import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { SendMessageRequest, SendMessageResponse } from "./types";

/**
 * Callable 실호출 — API.md `sendMessage` 1:1 (Track A, T7, UX-006, AC-003~005/AC-013/AC-024/AC-007).
 * T2 단계 더미 응답(Architecture.md §4 스텁 관례)을 채팅 화면(UX-006) 구현 시 실호출로 교체했다
 * (createVoiceClone.ts/endSession.ts와 동일 패턴). 서버(functions/src/roleplay/index.ts)의 역할극
 * 엔진 로직은 T7이 이미 완성해 두었다 — 이 클라 래퍼만 T2 더미 상태로 남아 있었다.
 */
export async function sendMessage(
  request: SendMessageRequest,
): Promise<SendMessageResponse> {
  const callable = httpsCallable<SendMessageRequest, SendMessageResponse>(
    functionsClient,
    "sendMessage",
  );
  const { data } = await callable(request);
  return data;
}
