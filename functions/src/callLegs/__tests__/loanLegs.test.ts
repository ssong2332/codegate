// ⭐ PR-B(2026-11-07 사용자 신고 — 기관 사칭 고급 *"대출 관련돼서 안내하다가 그냥 전화 끊는 문제"* · 결정 "앱 안 대출 체험" D-L1 ~ D-L7).
// 설계 docs/research/institution-advanced-loan-design-2026-11-07.md §3 · §5 · §6 · §7.
// | # | 고정하는 것 |
// |---|---|
// | B1 | fv-c5fj = 3통화(검사 · 대출 실행 확인 상담원 · 같은 검사) · 나감 incoming · 상담원 = 정당한 제3자(수법 0) · 검사 두 통화 = 같은 목소리 |
// | B2 | 다음 통화(확인 전화)는 대출 신청 화면을 제출해야 온다 — 미제출 = not_ready(screen_pending) · 참가자 끊기 뒤 callback도 같은 조건 |
// | B3 | 통화별 문자 선언 — 통화 3 대출금 보관 계좌 문자는 확인 결과 = 실행일 때만 |
// | B4 | 화면 보류 레그(통화 1)는 화면을 마치기 전 goal 끊기 4-c 대기 · 다 마치면 해제 |
// | B5 | 통화 3 맥락 줄 = 같은 사람이 다시 건 통화 + 확인 결과(대화 원문 0) |
// | B6 | 상담원 프롬프트 · 도구 — 사기범 조립 0 · 가상 캐피탈명 · 결과 보고 + 끊기만 |
// | B7 | 결과 기록 판정(`recordLoanReview` R1 · R3) |
// | B8 | 리포트 — 상담원 대사는 사기 대사가 아니다 · 실행 = 속은 순간 1개 |
// | B9 | 대출 신청 제출 맥락 1줄 · 카탈로그(문자 · 화면 · 이체 화면 목록) |
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findFlowVariant,
  genuineLegOf,
  MULTI_CALL_LEG_END_INCOMING,
  multiCallLegTactics,
  resolveSessionScenarioPrompt,
} from "../../scenarios/flowVariants";
import { buildLegLoanReviewContext, legVoiceSlot, planLegHangup, planLegStart, type RelayState } from "../legPlan";
import { resolveDeclaredSms } from "../../inCallSms/smsGate";
import { isLegScreenHoldPending } from "../../scammerHangup/goalAction";
import { buildGenuineLegPrompt, LIVE_TOOL_REPORT_LOAN_REVIEW_NAME } from "../../roleplay/genuineLegPrompt";
import { buildGenuineLegToolDeclarations, buildGenuineLegToolNames, LIVE_TOOL_END_CALL } from "../../realtime/liveTools";
import { canRecordLoanReview, readRecordLoanReviewRequest } from "../loanReview";
import { analyzeConversation, LOAN_CHECK_COACHED_TACTIC } from "../../report/analyzeConversation";
import { landingSubmittedInstructionFor, LOAN_APPLY_SUBMITTED_INSTRUCTION, LANDING_SUBMITTED_INSTRUCTION } from "../../inCallSms/confirmResult";
import { findInCallSmsItem } from "../../scenarios/inCallSms";
import { BANK_TRANSFER_LANDINGS, findMockScreenItem } from "../../scenarios/mockScreens";
import { nextLegLandingIds } from "../request";

const SCENARIO = "institutional-impersonation";
const c5fj = findFlowVariant("fv-c5fj")!;
const ended = (legIndex: number, extra: Partial<RelayState> = {}): RelayState => ({
  legIndex,
  legStartUserTurns: [0, 12, 18].slice(0, legIndex + 1),
  connected: false,
  legEnded: legIndex,
  ...extra,
});

test("[B1] fv-c5fj = 3통화 · 나감 incoming · 상담원 = 정당한 제3자 · 검사 두 통화 같은 목소리", () => {
  assert.equal(c5fj.multiCall, true);
  assert.equal(c5fj.legs.length, 3);
  assert.deepEqual(c5fj.legs.map((leg) => leg.exit), ["incoming", "incoming", undefined]);
  assert.deepEqual(c5fj.legs.map((leg) => leg.genuine === true), [false, true, false]);
  assert.equal(c5fj.legs[0].holdUntilScreens, true);
  assert.equal(c5fj.legs[0].opensNextAfterLanding, "loan-apply");
  assert.equal(c5fj.goalFollowUpUserTurns, undefined, "후속 단계 판정은 쓰지 않는다(화면 보류 · 4-c가 맡는다)");
  assert.deepEqual(multiCallLegTactics(c5fj)![1], [], "상담원 통화 수법 0");
  assert.deepEqual(legVoiceSlot(c5fj, 0), legVoiceSlot(c5fj, 2), "같은 검사 = 같은 목소리 자리");
  assert.equal(c5fj.legs[0].callerLabel, c5fj.legs[2].callerLabel, "같은 번호로 다시 건다");
  assert.notEqual(c5fj.legs[1].callerLabel, c5fj.legs[0].callerLabel);
  // 통화 1 프롬프트 끝 규칙 = 다른 사람이 따로 걸어 온다(넘기기 아님).
  assert.ok(resolveSessionScenarioPrompt(SCENARIO, "fv-c5fj", 0)!.personaPrompt.includes(MULTI_CALL_LEG_END_INCOMING));
  assert.ok(c5fj.reportLessons && c5fj.reportLessons.length === 4);
});

