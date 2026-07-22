// 실시간 음성 대화 목업 구현체 — ELEVENLABS_API_KEY / ELEVENLABS_AGENT_IDS 미설정 시 사용.
//
// voice/mockProvider.ts·llm/mockClient.ts와 동일한 "인터페이스 뒤 목업" 관례를 따른다. 실제
// WebSocket 연결을 만들지 않고 `isMock: true`만 돌려주며, 클라는 이 값을 보고 **기존 텍스트 기반
// 폴백 대화**로 진행한다(조용한 실패 금지 — 화면에도 실시간 통화가 아님을 알린다).
import { RealtimeVoiceProvider, RealtimeCallCredentials, RealtimeCallInput } from "./types";

export class MockRealtimeProvider implements RealtimeVoiceProvider {
  readonly providerName = "mock" as const;

  async createCallCredentials(input: RealtimeCallInput): Promise<RealtimeCallCredentials> {
    return {
      signedUrl: "",
      voiceId: input.voiceId,
      language: "ko",
      isMock: true,
    };
  }
}
