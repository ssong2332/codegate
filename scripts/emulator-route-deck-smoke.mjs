#!/usr/bin/env node
// §119(DECISIONS #234) — 다중 루트 0차 에뮬레이터 스모크: 섞은 덱 배정 · 회전 문서 모양 · 옛 문서 호환 · 리포트 루트 줄.
// ⛔ 측정 전용 — 앱 코드를 바꾸지 않는다. 에뮬레이터(auth + firestore + functions · 프로젝트 demo-test)에만 쓴다(호스트 127.0.0.1 고정).
//    LLM 키가 없으면 서버가 Mock LLM으로 강등되며, 이 스크립트의 단언은 LLM 응답 내용에 기대지 않는다.
//
// 사전: npm --prefix functions run build → (다른 셸) FUNCTIONS_DISCOVERY_TIMEOUT=120 firebase emulators:start
//       --only auth,firestore,functions --project demo-test
// 사용법: node scripts/emulator-route-deck-smoke.mjs [--out <file>] [--rounds 6]
//
// (A) 루트 2개 칸(카드사 고급 자가): createSession × N(매번 endSession) → 연속 같은 루트 0 · 두 세션(한 바퀴)마다 두 루트 모두 ·
//     회전 문서 = { lastVariantId, deck: 문자열 배열 } · 세션 문서 flowVariantId = 회전 문서 lastVariantId
// (B) 마지막 세션 리포트: sendMessage 1턴 → endSession → generateReport → reports.routeSummary = { 배정 변형의 루트 이름, 2 }
// (C) 루트 1개 칸(국세청 환급금 고급 — §124 이후 기관 사칭 고급은 3루트): 회전 문서 0 · 리포트 routeSummary 부재
// (E) §124 루트 3개 칸(기관 사칭 고급): 3세션(매번 endSession) = 세 루트가 한 번씩 · 은퇴 fv-pgqt 0 · 리포트 routeSummary 개수 3
// (D) 옛 회전 문서(lastVariantId만): 다른 루트로 배정 · 문서에 deck 생김
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PROJECT = "demo-test";
const AUTH = "http://127.0.0.1:9099";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const outFile = argVal("--out", "emulator-route-deck-result.json");
const ROUNDS = Number(argVal("--rounds", "6"));

const require = createRequire(import.meta.url);
const LIB = join(dirname(fileURLToPath(import.meta.url)), "..", "functions", "lib");
const { findFlowVariant } = require(join(LIB, "scenarios", "flowVariants.js"));

const TWO_ROUTE = { scenarioId: "card-company-impersonation", level: "advanced", ids: ["fv-x7ue", "fv-w3dq"] };
const ONE_ROUTE = { scenarioId: "tax-refund-scam", level: "advanced", id: "fv-uk7m" };
const THREE_ROUTE = { scenarioId: "institutional-impersonation", level: "advanced", ids: ["fv-c5fj", "fv-q7cn", "fv-g2ld"] };

async function signUp() {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `route-${crypto.randomUUID()}@example.com`, password: crypto.randomUUID(), returnSecureToken: true }),
  });
  const json = await res.json();
  if (!json.idToken) throw new Error(`signUp 실패: ${JSON.stringify(json).slice(0, 200)}`);
  return { idToken: json.idToken, uid: json.localId };
}
function fromValue(v) {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromValue(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fromValue);
  return v;
}
async function fsRead(docPath) {
  const res = await fetch(`${FS}/${docPath}`, { headers: { Authorization: "Bearer owner" } });
  if (res.status === 404) return null;
  const json = await res.json();
  return Object.fromEntries(Object.entries(json.fields ?? {}).map(([k, v]) => [k, fromValue(v)]));
}
function toValue(v) {
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  throw new Error(`지원하지 않는 값: ${typeof v}`);
}
async function fsWrite(docPath, data) {
  const res = await fetch(`${FS}/${docPath}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) }),
  });
  if (!res.ok) throw new Error(`Firestore write 실패 ${docPath}: ${res.status}`);
}
async function call(fn, data, idToken) {
  const res = await fetch(`${FN}/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.error) throw new Error(`${fn} 실패: ${JSON.stringify(json.error).slice(0, 300)}`);
  return json.result;
}

