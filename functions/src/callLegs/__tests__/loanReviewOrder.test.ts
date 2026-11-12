// ⭐ 2026-11-12 라이브 재시험 23 관찰 ⑬(기관 사칭 고급 `fv-c5fj` 통화 2 — 가상 캐피탈 대출 실행 확인 상담원 · 사기범 아님).
// 상담원이 "대출 용도가 어떻게 되시는지" 물은 뒤 참가자가 "네, 했어요"라고만 답한 순간(0:45) 입금 문자가 먼저 왔고, 다음 대사 한 덩어리에 "누군가로부터 대출을
// 권유받으셨거나 … 확인됐습니다. 오늘 중으로 … 입금될 예정입니다". (a) 답 없이 확인 (b) 문자가 확인보다 먼저 (c) 온 문자와 "입금될 예정"이 어긋남.
// 원인(코드): `recordLoanReview`가 답 수를 보지 않고 기록하고, 같은 요청에서 입금 문자를 보냈다(도구는 결과를 말하기 전에 부른다).
// 판정표 LR(기록) · LD(문자 시점) — `callLegs/loanReviewOrder.ts` · 현실 대조 `docs/research/otp-sms-lender-call-2026-11-12.md`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import * as order from "../loanReviewOrder";
import { loanReviewGuidance, readRecordLoanReviewRequest } from "../loanReview";
import { findFlowVariant } from "../../scenarios/flowVariants";
import { findInCallSmsItem } from "../../scenarios/inCallSms";
import { buildGenuineLegPrompt } from "../../roleplay/genuineLegPrompt";

const SRC = path.resolve(__dirname, "../../../src");
const VARIANT = "fv-c5fj";
const SCENARIO = "institutional-impersonation";
/** 통화 2(확인 전화)가 세션 누적 발화 10에서 시작했다. */
const RELAY_LEG1 = { legIndex: 1, legStartUserTurns: [0, 10], connected: true };

test("[재시험 23 ⑬ 재현] 확인 전화에서 답 2개(본인 신청 · '네, 했어요')에 실행 보고 → 기록하지 않고 남은 질문을 묻게 한다(종전 기록 + 입금 문자)", () => {
  assert.equal(typeof order.planLoanReviewRecord, "function", "판정표 LR 함수가 없다(수정 전)");
  assert.equal(order.genuineLoanLegIndex(VARIANT), 1);
  assert.equal(order.planLoanReviewRecord({ outcome: "approved", userTurns: 12, relay: RELAY_LEG1, legIndex: 1 }), "pending");
  // 지시 — 결과 · 입금을 말하지 않고 남은 질문 하나를 묻게 한다.
  assert.doesNotMatch(order.LOAN_REVIEW_NOT_YET_GUIDANCE, /확인됐|입금됩니다|입금될/);
  assert.match(order.LOAN_REVIEW_NOT_YET_GUIDANCE, /누가 대출을 권했/);
  // 통화 2가 아직 연결 중이면 실행 기록이 있어도 입금 문자는 아직(LD2).
  assert.equal(order.loanDisbursedSmsDue({ flowVariantId: VARIANT, scenarioId: SCENARIO, relay: RELAY_LEG1, loanReview: { outcome: "approved", at: undefined as never } }), false);
});

test("[판정표 LR] 결과 기록", () => {
  const plan = (outcome: "approved" | "held", userTurns: number | undefined) => order.planLoanReviewRecord({ outcome, userTurns, relay: RELAY_LEG1, legIndex: 1 });
  assert.equal(plan("held", 10), "record", "LR1 보류는 답 수 무관");
  assert.equal(plan("held", 11), "record");
  assert.equal(plan("approved", undefined), "record", "LR2 옛 화면");
  assert.equal(plan("approved", 10), "pending", "LR3 답 0");
  assert.equal(plan("approved", 12), "pending", "LR3 답 2");
  assert.equal(plan("approved", 13), "record", "LR4 답 3 = 본인 · 용도 · 누가 권했는지");
  assert.equal(order.LOAN_REVIEW_MIN_ANSWERS, 3);
  // 확인 질문 단계 수(통화 2 단계 1 ~ 3)와 같다.
  const officer = findFlowVariant(VARIANT)!.legs[1];
  assert.equal(officer.genuine, true);
  assert.ok((officer.stages ?? []).slice(0, 3).every((stage) => /확인|묻는다/.test(stage)));
});

test("[판정표 LR] 요청 판독 — userTurns는 0 이상 정수(부재 = 옛 화면)", () => {
  const base = { sessionId: "abcdefghij1234567890", outcome: "approved" };
  assert.deepEqual(readRecordLoanReviewRequest(base), base);
  assert.equal(readRecordLoanReviewRequest({ ...base, userTurns: 13 }).userTurns, 13);
  for (const bad of [-1, 1.5, "3", 10_000]) {
    assert.throws(() => readRecordLoanReviewRequest({ ...base, userTurns: bad }), /userTurns/, String(bad));
  }
});