test("[B2] 확인 전화는 대출 신청 화면 제출 뒤에만 — 미제출 = screen_pending · 참가자 끊기 뒤 callback도 같은 조건", () => {
  const base = { variant: c5fj, action: "callback" as const, installConsented: false, userTurns: 12 };
  assert.deepEqual(planLegStart({ ...base, relay: ended(0) }), { status: "not_ready", reason: "screen_pending" });
  const opened = planLegStart({ ...base, relay: ended(0), submittedLandings: ["loan-apply"] });
  assert.equal(opened.status, "connected");
  if (opened.status === "connected") {
    assert.equal(opened.legIndex, 1);
    assert.equal(opened.entry, "incoming");
    assert.equal(opened.rejoin, undefined);
  }
  // 참가자가 통화 1을 먼저 끊었다: 신청 전 = 같은 검사가 다시 건다(재연결) · 신청 뒤 = 확인 전화(다음 통화).
  const hung = planLegHangup(c5fj, { legIndex: 0, legStartUserTurns: [0] });
  assert.equal(hung.status, "ended");
  const hungRelay = hung.status === "ended" ? hung.relay : undefined;
  const rejoin = planLegStart({ ...base, relay: hungRelay });
  assert.equal(rejoin.status === "connected" && rejoin.legIndex === 0 && rejoin.rejoin === "callback", true);
  const next = planLegStart({ ...base, relay: hungRelay, submittedLandings: ["loan-apply"] });
  assert.equal(next.status === "connected" && next.legIndex === 1 && next.rejoin === undefined, true);
  // 통화 2 → 통화 3(조건 없음).
  const recall = planLegStart({ ...base, relay: ended(1) });
  assert.equal(recall.status === "connected" && recall.legIndex === 2, true);
  // 다른 행동은 그대로 막힌다.
  assert.deepEqual(planLegStart({ ...base, action: "transfer", relay: ended(0), submittedLandings: ["loan-apply"] }), {
    status: "not_ready",
    reason: "wrong_action",
  });
  assert.deepEqual(nextLegLandingIds(c5fj), [{ landingId: "loan-apply", smsIds: ["institution-loan-guide"] }]);
});

test("[B3] 통화별 문자 선언 — 통화 3 대출금 보관 계좌는 실행일 때만", () => {
  const ids = (relay: RelayState, loanReview?: "approved" | "held") =>
    resolveDeclaredSms(SCENARIO, "fv-c5fj", { relay, loanReview }).declared.map((s) => s.smsId);
  assert.deepEqual(ids({ legIndex: 0, legStartUserTurns: [0] }), ["institution-otp", "institution-asset-safe-account", "institution-loan-guide"]);
  assert.deepEqual(ids({ legIndex: 1, legStartUserTurns: [0, 12] }), [], "상담원은 문자를 보내지 않는다");
  assert.deepEqual(ids({ legIndex: 2, legStartUserTurns: [0, 12, 18] }), [], "결과 없음 = 선언 0");
  assert.deepEqual(ids({ legIndex: 2, legStartUserTurns: [0, 12, 18] }, "held"), []);
  assert.deepEqual(ids({ legIndex: 2, legStartUserTurns: [0, 12, 18] }, "approved"), ["institution-loan-safe-account"]);
  // 레그 밖 판정 지점(도달 랜딩 · 계좌)은 전체 선언 그대로.
  assert.equal(resolveDeclaredSms(SCENARIO, "fv-c5fj").declared.length, 4);
});

