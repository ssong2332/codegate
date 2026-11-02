#!/usr/bin/env node
// 외부 보안 점검 2차(2026-11-02) — SEC-05 · SEC-06 · SEC-07 · SEC-08 · 전사 재전송 에뮬레이터 스모크.
// ⛔ 측정 전용 — 앱 코드를 바꾸지 않는다. 에뮬레이터(auth + firestore + functions · 프로젝트 demo-test)에만 쓴다(호스트 127.0.0.1 고정).
//    LLM · 음성 키가 없으면 서버가 Mock으로 강등되며, 이 스크립트의 단언은 응답 내용에 기대지 않는다(실 키 0 · 과금 0).
//
// 사전: npm --prefix functions run build → (다른 셸) firebase emulators:start --only auth,firestore,functions --project demo-test
// 사용법: node scripts/emulator-security-round2-smoke.mjs [--out <file>]
// 수정 전 기준: main 빌드를 띄운 에뮬레이터에 같은 스크립트를 돌린다(PR 본문 표 — 수정 전 FAIL / 수정 후 PASS).
//
// (A) SEC-05 기존 세션 5개 + 동시 createSession 2개 → 성공 1 · 최종 6 · AI(오프닝 대사) 1회
// (B) SEC-06 되감기 기록 49개 + 동시 judgeRewindAnswer 3개 → 최종 ≤ 50 · 추가 판정 ≤ 1
// (C) SEC-07 숫자 · 객체 · 경로 모양 · null 항목 · 잘못된 역할 → 전부 invalid-argument · 저장 0
// (D) SEC-08 한 통화 구간 발급 7회 → 7번째 거절 · 25분 지난 구간 거절 · 다통화 다음 레그(relay legIndex 1)는 발급
// (E) SEC-08 통화 중 카톡 — 누적 100턴 · 받은 뒤 61분이면 거절 · 3턴이면 정상
// (F) 전사 재전송 — 같은 batchId 두 번 = 두 번째 저장 0 · batchId 없이 같은 내용 두 번 = 두 번째 0 · 종료 뒤 새 제출은 저장
import { writeFileSync } from "node:fs";

const PROJECT = "demo-test";
const AUTH = "http://127.0.0.1:9099";
const FS_ROOT = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : "emulator-security-round2-result.json";

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
async function fsCount(collectionPath) {
  let total = 0;
  let pageToken = "";
  do {
    const res = await fetch(`${FS_ROOT}/${collectionPath}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`, { headers: OWNER });
    const json = await res.json();
    total += (json.documents ?? []).length;
    pageToken = json.nextPageToken ?? "";
  } while (pageToken);
  return total;
}
async function countSessionsOf(uid) {
  const res = await fetch(`${FS_ROOT}:runQuery`, {
    method: "POST",
    headers: { "content-type": "application/json", ...OWNER },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "sessions" }], where: { fieldFilter: { field: { fieldPath: "uid" }, op: "EQUAL", value: { stringValue: uid } } } } }),
  });
  const rows = await res.json();
  return rows.filter((r) => r.document).length;
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
    body: JSON.stringify({ email: `sec2-${crypto.randomUUID()}@example.com`, password: crypto.randomUUID(), returnSecureToken: true }),
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

async function partA() {
  const user = await newUser();
  for (let i = 1; i <= 5; i += 1) {
    await fsWrite(`sessions/seed-${user.uid.slice(0, 8)}-${i}`, { uid: user.uid, status: "ended", scenarioId: "loan-refinance-scam", createdAt: new Date(Date.now() - i * 1000) });
  }
  const r = await Promise.all([call("createSession", VOICE_SESSION, user.idToken), call("createSession", VOICE_SESSION, user.idToken)]);
  const ok = r.filter((x) => x.ok).length;
  const total = await countSessionsOf(user.uid);
  // AI 호출 = 오프닝 대사 생성 = 성공한 생성 수(거절은 오프닝 대사 앞에서 일어난다 — 소스 순서는 단위 테스트가 고정).
  check("A", "SEC-05 동시 2개 중 성공 1 · 최종 6 · AI 1회", ok === 1 && total === 6, { ok, total, rejected: r.filter((x) => !x.ok).map((x) => x.status), aiCalls: ok });
}

