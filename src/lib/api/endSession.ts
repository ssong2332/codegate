import { callCallable } from "./callable";
import type { EndSessionRequest, EndSessionResponse } from "./types";

/**
 * Callable 실호출 — API.md `endSession` 1:1 (Track B, T8, UX-007, AC-006/AC-007/AC-021).
 * T2 단계 더미 응답(Architecture.md §4 스텁 관례)을 T8에서 실호출로 교체했다(createVoiceClone.ts와
 * 동일 패턴).
 */
export async function endSession(
  request: EndSessionRequest,
): Promise<EndSessionResponse> {
  return callCallable<EndSessionRequest, EndSessionResponse>("endSession", request);
}
