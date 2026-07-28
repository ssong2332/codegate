import { callCallable } from "./callable";
import type { JudgeRewindAnswerRequest, JudgeRewindAnswerResponse } from "./types";

/**
 * Callable 실호출 — API.md `judgeRewindAnswer` 1:1 (T70, UX-028/UF-009, AC-062/AC-063).
 * 실패(네트워크·타임아웃·서버 오류)는 그대로 throw한다 — 화면이 Judge-failed 상태("이번 답변은
 * 판정하지 못했습니다" + 모범 대처만 표시)로 정직하게 노출하기 위해서다(P-4 조용한 실패 금지).
 */
export async function judgeRewindAnswer(
  request: JudgeRewindAnswerRequest,
): Promise<JudgeRewindAnswerResponse> {
  return callCallable<JudgeRewindAnswerRequest, JudgeRewindAnswerResponse>(
    "judgeRewindAnswer",
    request,
  );
}
