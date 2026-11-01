#!/usr/bin/env node
// ⭐ P2(2026-10-31 · docs/research/in-service-experience-plan-2026-10-31.md §9) — 훈련용 이체 화면 에뮬레이터 스모크.
// "화면 제출 → 속음 기록 → 끊기 4-c 해제" 경로를 실제 콜러블로 확인한다(P2-a 남은 검증 · P2-c 메신저 칩).
// ⛔ 측정 전용 — 앱 코드를 바꾸지 않는다. 에뮬레이터(auth + firestore + functions · 프로젝트 demo-test)에만 쓴다(호스트 127.0.0.1 고정).
//    LLM 키가 없으면 서버가 Mock LLM으로 강등되며, 이 스크립트의 단언은 LLM 응답 내용에 기대지 않는다.
//
// 사전: npm --prefix functions run build → (다른 셸) firebase emulators:start --only auth,firestore,functions --project demo-test
// 사용법: node scripts/emulator-bank-transfer-smoke.mjs [--out <file>]
//
// (A) 통화 중 문자(대출 초급 — 계좌 문자 `loan-account` → `loan-repay-transfer`):
//     1 문자 도착 문서 = 이체 화면 링크 · 받는 분 · 금액 구조화 필드
//     2 제출 전 goal 끊기 = 거절(4-c — 결정 화면 대기) 3 제출 기록(landing_submitted) 4 제출 뒤 goal 끊기 = 승인
//     5 리포트 deceivedMoments에 그 화면의 속은 순간(momentTactic)
// (B) 메신저 칩(자녀 사칭 초급 — `child-bank-transfer`): 칩 메시지(첨부 · 세션 은행 · 계좌) → shown → submitted → 리포트 속은 순간.
//     ⚠️ Mock LLM은 링크 마커를 내지 않으므로 칩이 실린 사기범 메시지 1건을 에뮬레이터 Firestore에 직접 쓴다(앵커 재료).
// (C) D-e 이체 완료 화면 캡처: 화면 제출 → 캡처 보내기 → 저장 문면 · 종류 · 이미지 0 · 사기범 응답 생성(내용은 Mock이라 판정 안 함).
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
const outFile = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : "emulator-bank-transfer-result.json";

