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

// 시나리오를 가리지 않는 중립적 필러만 쓴다(2026-07-22). 예전엔 "엄마...", "흑흑...", "빨리..."
// 처럼 가족 사칭 전용 표현이 섞여 있어, 국세청·캐피탈 상담원 같은 기관 사칭 시나리오에서도 그대로
// 튀어나와 대사가 어긋났다(실측 확인). 발신자 정체는 화면(callerLabel)과 대사 내용이 이미
// 전달하므로 필러는 통화 도입/뜸 들이기 역할만 한다.
const OPENING_FILLERS = ["여보세요...?", "여보세요, 들리세요?", "..."];
const ESCALATION_FILLERS = ["...", "저기요...", "잠시만요..."];

/** weakenedTactics 항목은 "라벨 — 3인칭 설명(예: '...식으로 위협하되, 실제 법적 조치는 제시하지
 * 않는다')" 형식이다 — 실 LLM에게 줄 지침 문장이라 그대로 대사로 읽으면 캐릭터가 자기 수법을
 * 해설하는 것처럼 들린다(사용자 실측 피드백, 2026-07-22). 각 설명 안에는 캐릭터가 실제로 말했을
 * 법한 '따옴표' 인용구가 최소 1개 포함되어 있으므로, 그 인용구만 뽑아 대사로 쓴다. 인용구가 없는
 * 경우에만(향후 콘텐츠 대비 안전망) 기존 방식(라벨 이후 설명부 전체)으로 폴백한다. */
// T29 QA 재검증(2026-07-23) 회귀 수정: 인용구만 뽑아 반환하면 `[[LINK:id]]`/`[[SIGNAL:...]]`
// 처럼 인용구 밖에 있는 구조화 마커가 통째로 버려져, 메신저 시나리오의 스미싱 링크 칩이 Mock
// LLM 경로에서 영영 만들어지지 않는 회귀가 생겼다(QA 재검증에서 발견). 인용구는 여전히
// "대사 본문"으로 쓰되, 원문에 구조화 마커가 있으면 그 마커만 뽑아 인용구 뒤에 그대로
// 덧붙여 살려 보낸다(뒤이어 extractLinkMarker/향후 sentinel 파서가 이 텍스트를 정상 처리할 수
// 있게). 마커는 사용자에게 그대로 노출되면 안 되는 제어 토큰이므로 인용구 앞이 아니라 뒤에 붙여
// "자연스러운 문장 + 마커"라는 실제 LLM이 낼 법한 순서를 흉내낸다.
const STRUCTURED_MARKER_PATTERN = /\[\[(?:LINK|SIGNAL):[a-zA-Z0-9_-]+\]\]/g;

function extractStructuredMarkers(tacticText: string): string[] {
  return [...tacticText.matchAll(STRUCTURED_MARKER_PATTERN)].map((m) => m[0]);
}

function extractTacticFlavor(tacticText: string): string {
  const quoted = [...tacticText.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const markers = extractStructuredMarkers(tacticText);
  const markerSuffix = markers.length > 0 ? ` ${markers.join(" ")}` : "";

  if (quoted.length > 0) {
    return quoted.join(", ") + markerSuffix;
  }
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

  // "나야..."(가족을 사칭할 때만 성립하는 표현)를 모든 시나리오에 하드코딩했던 것을 제거했다
  // (사용자 실측 피드백, 2026-07-22) — 기관 사칭처럼 가족 관계가 아닌 시나리오에도 항상 붙어
  // 있어 내용상 맞지 않았다. 발신자 정체는 화면(callerLabel)이 이미 보여주므로, 대사 자체는
  // 시나리오를 가리지 않는 수법 문구만 전달한다.
  private craftOpeningLine(tacticHints?: string[]): string {
    const filler = OPENING_FILLERS[0];
    const flavor = tacticHints && tacticHints.length > 0
      ? extractTacticFlavor(tacticHints[0])
      : "확인하실 게 있어서 연락드렸습니다";
    return `${filler} ${flavor}.`;
  }

  // 예전엔 모든 응답 끝에 "지금 좀 도와줄 수 있어?"를 붙였다 — 가족 사칭에서만 성립하는 반말
  // 부탁이라 국세청·캐피탈 상담원 시나리오에서 어긋났다(실측 확인, 2026-07-22). 시나리오별 어투는
  // 수법 문구(weakenedTactics 인용구)가 이미 담고 있으므로 공통 꼬리말을 붙이지 않는다.
  private craftEscalationLine(turn: number, tacticHints?: string[]): string {
    const filler = ESCALATION_FILLERS[turn % ESCALATION_FILLERS.length];
    const hasHints = tacticHints && tacticHints.length > 0;
    const flavor = hasHints
      ? extractTacticFlavor(tacticHints![turn % tacticHints!.length])
      : "지금 처리하지 않으면 곤란해집니다";
    return `${filler} ${flavor}.`;
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