test("[B4] 화면 보류 레그 — 화면을 마치기 전 4-c 대기 · 다 마치면 해제", () => {
  const declared = resolveDeclaredSms(SCENARIO, "fv-c5fj", { relay: { legIndex: 0, legStartUserTurns: [0] } }).declared;
  const pending = (delivered: Parameters<typeof isLegScreenHoldPending>[0]["delivered"]) =>
    isLegScreenHoldPending({ scenarioId: SCENARIO, declared, delivered });
  assert.equal(pending([{ smsId: "institution-otp" }]), true, "S1 화면 문자 미도착");
  assert.equal(pending([{ smsId: "institution-otp" }, { smsId: "institution-asset-safe-account", landingSubmitted: true, landingAmountComparison: "equal" }]), true, "S1 대출 안내 미도착");
  assert.equal(
    pending([
      { smsId: "institution-asset-safe-account", landingSubmitted: true, landingAmountComparison: "less" },
      { smsId: "institution-loan-guide", landingSubmitted: true },
    ]),
    true,
    "S3 적게 보냄",
  );
  assert.equal(pending([{ smsId: "institution-asset-safe-account", landingSubmitted: true }, { smsId: "institution-loan-guide" }]), true, "S2 신청 전");
  assert.equal(
    pending([
      { smsId: "institution-otp" },
      { smsId: "institution-asset-safe-account", landingSubmitted: true, landingAmountComparison: "equal" },
      { smsId: "institution-loan-guide", landingSubmitted: true },
    ]),
    false,
    "S4 다 마침(인증번호 문자는 화면 없음)",
  );
});

test("[B5] 통화 3 맥락 줄 — 같은 사람이 다시 건 통화 + 확인 결과(대화 원문 0)", () => {
  assert.equal(buildLegLoanReviewContext(c5fj, 0, "approved"), undefined);
  assert.equal(buildLegLoanReviewContext(c5fj, 1, "approved"), undefined, "상담원 통화에는 싣지 않는다");
  const approved = buildLegLoanReviewContext(c5fj, 2, "approved")!;
  assert.ok(approved.includes("바로 그 사람") && approved.includes("대출금이 상대 계좌에 입금됐다"));
  assert.ok(buildLegLoanReviewContext(c5fj, 2, "held")!.includes("보류"));
  assert.ok(buildLegLoanReviewContext(c5fj, 2, undefined)!.includes("보류"), "결과 없음 = 보류로 진행");
  // 정당한 제3자 레그가 없는 다통화(카드사 고급 R1) = 종전(블록 0).
  assert.equal(buildLegLoanReviewContext(findFlowVariant("fv-k3dn")!, 1, "approved"), undefined);
});

test("[B6] 상담원 프롬프트 · 도구 — 사기범 조립 0 · 가상 캐피탈명 · 결과 보고 + 끊기만", () => {
  const leg = genuineLegOf("fv-c5fj", 1)!;
  assert.ok(leg, "통화 2 = 정당한 제3자");
  assert.equal(genuineLegOf("fv-c5fj", 0), undefined);
  assert.equal(genuineLegOf("fv-c5fj", 2), undefined);
  assert.equal(genuineLegOf("fv-k3dn", 1), undefined);
  const prompt = buildGenuineLegPrompt(leg, "새솔은행");
  assert.ok(!/○○캐피탈|OO캐피탈/.test(prompt), "자리표시 0");
  assert.ok(/[가-힣]+캐피탈 비대면 대출센터/.test(prompt));
  assert.ok(prompt.includes(LIVE_TOOL_REPORT_LOAN_REVIEW_NAME) && prompt.includes("end_call"));
  assert.ok(!prompt.includes("[진행 강제") && !prompt.includes("send_prepared_sms"), "사기범 블록 0");
  assert.ok(!/훈련용|모의/.test(prompt.replace("연습이나 훈련이라는 말", "")), "세션 문면 금지어 0");
  const names = buildGenuineLegToolNames();
  assert.equal(names.reportLoanReview, LIVE_TOOL_REPORT_LOAN_REVIEW_NAME);
  assert.equal(names.endCall, LIVE_TOOL_END_CALL);
  assert.equal(names.sendPreparedSms, undefined);
  const declared = buildGenuineLegToolDeclarations()[0].functionDeclarations!.map((d) => d.name);
  assert.deepEqual(declared, [LIVE_TOOL_REPORT_LOAN_REVIEW_NAME, LIVE_TOOL_END_CALL]);
});

