#!/usr/bin/env node
// ⭐ 2026-11-08(사용자 결정 *"화면 문구 시험으로 대신"*) — 기관 사칭 고급 `fv-c5fj` 앱 안 대출 3통화(PR-B #518) 에뮬레이터 스모크.
// 라이브 재시험에서 이 루트가 뽑히지 않아 확인이 비었다 — 실 키 없이 **서버 콜러블 경로**를 통화 1 → 2 → 3 → 리포트까지 그대로 걷는다.
// ⛔ 측정 전용 — 앱 코드를 바꾸지 않는다. 에뮬레이터(auth + firestore + functions · 프로젝트 demo-test)에만 쓴다(호스트 127.0.0.1 고정).
//    LLM 키가 없으면 서버가 Mock으로 강등된다. 이 스크립트의 단언은 LLM 응답 내용에 기대지 않는다 — 대사는 아래 고정 전사를 화면처럼 제출한다.
//    ⚠️ 그래서 "모델이 그 순서로 말하고 도구를 부르는가"는 이 스모크가 보지 않는다(실 키 확인 몫).
//
// 사전: npm --prefix functions run build → (다른 셸) firebase emulators:start --only auth,firestore,functions --project demo-test
//       루트 강제 지정을 쓰려면 functions/.env.demo-test에 DEV_ROUTE_OVERRIDE=true(없으면 배정 덱을 돌려 fv-c5fj가 나올 때까지 새 세션 — 최대 4회).
// 사용법: node scripts/emulator-loan-route-smoke.mjs [--out <file>]
//
// (A) 실행 갈래(확인 전화에서 시킨 대로 둘러댐 → loanReview approved):
//   통화 1 검사 — 인증번호 · 안전계좌 · 대출 안내 문자 도착 → 대출 신청 화면 제출 전: goal 끊기 거절 · 다음 통화 screen_pending · 결과 기록 거절(R3)
//              → 안전계좌 · 대출 신청 화면 제출 → goal 끊기 승인 → 다음 통화(callback) 연결
//   통화 2 상담원(정당한 제3자) — 번호 = 가상 캐피탈 대출센터 · 결과 기록 approved(두 번째 기록은 첫 결과 유지) · 입금 안내 문자 도착 → 통화 3 연결
//   통화 3 검사 재통화 — 같은 번호 · 대출금 보관 계좌 문자 = loan-safe-transfer 이체 화면 · 제출 전 goal 거절(4-c) · 제출 뒤 승인
//   리포트 — 속은 순간(안전계좌 화면 · 대출 신청 화면 · 확인 전화 얼버무림 · 대출금 보관 이체 화면) · 교육점 4 · 상담원 대사 = 근거 0
// (B) 보류 갈래(확인 전화에서 사실대로 말함 → held): 입금 안내 문자 0 · 통화 3 보관 계좌 문자 선언 밖 · 포기 끝내기 승인
//   리포트 — 확인 전화 · 대출금 보관 이체 속은 순간 0 · 상담원 대사(검찰 · 금감원 언급) = 근거 0
// (C) 대출 신청 안 함: 참가자가 먼저 끊으면 같은 검사 재연결 · 신청 없이 goal 거절 · 포기 끝내기 뒤 확인 전화 = screen_pending · 결과 기록 거절
// 관찰(판정 아님 · OBS 줄): 결과 기록 직후 같은 발화 수로 상담원이 끊으면 — 실행은 입금 안내 문자가 막 도착해 6행(문자 대기)으로 막힌다.
// 2026-11-08 첫 실측: 58/58 PASS(2회 연속) · 브랜치 claude/loan-route-check = main 856ca024 + 이 스크립트.
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
const outFile = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : "emulator-loan-route-result.json";

const require = createRequire(import.meta.url);
const LIB = join(dirname(fileURLToPath(import.meta.url)), "..", "functions", "lib");
const { findMockScreenItem } = require(join(LIB, "scenarios", "mockScreens.js"));
const { findInCallSmsItem } = require(join(LIB, "scenarios", "inCallSms.js"));
const { findFlowVariant, INSTITUTION_LOAN_REPORT_LESSONS } = require(join(LIB, "scenarios", "flowVariants.js"));
const { LOAN_CHECK_COACHED_TACTIC } = require(join(LIB, "report", "analyzeConversation.js"));

