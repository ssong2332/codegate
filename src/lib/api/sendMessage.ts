import type { SendMessageRequest, SendMessageResponse } from "./types";

/**
 * Callable 계약 스텁 — API.md `sendMessage` 1:1
 * (Track A, T7, UX-006, AC-003~005/AC-013/AC-024/AC-007).
 * T2 단계는 더미 응답을 반환한다(Architecture.md §4). T7에서 실호출로 교체.
 */
export async function sendMessage(
  request: SendMessageRequest,
): Promise<SendMessageResponse> {
  void request; // TODO(T7): 실호출로 교체 시 사용
  return {
    reply: { role: "scammer", text: "(stub) 사기범 응답" },
    turnCount: 1,
    ended: false,
  };
}
