import { callCallable } from "./callable";
import type { StartRelayLegRequest, StartRelayLegResponse } from "./types";

/**
 * Callable 실호출 — `startRelayLeg` 1:1 (T191 S7 · UF-013 · AC-101).
 *
 * - `check`: 실시간 `transfer_call` 도구 시점의 하한 확인(서버 쓰기 0) — 모델에 돌려줄 문면은 서버가 준다.
 * - `live` : 교대 실행 — 델타 전사를 서버가 마스킹 저장하고 다음 화자 · 다른 음성의 새 Live 토큰을 받는다.
 * - `text` : 텍스트 폴백 교대(멱등) — 새 화자 첫마디를 서버가 만들어 `messages`에 쓴다(화면은 구독으로 그린다).
 */
export async function startRelayLeg(request: StartRelayLegRequest): Promise<StartRelayLegResponse> {
  return callCallable<StartRelayLegRequest, StartRelayLegResponse>("startRelayLeg", request);
}