const SCENARIO = "institutional-impersonation";
const VARIANT = "fv-c5fj";
const variant = findFlowVariant(VARIANT);
const PROSECUTOR_NUMBER = variant.legs[0].callerLabel;
const OFFICER_NUMBER = variant.legs[1].callerLabel;

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
  const res = await fetch(`${FS}/${collectionPath}?pageSize=300`, { headers: { Authorization: "Bearer owner" } });
  const json = await res.json();
  return (json.documents ?? []).map((d) => ({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, fromValue(v)])) }));
}
/** 콜러블 호출 — 오류는 던지지 않고 `{ ok:false, status }`로 돌려준다(거절 행을 단언하려고). */
async function call(fn, data, idToken) {
  const res = await fetch(`${FN}/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.error) return { ok: false, status: json.error.status, message: String(json.error.message ?? "").slice(0, 160) };
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
    body: JSON.stringify({ email: `loan-${crypto.randomUUID()}@example.com`, password: crypto.randomUUID(), returnSecureToken: true }),
  });
  const json = await res.json();
  if (!json.idToken) throw new Error(`signUp 실패: ${JSON.stringify(json).slice(0, 200)}`);
  await fsWrite(`users/${json.localId}/consents/c1`, { granted: true, createdAt: new Date() });
  return { idToken: json.idToken, uid: json.localId };
}

const results = { checks: [], observations: [] };
function check(part, name, ok, detail) {
  results.checks.push({ part, name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"} [${part}] ${name}${detail !== undefined ? ` ${JSON.stringify(detail)}` : ""}`);
}

/** fv-c5fj 세션 — 루트 강제 지정(DEV_ROUTE_OVERRIDE=true)이 꺼져 있으면 배정 덱(3루트)을 돌려 나올 때까지(최대 4회 · 아닌 세션은 끝낸다). */
async function loanSession(user) {
  for (let i = 0; i < 4; i += 1) {
    const { sessionId } = await mustCall(
      "createSession",
      { scenarioId: SCENARIO, voiceId: "generic-voice", difficultyLevel: "advanced", forceVariantId: VARIANT },
      user.idToken,
    );
    const session = await fsRead(`sessions/${sessionId}`);
    if (session?.flowVariantId === VARIANT) return { sessionId, session, tries: i + 1 };
    await call("endSession", { sessionId, endReason: "user_ended" }, user.idToken);
  }
  throw new Error(`${VARIANT} 배정 실패(4회)`);
}

/** 화면이 레그 끝에 하는 것과 같은 전사 제출(통화 번호는 서버 relay가 찍는다). */
async function submitTurns(sessionId, idToken, turns) {
  const r = await call("submitRealtimeTranscript", { sessionId, turns, batchId: crypto.randomUUID().replace(/-/g, "") }, idToken);
  if (!r.ok) throw new Error(`submitRealtimeTranscript 실패: ${r.status} ${r.message}`);
}
const messagesOf = (sessionId) => fsList(`sessions/${sessionId}/messages`);
const userCount = async (sessionId) => (await messagesOf(sessionId)).filter((m) => m.role === "user").length;
const sms = (sessionId, smsId) => fsRead(`sessions/${sessionId}/inCallSms/${smsId}`);
const hangup = (sessionId, idToken, userTurns, kind = "goal") => call("requestScammerHangup", { sessionId, userTurns, pendingInstruction: false, kind }, idToken);
const statusOf = (r) => (r.ok ? r.result?.status : r.status);

// 통화 1 — 검사(사기범) · 참가자 대사.
const LEG0_TURNS = [
  { role: "scammer", text: "한빛지방검찰청 첨단범죄수사팀 검사입니다. 고객님 명의 계좌가 금융 범죄에 연루돼 연락드렸습니다." },
  { role: "user", text: "네? 제 계좌가요?" },
  { role: "scammer", text: "협조하지 않으시면 피의자로 소환될 수 있습니다. 본인 확인 위해 성함과 생년월일 말씀해 주세요." },
  { role: "user", text: "네 알겠습니다." },
  { role: "scammer", text: "지금 거래하시는 은행과 예금 규모가 어떻게 되십니까?" },
  { role: "user", text: "가온은행에 천만 원 정도 있어요." },
  { role: "scammer", text: "문자로 인증번호 보내 드렸습니다. 번호 불러 주세요." },
  { role: "user", text: "네 확인했어요." },
  { role: "scammer", text: "자산 보호를 위해 안전계좌로 980만 원을 옮기셔야 합니다. 문자 링크에서 이체하세요." },
  { role: "user", text: "이체했어요." },
  { role: "scammer", text: "정상 대출을 한 번 받아 보셔야 명의 도용이 입증됩니다. 안내 문자 링크에서 비대면으로 신청하세요. 용도는 생활비로 고르세요." },
  { role: "user", text: "신청했어요." },
  { role: "scammer", text: "곧 금융회사에서 확인 전화가 갑니다. 누가 시켰냐 물으면 아니라고만 하세요. 수사 기밀입니다." },
  { role: "user", text: "알겠습니다." },
];

