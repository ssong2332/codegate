// roleplay 모듈 요청/응답 타입 — src/lib/api/types.ts(클라 계약)와 1:1 대응(API.md).
import type { MessengerAttachment } from "../shared/types";

// attachments(T29 추가, 옵셔널·하위호환) — 메신저 채팅(UX-022)의 스미싱 링크(§13.2/13.4).
// extractLinkMarker(../roleplay/linkMarker.ts)가 채워 넣는다. 보이스 세션은 항상 부재.
export type ScammerMessage = {
  role: "scammer";
  text: string;
  attachments?: MessengerAttachment[];
};
export type UserMessage = { role: "user"; text: string };

export type SendMessageRequest = { sessionId: string; userText: string };
export type SendMessageResponse = {
  reply: ScammerMessage;
  turnCount: number;
  ended: boolean;
  endReason?: "limit_reached";
  /**
   * T7 추가(옵셔널, T19의 isMock 패턴과 동일) — true면 이번 응답이 MockLlmClient 산출물이라는 뜻
   * (LLM_API_KEY 미확보, PRD Risks급 고지). API.md에는 아직 명시 안 됨 — 클라(src/lib/api/types.ts)
   * 미러링은 이번 태스크 범위 밖이라 별도 후속 필요(구현 보고서 참고).
   */
  isMock?: boolean;
  /**
   * 실시간 음성 통화 전환(2026-07-22 사용자 결정) — 사기범 응답을 VoiceProvider(voice/provider.ts)로
   * 합성한 재생 URL. 합성이 실패해도 텍스트 응답 자체는 막지 않으므로 옵셔널이다(P-4 "핵심 루프
   * 비차단" 원칙). Mock 단계에서는 항상 고정 beep data URI가 온다(isMock으로 구분).
   */
  audioUrl?: string;
  /**
   * T30 추가(옵셔널, 하위호환) — sendMessage가 이번 응답에서 구조화 신호([[SIGNAL:ESCALATE_VOICE]])
   * 를 감지했거나 메신저 단계 max-turn 폴백에 도달해 서버가 이미 transitionChannel을 호출했다는
   * 뜻(Architecture.md §13.2). 클라는 이 플래그만 보고 통화 전환 연출(P-18)로 넘어간다 — 자유텍스트를
   * 직접 분류하지 않는다(AC-024 불변).
   */
  escalation?: { toChannel: "voice" };
};
