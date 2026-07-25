import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { DeliverInCallSmsRequest, DeliverInCallSmsResponse } from "./types";

/**
 * Callable 실호출 — `deliverInCallSms` 1:1 (T68, UX-027/UF-008, ADR-0007).
 *
 * 실시간 통화 중 사기범 턴 경계에 도달했을 때 클라가 부른다. 서버가 `smsId`의 시나리오 소속을
 * 재검증한 뒤 `sessions/{sid}/inCallSms/{smsId}` 문서를 쓰고, 캐릭터가 "문자 보냈어요"라고 말하게
 * 하는 1줄 지시를 돌려준다. **응답은 렌더 소스가 아니다** — 화면은 그 컬렉션 구독으로 그린다.
 */
export async function deliverInCallSms(
  request: DeliverInCallSmsRequest,
): Promise<DeliverInCallSmsResponse> {
  const callable = httpsCallable<DeliverInCallSmsRequest, DeliverInCallSmsResponse>(
    functionsClient,
    "deliverInCallSms",
  );
  const { data } = await callable(request);
  return data;
}