/** 통화 1(공통) — 문자 3통 도착 · 화면 보류 판정 · 제출 · 끊기 승인 · 통화 2 연결. */
async function legZero(part, user, sessionId) {
  await submitTurns(sessionId, user.idToken, LEG0_TURNS);
  const leg0 = (await messagesOf(sessionId)).filter((m) => m.role === "user" || m.role === "scammer");
  check(part, "1-0 통화 1 전사 = 통화 번호 0(또는 부재)", leg0.every((m) => m.legIndex === undefined || m.legIndex === 0), {
    userTurns: leg0.filter((m) => m.role === "user").length,
    legIndexes: [...new Set(leg0.map((m) => m.legIndex ?? null))],
  });

  const otp = await call("deliverInCallSms", { sessionId, trigger: "model_tool", purpose: "identity", userTurns: 5, scammerTranscriptTurns: 4 }, user.idToken);
  const safe = await call("deliverInCallSms", { sessionId, trigger: "model_tool", purpose: "transfer", userTurns: 6, scammerTranscriptTurns: 5 }, user.idToken);
  const safeDoc = await sms(sessionId, "institution-asset-safe-account");
  check(part, "1-1 인증번호 · 안전계좌 문자 도착(안전계좌 = 이체 화면 · 980만 원)", statusOf(otp) === "delivered" && statusOf(safe) === "delivered" && Boolean(safeDoc?.fakeLandingId) && safeDoc?.transferAmount === "9800000", {
    otp: statusOf(otp),
    safe: statusOf(safe),
    fakeLandingId: safeDoc?.fakeLandingId,
    transferAmount: safeDoc?.transferAmount,
  });
  const early = await call("deliverInCallSms", { sessionId, trigger: "model_tool", purpose: "link", userTurns: 8, scammerTranscriptTurns: 6 }, user.idToken);
  check(part, "1-2 대출 안내 문자 하한(발화 9) 전 = 도착 0", statusOf(early) !== "delivered", { status: statusOf(early) });
  const guide = await call("deliverInCallSms", { sessionId, trigger: "model_tool", purpose: "link", userTurns: 9, scammerTranscriptTurns: 6 }, user.idToken);
  const guideDoc = await sms(sessionId, "institution-loan-guide");
  check(part, "1-3 대출 안내 문자 = 앱 안 대출 신청 화면 링크(loan-apply)", statusOf(guide) === "delivered" && guideDoc?.fakeLandingId === "loan-apply", {
    status: statusOf(guide),
    fakeLandingId: guideDoc?.fakeLandingId,
    body: String(guideDoc?.body ?? "").slice(0, 70),
  });

  // 화면 제출 전 — 통화 1을 끝낼 수 없고 · 다음 통화가 오지 않고 · 상담원 결과를 적을 수 없다.
  const holdHangup = await hangup(sessionId, user.idToken, 10);
  check(part, "1-4 화면 제출 전 goal 끊기 = 거절(레그 화면 보류)", holdHangup.ok && statusOf(holdHangup) !== "accepted", { status: statusOf(holdHangup), row: holdHangup.result?.row });
  const holdLeg = await call("startCallLeg", { sessionId, action: "callback" }, user.idToken);
  // 통화 1이 끝나지 않았으면 다음 통화는 오지 않는다(끊기가 막혀 있으니 이 자리는 leg_in_progress — screen_pending은 참가자가 먼저 끊은 갈래 C).
  check(part, "1-5 대출 신청 제출 전 다음 통화 = not_ready(leg_in_progress)", holdLeg.result?.status === "not_ready" && holdLeg.result?.reason === "leg_in_progress", holdLeg.result ?? holdLeg);
  const earlyReview = await call("recordLoanReview", { sessionId, outcome: "approved" }, user.idToken);
  check(part, "1-6 통화 1(사기범 레그)에서 확인 결과 기록 = 거절(R3)", !earlyReview.ok && earlyReview.status === "FAILED_PRECONDITION", { status: statusOf(earlyReview) });

  // 안전계좌 이체 화면 · 대출 신청 화면 제출(화면이 보내는 그대로 — 고정 이벤트 · 비교 결과 1개 · 금액 0).
  await mustCall("recordInCallSmsEvent", { sessionId, smsId: "institution-asset-safe-account", event: "link_tapped" }, user.idToken);
  await mustCall("recordInCallSmsEvent", { sessionId, smsId: "institution-asset-safe-account", event: "landing_submitted", amountComparison: "equal" }, user.idToken);
  const halfHangup = await hangup(sessionId, user.idToken, 10);
  check(part, "1-7 안전계좌만 제출 = 아직 거절(대출 신청 화면 남음)", statusOf(halfHangup) !== "accepted", { status: statusOf(halfHangup), row: halfHangup.result?.row });
  await mustCall("recordInCallSmsEvent", { sessionId, smsId: "institution-loan-guide", event: "link_tapped" }, user.idToken);
  await mustCall("recordInCallSmsEvent", { sessionId, smsId: "institution-loan-guide", event: "landing_submitted" }, user.idToken);
  const guideAfter = await sms(sessionId, "institution-loan-guide");
  // `purpose` 키 = 문자 목적("link") — 대출 용도가 아니다. 신청 금액 · 대출 용도를 담을 필드가 없어야 한다(G138).
  check(part, "1-8 대출 신청 제출 기록 = 단계 표식만(신청 금액 · 대출 용도 필드 0)", Boolean(guideAfter?.landingSubmittedAt) && guideAfter?.purpose === "link" && !Object.keys(guideAfter ?? {}).some((k) => /amount|loanPurpose|value/i.test(k)), {
    keys: Object.keys(guideAfter ?? {}).sort(),
    purpose: guideAfter?.purpose,
  });
  const leg0Hangup = await hangup(sessionId, user.idToken, 11);
  check(part, "1-9 두 화면 제출 뒤 goal 끊기 = 승인", statusOf(leg0Hangup) === "accepted", { status: statusOf(leg0Hangup), row: leg0Hangup.result?.row });

  const leg1 = await call("startCallLeg", { sessionId, action: "callback" }, user.idToken);
  check(part, "2-0 통화 2 연결 = 가상 캐피탈 대출센터 번호", leg1.result?.status === "connected" && leg1.result?.legIndex === 1 && leg1.result?.callerLabel === OFFICER_NUMBER, leg1.result ?? leg1);
  const cred1 = await call("createRealtimeCall", { sessionId }, user.idToken);
  check(part, "2-1 통화 2 실시간 발급 = 레그 1 표시값(번호 · 수신)", cred1.ok && cred1.result?.callLeg?.legIndex === 1 && cred1.result?.callLeg?.callerLabel === OFFICER_NUMBER && cred1.result?.callLeg?.entry === "incoming", {
    status: cred1.ok ? "ok" : cred1.status,
    callLeg: cred1.result?.callLeg ?? null,
    provider: cred1.result?.provider,
    isMock: cred1.result?.isMock,
  });
}

