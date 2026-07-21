// LLM 어댑터 인터페이스/타입 (Track A, T7, Architecture.md §1·§9 DECISIONS #11 — Claude|Gemini
// 교체 가능한 얇은 어댑터 1겹). `functions/src/voice/provider.ts`의 VoiceProvider 패턴과 동일한
// 구조(인터페이스 뒤에 구현체를 교체, 팩토리 함수 1곳으로 교체점을 단일화)를 LLM에도 적용한다.
//
// 이 인터페이스는 Claude/Gemini 실구현체와 Mock 구현체 모두가 따라야 하는 최소 계약이다. 프롬프트
// 조립(personaPrompt+weakenedTactics+guardrailPreamble, ADR-0004)과 사용자 입력 구분자 감싸기는
// 이 모듈이 아니라 호출부(functions/src/roleplay)의 책임이다 — LLM 어댑터는 이미 조립된
// systemPrompt/messages를 모델에 전달하는 얇은 transport 계층으로 유지한다(도메인 로직 분리).

export type LlmMessageRole = "user" | "assistant";
export type LlmMessage = { role: LlmMessageRole; content: string };

export type LlmCompletionInput = {
  /** 서버가 조립한 시스템 프롬프트(페르소나+약화 수법+가드레일 프리앰블, ADR-0004). */
  systemPrompt: string;
  /**
   * 지금까지의 대화 이력 + 이번 턴 사용자 입력(마지막 원소로 role:"user" 포함, 호출부가 구분자로
   * 감싸서 전달한다 — AC-013/AC-024 "사용자 입력과 시스템 프롬프트 분리" 구조). 오프닝 대사
   * 생성처럼 아직 사용자 입력이 없는 경우 빈 배열.
   */
  messages: LlmMessage[];
  /**
   * Mock 구현체 전용 힌트(선택). 실 Claude/Gemini 어댑터는 systemPrompt만으로 판단하고 이 필드를
   * 무시한다 — MockLlmClient는 실제 모델 이해력이 없으므로 시나리오 weakenedTactics 원문을 그대로
   * 참고해 규칙 기반 대사를 만드는 데 사용한다.
   */
  mockTacticHints?: string[];
};

export type LlmCompletionResult = {
  text: string;
  /** true = Mock 구현체 산출물(T7). 실 Claude/Gemini 응답이면 반드시 false(PRD Risks 식별 표식). */
  isMock: boolean;
};

export interface LlmClient {
  readonly providerName: "mock" | "claude" | "gemini";
  complete(input: LlmCompletionInput): Promise<LlmCompletionResult>;
}
