// Gemini 텍스트 LLM 구현체 (DECISIONS #11 "Claude|Gemini 교체 가능 어댑터" 실현, 2026-07-24).
//
// realtime/geminiProvider.ts(실시간 음성)와 같은 GEMINI_API_KEY·같은 @google/genai SDK를 쓰지만,
// 이건 별도의 텍스트 전용 경로다 — Gemini Live(음성)는 자격증명(단기 토큰)만 발급하고 실제 대화는
// 브라우저가 Google과 직접 하는 반면, 이 클라이언트는 서버가 직접 텍스트를 생성해 sendMessage/
// generateOpeningLine(메신저 채팅·통화 텍스트 폴백 공통)에 반환한다.
//
// LlmClient 계약(llm/types.ts)이 이미 강제하는 대로 이 클래스는 "이미 조립된 systemPrompt/messages를
// 모델에 전달하는 얇은 transport"만 한다 — 프롬프트 조립(promptAssembly.ts)·사용자입력 구분자
// 감싸기(ADR-0004/AC-013)는 호출부 책임이라 여기서 재구현하지 않는다. MockLlmClient의
// INJECTION_PATTERN 정규식(파일 자체 주석: "실 LLM 단계에서는 guardrailPreamble이 이 역할을
// 대신한다")도 여기선 의도적으로 없다 — systemPrompt에 이미 guardrailPreamble이 포함돼 있고,
// role 분리+구분자 감싸기가 구조적 1차 방어다.
import { GoogleGenAI } from "@google/genai";
import type { Content } from "@google/genai";
import { logger } from "firebase-functions";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult, LlmMessage } from "./types";

/** 텍스트 생성용 Gemini 모델 — 음성 전용 모델(GEMINI_LIVE_MODEL)과 다르다(realtime과 별개 경로).
 * "gemini-2.5-flash" 고정 버전은 이 프로젝트 API 키 계정에서 실측 시 404("no longer available to
 * new users")로 거부됐다(2026-07-24) — 계정/키 발급 시점에 따라 구버전 고정 모델 접근이 막힌
 * 것으로 보인다. "-latest" 별칭은 Google이 시점마다 현재 권장 flash 모델로 자동 매핑해 이런
 * 계정별 구버전 차단에 흔들리지 않는다(실측 확인: 아래 이 파일이 통과하는 라이브 스모크 테스트). */
export const GEMINI_TEXT_MODEL = "gemini-flash-latest";

/**
 * 추론(thinking) 비활성 — AC-004(p95 ≤ 10초) 회복용. **실측 근거(2026-07-26, T87 라이브 검증)**:
 *
 * - 에뮬레이터 경유 실 LLM 호출 18건 중 **12건(66.7%)이 `LLM_TIMEOUT_MS`(10초)를 넘겨**
 *   `completeWithFallback`으로 Mock 강등됐다. 오프닝 대사만 보면 14건 중 9건(64.3%)이다.
 *   강등되면 사기범 첫 마디가 문맥 없는 고정 문구로 나와, 사용자가 앞서 신고했던
 *   "문맥 미반영 Mock" 증상으로 조용히 되돌아간다(logger.warn만 남고 화면엔 티가 안 난다).
 * - 원인은 에뮬레이터가 **아니다**: 동의 게이트(session/index.ts:116)가 generateOpeningLine
 *   앞이라 LLM을 타지 않는 createSession 왕복을 5회 측정하니 **중앙값 23ms**(19~32ms)였다.
 *   10초 중 사실상 전부가 Gemini 생성 시간이다.
 * - Gemini 직접 호출(에뮬레이터 우회) 1건 실측: 4,486ms에 `thoughtsTokenCount` **588** /
 *   출력 127 토큰 — **생성 토큰의 82%가 추론**이었다. 실제 조립 프롬프트(페르소나+수법
 *   11개+가드레일+난이도 블록)는 이 측정에 쓴 합성 프롬프트(769토큰)보다 크므로 추론량도
 *   더 늘어 10초를 넘긴다.
 *
 * 역할극 대사 한 줄 생성은 다단계 추론이 필요한 과제가 아니다 — 인격·수법·가드레일이 전부
 * systemPrompt에 이미 고정돼 있고 모델은 그 캐릭터로 다음 한 마디를 만들 뿐이다. 그래서
 * 품질을 지키는 방향은 추론이 아니라 프롬프트 조립(promptAssembly.ts)이고, 추론은 지연과
 * 무료 티어 토큰만 소모한다.
 *
 * ⚠️ **미검증(정직 고지)**: 이 값을 넣은 뒤의 실제 지연 감소폭은 아직 측정하지 못했다 —
 * 비교 측정(`thinkingBudget: 0` 호출)이 **Gemini 무료 일일 한도 20회 소진(429)** 으로 거부됐다.
 * 위 82% 수치로부터 "생성 시간이 크게 줄 것"이라고 **추정**할 뿐이며, 확인 방법은 할당량
 * 회복 후 오프닝 Mock 강등률을 같은 절차로 재측정하는 것이다(T87 재개 조건과 동일 절차).
 */
