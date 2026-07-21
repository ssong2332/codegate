// roleplay 모듈 요청/응답 타입 — src/lib/api/types.ts(클라 계약)와 1:1 대응(API.md).
export type ScammerMessage = { role: "scammer"; text: string };
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
};
