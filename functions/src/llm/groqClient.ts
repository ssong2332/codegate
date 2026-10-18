// Groq 텍스트 LLM 구현체 — 텍스트 대사 생성의 **3차 예비**(2026-10-18, Architecture.md §75).
//
// GeminiLlmClient와 같은 얇은 transport다: 이미 조립된 systemPrompt/messages를 보낸다(프롬프트 조립·
// 구분자 감싸기는 호출부 책임 — llm/types.ts). 다른 점은 둘뿐이다.
//   1. 보내기 전에 **이름·생년월일 가명 처리**(piiPseudonymizer.ts)를 하고, 응답의 가명은 원문으로 되돌린다.
//   2. SDK 없이 OpenAI 호환 REST(`/openai/v1/chat/completions`)를 Node 22 내장 `fetch`로 부른다
//      — 새 의존성 0(설치 단계·라이선스 검토 불필요).
//
// 모델·파라미터 근거(공식 문서, 2026-10-18 확인 — §75.2):
//   - 모델 ID `openai/gpt-oss-120b`(https://console.groq.com/docs/model/openai/gpt-oss-120b).
//   - 추론 모델이다. `reasoning_effort: "low"`(지연·토큰 절약), `include_reasoning: false`
//     (추론문이 `message.reasoning`에도 오지 않게 — 대사에 섞일 경로 차단). `reasoning_format`은
//     이 모델에서 지원되지 않는다(https://console.groq.com/docs/reasoning).
//   - `max_completion_tokens`는 추론 토큰을 포함한다 — 1,024면 3문장 대사에 충분하다(프로브 출력 ~100토큰).
//
// ⛔ 재시도 없음 — 실패는 그대로 던지고 바깥(completeWithFallback)이 Mock으로 강등한다.
// ⛔ 로그·에러 메시지에 키·프롬프트·응답 본문·Groq 에러 본문을 싣지 말 것(G170). Groq 에러 본문에는
//    조직 ID가 들어 있다(프로브 실측) — HTTP 상태와 `error.type`·`error.code`만 싣는다.
import { logger } from "firebase-functions";
import { OPENING_TRIGGER_TURN } from "./geminiClient";
import { pseudonymizeForGroq } from "./piiPseudonymizer";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "./types";

/** 고정 모델 ID — 별칭 금지 원칙(geminiClient.ts `GEMINI_TEXT_MODEL` 주석)과 같다. */
export const GROQ_TEXT_MODEL = "openai/gpt-oss-120b";
export const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MAX_COMPLETION_TOKENS = 1024;

/** Groq HTTP 오류 — `status`를 숫자로 보존한다(판정은 숫자로만 한다). 메시지에 본문을 넣지 않는다. */
export class GroqApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorType?: string,
    readonly errorCode?: string,
  ) {
    super(`Groq HTTP ${status}${errorType || errorCode ? ` (${errorType ?? "-"}/${errorCode ?? "-"})` : ""}`);
    this.name = "GroqApiError";
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface GroqChatResponse {
  choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  error?: { type?: unknown; code?: unknown };
}

export class GroqLlmClient implements LlmClient {
  readonly providerName = "groq" as const;

  /** `fetchImpl`은 테스트 주입점(기본값 = 전역 fetch). */
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {}

  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    const pseudo = pseudonymizeForGroq(input.messages);
    const messages =
      pseudo.messages.length > 0 ? pseudo.messages : [{ role: "user" as const, content: OPENING_TRIGGER_TURN }];

    const startedAt = Date.now();
    const response = await this.fetchImpl(GROQ_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: GROQ_TEXT_MODEL,
        messages: [{ role: "system", content: input.systemPrompt }, ...messages],
        reasoning_effort: "low",
        include_reasoning: false,
        max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
      }),
      ...(input.signal ? { signal: input.signal } : {}),
    });

    let body: GroqChatResponse = {};
    try {
      body = (await response.json()) as GroqChatResponse;
    } catch {
      // 본문이 JSON이 아니어도 상태 코드로 판정한다.
    }
    const elapsedMs = Date.now() - startedAt;

    if (!response.ok) {
      const errorType = typeof body.error?.type === "string" ? body.error.type : undefined;
      const errorCode = typeof body.error?.code === "string" ? body.error.code : undefined;
      logger.warn("Groq 텍스트 생성 실패", { model: GROQ_TEXT_MODEL, status: response.status, errorType, errorCode, elapsedMs });
      throw new GroqApiError(response.status, errorType, errorCode);
    }

    const raw = body.choices?.[0]?.message?.content;
    const text = typeof raw === "string" ? pseudo.restore(raw).trim() : "";
    logger.info("Groq 텍스트 생성 성공", {
      model: GROQ_TEXT_MODEL,
      elapsedMs,
      ...(typeof body.usage?.prompt_tokens === "number" ? { promptTokens: body.usage.prompt_tokens } : {}),
      ...(typeof body.usage?.completion_tokens === "number" ? { completionTokens: body.usage.completion_tokens } : {}),
      // 가명 처리 개수만(원문 값 금지 — G170).
      pseudonymizedNames: pseudo.nameCount,
      pseudonymizedBirthdates: pseudo.birthdateCount,
    });

    if (!text) {
      throw new Error("Groq 텍스트 응답이 비어 있습니다(차단·길이 초과 가능성).");
    }
    return { text, isMock: false };
  }
}
