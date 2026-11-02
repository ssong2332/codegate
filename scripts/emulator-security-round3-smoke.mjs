#!/usr/bin/env node
// 외부 보안 점검 2차 후속(2026-11-02) — 같은 사전 세션 id 동시 시작 · 오래된 세션 첫 통화 발급 에뮬레이터 스모크.
// ⛔ 측정 전용 — 앱 코드를 바꾸지 않는다. 에뮬레이터(auth + firestore + functions · 프로젝트 demo-test)에만 쓴다(호스트 127.0.0.1 고정).
//    LLM · 음성 키가 없으면 서버가 Mock으로 강등되며, 이 스크립트의 단언은 응답 내용에 기대지 않는다(실 키 0 · 과금 0).
//
// 사전: npm --prefix functions run build → (다른 셸) firebase emulators:start --only auth,firestore,functions --project demo-test
// 사용법: node scripts/emulator-security-round3-smoke.mjs [--out <file>]
// 수정 전 기준: main 빌드를 띄운 에뮬레이터에 같은 스크립트를 돌린다(PR 본문 표 — 수정 전 FAIL / 수정 후 PASS).
//
// (G) 같은 사전 세션 id(createVoiceClone이 만든 status "created" 문서)로 createSession 동시 3개 → 성공 1 · 오프닝(turnIndex 0) 1개
//     · 나머지는 외부 호출 없이 거절 · 끝난 뒤 같은 id 재시작도 거절
// (H) 오래된 active 세션 첫 통화 발급 — 생성 2시간 · 받은 뒤 61분이면 거절(외부 호출 전)
//     대조: 새 세션 · 생성 50분 · 다통화 다음 레그 · 메신저→통화 전환 세션은 발급
import { writeFileSync } from "node:fs";

const PROJECT = "demo-test";
const AUTH = "http://127.0.0.1:9099";
const FS_ROOT = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : "emulator-security-round3-result.json";

function toValue(v) {
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (v && typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
  throw new Error(`지원하지 않는 값: ${typeof v}`);
}
const OWNER = { Authorization: "Bearer owner" };
async function fsWrite(docPath, data) {
  const res = await fetch(`${FS_ROOT}/${docPath}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...OWNER },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) }),
  });
  if (!res.ok) throw new Error(`Firestore write 실패 ${docPath}: ${res.status} ${await res.text()}`);
}
async function fsList(collectionPath) {
  const docs = [];
  let pageToken = "";
  do {
    const res = await fetch(`${FS_ROOT}/${collectionPath}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`, { headers: OWNER });
    const json = await res.json();
    docs.push(...(json.documents ?? []));
    pageToken = json.nextPageToken ?? "";
  } while (pageToken);
  return docs;
}
/** 콜러블 호출 — 성공이면 { ok, result }, 실패면 { ok:false, status }(HTTP 콜러블 오류 status 문자열). */
async function call(fn, data, idToken) {
  const res = await fetch(`${FN}/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.error) return { ok: false, status: json.error.status, message: String(json.error.message ?? "").slice(0, 120) };
  return { ok: true, result: json.result };
}
async function mustCall(fn, data, idToken) {
  const r = await call(fn, data, idToken);
  if (!r.ok) throw new Error(`${fn} 실패: ${r.status} ${r.message}`);
  return r.result;
}
async function newUser() {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `sec3-${crypto.randomUUID()}@example.com`, password: crypto.randomUUID(), returnSecureToken: true }),
  });
  const json = await res.json();
  if (!json.idToken) throw new Error(`signUp 실패: ${JSON.stringify(json).slice(0, 200)}`);
  await fsWrite(`users/${json.localId}/consents/c1`, { granted: true, createdAt: new Date() });
  return { idToken: json.idToken, uid: json.localId };
}
const VOICE_SESSION = { scenarioId: "loan-refinance-scam", voiceId: "generic-voice", difficultyLevel: "beginner" };

