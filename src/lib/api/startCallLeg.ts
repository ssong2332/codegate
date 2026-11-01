import { callCallable } from "./callable";
import type { StartCallLegRequest, StartCallLegResponse } from "./types";

/**
 * Callable 실호출 — `startCallLeg` 1:1 (§142 카드사 고급 재구성 · Architecture.md §142.4 · §142.8).
 *
 * 다통화 변형에서 한 통화가 끝난 뒤 다음 통화를 연다(참가자 발신 · 상대 재발신 · 호 전환). 판정은 서버가 하고
 * (건 번호 · 원격 지원 앱 응낙), 연결이면 화면이 새 `createRealtimeCall`로 다음 인물과 통화한다.
 */
export async function startCallLeg(request: StartCallLegRequest): Promise<StartCallLegResponse> {
  return callCallable<StartCallLegRequest, StartCallLegResponse>("startCallLeg", request);
}