/** 통화 2 → 3 공통 — 결과 기록 · 문자 · 통화 3 연결. */
async function legOneThenRecall(part, user, sessionId, outcome, officerTurns) {
  await submitTurns(sessionId, user.idToken, officerTurns);
  const leg1Msgs = (await messagesOf(sessionId)).filter((m) => officerTurns.some((t) => t.text === m.textMasked));
  check(part, "2-2 통화 2 전사 = 통화 번호 1", leg1Msgs.length === officerTurns.length && leg1Msgs.every((m) => m.legIndex === 1), {
    stored: leg1Msgs.length,
    legIndexes: [...new Set(leg1Msgs.map((m) => m.legIndex ?? null))],
  });
  const first = await mustCall("recordLoanReview", { sessionId, outcome }, user.idToken);
  const second = await mustCall("recordLoanReview", { sessionId, outcome: outcome === "approved" ? "held" : "approved" }, user.idToken);
  const session = await fsRead(`sessions/${sessionId}`);
  check(part, `2-3 확인 결과 기록 = ${outcome} · 두 번째 기록은 첫 결과 유지(R4)`, first.recorded === true && first.outcome === outcome && second.recorded === false && second.outcome === outcome && session?.loanReview?.outcome === outcome, {
    first: { recorded: first.recorded, outcome: first.outcome, guidance: String(first.guidance ?? "").slice(0, 40) },
    second: { recorded: second.recorded, outcome: second.outcome },
    stored: session?.loanReview?.outcome,
  });
  const disbursed = await sms(sessionId, "institution-loan-disbursed");
  check(part, outcome === "approved" ? "2-4 실행 = 입금 안내 문자 도착" : "2-4 보류 = 입금 안내 문자 0", outcome === "approved" ? Boolean(disbursed) : !disbursed, {
    exists: Boolean(disbursed),
    body: String(disbursed?.body ?? "").slice(0, 70),
  });
  // 관찰(판정 아님) — 결과 기록 직후 같은 발화 수로 끊으면? 실행이면 입금 안내 문자가 막 도착해 6행(문자 대기)일 수 있다.
  const immediate = await hangup(sessionId, user.idToken, await userCount(sessionId));
  results.observations.push({ part, what: `결과 기록(${outcome}) 직후 같은 발화 수로 상담원 goal 끊기`, status: statusOf(immediate), row: immediate.result?.row });
  if (statusOf(immediate) !== "accepted") {
    // 참가자가 안내에 한 마디 답한 뒤 끊는다(실제 통화 흐름).
    await submitTurns(sessionId, user.idToken, [{ role: "user", text: outcome === "approved" ? "네 감사합니다." : "네 경찰에 확인해 볼게요." }]);
  }
  const leg1Hangup = statusOf(immediate) === "accepted" ? immediate : await hangup(sessionId, user.idToken, await userCount(sessionId));
  check(part, "2-5 상담원 통화 끝 = 승인(참가자 답 뒤)", statusOf(leg1Hangup) === "accepted", { status: statusOf(leg1Hangup), row: leg1Hangup.result?.row });
  const leg2 = await call("startCallLeg", { sessionId, action: "callback" }, user.idToken);
  check(part, "3-0 통화 3 연결 = 통화 1과 같은 번호", leg2.result?.status === "connected" && leg2.result?.legIndex === 2 && leg2.result?.callerLabel === PROSECUTOR_NUMBER, leg2.result ?? leg2);
  const lateReview = await call("recordLoanReview", { sessionId, outcome }, user.idToken);
  check(part, "3-1 통화 3(사기범 레그)에서 확인 결과 기록 = 거절(R3)", !lateReview.ok && lateReview.status === "FAILED_PRECONDITION", { status: statusOf(lateReview) });
}

