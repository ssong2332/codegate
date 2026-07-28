import { callCallable } from "./callable";
import type { RecordInCallSmsEventRequest, RecordInCallSmsEventResponse } from "./types";

/**
 * Callable 실호출 — `recordInCallSmsEvent` 1:1 (T68, UX-027 Data Operations "Update").
 *
 * 문자를 열어봤는지·링크 칩을 탭했는지를 세션 타임라인에 남긴다. **실패는 조용히 흡수한다**
 * (기록 실패로 훈련을 막지 않는다 — API.md Errors). 호출부는 await 없이 fire-and-forget해도 된다.
 */
export async function recordInCallSmsEvent(
  request: RecordInCallSmsEventRequest,
): Promise<RecordInCallSmsEventResponse> {
  return callCallable<RecordInCallSmsEventRequest, RecordInCallSmsEventResponse>(
    "recordInCallSmsEvent",
    request,
  );
}