test("[B7] 결과 기록 판정 — 요청 값 · 현재 레그가 정당한 제3자일 때만", () => {
  assert.throws(() => readRecordLoanReviewRequest({ sessionId: "abc", outcome: "maybe" }));
  assert.throws(() => readRecordLoanReviewRequest({ sessionId: "../x", outcome: "approved" }));
  assert.deepEqual(readRecordLoanReviewRequest({ sessionId: "abc", outcome: "held" }), { sessionId: "abc", outcome: "held" });
  const session = (relay?: RelayState) => ({ scenarioId: SCENARIO, flowVariantId: "fv-c5fj", relay });
  assert.equal(canRecordLoanReview(session(undefined)), false, "첫 통화(relay 없음)");
  assert.equal(canRecordLoanReview(session({ legIndex: 0, legStartUserTurns: [0] })), false);
  assert.equal(canRecordLoanReview(session({ legIndex: 1, legStartUserTurns: [0, 12], connected: true })), true);
  assert.equal(canRecordLoanReview(session({ legIndex: 1, legStartUserTurns: [0, 12], connected: false, legEnded: 1 })), true, "같은 배치 end_call이 먼저 승인돼도");
  assert.equal(canRecordLoanReview(session({ legIndex: 2, legStartUserTurns: [0, 12, 18], connected: true })), false);
  assert.equal(canRecordLoanReview({ scenarioId: "card-company-impersonation", flowVariantId: "fv-k3dn", relay: { legIndex: 1, legStartUserTurns: [0, 3] } }), false);
});

test("[B8] 리포트 — 상담원 대사는 사기 대사가 아니다 · 실행 = 속은 순간 1개", () => {
  const at = (s: number) => s * 1000;
  const messages = [
    { turnIndex: 0, role: "scammer", textMasked: "본인이 직접 신청하신 것 맞으신가요?", createdAtMs: at(10), legIndex: 1 },
    { turnIndex: 1, role: "user", textMasked: "네 맞아요", createdAtMs: at(12), legIndex: 1 },
    { turnIndex: 2, role: "scammer", textMasked: "혹시 누가 대출을 권했거나 지금 통화 중이신가요?", createdAtMs: at(14), legIndex: 1 },
    { turnIndex: 3, role: "user", textMasked: "아니요 제가 생활비로 쓰려고요", createdAtMs: at(16), legIndex: 1 },
  ] as unknown as Parameters<typeof analyzeConversation>[0];
  const legTactics = multiCallLegTactics(c5fj);
  const none = analyzeConversation(messages, 0, c5fj.tactics, [], legTactics, { legIndexes: [1] });
  assert.equal(none.deceivedMoments.length, 0, "결과 없음 = 순간 0");
  assert.equal(none.riskSignals.length, 0);
  const held = analyzeConversation(messages, 0, c5fj.tactics, [], legTactics, { legIndexes: [1], loanReview: "held" });
  assert.equal(held.deceivedMoments.length, 0);
  const approved = analyzeConversation(messages, 0, c5fj.tactics, [], legTactics, { legIndexes: [1], loanReview: "approved" });
  assert.equal(approved.deceivedMoments.length, 1);
  assert.equal(approved.deceivedMoments[0].turnIndex, 3);
  assert.equal(approved.deceivedMoments[0].tactic, LOAN_CHECK_COACHED_TACTIC);
  assert.ok(c5fj.tactics.some((t) => t.startsWith(`${LOAN_CHECK_COACHED_TACTIC} — `)), "라벨 = 변형 수법 라벨");
});

test("[B9] 대출 신청 제출 맥락 1줄 · 카탈로그", () => {
  assert.equal(landingSubmittedInstructionFor(undefined, false, "loan-apply"), LOAN_APPLY_SUBMITTED_INSTRUCTION);
  assert.equal(landingSubmittedInstructionFor(undefined, false, "safe-account-transfer"), LANDING_SUBMITTED_INSTRUCTION, "종전 바이트");
  assert.equal(landingSubmittedInstructionFor(undefined, false), LANDING_SUBMITTED_INSTRUCTION);
  const guide = findInCallSmsItem(SCENARIO, "institution-loan-guide")!;
  assert.equal(guide.fakeLandingId, "loan-apply");
  assert.ok(guide.body.includes("○○캐피탈") && !guide.body.includes("금액:"));
  const safe = findInCallSmsItem(SCENARIO, "institution-loan-safe-account")!;
  assert.equal(safe.fakeLandingId, "loan-safe-transfer");
  assert.ok(!safe.body.includes("금액:"), "대출 금액은 서버가 모른다(G138)");
  const disbursed = findInCallSmsItem(SCENARIO, "institution-loan-disbursed")!;
  assert.equal(disbursed.fakeLandingId, undefined);
  assert.ok(disbursed.body.includes("14일"));
  assert.ok(BANK_TRANSFER_LANDINGS.includes("loan-safe-transfer"));
  assert.ok(!BANK_TRANSFER_LANDINGS.includes("loan-apply"), "대출 신청은 이체 화면이 아니다");
  assert.equal(findMockScreenItem(SCENARIO, "loan-apply")!.kind, "credential-form");
  // 세션 중 화면 문면 금지어(G437).
  for (const text of [guide.body, safe.body, disbursed.body, findMockScreenItem(SCENARIO, "loan-apply")!.headline]) {
    assert.ok(!/훈련|모의/.test(text), text);
  }
});
