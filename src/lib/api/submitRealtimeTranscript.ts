import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type {
  SubmitRealtimeTranscriptRequest,
  SubmitRealtimeTranscriptResponse,
} from "./types";

/**
 * Callable 실호출 — `submitRealtimeTranscript` 1:1 (finding #1, 2026-07-23).
 *
 * 실시간 음성 통화(Gemini/ElevenLabs) 대화는 외부 AI 안에서 일어나 서버 `messages`에 기록되지
 * 않는다. 이 함수로 통화 중 모아둔 전사 턴을 종료 직전에 제출하면, 서버가 마스킹 후 messages에
 * append해 기존 리포트 로직이 실제 대화를 분석할 수 있게 된다. 실패해도 통화 종료 자체는 막지
 * 않는다(호출부에서 흡수) — 리포트가 비는 건 통화를 못 끝내는 것보다 나은 실패다.
 */
export async function submitRealtimeTranscript(
  request: SubmitRealtimeTranscriptRequest,
): Promise<SubmitRealtimeTranscriptResponse> {
  const callable = httpsCallable<SubmitRealtimeTranscriptRequest, SubmitRealtimeTranscriptResponse>(
    functionsClient,
    "submitRealtimeTranscript",
  );
  const { data } = await callable(request);
  return data;
}