const require = createRequire(import.meta.url);
const LIB = join(dirname(fileURLToPath(import.meta.url)), "..", "functions", "lib");
const { findMockScreenItem } = require(join(LIB, "scenarios", "mockScreens.js"));

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
function toValue(v) {
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (v && typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
  throw new Error(`지원하지 않는 값: ${typeof v}`);
}
async function fsRead(docPath) {
  const res = await fetch(`${FS}/${docPath}`, { headers: { Authorization: "Bearer owner" } });
  if (res.status === 404) return null;
  const json = await res.json();
  return Object.fromEntries(Object.entries(json.fields ?? {}).map(([k, v]) => [k, fromValue(v)]));
}
async function fsWrite(docPath, data) {
  const res = await fetch(`${FS}/${docPath}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) }),
  });
  if (!res.ok) throw new Error(`Firestore write 실패 ${docPath}: ${res.status} ${await res.text()}`);
}
async function fsList(collectionPath) {
  const res = await fetch(`${FS}/${collectionPath}?pageSize=100`, { headers: { Authorization: "Bearer owner" } });
  const json = await res.json();
  return (json.documents ?? []).map((d) => ({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, fromValue(v)])) }));
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
    body: JSON.stringify({ email: `p2-${crypto.randomUUID()}@example.com`, password: crypto.randomUUID(), returnSecureToken: true }),
  });
  const json = await res.json();
  if (!json.idToken) throw new Error(`signUp 실패: ${JSON.stringify(json).slice(0, 200)}`);
  await fsWrite(`users/${json.localId}/consents/c1`, { granted: true, createdAt: new Date() });
  return { idToken: json.idToken, uid: json.localId };
}

const results = { checks: [] };
function check(part, name, ok, detail) {
  results.checks.push({ part, name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"} [${part}] ${name}${detail !== undefined ? ` ${JSON.stringify(detail)}` : ""}`);
}

async function partA() {
  const user = await newUser();
  const { sessionId } = await call("createSession", { scenarioId: "loan-refinance-scam", voiceId: "generic-voice", difficultyLevel: "beginner" }, user.idToken);
  const session = await fsRead(`sessions/${sessionId}`);
  check("A", "0 대출 초급 변형", session?.flowVariantId === "fv-bqr9", { flowVariantId: session?.flowVariantId });

  const delivered = await call(
    "deliverInCallSms",
    // 앵커 = 1 + 사기범 전사 수. 이 스모크는 전사를 제출하지 않으므로 0(앵커 = 오프닝 메시지) — 실제 통화는 전사가 쌓여 그 턴에 앵커된다.
    { sessionId, trigger: "model_tool", purpose: "transfer", userTurns: 4, scammerTranscriptTurns: 0 },
    user.idToken,
  );
  const sms = await fsRead(`sessions/${sessionId}/inCallSms/loan-account`);
  check("A", "1 계좌 문자 도착 = 이체 화면 링크 · 받는 분 · 금액", delivered?.status === "delivered" && sms?.fakeLandingId === "loan-repay-transfer" && sms?.transferAmount === "1850000" && typeof sms?.accountHolder === "string" && typeof sms?.bankName === "string", {
    status: delivered?.status,
    fakeLandingId: sms?.fakeLandingId,
    accountHolder: sms?.accountHolder,
    transferAmount: sms?.transferAmount,
    bankName: sms?.bankName,
    accountNumber: sms?.accountNumber,
  });

  const before = await call("requestScammerHangup", { sessionId, userTurns: 7, pendingInstruction: false, kind: "goal" }, user.idToken);
  check("A", "2 제출 전 goal 끊기 = 거절(4-c)", before?.status !== "accepted", { status: before?.status, guidance: String(before?.guidance ?? "").slice(0, 80) });

  await call("recordInCallSmsEvent", { sessionId, smsId: "loan-account", event: "link_tapped" }, user.idToken);
  await call("recordInCallSmsEvent", { sessionId, smsId: "loan-account", event: "landing_submitted" }, user.idToken);
  const smsAfter = await fsRead(`sessions/${sessionId}/inCallSms/loan-account`);
  check("A", "3 제출 기록 landingSubmittedAt", Boolean(smsAfter?.landingSubmittedAt));

  const after = await call("requestScammerHangup", { sessionId, userTurns: 8, pendingInstruction: false, kind: "goal" }, user.idToken);
  check("A", "4 제출 뒤 goal 끊기 = 승인", after?.status === "accepted", { status: after?.status });

  const current = await fsRead(`sessions/${sessionId}`);
  if (current?.status === "active") await call("endSession", { sessionId, endReason: "user_ended" }, user.idToken);
  const { reportId } = await call("generateReport", { sessionId }, user.idToken);
  const report = await fsRead(`reports/${reportId}`);
  const tactic = findMockScreenItem("loan-refinance-scam", "loan-repay-transfer")?.momentTactic;
  const moments = report?.deceivedMoments ?? [];
  check("A", "5 리포트 속은 순간 = 이체 화면 문면", moments.some((m) => m.tactic === tactic || m.landingId === "loan-repay-transfer"), {
    expected: tactic,
    moments: moments.map((m) => ({ tactic: m.tactic, landingId: m.landingId, turnIndex: m.turnIndex })),
  });
}

async function partB() {
  const user = await newUser();
  const { sessionId } = await call("createSession", { scenarioId: "messenger-child-impersonation-kakao", voiceId: "generic-voice", difficultyLevel: "beginner" }, user.idToken);
  const session = await fsRead(`sessions/${sessionId}`);
  check("B", "0 자녀 사칭 초급 변형", session?.flowVariantId === "fv-34v5", { flowVariantId: session?.flowVariantId });
  // 사용자 발화 1 + 칩이 실린 사기범 메시지 1(서버 `withBankTransferPrefill`이 붙이는 모양 그대로).
  await call("sendMessage", { sessionId, userText: "응 무슨 일이야?" }, user.idToken);
  const messages = await fsList(`sessions/${sessionId}/messages`);
  const nextTurn = Math.max(...messages.map((m) => Number(m.turnIndex ?? 0))) + 1;
  await fsWrite(`sessions/${sessionId}/messages/p2-chip`, {
    role: "scammer",
    textMasked: "엄마 이 계좌로 200만 원만 보내줘",
    turnIndex: nextTurn,
    createdAt: new Date(),
    attachments: [
      { kind: "link", displayText: "이체하기", fakeLandingId: "child-bank-transfer", harmless: true, bankName: "가온은행", accountNumber: "948-2716-5093-27" },
    ],
  });
  await call("recordMockScreenEvent", { sessionId, landingId: "child-bank-transfer", event: "shown" }, user.idToken);
  await call("recordMockScreenEvent", { sessionId, landingId: "child-bank-transfer", event: "submitted" }, user.idToken);
  const doc = await fsRead(`sessions/${sessionId}/mockScreens/child-bank-transfer`);
  check("B", "1 제출 기록 submittedAt", Boolean(doc?.submittedAt));
  await call("endSession", { sessionId, endReason: "user_ended" }, user.idToken);
  const { reportId } = await call("generateReport", { sessionId }, user.idToken);
  const report = await fsRead(`reports/${reportId}`);
  const tactic = findMockScreenItem("messenger-child-impersonation-kakao", "child-bank-transfer")?.momentTactic;
  const moments = report?.deceivedMoments ?? [];
  check("B", "2 리포트 속은 순간 = 메신저 이체 화면 문면", moments.some((m) => m.tactic === tactic || m.landingId === "child-bank-transfer"), {
    expected: tactic,
    moments: moments.map((m) => ({ tactic: m.tactic, landingId: m.landingId, turnIndex: m.turnIndex })),
  });
}

// (C) D-e 이체 완료 화면 캡처(2026-11-01 · 확인 실측): 칩 → 화면 제출 → 캡처 보내기(`photo: true` · `photoKind: "transfer-receipt"`) → 사기범 응답.
//     화면(MessengerChatRoom)이 보내는 요청 모양 그대로. 서버에 남는 것 = 고정 문장 · 종류뿐(이미지 · data URL 0).
//     ⚠️ Mock LLM은 턴 지시를 읽지 않으므로 응답 *내용*(확인 반응 · 재요구 0)은 여기서 판정하지 않는다 — 응답이 생겼는지만 본다.
async function partC() {
  const user = await newUser();
  const { sessionId } = await call("createSession", { scenarioId: "messenger-child-impersonation-kakao", voiceId: "generic-voice", difficultyLevel: "beginner" }, user.idToken);
  await call("sendMessage", { sessionId, userText: "응 무슨 일이야?" }, user.idToken);
  const before = await fsList(`sessions/${sessionId}/messages`);
  await fsWrite(`sessions/${sessionId}/messages/p2-chip`, {
    role: "scammer",
    textMasked: "엄마 이 계좌로 200만 원만 보내줘",
    turnIndex: Math.max(...before.map((m) => Number(m.turnIndex ?? 0))) + 1,
    createdAt: new Date(),
    attachments: [
      { kind: "link", displayText: "이체하기", fakeLandingId: "child-bank-transfer", harmless: true, bankName: "가온은행", accountNumber: "948-2716-5093-27", accountHolder: "김도현" },
    ],
  });
  await call("recordMockScreenEvent", { sessionId, landingId: "child-bank-transfer", event: "shown" }, user.idToken);
  await call("recordMockScreenEvent", { sessionId, landingId: "child-bank-transfer", event: "submitted" }, user.idToken);
  const reply = await call("sendMessage", { sessionId, photo: true, photoKind: "transfer-receipt" }, user.idToken);
  const messages = (await fsList(`sessions/${sessionId}/messages`)).sort((a, b) => Number(a.turnIndex) - Number(b.turnIndex));
  const sent = messages.filter((m) => m.role === "user").at(-1);
  check("C", "1 캡처 턴 저장 = 고정 문장 · photo · photoKind", sent?.textMasked === "(이체 완료 화면 캡처 1장을 보냈다)" && sent?.photo === true && sent?.photoKind === "transfer-receipt", {
    textMasked: sent?.textMasked,
    photo: sent?.photo,
    photoKind: sent?.photoKind,
  });
  check("C", "2 서버에 이미지 0(data URL · photoUrl 필드 없음)", messages.every((m) => !("photoUrl" in m) && !JSON.stringify(m).includes("data:image")));
  const after = messages.filter((m) => m.role === "scammer" && Number(m.turnIndex) > Number(sent?.turnIndex ?? 0));
  check("C", "3 사기범 응답 생성(Mock — 내용 판정 안 함)", after.length >= 1 && typeof reply === "object", { replyText: String(after[0]?.textMasked ?? "").slice(0, 80) });
  // 허용 값 밖 photoKind · 사진 턴이 아닌 photoKind는 버려진다(일반 사진 턴 · 일반 글자 턴).
  await call("sendMessage", { sessionId, photo: true, photoKind: "bogus" }, user.idToken);
  await call("sendMessage", { sessionId, userText: "보냈어", photoKind: "transfer-receipt" }, user.idToken);
  const users = (await fsList(`sessions/${sessionId}/messages`)).filter((m) => m.role === "user").sort((a, b) => Number(a.turnIndex) - Number(b.turnIndex));
  const [bogus, plain] = users.slice(-2);
  check("C", "4 허용 밖 종류 = 일반 사진 턴 · 글자 턴엔 종류 0", bogus?.photo === true && !bogus?.photoKind && bogus?.textMasked !== sent?.textMasked && !plain?.photo && !plain?.photoKind, {
    bogus: { textMasked: bogus?.textMasked, photoKind: bogus?.photoKind },
    plain: { textMasked: plain?.textMasked, photoKind: plain?.photoKind },
  });
  await call("endSession", { sessionId, endReason: "user_ended" }, user.idToken);
}

for (const [name, fn] of [["A", partA], ["B", partB], ["C", partC]]) {
  try {
    await fn();
  } catch (error) {
    check(name, "예외", false, String(error).slice(0, 400));
  }
}
const passed = results.checks.filter((c) => c.ok).length;
results.summary = `${passed}/${results.checks.length} PASS`;
writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(results.summary);
process.exit(passed === results.checks.length ? 0 : 1);
