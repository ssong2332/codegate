import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { RequestEscalationRequest, RequestEscalationResponse } from "./types";

/**
 * Callable 실호출 — 명시 전환 버튼("전화로 확인", T30, UX-022 §13.3/AC-034). 서버가 즉시
 * transitionChannel을 호출하고 확인 플래그를 돌려준다(updateMessengerSkin.ts와 동일 패턴).
 */
export async function requestEscalation(
  request: RequestEscalationRequest,
): Promise<RequestEscalationResponse> {
  const callable = httpsCallable<RequestEscalationRequest, RequestEscalationResponse>(
    functionsClient,
    "requestEscalation",
  );
  const { data } = await callable(request);
  return data;
}