async function partB() {
  const user = await newUser();
  const rid = `rep-${user.uid.slice(0, 10)}`;
  await fsWrite(`reports/${rid}`, {
    uid: user.uid,
    sessionId: `sess-${user.uid.slice(0, 8)}`,
    deceivedMoments: [{ turnIndex: 1, tactic: "권위 사칭", correctAction: "전화를 끊고 대표번호로 확인한다" }],
  });
  for (let i = 0; i < 49; i += 1) await fsWrite(`reports/${rid}/rewindAttempts/seed${i}`, { verdict: "unclear", createdAt: new Date() });
  const r = await Promise.all([1, 2, 3].map(() => call("judgeRewindAnswer", { reportId: rid, momentIndex: 0, answerText: "끊고 대표번호로 확인할게요" }, user.idToken)));
  const total = await fsCount(`reports/${rid}/rewindAttempts`);
  check("B", "SEC-06 49개 + 동시 3개 → 최종 ≤ 50 · 추가 판정 ≤ 1", total <= 50 && r.filter((x) => x.ok).length <= 1, { total, ok: r.filter((x) => x.ok).length, statuses: r.map((x) => (x.ok ? "ok" : x.status)) });
}

async function partC() {
  const user = await newUser();
  const { sessionId } = await mustCall("createSession", VOICE_SESSION, user.idToken);
  const before = await fsCount(`sessions/${sessionId}/messages`);
  const cases = [
    ["createRealtimeCall", { sessionId: 123 }],
    ["generateReport", { sessionId: { a: 1 } }],
    ["endSession", { sessionId: ["x"], endReason: "user_ended" }],
    ["sendMessage", { sessionId, userText: 5 }],
    ["sendMessage", { sessionId: "a/b", userText: "여보세요" }],
    ["submitRealtimeTranscript", { sessionId, turns: [null] }],
    ["submitRealtimeTranscript", { sessionId, turns: [{ role: "admin", text: "가짜 역할" }] }],
    ["submitRealtimeTranscript", { sessionId, turns: [{ role: "user", text: { x: 1 } }] }],
    ["judgeRewindAnswer", { reportId: 7, momentIndex: 0, answerText: "확인" }],
    ["createSession", { scenarioId: { a: 1 }, voiceId: "generic-voice" }],
    ["createSession", { scenarioId: "constructor", voiceId: "generic-voice" }],
    ["createSession", { ...VOICE_SESSION, channel: { x: 1 } }],
    ["recordMockScreenEvent", { sessionId: 1, landingId: "x", event: "shown" }],
    ["deliverVerifyOffer", { sessionId: { a: 1 } }],
  ];
  for (const [fn, data] of cases) {
    const r = await call(fn, data, user.idToken);
    check("C", `SEC-07 ${fn} ${JSON.stringify(data).slice(0, 70)} → invalid-argument`, !r.ok && r.status === "INVALID_ARGUMENT", { status: r.ok ? "ok" : r.status });
  }
  const after = await fsCount(`sessions/${sessionId}/messages`);
  check("C", "SEC-07 잘못된 입력 뒤 저장 0", before === after, { before, after });
}

async function partD() {
  const user = await newUser();
  const { sessionId } = await mustCall("createSession", VOICE_SESSION, user.idToken);
  const statuses = [];
  for (let i = 0; i < 7; i += 1) {
    const r = await call("createRealtimeCall", { sessionId }, user.idToken);
    statuses.push(r.ok ? "ok" : r.status);
  }
  check("D", "SEC-08 한 구간 발급 6회 허용 · 7번째 거절", statuses.slice(0, 6).every((s) => s === "ok") && statuses[6] === "RESOURCE_EXHAUSTED", { statuses });

  // 오래된 active 세션 — 그 구간 최초 발급이 26분 전이면 거절(외부 호출 전).
  const user2 = await newUser();
  const old = await mustCall("createSession", VOICE_SESSION, user2.idToken);
  await fsWrite(`sessions/${old.sessionId}/limits/realtimeCall`, { legs: { voice0: { count: 1, firstIssuedAtMs: Date.now() - 26 * 60_000 } } });
  const r2 = await call("createRealtimeCall", { sessionId: old.sessionId }, user2.idToken);
  check("D", "SEC-08 최초 발급 후 25분 지난 구간 거절", !r2.ok && r2.status === "RESOURCE_EXHAUSTED", { status: r2.ok ? "ok" : r2.status });

  // 다통화(카드사 고급 fv-k3dn) — 레그 0 예산을 다 쓴 뒤 startCallLeg가 레그 1을 열었다(relay)면 그 레그는 새 예산이다.
  const user3 = await newUser();
  const sid = `multi-${user3.uid.slice(0, 10)}`;
  await fsWrite(`sessions/${sid}`, {
    sessionId: sid,
    uid: user3.uid,
    scenarioId: "card-company-impersonation",
    status: "active",
    voiceId: "generic-voice",
    turnCount: 4,
    maxUserTurns: 100,
    maxSessionMs: 3_600_000,
    createdAt: new Date(),
    difficultyLevel: "advanced",
    flowVariantId: "fv-k3dn",
    relay: { legIndex: 1, legStartUserTurns: [0, 4], connected: true },
  });
  await fsWrite(`sessions/${sid}/limits/realtimeCall`, { legs: { leg0: { count: 6, firstIssuedAtMs: Date.now() - 60_000 } } });
  const r3 = await call("createRealtimeCall", { sessionId: sid }, user3.idToken);
  check("D", "SEC-08 다통화 다음 레그(leg1)는 레그 0 예산과 따로 발급", r3.ok && r3.result?.callLeg?.legIndex === 1, { status: r3.ok ? "ok" : r3.status, callLeg: r3.result?.callLeg ?? null });
}

