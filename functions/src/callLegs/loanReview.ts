// ⭐ PR-B(2026-11-07 · 사용자 결정 "앱 안 대출 체험" — docs/research/institution-advanced-loan-design-2026-11-07.md §7) — `recordLoanReview` 콜러블:
// 정당한 제3자 레그(대출 실행 확인 상담원)의 결과 보고 도구(`report_loan_review`)를 클라가 서버에 적는다.
//
// 판정표(이 순서대로 · 첫 매치):
// | # | If | Then |
// |---|---|---|
// | R1 | 인증 없음 · 요청 값 밖(sessionId · outcome enum) | unauthenticated · invalid-argument |
// | R2 | 세션 없음 · 남의 세션 · 익명 범위 밖 · 활성 아님 | failed-precondition · permission-denied |
// | R3 | 현재 레그(`relay.legIndex` — 서버가 연 레그)가 정당한 제3자 레그가 아니다 | failed-precondition(사기범 레그에서 결과를 지어낼 수 없다) |
//      ⚠️ 그 레그가 막 끝났어도(같은 도구 배치의 `end_call`이 먼저 승인 — 병렬 처리) 다음 레그가 열리기 전이면 받는다.
// | R4 | 이미 결과가 있다 | 쓰기 0 · `recorded:false` + 먼저 남은 결과(첫 기록이 이긴다) |
// | R5 | 그 밖 | `loanReview` 기록 · 결과 = 실행이면 입금 안내 문자 도착(`deliverServerNoticeSms`) |
//
// ⛔ 이 모듈이 하지 않는 것: 대출 금액 · 계좌 저장(서버는 모른다 — G138) · 레그 열기 · 세션 종료 · LLM 호출.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { assertAnonymousChallengeScope } from "../shared/anonymousGate";
import { isDocId } from "../shared/requestValidation";
import { findFlowVariant, genuineLegOf } from "../scenarios/flowVariants";
import { findInCallSmsItem } from "../scenarios/inCallSms";
import { resolveFictionalBankName } from "../shared/fictionalBank";
import { deliverServerNoticeSms } from "../inCallSms/smsDelivery";
import type { SessionDoc } from "../shared/types";
import { currentLegIndex } from "./legPlan";

ensureFirebaseAdminApp();

export type LoanReviewOutcome = "approved" | "held";
export type RecordLoanReviewRequest = { sessionId: string; outcome: LoanReviewOutcome };
export type RecordLoanReviewResponse = { recorded: boolean; outcome: LoanReviewOutcome; guidance: string };

/** 실행일 때 도착시키는 가상 캐피탈 입금 안내 문자(`scenarios/inCallSms.ts`). 그 시나리오 카탈로그에 없으면 보내지 않는다. */
export const LOAN_DISBURSED_SMS_ID = "institution-loan-disbursed";
/** 모델에게 돌려줄 1줄 — 기록 뒤 정한 결과를 그대로 안내한다(먼저 남은 결과가 다르면 그 결과로). */
export function loanReviewGuidance(outcome: LoanReviewOutcome): string {
  return outcome === "approved"
    ? "(결과가 실행으로 기록됐다. 확인됐다며 오늘 중 대출금이 입금된다고 안내하고 인사한 뒤 통화를 끝내라.)"
    : "(결과가 보류로 기록됐다. 보이스피싱이 의심돼 대출 실행을 보류한다고 안내하고, 수사기관은 대출을 권하지 않으니 통화하던 사람과 연락을 끊고 경찰에 확인하라고 알린 뒤 인사하고 통화를 끝내라.)";
}

/** 요청 판독(순수 — read 앞). */
export function readRecordLoanReviewRequest(data: unknown): RecordLoanReviewRequest {
  const raw = (data ?? {}) as Record<string, unknown>;
  if (!isDocId(raw.sessionId)) throw new HttpsError("invalid-argument", "sessionId가 올바르지 않습니다.");
  if (raw.outcome !== "approved" && raw.outcome !== "held") throw new HttpsError("invalid-argument", "outcome이 올바르지 않습니다.");
  return { sessionId: raw.sessionId, outcome: raw.outcome };
}

/** 판정표 R3 — 서버가 연 현재 레그가 정당한 제3자 레그인가(순수). 첫 레그는 정당한 제3자일 수 없다(세션 시작 = 사기범 통화). */
export function canRecordLoanReview(session: Pick<SessionDoc, "flowVariantId" | "scenarioId" | "relay">): boolean {
  const variant = findFlowVariant(session.flowVariantId);
  if (!variant?.multiCall || variant.scenarioId !== session.scenarioId || session.relay === undefined) return false;
  const legIndex = currentLegIndex(variant, session.relay);
  return legIndex > 0 && genuineLegOf(session.flowVariantId, legIndex) !== undefined;
}

export const recordLoanReview = onCall<RecordLoanReviewRequest, Promise<RecordLoanReviewResponse>>(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const { sessionId, outcome } = readRecordLoanReviewRequest(request.data);
  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const first = await sessionRef.get();
  if (!first.exists) throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
  const firstSession = first.data() as SessionDoc;
  if (firstSession.uid !== request.auth.uid) throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
  assertAnonymousChallengeScope(request.auth, firstSession);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    const session = snap.data() as SessionDoc | undefined;
    if (!session || session.status !== "active") {
      throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
    }
    if (!canRecordLoanReview(session)) throw new HttpsError("failed-precondition", "지금은 결과를 기록할 수 없습니다.");
    if (session.loanReview) return { recorded: false, outcome: session.loanReview.outcome, session };
    tx.update(sessionRef, { loanReview: { outcome, at: Timestamp.now() } });
    return { recorded: true, outcome, session };
  });

  if (result.recorded && result.outcome === "approved") {
    const item = findInCallSmsItem(result.session.scenarioId, LOAN_DISBURSED_SMS_ID);
    if (item) {
      try {
        const userTurns = (await sessionRef.collection("messages").where("role", "==", "user").count().get()).data().count;
        await deliverServerNoticeSms(
          sessionRef,
          item,
          Timestamp.now(),
          result.session.scenarioId,
          userTurns,
          resolveFictionalBankName({ sessionId, fictionalBankName: result.session.fictionalBankName }),
        );
      } catch (error) {
        // 이미 있으면(create 충돌) · 쓰기 실패 = 결과 기록은 유지(문자 1통이 빠질 뿐 — 통화 3 판정은 `loanReview`만 본다).
        logger.warn("대출 입금 안내 문자 도착 실패", { sessionId, message: error instanceof Error ? error.message : "unknown" });
      }
    }
  }
  // G170 — 값 · 단계만(대사 0).
  logger.info("대출 실행 확인 결과 기록", { sessionId, outcome: result.outcome, recorded: result.recorded });
  return { recorded: result.recorded, outcome: result.outcome, guidance: loanReviewGuidance(result.outcome) };
});
