import { callCallable } from "./callable";
import type { DeleteChallengeRequest, DeleteChallengeResponse } from "./types";

/**
 * Callable 실호출 — 챌린지 수동 삭제(UX-020, T36, AC-041). 서버가 챌린지 스코프 ElevenLabs voice를
 * 폐기하고 status를 "deleted"로 바꾼다. 이미 삭제된 챌린지에 다시 호출해도 멱등하다.
 */
export async function deleteChallenge(
  request: DeleteChallengeRequest,
): Promise<DeleteChallengeResponse> {
  return callCallable<DeleteChallengeRequest, DeleteChallengeResponse>("deleteChallenge", request);
}
