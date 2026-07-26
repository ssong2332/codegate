import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { RecordMockScreenEventRequest, RecordMockScreenEventResponse } from "./types";

/**
 * Callable 실호출 — `recordMockScreenEvent` 1:1 (T84, API.md 부록 A, UX-023 kind=`app-install`).
 *
 * 모의 화면이 열렸는지·가짜 "권한 허용"에 응했는지를 세션 타임라인에 남긴다. **실패는 핵심 루프를
 * 막지 않는다**(오버레이는 정상 닫히고 대화는 계속된다 — API.md Errors). 다만 **조용히 삼키지
 * 않는다**: 실패하면 그 순간이 리포트에서 통째로 사라져 "참가자는 속았는데 리포트는 속지 않았다고
 * 말하는" 상태가 되므로(§15.9.7 G56), 호출부가 **1회 재시도 + 콘솔 경고**를 남긴다.
 */
export async function recordMockScreenEvent(
  request: RecordMockScreenEventRequest,
): Promise<RecordMockScreenEventResponse> {
  const callable = httpsCallable<RecordMockScreenEventRequest, RecordMockScreenEventResponse>(
    functionsClient,
    "recordMockScreenEvent",
  );
  const { data } = await callable(request);
  return data;
}
