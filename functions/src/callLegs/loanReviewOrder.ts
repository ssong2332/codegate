// ⭐ 2026-11-12(라이브 재시험 23 관찰 ⑬ — docs/research/otp-sms-lender-call-2026-11-12.md) — 대출 실행 확인 전화(기관 사칭 고급 `fv-c5fj` 통화 2)의
// 순서 판정. 현실 확인 전화 순서(본인 신청 · 용도 · 누가 권했는지를 묻고 **답을 들은 뒤** 실행 → 실행 뒤 입금 문자)와 맞춘다.
// 순수 판정(Firestore 0) + 입금 문자 도착 헬퍼 1개(LD3 · LD4 호출부 3곳이 같은 함수를 부른다).
//
// ── 판정표 LR — 결과 기록(`recordLoanReview`) ─────────────────────────────────────────────────────────────
// | # | If | Then |
// |---|---|---|
// | LR1 | outcome = held | 기록(답 수 무관 — 의심 답이 나오면 언제든 보류) |
// | LR2 | approved ∧ 요청에 `userTurns` 없음(옛 화면) | 종전(기록) |
// | LR3 | approved ∧ 이 통화에서 들은 답 수(`userTurns − legStartUserTurns`) < `LOAN_REVIEW_MIN_ANSWERS` | 기록 0 · `pending` · 지시 = 결과를 말하지 말고 남은 확인 질문을 하나씩 묻고 답을 들은 뒤 다시 보고 |
// | LR4 | 그 밖 | 기록(종전 R4 · R5 — 문자는 아래 LD) |
//
// ── 판정표 LD — 입금 안내 문자 시점 ────────────────────────────────────────────────────────────────────────
// | # | If | Then |
// |---|---|---|
// | LD1 | 결과 held · 결과 없음 | 문자 0 |
// | LD2 | approved ∧ 확인 전화 통화가 아직 연결 중 | 문자 보류(기록만) |
// | LD3 | approved ∧ 확인 전화 통화가 끝났다(`relay.legEnded` = 그 레그 — 상담원 `end_call` 승인 · 참가자 끊기 · 기록 시점에 이미 끝남) | 입금 문자 도착(이미 있으면 0) |
// | LD4 | approved ∧ 다음 통화로 넘어갔다(`relay.legIndex` > 그 레그) | 입금 문자 도착(안전망 · 이미 있으면 0) |
// 근거: 종전에는 기록과 같은 요청에서 문자를 보냈고 도구는 "결과를 말하기 전에" 부르게 돼 있어, 질문만 해 놓고 답을 듣기 전 입금 문자("입금되었습니다")가
// 먼저 왔고 이어 상담원이 "입금될 예정입니다"라고 해 서로 어긋났다(재시험 23 · `loanReviewOrder.test.ts` 재현).
import { logger } from "firebase-functions";
import { Timestamp } from "firebase-admin/firestore";
import { findFlowVariant } from "../scenarios/flowVariants";
import { findInCallSmsItem } from "../scenarios/inCallSms";
import { resolveFictionalBankName } from "../shared/fictionalBank";
import { deliverServerNoticeSms } from "../inCallSms/smsDelivery";
import type { SessionDoc } from "../shared/types";
import { currentLegIndex, legStartUserTurns, type RelayState } from "./legPlan";

/** 실행일 때 도착시키는 가상 캐피탈 입금 안내 문자(`scenarios/inCallSms.ts`). */
export const LOAN_DISBURSED_SMS_ID = "institution-loan-disbursed";

/** LR3 — 실행 전에 들어야 할 답 수 = 확인 질문 셋(본인 신청 · 용도 · 누가 권했는지 · 통화 중 안내 여부)의 답. 통화 2 단계 1 ~ 3과 같은 수. */
export const LOAN_REVIEW_MIN_ANSWERS = 3;

/** LR3 지시(서버 소유 문면 — 결과 · 입금 언급 0). */
export const LOAN_REVIEW_NOT_YET_GUIDANCE =
  "(아직 결과를 정할 수 없다. 확인 질문의 답을 다 듣지 않았다. 결과나 입금 이야기는 하지 말고, 아직 답을 듣지 못한 확인 질문 — 본인이 직접 신청했는지 · 대출 용도 · 누가 대출을 권했거나 지금 누구와 통화하며 안내받는지 — 중 다음 하나만 묻고 고객의 답을 기다려라. 답이 질문과 맞지 않으면 그 질문을 한 번 다시 묻는다. 답을 모두 들은 뒤에 결과 보고 도구를 다시 불러라.)";

