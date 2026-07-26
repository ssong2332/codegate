import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { DeliverVerifyReconnectRequest, DeliverVerifyReconnectResponse } from "./types";

/**
 * Callable 실호출 — `deliverVerifyReconnect` 1:1 (T83, UX-031/UF-011, AC-071/AC-019).
 *
 * 참가자가 UX-031에서 "확인 전화 걸기"를 누른 사실을 기록하고, **같은 세션 위에서** 상대 표면이
 * 바뀌도록 하는 지시문을 돌려준다. **새 세션을 만들지 않는다**(AC-007/AC-035).
 *
 * ⚠️ **이 함수는 전화를 걸지 않는다**(AC-019). 요청에 번호·URL·발신 대상이 없고, 서버도 통신 API를
 * 호출하지 않는다 — "reconnect"는 **인앱 재현**을 뜻한다.
 */
export async function deliverVerifyReconnect(
  request: DeliverVerifyReconnectRequest,
): Promise<DeliverVerifyReconnectResponse> {
  const callable = httpsCallable<DeliverVerifyReconnectRequest, DeliverVerifyReconnectResponse>(
    functionsClient,
    "deliverVerifyReconnect",
  );
  const { data } = await callable(request);
  return data;
}
