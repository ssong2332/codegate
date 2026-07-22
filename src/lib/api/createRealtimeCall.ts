import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { CreateRealtimeCallRequest, CreateRealtimeCallResponse } from "./types";

/**
 * Callable 실호출 — `createRealtimeCall` 1:1 (UX-014 live phase, 2026-07-22).
 *
 * 실시간 speech-to-speech 통화를 시작하기 위한 ElevenLabs 서명 URL을 받아온다. 서명 URL은 짧은
 * 수명을 가지며, 이 구조 덕분에 ElevenLabs API 키가 브라우저 번들에 포함되지 않는다.
 * 키/에이전트 미설정 등으로 실시간 대화가 불가능하면 `isMock: true`가 돌아오고, 화면은 기존
 * 텍스트 기반 폴백 대화로 진행한다(조용한 실패 금지).
 */
export async function createRealtimeCall(
  request: CreateRealtimeCallRequest,
): Promise<CreateRealtimeCallResponse> {
  const callable = httpsCallable<CreateRealtimeCallRequest, CreateRealtimeCallResponse>(
    functionsClient,
    "createRealtimeCall",
  );
  const { data } = await callable(request);
  return data;
}
