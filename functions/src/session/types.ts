// session 모듈 요청/응답 타입 — src/lib/api/types.ts(클라 계약)와 1:1 대응(API.md).
import type { ScammerMessage } from "../roleplay/types";

// sessionId(T4 추가, 옵셔널·하위호환): 온보딩 단계에서 클라가 만든 "사전 세션 id"
// (src/lib/recording/pendingSession.ts, createVoiceClone이 최소 필드로 미리 만들어 둔
// sessions/{sid} 문서)를 넘기면 createSession이 새 문서를 또 만들지 않고 그 문서를 채택한다
// (sessionId 불일치 갭 해소 — functions/src/session/index.ts 주석 참고). 생략 시 기존과 동일하게
// 새 id를 발급한다. API.md에는 아직 반영 안 됨 — architect 확인/문서 갱신 권장.
export type CreateSessionRequest = { scenarioId: string; voiceId: string; sessionId?: string };
export type CreateSessionResponse = {
  sessionId: string;
  openingMessage: ScammerMessage;
  maxUserTurns: number;
  maxSessionMs: number;
  /**
   * T7 추가(옵셔널, T19의 isMock 패턴과 동일) — true면 openingMessage가 MockLlmClient 산출물이라는
   * 뜻(LLM_API_KEY 미확보). API.md에는 아직 명시 안 됨 — 클라(src/lib/api/types.ts) 미러링은 이번
   * 태스크 범위 밖이라 별도 후속 필요(구현 보고서 참고).
   */
  isMock?: boolean;
  /**
   * 실시간 음성 통화 전환(2026-07-22 사용자 결정) — 오프닝 사기범 대사를 VoiceProvider로 합성한
   * 재생 URL(sendMessage.audioUrl과 동일 패턴). 합성 실패해도 세션 생성 자체는 막지 않는다.
   */
  openingAudioUrl?: string;
};

export type EndSessionReason =
  | "user_ended"
  | "completed"
  | "deceived"
  | "limit_reached";
export type EndSessionRequest = {
  sessionId: string;
  endReason: EndSessionReason;
};
export type EndSessionResponse = { status: "ended"; reportPending: true };
