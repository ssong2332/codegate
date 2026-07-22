// createRealtimeCall 콜러블 요청/응답 — src/lib/api/types.ts(클라 계약)와 1:1(API.md 관례).
export type CreateRealtimeCallRequest = { sessionId: string };
export type CreateRealtimeCallResponse = {
  /** 접속할 실시간 프로바이더. `none`이면 실시간 불가 → 텍스트 폴백. */
  provider: "elevenlabs" | "gemini" | "none";
  /** ElevenLabs 서명 WebSocket URL. 그 외 프로바이더면 빈 문자열. */
  signedUrl: string;
  /** Gemini 단기 토큰(모델·프롬프트가 서버에서 고정돼 있음). 그 외면 빈 문자열. */
  geminiToken: string;
  /** Gemini 접속 모델명. 그 외면 빈 문자열. */
  geminiModel: string;
  /** ElevenLabs에서 쓸 목소리(clone 시나리오는 본인 클론 id). Gemini는 고정 음성이라 빈 문자열. */
  voiceId: string;
  language: "ko";
  /** true = 실시간 대화 불가(키/설정 미비 또는 발급 실패) → 클라는 텍스트 폴백으로 진행. */
  isMock: boolean;
};