const results = { checks: [] };
function check(part, name, ok, detail) {
  results.checks.push({ part, name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"} [${part}] ${name}${detail !== undefined ? ` ${JSON.stringify(detail)}` : ""}`);
}

async function partG() {
  const user = await newUser();
  const pre = `pre-${user.uid.slice(0, 12)}`;
  // createVoiceClone이 남기는 사전 세션 문서 모양(voice/index.ts — status "created").
  await fsWrite(`sessions/${pre}`, { sessionId: pre, uid: user.uid, status: "created", createdAt: new Date() });
  const r = await Promise.all([1, 2, 3].map(() => call("createSession", { ...VOICE_SESSION, sessionId: pre }, user.idToken)));
  const ok = r.filter((x) => x.ok).length;
  const openings = (await fsList(`sessions/${pre}/messages`)).filter((d) => d.fields?.turnIndex?.integerValue === "0").length;
  check("G", "같은 사전 id 동시 3개 → 성공 1 · 오프닝 1개", ok === 1 && openings === 1, {
    ok,
    openings,
    rejected: r.filter((x) => !x.ok).map((x) => x.status),
  });
  const again = await call("createSession", { ...VOICE_SESSION, sessionId: pre }, user.idToken);
  const openingsAfter = (await fsList(`sessions/${pre}/messages`)).filter((d) => d.fields?.turnIndex?.integerValue === "0").length;
  check("G", "시작이 끝난 같은 id 재시작 = 거절 · 오프닝 그대로", !again.ok && openingsAfter === openings, {
    status: again.ok ? "ok" : again.status,
    openingsAfter,
  });
  // 대조 — 사전 id 없는 정상 시작은 그대로.
  const plain = await call("createSession", VOICE_SESSION, user.idToken);
  check("G", "대조: 사전 id 없는 시작 = 정상", plain.ok, { status: plain.ok ? "ok" : plain.status });
}

async function seedSession(uid, extra) {
  const sid = `old-${crypto.randomUUID().slice(0, 12)}`;
  await fsWrite(`sessions/${sid}`, {
    sessionId: sid,
    uid,
    scenarioId: "loan-refinance-scam",
    status: "active",
    voiceId: "generic-voice",
    turnCount: 2,
    maxUserTurns: 14,
    maxSessionMs: 3_600_000,
    createdAt: new Date(),
    difficultyLevel: "beginner",
    ...extra,
  });
  return sid;
}
async function issue(user, sid) {
  const r = await call("createRealtimeCall", { sessionId: sid }, user.idToken);
  return r.ok ? { ok: true, callLeg: r.result?.callLeg ?? null } : { ok: false, status: r.status };
}

async function partH() {
  const user = await newUser();
  const twoHours = await issue(user, await seedSession(user.uid, { createdAt: new Date(Date.now() - 2 * 3_600_000) }));
  check("H", "생성 2시간 · 발급 기록 없는 active 세션 첫 발급 = 거절", !twoHours.ok && twoHours.status === "RESOURCE_EXHAUSTED", twoHours);
  const answered = await issue(
    user,
    await seedSession(user.uid, { createdAt: new Date(Date.now() - 62 * 60_000), answeredAt: new Date(Date.now() - 61 * 60_000) }),
  );
  check("H", "받은 뒤 61분 active 세션 첫 발급 = 거절", !answered.ok && answered.status === "RESOURCE_EXHAUSTED", answered);

  // 대조 — 정상 흐름은 그대로.
  const { sessionId } = await mustCall("createSession", VOICE_SESSION, user.idToken);
  const fresh = await issue(user, sessionId);
  const refetch = await issue(user, sessionId);
  check("H", "대조: 새 세션 발급 · 같은 구간 재발급(재연결 · 대기 화면 미리 받기) = 정상", fresh.ok && refetch.ok, { fresh, refetch });
  const fifty = await issue(user, await seedSession(user.uid, { createdAt: new Date(Date.now() - 50 * 60_000) }));
  check("H", "대조: 생성 50분(예산 안) 첫 발급 = 정상", fifty.ok, fifty);
  const multi = await issue(
    user,
    await seedSession(user.uid, {
      scenarioId: "card-company-impersonation",
      maxUserTurns: 100,
      createdAt: new Date(Date.now() - 31 * 60_000),
      answeredAt: new Date(Date.now() - 30 * 60_000),
      difficultyLevel: "advanced",
      flowVariantId: "fv-k3dn",
      relay: { legIndex: 1, legStartUserTurns: [0, 4], connected: true },
    }),
  );
  check("H", "대조: 다통화 다음 레그(받은 뒤 30분) 발급 = 정상", multi.ok && multi.callLeg?.legIndex === 1, multi);
  const escalated = await issue(
    user,
    await seedSession(user.uid, {
      scenarioId: "messenger-child-impersonation-kakao",
      createdAt: new Date(Date.now() - 20 * 60_000),
      answeredAt: new Date(Date.now() - 19 * 60_000),
      entryChannel: "messenger",
      channel: "voice",
      surface: "kakao",
      channelHistory: [{ from: "messenger", to: "voice", at: new Date(), trigger: "manual_button" }],
    }),
  );
  check("H", "대조: 메신저→통화 전환 세션 발급 = 정상", escalated.ok, escalated);
}

for (const part of [partG, partH]) {
  try {
    await part();
  } catch (error) {
    check(part.name, "예외", false, { error: String(error).slice(0, 300) });
  }
}
const passed = results.checks.filter((c) => c.ok).length;
results.summary = { passed, total: results.checks.length };
console.log(`\nTOTAL ${passed}/${results.checks.length}`);
writeFileSync(outFile, JSON.stringify(results, null, 2));
process.exit(passed === results.checks.length ? 0 : 1);