test("[판정표 LD] 입금 안내 문자 시점 — 확인 전화가 끝난 뒤", () => {
  const approved = { outcome: "approved" as const, at: undefined as never };
  const due = (relay: object | undefined, loanReview?: typeof approved | { outcome: "held"; at: never }) =>
    order.loanDisbursedSmsDue({ flowVariantId: VARIANT, scenarioId: SCENARIO, relay: relay as never, ...(loanReview ? { loanReview } : {}) });
  assert.equal(due({ ...RELAY_LEG1, connected: false, legEnded: 1 }, { outcome: "held", at: undefined as never }), false, "LD1 보류");
  assert.equal(due({ ...RELAY_LEG1, connected: false, legEnded: 1 }), false, "LD1 결과 없음");
  assert.equal(due(RELAY_LEG1, approved), false, "LD2 연결 중");
  assert.equal(due({ ...RELAY_LEG1, connected: false, legEnded: 1 }, approved), true, "LD3 끝남");
  assert.equal(due({ ...RELAY_LEG1, connected: false, legEnded: 1, hungUpBy: "participant" }, approved), true, "LD3 참가자 끊기");
  assert.equal(due({ legIndex: 2, legStartUserTurns: [0, 10, 14], connected: true }, approved), true, "LD4 다음 통화");
  // 다른 변형 · 다통화 아님 = 0.
  assert.equal(order.loanDisbursedSmsDue({ flowVariantId: "fv-q7cn", scenarioId: SCENARIO, relay: { ...RELAY_LEG1, legEnded: 1 } as never, loanReview: approved }), false);
  // 문자 본문은 "입금되었습니다" — 안내("오늘 중 입금됩니다") 뒤에 와야 어긋나지 않는다.
  const sms = findInCallSmsItem(SCENARIO, order.LOAN_DISBURSED_SMS_ID);
  assert.ok(sms, "입금 안내 문자 카탈로그");
  assert.match(loanReviewGuidance("approved"), /입금된다고 안내/);
});

test("[배선] 기록 요청은 문자를 직접 보내지 않고 · 끝나는 세 곳(상담원 끊기 승인 · 참가자 끊기 · 다음 통화 연결)이 LD 헬퍼를 부른다", () => {
  const record = readFileSync(path.join(SRC, "callLegs/loanReview.ts"), "utf8");
  assert.doesNotMatch(record, /deliverServerNoticeSms\(/, "기록 요청에서 입금 문자를 바로 보내지 않는다");
  assert.match(record, /planLoanReviewRecord\(/);
  assert.match(record, /deliverLoanDisbursedSmsIfDue\(sessionRef, sessionId\)/);
  const hangup = readFileSync(path.join(SRC, "scammerHangup/index.ts"), "utf8");
  assert.match(hangup, /if \(legScope && decision\.hangup\) await deliverLoanDisbursedSmsIfDue\(sessionRef, sessionId\)/);
  const legs = readFileSync(path.join(SRC, "callLegs/index.ts"), "utf8");
  assert.match(legs, /if \(hung\.status === "ended"\) await deliverLoanDisbursedSmsIfDue\(sessionRef, sessionId\)/);
  assert.match(legs, /if \(plan\.status === "connected"\) await deliverLoanDisbursedSmsIfDue\(sessionRef, sessionId\)/);
  // 화면이 응답 중인 발화를 포함한 세션 누적 발화 수를 싣는다 · 보류 응답을 따로 표시한다.
  const client = readFileSync(path.resolve(SRC, "../../src/lib/realtime/GeminiVoiceSession.tsx"), "utf8");
  assert.match(client, /recordLoanReview\(\{ sessionId, outcome, userTurns: claimedUserTurns\(\) \}\)/);
  assert.match(client, /result\.pending \? "not_yet"/);
});

test("[프롬프트] 상담원은 질문 하나씩 · 답을 다 들은 뒤에만 실행 · '아직'이면 결과 · 입금 이야기 없이 이어 간다", () => {
  const prompt = buildGenuineLegPrompt(findFlowVariant(VARIANT)!.legs[1]);
  assert.match(prompt, /한 번에 하나만 묻고, 고객의 답을 들은 뒤에 다음 질문으로 넘어간다/);
  assert.match(prompt, /답을 모두 들은 뒤에만 정한다/);
  assert.match(prompt, /도구가 아직 결과를 정할 수 없다고 하면 결과 · 입금 이야기 없이/);
});
