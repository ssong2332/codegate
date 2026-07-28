import { callCallable } from "./callable";
import type { GetBeginnerBriefingRequest, GetBeginnerBriefingResponse } from "./types";

/**
 * Callable 실호출 — T72 · UX-029 초급 사전 브리핑(AC-066, Architecture.md §15.3.4).
 * 시나리오 프롬프트는 클라가 직접 read할 수 없으므로(firestore.rules) 이 콜러블이 유일한 경로다.
 * 실패는 비차단으로 다룬다(브리핑은 보조 정보 — 난이도 선택 자체를 막지 않는다, P-4).
 */
export async function getBeginnerBriefing(
  request: GetBeginnerBriefingRequest,
): Promise<GetBeginnerBriefingResponse> {
  return callCallable<GetBeginnerBriefingRequest, GetBeginnerBriefingResponse>(
    "getBeginnerBriefing",
    request,
  );
}
