// session 모듈 요청/응답 타입 — src/lib/api/types.ts(클라 계약)와 1:1 대응(API.md).
import type { ScammerMessage } from "../roleplay/types";
import type {
  MessengerChannel,
  MessengerSkin,
  MessengerSkinSource,
  MessengerSurface,
  VoiceSelectionSource,
} from "../shared/types";

// sessionId(T4 추가, 옵셔널·하위호환): 온보딩 단계에서 클라가 만든 "사전 세션 id"
// (src/lib/recording/pendingSession.ts, createVoiceClone이 최소 필드로 미리 만들어 둔
// sessions/{sid} 문서)를 넘기면 createSession이 새 문서를 또 만들지 않고 그 문서를 채택한다
// (sessionId 불일치 갭 해소 — functions/src/session/index.ts 주석 참고). 생략 시 기존과 동일하게
// 새 id를 발급한다. API.md에는 아직 반영 안 됨 — architect 확인/문서 갱신 권장.
// channel/surface/messengerSkin/skinSource(T29 추가, 옵셔널·하위호환, Architecture.md §13.1/13.4):
// 메신저 훈련(UX-024)에서만 채워진다. 부재 시 기존과 동일하게 voice 세션으로 생성된다.
// voiceSelectionSource(T30 추가, 옵셔널·하위호환, Architecture.md §13.6/UX-025) — 에스컬레이션
// 가능한 메신저 시나리오에서만 채워진다. "fallback_male"|"fallback_female"이면 createSession이
// 클라가 보낸 voiceId를 FALLBACK_VOICE_MALE_ID/FEMALE_ID(shared/config.ts)로 서버측 재해석한다
// (미설정 시 클라 값 그대로, 조용한 실패 없음 — functions/src/session/index.ts 참고).
export type CreateSessionRequest = {
  scenarioId: string;
  voiceId: string;
  sessionId?: string;
  channel?: MessengerChannel;
  surface?: MessengerSurface;
  messengerSkin?: MessengerSkin;
  skinSource?: MessengerSkinSource;
  voiceSelectionSource?: VoiceSelectionSource;
};
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

// --- updateMessengerSkin (T29 · UX-022 · AC-031/P-16) ---
// 클라 UA 감지·수동 전환 결과를 세션 문서에 지속한다(리포트·새로고침·수동 전환 유지 목적).
// firestore.rules가 sessions/{sessionId}에 클라 write를 전부 거부해 콜러블이 필요하다.
export type UpdateMessengerSkinRequest = {
  sessionId: string;
  messengerSkin: MessengerSkin;
  skinSource: MessengerSkinSource;
};
export type UpdateMessengerSkinResponse = {
  messengerSkin: MessengerSkin;
  skinSource: MessengerSkinSource;
};

// --- requestEscalation (T30 · UX-022 명시 "전화로 확인" 버튼 · §13.3/AC-034) ---
// 사용자가 언제든(1턴부터) 수동으로 메신저→보이스 전이를 요청한다. endSession/updateMessengerSkin과
// 동일한 인증·존재확인·소유uid·상태 검증 패턴을 따른다(functions/src/session/index.ts 참고).
export type RequestEscalationRequest = { sessionId: string };
export type RequestEscalationResponse = { escalation: { toChannel: "voice" } };
