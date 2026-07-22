// createRealtimeCall 콜러블 요청/응답 — src/lib/api/types.ts(클라 계약)와 1:1(API.md 관례).
export type CreateRealtimeCallRequest = { sessionId: string };
export type CreateRealtimeCallResponse = {
  /** ElevenLabs 서명 WebSocket URL. isMock:true면 빈 문자열. */
  signedUrl: string;
  /** 이 통화에 쓸 목소리(clone 시나리오는 본인 클론 id, generic은 공용 기본 음성). */
  voiceId: string;
  language: "ko";
  /** true = 실시간 대화 불가(키/에이전트 미설정 또는 발급 실패) → 클라는 텍스트 폴백으로 진행. */
  isMock: boolean;
};