async function reportOf(user, sessionId) {
  const current = await fsRead(`sessions/${sessionId}`);
  if (current?.status === "active") await mustCall("endSession", { sessionId, endReason: "user_ended" }, user.idToken);
  const { reportId } = await mustCall("generateReport", { sessionId }, user.idToken);
  return fsRead(`reports/${reportId}`);
}
const leg1TurnIndexes = async (sessionId, role) =>
  (await messagesOf(sessionId)).filter((m) => m.legIndex === 1 && (role === undefined || m.role === role)).map((m) => Number(m.turnIndex));

async function partA() {
  const user = await newUser();
  const { sessionId, tries } = await loanSession(user);
  check("A", "0 기관 사칭 고급 fv-c5fj · 3통화", variant.legs.length === 3 && variant.legs[1].genuine === true, { sessionId, tries });
  await legZero("A", user, sessionId);
  await legOneThenRecall("A", user, sessionId, "approved", [
    { role: "scammer", text: "안녕하세요, 비대면 대출센터입니다. 방금 접수된 신용대출 본인이 직접 신청하셨나요?" },
    { role: "user", text: "네 제가 했어요." },
    { role: "scammer", text: "대출 용도가 어떻게 되실까요?" },
    { role: "user", text: "생활비요." },
    { role: "scammer", text: "혹시 누가 대출을 권했거나 지금 누구와 통화하면서 진행하시나요?" },
    { role: "user", text: "아니요, 혼자 했어요." },
    { role: "scammer", text: "확인됐습니다. 오늘 중 신청하신 계좌로 대출금이 입금됩니다." },
  ]);

  // 통화 3 — 대출금 보관 계좌 문자(실행일 때만 선언) → 이체 화면.
  await submitTurns(sessionId, user.idToken, [
    { role: "scammer", text: "검사입니다. 확인 전화 받으셨죠? 대출금은 입증이 끝날 때까지 보관 계좌로 옮기셔야 합니다." },
    { role: "user", text: "네 들어왔어요." },
  ]);
  const before = await userCount(sessionId);
  // 앵커 입력 = 세션 누적 사기범 전사 수(백스톱 경로 `turnCountersRef`와 같은 값). ⚠️ 실시간 모델 도구 경로는 통화마다 0부터 센 값을 보낸다(보고서 참고).
  const scammerSoFar = (await messagesOf(sessionId)).filter((m) => m.role === "scammer" && m.legIndex !== undefined).length;
  const keep = await call("deliverInCallSms", { sessionId, trigger: "model_tool", purpose: "transfer", userTurns: before, scammerTranscriptTurns: scammerSoFar }, user.idToken);
  const keepDoc = await sms(sessionId, "institution-loan-safe-account");
  check("A", "3-2 대출금 보관 계좌 문자 = 이체 화면 loan-safe-transfer · 받는 분 · 은행 · 계좌", statusOf(keep) === "delivered" && keepDoc?.fakeLandingId === "loan-safe-transfer" && Boolean(keepDoc?.accountHolder) && Boolean(keepDoc?.bankName) && Boolean(keepDoc?.accountNumber), {
    status: statusOf(keep),
    fakeLandingId: keepDoc?.fakeLandingId,
    accountHolder: keepDoc?.accountHolder,
    bankName: keepDoc?.bankName,
    transferAmount: keepDoc?.transferAmount ?? null,
  });
  const safeDoc = await sms(sessionId, "institution-asset-safe-account");
  check("A", "3-3 보관 계좌 ≠ 통화 1 안전계좌(같은 계좌 합계 섞임 0)", Boolean(keepDoc?.accountNumber) && keepDoc?.accountNumber !== safeDoc?.accountNumber, { keep: keepDoc?.accountNumber, safe: safeDoc?.accountNumber });
  const recallEarly = await hangup(sessionId, user.idToken, before + 3);
  check("A", "3-4 보관 이체 제출 전 goal 끊기 = 거절(4-c)", statusOf(recallEarly) !== "accepted", { status: statusOf(recallEarly), row: recallEarly.result?.row });
  await mustCall("recordInCallSmsEvent", { sessionId, smsId: "institution-loan-safe-account", event: "link_tapped" }, user.idToken);
  await mustCall("recordInCallSmsEvent", { sessionId, smsId: "institution-loan-safe-account", event: "landing_submitted", amountComparison: "equal" }, user.idToken);
  await submitTurns(sessionId, user.idToken, [
    { role: "scammer", text: "확인됐습니다. 입증 끝나면 상환 처리됩니다. 이 일은 가족에게도 비밀입니다." },
    { role: "user", text: "네." },
  ]);
  const recallDone = await hangup(sessionId, user.idToken, (await userCount(sessionId)) + 1);
  check("A", "3-5 보관 이체 제출 뒤 goal 끊기 = 승인", statusOf(recallDone) === "accepted", { status: statusOf(recallDone), row: recallDone.result?.row });

  const leg1All = await leg1TurnIndexes(sessionId);
  const leg1User = await leg1TurnIndexes(sessionId, "user");
  const report = await reportOf(user, sessionId);
  const moments = report?.deceivedMoments ?? [];
  const tacticOf = (smsId) => findMockScreenItem(SCENARIO, findInCallSmsItem(SCENARIO, smsId)?.fakeLandingId)?.momentTactic;
  const has = (smsId) => moments.some((m) => m.tactic === tacticOf(smsId));
  check("A", "4-1 속은 순간 = 안전계좌 화면 · 대출 신청 화면 · 대출금 보관 이체 화면", has("institution-asset-safe-account") && has("institution-loan-guide") && has("institution-loan-safe-account"), {
    expected: ["institution-asset-safe-account", "institution-loan-guide", "institution-loan-safe-account"].map(tacticOf),
    moments: moments.map((m) => ({ tactic: m.tactic, turnIndex: m.turnIndex })),
  });
  const leg2Turns = (await messagesOf(sessionId)).filter((m) => m.legIndex === 2).map((m) => Number(m.turnIndex));
  const keepMoment = moments.find((m) => m.tactic === tacticOf("institution-loan-safe-account"));
  check("A", "4-1b 대출금 보관 이체 속은 순간 = 통화 3 안 턴", keepMoment !== undefined && keepMoment.turnIndex >= Math.min(...leg2Turns), { turnIndex: keepMoment?.turnIndex, leg2From: Math.min(...leg2Turns) });
  const coached = moments.filter((m) => m.tactic === LOAN_CHECK_COACHED_TACTIC);
  check("A", "4-2 확인 전화 얼버무림 = 속은 순간 1개(상담원 통화 마지막 참가자 줄)", coached.length === 1 && coached[0].turnIndex === Math.max(...leg1User), {
    coached: coached.map((m) => ({ turnIndex: m.turnIndex, correctAction: String(m.correctAction ?? "").slice(0, 50) })),
    leg1User,
  });
  const nonCoachedAtLeg1 = [...moments.filter((m) => m.tactic !== LOAN_CHECK_COACHED_TACTIC), ...(report?.riskSignals ?? [])].filter((m) => leg1All.includes(Number(m.turnIndex)));
  check("A", "4-3 상담원 통화 줄 = 그 밖의 속은 순간 · 위험 신호 근거 0", nonCoachedAtLeg1.length === 0, { leg1All, found: nonCoachedAtLeg1 });
  const advice = report?.preventionAdvice ?? [];
  check("A", "4-4 교육점 4개(대출 루트 reportLessons)", INSTITUTION_LOAN_REPORT_LESSONS.every((lesson) => advice.includes(lesson)), { adviceCount: advice.length });
  results.reportA = { wasDeceived: report?.wasDeceived, tacticsUsed: report?.tacticsUsed, moments: moments.map((m) => ({ tactic: m.tactic, turnIndex: m.turnIndex })) };
}