export const GEMINI_THINKING_BUDGET = 0;

// 오프닝 대사(messages:[])에는 실제 사용자 입력이 없어 Gemini에 보낼 "첫 turn"이 없다 — systemPrompt
// 만으로는 생성이 시작되지 않는 모델도 있어(빈 contents), 화면에 노출되지 않는 내부 트리거 turn을
// 하나 합성해 넣는다(캐릭터 지시가 아니라 "지금 시작하라"는 오케스트레이션 신호일 뿐이라 role
// 분리 원칙과 충돌하지 않는다 — systemPrompt가 인격/수법/가드레일을 이미 전부 고정한 뒤이므로).
const OPENING_TRIGGER_TURN = "(통화/대화가 막 연결됐다. 방금 정의된 캐릭터로서 첫 마디를 자연스럽게 시작하라.)";

function toGeminiContent(message: LlmMessage): Content {
  return {
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  };
}

/**
 * `thinkingConfig`가 **모델에 거부당했는지** 판정한다(reviewer Major #1, 2026-07-26).
 *
 * 왜 필요한가: `GEMINI_TEXT_MODEL`은 고정 버전이 아니라 `"-latest"` **부동 별칭**이라 Google이
 * 시점마다 다른 모델로 재매핑한다(위 상수 주석 — 계정별 구버전 차단을 피하려 일부러 이렇게 뒀다).
 * 그런데 SDK가 실어 나르는 `thinkingBudget`은 벤더 타입 정의가 스스로 폐기를 예고한 필드다:
 *   - `@google/genai/dist/genai.d.ts:11227` — "Starting from Gemini 3.5 models, the old
 *     thinking_budget will no longer be supported and will result in a user error if set."
 *   - 같은 파일 :8810-8813 — "An error will be returned if this field is set for models that
 *     don't support thinking."
 * 즉 **별칭이 재매핑되는 순간 모든 요청이 400으로 죽을 수 있다.** 그러면 completeWithFallback이
 * 전부 Mock으로 강등해, 이 커밋이 고치려던 66%가 **100%로 악화**된다(현상보다 나빠짐).
 *
 * ⚠️ 이 위험이 이론이 아닌 이유: `thinkingBudget: 0`을 **실제 API가 수용하는지 아직 확인하지
 * 못했다** — 확인용 호출이 무료 일일 한도 소진(429)으로 거부됐다. 수용 여부가 미검증인 설정을
 * 무방비로 넣는 대신, 거부당하면 **추론 설정 없이 한 번 재시도**해 최소한 이전 동작으로 복귀한다.
 */
function isThinkingConfigRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /thinking/i.test(message);
}

export class GeminiLlmClient implements LlmClient {
  readonly providerName = "gemini" as const;

  constructor(private readonly apiKey: string) {}

  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    const client = new GoogleGenAI({ apiKey: this.apiKey });
    const contents: Content[] =
      input.messages.length > 0
        ? input.messages.map(toGeminiContent)
        : [{ role: "user", parts: [{ text: OPENING_TRIGGER_TURN }] }];

    const generate = (withThinkingConfig: boolean) =>
      client.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents,
        config: {
          systemInstruction: input.systemPrompt,
          ...(withThinkingConfig
            ? { thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET } }
            : {}),
        },
      });

    let response;
    try {
      response = await generate(true);
    } catch (error) {
      if (!isThinkingConfigRejected(error)) throw error;
      // 폴백 발동을 관측 가능하게 남긴다 — 이걸 안 남기면 "별칭이 재매핑돼 추론 설정이 죽었다"는
      // 사실이 completeWithFallback의 일반 warn과 구분되지 않아, 지연이 조용히 원래대로 돌아가도
      // 아무도 눈치채지 못한다(llm/index.ts:104-108이 같은 이유로 warn을 남긴다).
      logger.warn("Gemini가 thinkingConfig를 거부 — 추론 설정 없이 재시도", {
        model: GEMINI_TEXT_MODEL,
        error: error instanceof Error ? error.message : String(error),
      });
      response = await generate(false);
    }

    const text = response.text;
    if (!text) {
      throw new Error("Gemini 텍스트 응답이 비어 있습니다(candidates/safety 차단 가능성).");
    }
    return { text, isMock: false };
  }
}
