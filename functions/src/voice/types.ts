// voice 모듈 요청/응답 타입 — src/lib/api/types.ts(클라 계약)와 1:1 대응(API.md).
// isMock 필드(T19 추가): true면 VoiceProvider가 MockVoiceProvider였다는 뜻 — 클라이언트가 이
// 값으로 "임시 목업 음성" 라벨을 노출해 실제 ElevenLabs 클론과 혼동되지 않게 한다(PRD Risks).
export type CreateVoiceCloneRequest = { sessionId: string };
export type CreateVoiceCloneResponse = {
  voiceId: string;
  cloneStatus: "ready";
  isMock: boolean;
};

// synthesizeDeepvoice 요청/응답 타입은 2026-07-22에 콜러블과 함께 제거했다
// (functions/src/voice/index.ts 상단 제거 이력 참고). VoiceProvider.synthesize 자체는 남아 있고
// createSession/sendMessage의 오디오 합성 경로에서 계속 쓰인다.