async function partB() {
  const user = await newUser();
  const { sessionId, tries } = await loanSession(user);
  check("B", "0 기관 사칭 고급 fv-c5fj", true, { sessionId, tries });
  await legZero("B", user, sessionId);
  await legOneThenRecall("B", user, sessionId, "held", [
    { role: "scammer", text: "안녕하세요, 비대면 대출센터입니다. 방금 접수된 신용대출 본인이 직접 신청하셨나요?" },
    { role: "user", text: "검사라는 분이 대출을 받아 보라고 해서요." },
    { role: "scammer", text: "혹시 검찰이나 금융감독원이라며 연락받으셨나요?" },
    { role: "user", text: "네 한빛지방검찰청 검사라고 했어요." },
    { role: "scammer", text: "검찰 · 경찰 · 금융감독원은 대출을 받으라고 하지 않습니다. 보이스피싱이 의심되어 대출 실행을 보류합니다. 지금 통화하던 분과는 연락을 끊고 경찰에 확인해 주세요." },
    { role: "user", text: "그럼 대출은 안 받을게요." },
  ]);
  await submitTurns(sessionId, user.idToken, [
    { role: "scammer", text: "그 직원이 범죄 조직과 연결돼 있을 수 있습니다. 그렇게 말하면 수사가 방해됩니다. 다시 신청하세요." },
    { role: "user", text: "안 할게요." },
  ]);
  const keep = await call("deliverInCallSms", { sessionId, trigger: "model_tool", purpose: "transfer", userTurns: await userCount(sessionId), scammerTranscriptTurns: 1 }, user.idToken);
  const keepDoc = await sms(sessionId, "institution-loan-safe-account");
  check("B", "3-2 보류 = 대출금 보관 계좌 문자 선언 밖(도착 0)", statusOf(keep) !== "delivered" && !keepDoc, { status: statusOf(keep) });
  const giveUp = await hangup(sessionId, user.idToken, (await userCount(sessionId)) + 1, "give_up");
  check("B", "3-3 보류 뒤 포기 끝내기 = 승인", statusOf(giveUp) === "accepted", { status: statusOf(giveUp), row: giveUp.result?.row });

  const leg1All = await leg1TurnIndexes(sessionId);
  const report = await reportOf(user, sessionId);
  const moments = report?.deceivedMoments ?? [];
  const keepTactic = findMockScreenItem(SCENARIO, "loan-safe-transfer")?.momentTactic;
  check("B", "4-1 보류 = 확인 전화 · 대출금 보관 이체 속은 순간 0", !moments.some((m) => m.tactic === LOAN_CHECK_COACHED_TACTIC || m.tactic === keepTactic), {
    moments: moments.map((m) => ({ tactic: m.tactic, turnIndex: m.turnIndex })),
  });
  const atLeg1 = [...moments, ...(report?.riskSignals ?? [])].filter((m) => leg1All.includes(Number(m.turnIndex)));
  check("B", "4-2 상담원 통화 줄(검찰 · 금감원 언급) = 속은 순간 · 위험 신호 근거 0", atLeg1.length === 0, { leg1All, found: atLeg1 });
  results.reportB = { wasDeceived: report?.wasDeceived, tacticsUsed: report?.tacticsUsed, moments: moments.map((m) => ({ tactic: m.tactic, turnIndex: m.turnIndex })) };
}

