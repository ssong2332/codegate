import { callCallable } from "./callable";
import type { SendMessageRequest, SendMessageResponse } from "./types";
import { readAnsweredElapsedMs } from "@/lib/recording/pendingSession";

/**
 * Callable 실호출 — API.md `sendMessage` 1:1 (Track A, T7, UX-006, AC-003~005/AC-013/AC-024/AC-007).
 * T2 단계 더미 응답(Architecture.md §4 스텁 관례)을 채팅 화면(UX-006) 구현 시 실호출로 교체했다
 * (createVoiceClone.ts/endSession.ts와 동일 패턴). 서버(functions/src/roleplay/index.ts)의 역할극
 * 엔진 로직은 T7이 이미 완성해 두었다 — 이 클라 래퍼만 T2 더미 상태로 남아 있었다.
 *
 * §129 에뮬 D2 — 이 탭에서 "받기"를 누른 세션이면 받은 뒤 지난 ms(`answeredElapsedMs`)를 함께 싣는다. 서버는 받은 시각이
 * 아직 없는 통화 세션의 첫 턴에서만 이 값을 쓴다(그 밖 = 무시). 통화 중 카톡(`duringCall`)에는 싣지 않는다.
 */
export async function sendMessage(
  request: SendMessageRequest,
): Promise<SendMessageResponse> {
  const answeredElapsedMs = request.duringCall ? undefined : readAnsweredElapsedMs(request.sessionId);
  return callCallable<SendMessageRequest, SendMessageResponse>(
    "sendMessage",
    answeredElapsedMs === undefined ? request : { ...request, answeredElapsedMs },
  );
}
