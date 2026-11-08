#!/usr/bin/env node
// D4 3차(2026-11-08 Edge 재시험 3) — 초급 물러섬 턴 지시(판정표 B)와 대사 검사(판정표 V)가 실제 `sendMessage` 콜러블에서 도는지 에뮬레이터로 확인한다.
// ⛔ 측정 전용 — 앱 코드를 바꾸지 않는다. 에뮬레이터(auth + firestore + functions · 프로젝트 demo-test)에만 쓴다(호스트 127.0.0.1 고정).
//    LLM 키가 없으면 서버가 Mock LLM을 쓴다 — Mock은 시나리오 수법 문구("왜 내 말을 못 믿어" · "200만 원만 … 계좌 알려줄게")로 대사를 만들므로,
//    판정표 V가 그 대사를 걸러 내는지 볼 수 있다(모델이 지시를 따르는지는 이 스모크로 알 수 없다 — 실 키 프로브의 몫).
//
// 사전: npm --prefix functions run build → (다른 셸) firebase emulators:start --only auth,firestore,functions --project demo-test
// 사용법: node scripts/emulator-beginner-retreat-smoke.mjs [--out <file>]
// 함수 로그의 `[D4] sendMessage 초급 물러섬 지시` · `[D4] 초급 물러섬 턴 대사 교체` 줄은 에뮬레이터 출력에서 따로 센다(이 스크립트는 저장된 대사만 본다).
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PROJECT = "demo-test";
const AUTH = "http://127.0.0.1:9099";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : "emulator-beginner-retreat-result.json";

const require = createRequire(import.meta.url);
const LIB = join(dirname(fileURLToPath(import.meta.url)), "..", "functions", "lib");
const { BEGINNER_RETREAT_REPLY, VERIFY_BLOCK, GUILT_PLEA, MONEY_DEMAND, TIME_PRESSURE } = require(join(LIB, "roleplay", "beginnerRetreat.js"));

// Edge 재시험 3 참가자 말(원문 그대로).
const U = [
  "진짜 지수 맞아? 이상하네. 지수 원래 번호로 지금 전화해 볼게.",
  "안 믿어. 너 우리 지수 아닌 것 같아. 돈 못 보내.",
  "싫어. 지수한테 직접 확인하기 전엔 절대 안 보내.",
];

function fromValue(v) {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromValue(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fromValue);
  return v;
}
async function fsWrite(docPath, data) {
  const fields = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v instanceof Date ? { timestampValue: v.toISOString() } : typeof v === "boolean" ? { booleanValue: v } : { stringValue: String(v) }]),
  );
  const res = await fetch(`${FS}/${docPath}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore write 실패 ${docPath}: ${res.status}`);
}
async function fsRead(docPath) {
  const res = await fetch(`${FS}/${docPath}`, { headers: { Authorization: "Bearer owner" } });
  if (res.status === 404) return null;
  const json = await res.json();
  return Object.fromEntries(Object.entries(json.fields ?? {}).map(([k, v]) => [k, fromValue(v)]));
}
async function scammerTexts(sessionId) {
  const res = await fetch(`${FS}/sessions/${sessionId}/messages?pageSize=100`, { headers: { Authorization: "Bearer owner" } });
  const json = await res.json();
  return (json.documents ?? [])
    .map((d) => Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, fromValue(v)])))
    .filter((m) => m.role === "scammer")
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((m) => m.textMasked);
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
async function newUser() {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `d4-${crypto.randomUUID()}@example.com`, password: crypto.randomUUID(), returnSecureToken: true }),
  });
  const json = await res.json();
  if (!json.idToken) throw new Error("signUp 실패");
  await fsWrite(`users/${json.localId}/consents/c1`, { granted: true, createdAt: new Date() });
  return { idToken: json.idToken };
}

const results = { checks: [], transcripts: {} };
function check(name, ok, detail) {
  results.checks.push({ name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` ${JSON.stringify(detail)}` : ""}`);
}

async function runLevel(level) {
  const user = await newUser();
  const { sessionId } = await call("createSession", { scenarioId: "messenger-child-impersonation-kakao", voiceId: "generic-voice", difficultyLevel: level }, user.idToken);
  const session = await fsRead(`sessions/${sessionId}`);
  const before = (await scammerTexts(sessionId)).length;
  for (const text of U) await call("sendMessage", { sessionId, userText: text }, user.idToken);
  const replies = (await scammerTexts(sessionId)).slice(before);
  results.transcripts[level] = { sessionId, flowVariantId: session?.flowVariantId, replies };
  return replies;
}

const fixed = new Set(Object.values(BEGINNER_RETREAT_REPLY));
const beginner = await runLevel("beginner");
check("1 초급 — 참가자 말 3개에 대답 3개", beginner.length === 3, { count: beginner.length });
check(
  "2 초급 물러섬 턴(첫 의심) — 확인 차단 · 죄책감 0",
  beginner[0] !== undefined && !VERIFY_BLOCK.test(beginner[0]) && !GUILT_PLEA.test(beginner[0]),
  { reply: beginner[0] },
);
for (const i of [1, 2]) {
  const r = beginner[i];
  check(
    `${i + 2} 초급 마무리 턴 — 확인 차단 · 죄책감 · 금액 · 계좌 요구 · 시간 재촉 0`,
    r !== undefined && !VERIFY_BLOCK.test(r) && !GUILT_PLEA.test(r) && !MONEY_DEMAND.test(r) && !TIME_PRESSURE.test(r),
    { reply: r, fixedLine: fixed.has(r) },
  );
}
const intermediate = await runLevel("intermediate");
check(
  "5 중급 대조 — 같은 대본에 고정 물러섬 1줄이 나오지 않는다(판정표 B1 · V1)",
  intermediate.length === 3 && intermediate.every((r) => !fixed.has(r)),
  { replies: intermediate },
);

writeFileSync(outFile, JSON.stringify(results, null, 2));
const failed = results.checks.filter((c) => !c.ok).length;
console.log(`${results.checks.length - failed}/${results.checks.length} PASS → ${outFile}`);
process.exit(failed === 0 ? 0 : 1);
