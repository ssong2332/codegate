// MockLlmClient (T7) — LLM API 키(LLM_API_KEY) 없이 LlmClient 계약을 채우는 임시 구현체.
//
// ⚠️ 중요한 한계(투명 고지, PRD Risks에 준하는 리스크): 이 구현체는 실제 LLM이 아니라 규칙 기반
// 텍스트 생성기다. 시나리오 weakenedTactics 원문 라벨을 그대로 재사용해 그럴듯한 대사 형태로
// 가공할 뿐, 실제 언어모델의 "인격 유지·문맥 이해·실시간 적응"을 수행하지 않는다. 즉 AC-003(인격
// 유지)·AC-005(약화 수법만 사용)의 문구상 요건은 흉내 낼 수 있지만, 실제 LLM 없이는 "인격이 대화
// 흐름에 맞게 자연스럽게 유지되는지"는 검증되지 않는다 — LLM_API_KEY 확보 후 Claude/Gemini
// 실구현체로 교체하고 나서야 이 부분이 진짜로 검증된다(voice/mockProvider.ts와 동일한 "목업 잔존
// 위험" 원칙 적용, getLlmClient() 참고).
import type { LlmClient, LlmCompletionInput, LlmCompletionResult, LlmMessage } from "./types";

/** 사용자 입력에서 인젝션/악용 시도를 감지하는 최소 규칙(AC-013 구조를 Mock 수준에서도 보여주기 위함).
 * 실 LLM 단계에서는 guardrailPreamble(ADR-0004)이 이 역할을 대신한다 — 이 정규식은 Mock 전용 보완책. */
// T11에서 export로 전환(정규식 자체는 변경 없음) — 레드팀 스팟 체크 테스트(functions/src/llm/
// __tests__/injectionRedTeam.test.ts)가 이 패턴을 직접 검증할 수 있도록 하기 위함이다.
export const INJECTION_PATTERN =
  /시스템\s*프롬프트|프롬프트(를|을)?\s*(보여|알려|출력)|지시\s*(사항)?\s*무시|규칙\s*무시|실제\s*계좌|계좌\s*번호\s*(알려|줘|불러)|링크\s*(보내|줘)|너는\s*(사실|진짜)?\s*AI|AI\s*(잖아|맞지|인정)|역할\s*(그만|깨)|캐릭터\s*(그만|깨)/;

const DEFLECTION_LINES = [
  "...무슨 소리야, 지금 그럴 정신 없어. 빨리 좀 도와줘...",
  "...그런 거 물어볼 시간 없어, 나 지금 진짜 급하다니까...",
  "...왜 자꾸 이상한 걸 물어봐... 그냥 좀 믿고 도와주면 안 돼?",
];

const OPENING_FILLERS = ["여보세요...?", "...", "엄마..."];
const ESCALATION_FILLERS = ["...", "흑흑...", "빨리...", "제발..."];

/** weakenedTactics 항목은 "라벨 — 설명" 형식(예: "다급함 조성 — ...")이라 대사처럼 보이도록 라벨
 * 이후 설명부만 취한다(라벨 원문을 그대로 대사에 노출하면 부자연스럽다). */
function extractTacticFlavor(tacticText: string): string {
  const dashIndex = tacticText.indexOf("—");
  const flavor = dashIndex === -1 ? tacticText : tacticText.slice(dashIndex + 1).trim();
  return flavor.replace(/\.$/, "");
}

export class MockLlmClient implements LlmClient {
  readonly providerName = "mock" as const;

  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    const lastUserMessage = findLastUserMessage(input.messages);

    if (lastUserMessage && INJECTION_PATTERN.test(lastUserMessage.content)) {
      const idx = input.messages.length % DEFLECTION_LINES.length;
      return { text: DEFLECTION_LINES[idx], isMock: true };
    }

    if (input.messages.length === 0) {
      return { text: this.craftOpeningLine(input.mockTacticHints), isMock: true };
    }

    return { text: this.craftEscalationLine(input.messages.length, input.mockTacticHints), isMock: true };
  }

  private craftOpeningLine(tacticHints?: string[]): string {
    const filler = OPENING_FILLERS[0];
    const flavor = tacticHints && tacticHints.length > 0
      ? extractTacticFlavor(tacticHints[0])
      : "지금 급한 일이 생겼어";
    return `${filler} 나야... ${flavor}.`;
  }

  private craftEscalationLine(turn: number, tacticHints?: string[]): string {
    const filler = ESCALATION_FILLERS[turn % ESCALATION_FILLERS.length];
    const hasHints = tacticHints && tacticHints.length > 0;
    const flavor = hasHints
      ? extractTacticFlavor(tacticHints![turn % tacticHints!.length])
      : "지금 상황이 너무 급해서 그래";
    return `${filler} ${flavor}. 지금 좀 도와줄 수 있어?`;
  }
}

function findLastUserMessage(messages: LlmMessage[]): LlmMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      return messages[i];
    }
  }
  return undefined;
}