async function escalatedSession(uid, extra) {
  const sid = `esc-${crypto.randomUUID().slice(0, 12)}`;
  await fsWrite(`sessions/${sid}`, {
    sessionId: sid,
    uid,
    scenarioId: "messenger-child-impersonation-kakao",
    status: "active",
    voiceId: "generic-voice",
    turnCount: 3,
    maxUserTurns: 14,
    maxSessionMs: 3_600_000,
    createdAt: new Date(),
    entryChannel: "messenger",
    channel: "voice",
    surface: "kakao",
    difficultyLevel: "beginner",
    channelHistory: [{ from: "messenger", to: "voice", at: new Date(), trigger: "manual_button" }],
    ...extra,
  });
  return sid;
}
async function partE() {
  const user = await newUser();
  const normal = await call("sendMessage", { sessionId: await escalatedSession(user.uid, {}), userText: "엄마 지금 통화 중이야", duringCall: true }, user.idToken);
  check("E", "SEC-08 통화 중 카톡 3턴 = 정상", normal.ok, { status: normal.ok ? "ok" : normal.status });
  const turns = await call("sendMessage", { sessionId: await escalatedSession(user.uid, { turnCount: 100 }), userText: "뭐라고?", duringCall: true }, user.idToken);
  check("E", "SEC-08 통화 중 카톡 누적 100턴 = 거절", !turns.ok && turns.status === "RESOURCE_EXHAUSTED", { status: turns.ok ? "ok" : turns.status });
  const time = await call(
    "sendMessage",
    { sessionId: await escalatedSession(user.uid, { answeredAt: new Date(Date.now() - 61 * 60_000), createdAt: new Date(Date.now() - 62 * 60_000) }), userText: "뭐라고?", duringCall: true },
    user.idToken,
  );
  check("E", "SEC-08 통화 중 카톡 받은 뒤 61분 = 거절", !time.ok && time.status === "RESOURCE_EXHAUSTED", { status: time.ok ? "ok" : time.status });
}

async function partF() {
  const user = await newUser();
  const { sessionId } = await mustCall("createSession", VOICE_SESSION, user.idToken);
  const batch = { sessionId, turns: [{ role: "scammer", text: "여보세요, 대출 상담 센터입니다", atMs: 1000 }, { role: "user", text: "네 말씀하세요", atMs: 4000 }] };
  const first = await mustCall("submitRealtimeTranscript", { ...batch, batchId: "dupcheck0001" }, user.idToken);
  const again = await mustCall("submitRealtimeTranscript", { ...batch, batchId: "dupcheck0001" }, user.idToken);
  const afterId = await fsCount(`sessions/${sessionId}/messages`);
  check("F", "같은 batchId 재전송 = 두 번째 저장 0", first.written === 2 && again.written === 0 && afterId === 3, { first: first.written, again: again.written, messages: afterId });
  const plain = { sessionId, turns: [{ role: "user", text: "그럼 어떻게 하면 되나요", atMs: 9000 }] };
  const p1 = await mustCall("submitRealtimeTranscript", plain, user.idToken);
  const p2 = await mustCall("submitRealtimeTranscript", plain, user.idToken);
  check("F", "batchId 없는 같은 내용 재전송 = 두 번째 저장 0(옛 화면 캐시)", p1.written === 1 && p2.written === 0, { p1: p1.written, p2: p2.written });
  await mustCall("endSession", { sessionId, endReason: "user_ended" }, user.idToken);
  const late = await mustCall("submitRealtimeTranscript", { sessionId, turns: [{ role: "scammer", text: "끊으시면 안 됩니다", atMs: 12000 }], batchId: "afterend0001" }, user.idToken);
  check("F", "종료 직후 새 전사 제출은 저장된다(종료 세션 단순 차단 0)", late.written === 1, { written: late.written });
}

for (const part of [partA, partB, partC, partD, partE, partF]) {
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
