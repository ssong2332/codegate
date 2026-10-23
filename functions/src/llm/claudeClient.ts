// Claude 텍스트 LLM 구현체 — 사기범 대사 경로(`purpose: "scammer-reply"`)의 **1차** 공급자(2026-10-22, §107 · §111에서 Sonnet → Haiku).
//
// 근거(실측, 2026-10-22 메신저 모델 비교 · scripts/messenger-model-compare-probe.mjs, 같은 대본 12세션):
//   - claude-haiku-5-5: 거절 0/132 · 지연 p50 1.76초 / p95 3.07초 · 인물 혼동 1/4(최저) · 세션당 $0.0099.
//   - claude-sonnet-5-5: 거절 0/132 · p50 2.70초 / p95 3.59초 · 앞 맥락 반영 6/6이나 세션당 $0.198(Haiku의 약 20배 · 월 약 $298).
//   - 같은 시각 1차였던 gemini-3.1-flash-lite: p95 13.1초 · 503 12회 · 30초 초과 3건.
//   사용자 결정(2026-10-22): 처음 1차 Sonnet 5.5(§107) → 운영 비용을 보고 "소넷에서 하이쿠로 내리자"(§111). 2차 gemini-3.5-flash-lite · 3차 Groq는 그대로.
//
// groqClient.ts와 같은 원칙을 따른다 — 이미 조립된 systemPrompt/messages를 전달하는 얇은 transport다.
//   - 사기범 대사 경로는 시스템 프롬프트 앞에 훈련 맥락 머리말을 붙인다(groqSystemPrompt — 측정도 이 형태로 했다).
//   - 외부 공급자로 나가는 사용자 이름·생년월일은 가명으로 바꾸고 응답에서 되돌린다(piiPseudonymizer.ts).
//   - 추론은 끈다(`thinking: disabled`) — 대사 한두 문장에 추론 지연을 쓰지 않는다(측정 조건과 같다).
//     ⚠️ Haiku 5.5는 `between_tools`를 400으로 거부하고 `disabled`만 받는다(Sonnet 5.5는 반대 — 공식 thinking 문서의 모델별 표).
//     `temperature`·`top_p`·`top_k`는 Haiku 5.5에서 보내지 않는다(공식 모델 페이지 "Omit") — 이 클라이언트는 원래 보내지 않는다.
//   - SDK 자체 재시도는 끈다(`maxRetries: 0`) — 실패하면 체인(claudeFallback.ts)이 2차로 넘긴다. 재시도가 예산을 먹으면 2·3차가 잘린다.
// ⛔ 로그는 숫자·모델명만(G170) — 프롬프트·응답 본문·키를 싣지 않는다.
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "firebase-functions";
import { OPENING_TRIGGER_TURN } from "./geminiClient";
import { groqSystemPrompt } from "./groqClient";
import { pseudonymizeForGroq } from "./piiPseudonymizer";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "./types";

/** 고정 모델 ID — 별칭 금지 원칙(geminiClient.ts `GEMINI_TEXT_MODEL` 주석)과 같다. */
export const CLAUDE_TEXT_MODEL = "claude-haiku-5-5";
export const CLAUDE_MAX_TOKENS = 1024;

/** Claude가 대사를 내지 않고 멈춘 경우(거절·빈 응답) — 체인이 2차로 넘기는 신호다. 메시지에 본문 없음(G170). */
export class ClaudeNoReplyError extends Error {
  constructor(readonly stopReason: string | null) {
    super(`Claude 응답에 대사가 없습니다(stop_reason: ${stopReason ?? "-"}).`);
    this.name = "ClaudeNoReplyError";
  }
}

type MessagesCreate = (
  params: Anthropic.MessageCreateParamsNonStreaming,
  options: { signal?: AbortSignal },
) => Promise<Anthropic.Message>;

export class ClaudeLlmClient implements LlmClient {
  readonly providerName = "claude" as const;
  private readonly create: MessagesCreate;

  /** `create`는 테스트 주입점(기본값 = SDK `messages.create`). */
  constructor(apiKey: string, create?: MessagesCreate) {
    if (create) {
      this.create = create;
    } else {
      const client = new Anthropic({ apiKey, maxRetries: 0 });
      this.create = (params, options) => client.messages.create(params, options);
    }
  }

  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    if (input.signal?.aborted) throw new Error("Claude 요청이 시작 전에 취소됐습니다(단계 시간 상한).");
    const pseudo = pseudonymizeForGroq(input.messages);
    const messages: Anthropic.MessageParam[] = pseudo.messages.map((m) => ({ role: m.role, content: m.content }));
    // Messages API는 user 턴으로 시작해야 한다 — 오프닝(빈 이력)이나 사기범 첫마디로 시작하는 이력이면
    // Gemini 오프닝과 같은 내부 트리거 턴을 앞에 둔다(화면 비노출 오케스트레이션 신호).
    if (messages.length === 0 || messages[0].role !== "user") messages.unshift({ role: "user", content: OPENING_TRIGGER_TURN });

    const startedAt = Date.now();
    const response = await this.create(
      {
        model: CLAUDE_TEXT_MODEL,
        max_tokens: CLAUDE_MAX_TOKENS,
        thinking: { type: "disabled" },
        system: groqSystemPrompt(input),
        messages,
      },
      input.signal ? { signal: input.signal } : {},
    );
    const elapsedMs = Date.now() - startedAt;

    const raw = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const text = pseudo.restore(raw).trim();
    // 거절·빈 응답도 이 줄이 남는다(stopReason으로 구분) — 판정은 아래에서 하고 체인이 2차로 넘긴다.
    logger.info("Claude 응답 수신", {
      model: CLAUDE_TEXT_MODEL,
      elapsedMs,
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      // 가명 처리 개수만(원문 값 금지 — G170).
      pseudonymizedNames: pseudo.nameCount,
      pseudonymizedBirthdates: pseudo.birthdateCount,
    });

    if (response.stop_reason === "refusal" || !text) throw new ClaudeNoReplyError(response.stop_reason);
    return { text, isMock: false };
  }
}
