import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { RequestReverseEscalationRequest, RequestReverseEscalationResponse } from "./types";

/**
 * Callable 실호출 — 역방향 명시 전환 버튼("메시지로 전환", T40 fast-follow, UX-014 §13.1/AC-039).
 * requestEscalation.ts와 정확히 동일한 패턴(서버가 즉시 transitionChannel을 호출하고 확인 플래그를
 * 돌려준다), 방향만 반대다.
 */
export async function requestReverseEscalation(
  request: RequestReverseEscalationRequest,
): Promise<RequestReverseEscalationResponse> {
  const callable = httpsCallable<RequestReverseEscalationRequest, RequestReverseEscalationResponse>(
    functionsClient,
    "requestReverseEscalation",
  );
  const { data } = await callable(request);
  return data;
}
