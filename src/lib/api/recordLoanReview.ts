import { callCallable } from "./callable";
import type { RecordLoanReviewRequest, RecordLoanReviewResponse } from "./types";

/**
 * Callable 실호출 — `recordLoanReview` 1:1(⭐ PR-B · functions/src/callLegs/loanReview.ts).
 *
 * 기관 사칭 고급 3통화의 대출 실행 확인 상담원(정당한 제3자 레그)이 결과 보고 도구(`report_loan_review`)를 부르면 화면이 그 결과(고정 enum 하나)를
 * 서버에 적는다. 금액 · 용도 같은 입력값은 싣지 않는다(G138).
 */
export async function recordLoanReview(request: RecordLoanReviewRequest): Promise<RecordLoanReviewResponse> {
  return callCallable<RecordLoanReviewRequest, RecordLoanReviewResponse>("recordLoanReview", request);
}
