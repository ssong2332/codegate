// 실시간 음성 대화(Realtime Voice) 어댑터 타입 — 2026-07-22 사용자 결정.
//
// 기존 파이프라인(브라우저 STT → 텍스트 LLM → TTS 합성 → <audio> 재생)은 턴마다 3단계를 왕복해
// 지연이 누적되고, 사용자가 말을 끊거나 겹쳐 말하는 실제 통화 동작을 재현하지 못했다. 이를
// **speech-to-speech 실시간 대화**로 교체한다.
//
// 프로바이더 선택 근거(추정 아님 — 각 API 문서 확인):
//   ElevenLabs Agents Platform을 채택했다. OpenAI Realtime·Gemini Live도 저지연 speech-to-speech를
//   제공하지만 **둘 다 고정된 프리셋 음성만 쓸 수 있다**. 이 앱의 1번 차별점은 "참가자 본인 목소리를
//   복제한 딥보이스"(AC-018/019)이므로, 런타임에 임의의 클론 voice_id를 지정할 수 있어야 한다.
//   ElevenLabs는 `tts.voice_id` 오버라이드를 지원하는 유일한 선택지라 이 요구를 만족한다.
//   한국어는 `agent.language: "ko"`로 지정하며, 음성 모델은 저지연(Flash 계열) 설정을 에이전트
//   쪽에 구성한다.
//
// ⚠️ ADR-0004 준수(중요): 시나리오 페르소나 프롬프트는 **클라이언트로 내려보내지 않는다**.
//   ElevenLabs 오버라이드는 클라이언트가 세션 시작 시 전송하는 값이라, 프롬프트를 오버라이드로
//   넘기면 브라우저에 민감 프롬프트가 노출된다. 따라서 **시나리오별 에이전트를 ElevenLabs 쪽에
//   미리 만들어 두고 프롬프트는 그 에이전트에 저장**하며, 서버는 scenarioId → agentId 매핑과
//   서명 URL만 발급한다. 클라가 보내는 오버라이드는 민감하지 않은 voice_id(본인 클론 id)뿐이다.

export type RealtimeCallInput = {
  sessionId: string;
  scenarioId: string;
  /**
   * 이 통화에 쓸 목소리. clone 시나리오는 참가자 본인의 클론 voiceId, generic 시나리오는
   * 공용 기본 음성 id. 민감 정보가 아니라 클라 오버라이드로 전달해도 무방하다.
   */
  voiceId: string;
};

export type RealtimeCallCredentials = {
  /**
   * ElevenLabs 서명 URL(WebSocket). 짧은 유효기간을 가지며 API 키를 클라에 노출하지 않는다.
   * Mock 구현체는 빈 문자열을 반환하고 `isMock: true`로 표시한다.
   */
  signedUrl: string;
  /** 클라가 세션 시작 시 그대로 전달할 오버라이드(민감 정보 없음 — voice_id/language만). */
  voiceId: string;
  language: "ko";
  /** true = 실제 실시간 대화가 아니라 목업(키 미설정). 클라는 기존 텍스트 폴백으로 진행한다. */
  isMock: boolean;
};

export interface RealtimeVoiceProvider {
  readonly providerName: "mock" | "elevenlabs";
  /** 통화 1건에 필요한 접속 자격증명을 발급한다. */
  createCallCredentials(input: RealtimeCallInput): Promise<RealtimeCallCredentials>;
}
