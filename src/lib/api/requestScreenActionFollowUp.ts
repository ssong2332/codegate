import { callCallable } from "./callable";
import type { RequestScreenActionFollowUpRequest, RequestScreenActionFollowUpResponse } from "./types";

/**
 * Callable 실호출 — §128(7) 대화방 링크 화면에서 설치 · 제출을 마친 뒤 사기범이 먼저 메시지 1건을 보낸다
 * (서버 `functions/src/roleplay/screenActionFollowUp.ts` 판정표). 메시지는 대화방 구독이 그린다.
 */
export async function requestScreenActionFollowUp(
  request: RequestScreenActionFollowUpRequest,
): Promise<RequestScreenActionFollowUpResponse> {
  return callCallable<RequestScreenActionFollowUpRequest, RequestScreenActionFollowUpResponse>(
    "requestScreenActionFollowUp",
    request,
  );
}