// (C) 대출을 신청하지 않은 갈래 — 참가자가 먼저 끊으면 같은 검사가 다시 건다(같은 레그 재연결) · 검사가 포기 끝내기로 끊으면 확인 전화는 오지 않는다(screen_pending).
async function partC() {
  const user = await newUser();
  const { sessionId, tries } = await loanSession(user);
  check("C", "0 기관 사칭 고급 fv-c5fj", true, { sessionId, tries });
  await submitTurns(sessionId, user.idToken, LEG0_TURNS.slice(0, 12));
  await mustCall("deliverInCallSms", { sessionId, trigger: "model_tool", purpose: "identity", userTurns: 5, scammerTranscriptTurns: 4 }, user.idToken);
  await mustCall("deliverInCallSms", { sessionId, trigger: "model_tool", purpose: "transfer", userTurns: 6, scammerTranscriptTurns: 5 }, user.idToken);
  await mustCall("deliverInCallSms", { sessionId, trigger: "model_tool", purpose: "link", userTurns: 9, scammerTranscriptTurns: 6 }, user.idToken);
  const ended = await call("startCallLeg", { sessionId, action: "hangup" }, user.idToken);
  check("C", "1 참가자 먼저 끊음 = 통화 1 끝(세션 계속)", ended.result?.status === "ended" && ended.result?.legIndex === 0, ended.result ?? ended);
  const rejoin = await call("startCallLeg", { sessionId, action: "callback" }, user.idToken);
  check("C", "2 신청 전 다시 걸려 오는 전화 = 같은 검사(통화 1 재연결 · 확인 전화 아님)", rejoin.result?.status === "connected" && rejoin.result?.legIndex === 0 && rejoin.result?.rejoin === "callback" && rejoin.result?.callerLabel === PROSECUTOR_NUMBER, rejoin.result ?? rejoin);
  await submitTurns(sessionId, user.idToken, [
    { role: "scammer", text: "왜 끊으셨습니까? 대출 신청을 마치셔야 입증이 끝납니다." },
    { role: "user", text: "대출은 안 받을래요." },
    { role: "scammer", text: "그러면 불이익이 있을 수 있습니다. 다시 생각해 보세요." },
    { role: "user", text: "싫어요, 경찰에 물어볼게요." },
    { role: "scammer", text: "알겠습니다. 협조하지 않으시면 어쩔 수 없습니다." },
    { role: "user", text: "네." },
  ]);
  const goalNoApply = await hangup(sessionId, user.idToken, (await userCount(sessionId)) + 1, "goal");
  check("C", "3 신청 없이 goal 끊기 = 거절(레그 화면 보류)", statusOf(goalNoApply) !== "accepted", { status: statusOf(goalNoApply), row: goalNoApply.result?.row });
  const giveUp = await hangup(sessionId, user.idToken, (await userCount(sessionId)) + 1, "give_up");
  check("C", "4 신청 거절 뒤 포기 끝내기 = 승인", statusOf(giveUp) === "accepted", { status: statusOf(giveUp), row: giveUp.result?.row });
  const pending = await call("startCallLeg", { sessionId, action: "callback" }, user.idToken);
  check("C", "5 대출 신청 안 함 = 확인 전화 안 옴(not_ready · screen_pending)", pending.result?.status === "not_ready" && pending.result?.reason === "screen_pending", pending.result ?? pending);
  const review = await call("recordLoanReview", { sessionId, outcome: "approved" }, user.idToken);
  check("C", "6 확인 전화 없이 결과 기록 = 거절(R3)", !review.ok && review.status === "FAILED_PRECONDITION", { status: statusOf(review) });
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
for (const o of results.observations) console.log(`OBS [${o.part}] ${o.what} ${JSON.stringify(o.status ?? o.result)}${o.row ? ` row ${o.row}` : ""}`);
writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(results.summary);
process.exit(passed === results.checks.length ? 0 : 1);