const results = { checks: [] };
function check(part, name, ok, detail) {
  results.checks.push({ part, name, ok: Boolean(ok), ...(detail ? { detail } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"} [${part}] ${name}${detail ? ` ${JSON.stringify(detail)}` : ""}`);
}
const rotationPath = (uid, cell) => `users/${uid}/variantRotation/${cell.scenarioId}__${cell.level}`;

async function newUser() {
  const user = await signUp();
  await fsWrite(`users/${user.uid}/consents/c1`, { granted: true, createdAt: new Date() });
  return user;
}
async function startSession(user, cell) {
  const { sessionId } = await call("createSession", { scenarioId: cell.scenarioId, voiceId: "generic-voice", difficultyLevel: cell.level }, user.idToken);
  const session = await fsRead(`sessions/${sessionId}`);
  return { sessionId, flowVariantId: session?.flowVariantId };
}
async function finishWithReport(user, sessionId) {
  await call("sendMessage", { sessionId, userText: "네 여보세요? 누구시죠?" }, user.idToken);
  await call("endSession", { sessionId, endReason: "user_ended" }, user.idToken);
  const { reportId } = await call("generateReport", { sessionId }, user.idToken);
  return fsRead(`reports/${reportId}`);
}

async function partAB() {
  const user = await newUser();
  const seq = [];
  const docs = [];
  let lastSessionId;
  for (let i = 0; i < ROUNDS; i += 1) {
    const { sessionId, flowVariantId } = await startSession(user, TWO_ROUTE);
    const rotation = await fsRead(rotationPath(user.uid, TWO_ROUTE));
    seq.push(flowVariantId);
    docs.push(rotation);
    lastSessionId = sessionId;
    if (i < ROUNDS - 1) await call("endSession", { sessionId, endReason: "user_ended" }, user.idToken);
  }
  results.A = { seq, rotationDocs: docs.map((d) => ({ lastVariantId: d?.lastVariantId, deck: d?.deck })) };
  check("A", "1 배정이 모두 그 칸의 루트", seq.every((id) => TWO_ROUTE.ids.includes(id)), { seq });
  check("A", "2 연속 같은 루트 0", seq.every((id, i) => i === 0 || id !== seq[i - 1]), { seq });
  const laps = [];
  for (let i = 0; i + 1 < seq.length; i += 2) laps.push(new Set(seq.slice(i, i + 2)).size === 2);
  check("A", "3 한 바퀴(2세션)마다 두 루트 모두", laps.every(Boolean), { laps });
  check(
    "A",
    "4 회전 문서 = { lastVariantId = 세션 변형, deck 문자열 배열 }",
    docs.every((d, i) => d?.lastVariantId === seq[i] && Array.isArray(d?.deck) && d.deck.every((x) => typeof x === "string")),
  );

  const report = await finishWithReport(user, lastSessionId);
  const expected = { label: findFlowVariant(seq[seq.length - 1])?.routeLabel, routeCount: 2 };
  results.B = { routeSummary: report?.routeSummary, expected };
  check("B", "1 리포트 routeSummary = 배정 루트 이름 · 2", JSON.stringify(report?.routeSummary) === JSON.stringify(expected), results.B);
}

async function partC() {
  const user = await newUser();
  const { sessionId, flowVariantId } = await startSession(user, ONE_ROUTE);
  const rotation = await fsRead(rotationPath(user.uid, ONE_ROUTE));
  check("C", "1 루트 1개 칸 = fv-uk7m", flowVariantId === ONE_ROUTE.id, { flowVariantId });
  check("C", "2 루트 1개 칸은 회전 문서 0", rotation === null);
  const report = await finishWithReport(user, sessionId);
  check("C", "3 리포트 routeSummary 부재", report !== null && report.routeSummary === undefined, { routeSummary: report?.routeSummary });
}

async function partD() {
  const user = await newUser();
  await fsWrite(rotationPath(user.uid, TWO_ROUTE), { lastVariantId: "fv-x7ue", updatedAt: new Date() });
  const { sessionId, flowVariantId } = await startSession(user, TWO_ROUTE);
  const rotation = await fsRead(rotationPath(user.uid, TWO_ROUTE));
  check("D", "1 옛 문서(lastVariantId만) → 다른 루트", flowVariantId === "fv-w3dq", { flowVariantId });
  check("D", "2 문서에 deck 생김 = [fv-x7ue]", JSON.stringify(rotation?.deck) === JSON.stringify(["fv-x7ue"]), { rotation });
  await call("endSession", { sessionId, endReason: "user_ended" }, user.idToken);
}

async function partE() {
  const user = await newUser();
  const seq = [];
  let lastSessionId;
  for (let i = 0; i < 3; i += 1) {
    const { sessionId, flowVariantId } = await startSession(user, THREE_ROUTE);
    seq.push(flowVariantId);
    lastSessionId = sessionId;
    if (i < 2) await call("endSession", { sessionId, endReason: "user_ended" }, user.idToken);
  }
  results.E = { seq };
  check("E", "1 첫 바퀴 3세션 = 세 루트가 한 번씩(은퇴 fv-pgqt 0)", JSON.stringify([...seq].sort()) === JSON.stringify([...THREE_ROUTE.ids].sort()), { seq });
  const report = await finishWithReport(user, lastSessionId);
  const expected = { label: findFlowVariant(seq[2])?.routeLabel, routeCount: 3 };
  check("E", "2 리포트 routeSummary = 배정 루트 이름 · 3", JSON.stringify(report?.routeSummary) === JSON.stringify(expected), { routeSummary: report?.routeSummary, expected });
}

// (F) §125 — 1b 다중 루트 칸: 첫 바퀴(루트 수만큼 세션)에 그 칸의 루트가 한 번씩 · 루트별 페르소나(legs) 경로로 세션 시작 성공.
const FIRST_LAP_CELLS = [
  { scenarioId: "prosecution-cooperation-call", level: "advanced", ids: ["fv-h3vn", "fv-v2mk", "fv-a6lq"] },
  { scenarioId: "asset-protection-notice-call", level: "advanced", ids: ["fv-k9ra", "fv-p3jx", "fv-t8ga"] },
  { scenarioId: "kidnapping-threat", level: "advanced", ids: ["fv-k268", "fv-w7tb"] },
  { scenarioId: "family-accident-deepvoice", level: "advanced", ids: ["fv-66hh", "fv-h5sz"] },
];
async function partF() {
  for (const cell of FIRST_LAP_CELLS) {
    const user = await newUser();
    const seq = [];
    for (let i = 0; i < cell.ids.length; i += 1) {
      const { sessionId, flowVariantId } = await startSession(user, cell);
      seq.push(flowVariantId);
      await call("endSession", { sessionId, endReason: "user_ended" }, user.idToken);
    }
    check("F", `${cell.scenarioId} 첫 바퀴 = 루트 ${cell.ids.length}개 한 번씩`, JSON.stringify([...seq].sort()) === JSON.stringify([...cell.ids].sort()), { seq });
  }
}

try {
  for (const [name, fn] of [["A·B", partAB], ["C", partC], ["D", partD], ["E", partE], ["F", partF]]) {
    try {
      await fn();
    } catch (err) {
      check(name, "예외 없이 끝남", false, { error: String(err).slice(0, 300) });
    }
  }
} finally {
  const pass = results.checks.filter((c) => c.ok).length;
  results.summary = { pass, total: results.checks.length };
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n${pass}/${results.checks.length} PASS → ${outFile}`);
  if (pass !== results.checks.length) process.exitCode = 1;
}