export type LoanReviewRecordPlan = "record" | "pending";

/** 판정표 LR(순수). `userTurns` = 클라 세션 누적 사용자 발화 수(부재 = 옛 화면). */
export function planLoanReviewRecord(input: {
  outcome: "approved" | "held";
  userTurns: number | undefined;
  relay: Pick<RelayState, "legIndex" | "legStartUserTurns"> | undefined;
  legIndex: number;
}): LoanReviewRecordPlan {
  if (input.outcome === "held") return "record"; // LR1
  if (input.userTurns === undefined) return "record"; // LR2
  const answers = input.userTurns - legStartUserTurns(input.relay, input.legIndex);
  return answers < LOAN_REVIEW_MIN_ANSWERS ? "pending" : "record"; // LR3 · LR4
}

/** 이 세션의 정당한 제3자(대출 확인) 레그 번호. 없으면 undefined. */
export function genuineLoanLegIndex(flowVariantId: string | undefined): number | undefined {
  const variant = findFlowVariant(flowVariantId);
  if (!variant?.multiCall) return undefined;
  const index = variant.legs.findIndex((leg) => leg.genuine === true);
  return index >= 0 ? index : undefined;
}

/** 판정표 LD(순수) — 지금 입금 안내 문자를 도착시킬 때인가(이미 도착 여부는 호출부가 create 충돌로 막는다). */
export function loanDisbursedSmsDue(session: Pick<SessionDoc, "flowVariantId" | "scenarioId" | "relay" | "loanReview">): boolean {
  if (session.loanReview?.outcome !== "approved") return false; // LD1
  const variant = findFlowVariant(session.flowVariantId);
  if (!variant?.multiCall || variant.scenarioId !== session.scenarioId) return false;
  const genuine = genuineLoanLegIndex(session.flowVariantId);
  if (genuine === undefined) return false;
  const relay = session.relay;
  if (relay === undefined) return false;
  if (relay.legEnded === genuine) return true; // LD3
  return currentLegIndex(variant, relay) > genuine; // LD4 · 그 밖 LD2
}

/**
 * LD3 · LD4 — 때가 되면 입금 안내 문자를 1회 도착시킨다(이미 있으면 0 · 실패는 통화를 막지 않는다).
 * 호출부: `recordLoanReview`(기록 시점에 이미 끝남) · `requestScammerHangup`(상담원 `end_call` 승인 뒤) · `startCallLeg`(참가자 끊기 · 다음 통화 연결 뒤).
 */
export async function deliverLoanDisbursedSmsIfDue(
  sessionRef: FirebaseFirestore.DocumentReference,
  sessionId: string,
): Promise<boolean> {
  try {
    const snap = await sessionRef.get();
    const session = snap.data() as SessionDoc | undefined;
    if (!session || !loanDisbursedSmsDue(session)) return false;
    const item = findInCallSmsItem(session.scenarioId, LOAN_DISBURSED_SMS_ID);
    if (!item) return false;
    const existing = await sessionRef.collection("inCallSms").doc(LOAN_DISBURSED_SMS_ID).get();
    if (existing.exists) return false;
    const userTurns = (await sessionRef.collection("messages").where("role", "==", "user").count().get()).data().count;
    await deliverServerNoticeSms(
      sessionRef,
      item,
      Timestamp.now(),
      session.scenarioId,
      userTurns,
      resolveFictionalBankName({ sessionId, fictionalBankName: session.fictionalBankName }),
    );
    logger.info("대출 입금 안내 문자 도착(확인 전화 뒤)", { sessionId });
    return true;
  } catch (error) {
    // 동시 호출(create 충돌) · 쓰기 실패 = 문자 1통이 빠질 뿐(통화 3 판정은 `loanReview`만 본다).
    logger.warn("대출 입금 안내 문자 도착 실패", { sessionId, message: error instanceof Error ? error.message : "unknown" });
    return false;
  }
}
