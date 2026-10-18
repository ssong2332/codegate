import { callCallable } from "./callable";
import type { RequestScammerHangupRequest, RequestScammerHangupResponse } from "./types";

/**
 * Callable 실호출 — `requestScammerHangup` 1:1 (T192 C1, Architecture.md §79.5, AC-103).
 *
 * 실시간 통화에서 모델이 `end_call` 도구를 부르면 클라가 서버 판정을 받는다(호출부 배선은 C5).
 * 승인이면 서버가 `scammerHangup` 표식을 남긴다 — **세션을 끝내지 않는다**(끝내는 것은 전사 제출 뒤 `endSession`).
 * 응답 `guidance`는 서버 소유 문면이므로 그대로 도구 응답에 싣는다(G386).
 */
export async function requestScammerHangup(
  request: RequestScammerHangupRequest,
): Promise<RequestScammerHangupResponse> {
  return callCallable<RequestScammerHangupRequest, RequestScammerHangupResponse>(
    "requestScammerHangup",
    request,
  );
}
