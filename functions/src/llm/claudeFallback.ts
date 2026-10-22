// Claude 1차 → Gemini 2차 단계 (2026-10-22, §107 판정표가 정본). 사기범 대사 경로에만 쓴다(llm/index.ts).
//
// 순서: 1차 Claude(claude-haiku-5-5) → **2차 gemini-3.5-flash-lite** → 3차 Groq(groqFallback.ts) → Mock 강등.
//
// | Claude 단계의 결과                                                           | Gemini 2차 시도 |
// |------------------------------------------------------------------------------|-----------------|
// | 성공했지만 사기범 대사로 쓸 수 없음(`UnusableReplyError`, §102)               | 예, 1회         |
// | 거절·빈 응답(`ClaudeNoReplyError`)                                            | 예, 1회         |
// | 단계 시간 상한 초과(`withStageDeadline`의 `GeminiStageTimeoutError`)          | 예, 1회         |
// | HTTP 오류 전부(400·401·403·404·429·500·529 등) · 네트워크 오류 · 그 밖의 예외  | 예, 1회         |
// | 바깥 신호가 이미 끊김(`input.signal.aborted` — 상위 단계 상한이 지남)         | 아니요          |
// | `경과 + minAttemptMs > budgetMs`(잘릴 게 뻔한 호출)                           | 아니요          |
// ⭐ groqFallback.ts와 달리 4xx도 넘긴다 — 다른 공급자로 넘어가는 단계라, 키 만료·모델 변경 같은 Claude 쪽
//    설정 문제가 곧바로 Mock 강등이 되지 않게 한다. Gemini 2차가 실패하면 그 에러를 그대로 던진다
//    (3차 Groq 판정은 groqFallback.ts가 그 에러로 한다).
//
// ⛔ `providerName`은 1차를 그대로 위임한다(G176). 어느 단계가 답했는지는 응답의 `servedBy`로 본다.
// ⛔ 로그는 숫자·단계 이름만(G170).
import { logger } from "firebase-functions";
import { CLAUDE_TEXT_MODEL, ClaudeNoReplyError } from "./claudeClient";
import { GEMINI_FALLBACK_TEXT_MODEL } from "./geminiClient";
import { assertUsableScammerReply, GeminiStageTimeoutError } from "./groqFallback";
import { UnusableReplyError } from "./replyUsability";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "./types";

export interface ClaudeFallbackOptions {
  /** 1·2차 합계 예산(ms) — 바깥 단계 상한(withStageDeadline)과 같은 값. */
  readonly budgetMs: number;
  /** 2차 시도 1회가 쓸모 있으려면 남아 있어야 하는 최소 시간(ms). */
  readonly minAttemptMs: number;
  /** 테스트 주입점(기본값 = Date.now). */
  readonly now?: () => number;
}

/** 로그용 사유 코드 — 숫자 status · 에러 종류만(본문 금지). */
function reasonOf(error: unknown): string {
  if (error instanceof UnusableReplyError) return `unusable-${error.reason}`;
  if (error instanceof ClaudeNoReplyError) return `no-reply-${error.stopReason ?? "none"}`;
  if (error instanceof GeminiStageTimeoutError) return "stage-timeout";
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") return `http-${status}`;
  return (error as { name?: unknown } | null)?.name === "AbortError" ? "aborted" : "error";
}

/**
 * `claude`가 실패하거나 쓸 수 없는 대사를 내면, 바깥 신호가 살아 있고 예산이 남을 때 `gemini`를 1회 부른다.
 */
export function withGeminiAfterClaude(claude: LlmClient, gemini: LlmClient, options: ClaudeFallbackOptions): LlmClient {
  const now = options.now ?? Date.now;
  return {
    providerName: claude.providerName,
    async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
      const startedAt = now();
      try {
        const result = await claude.complete(input);
        assertUsableScammerReply(input, result);
        return result;
      } catch (error) {
        if (input.signal?.aborted) throw error;
        const elapsedMs = now() - startedAt;
        const reason = reasonOf(error);
        if (elapsedMs + options.minAttemptMs > options.budgetMs) {
          logger.warn("Claude 1차 실패 — 2차 예산 부족으로 생략", { model: CLAUDE_TEXT_MODEL, reason, elapsedMs, budgetMs: options.budgetMs });
          throw error;
        }
        logger.warn("Claude 1차 실패 — Gemini 2차로 전환", { model: CLAUDE_TEXT_MODEL, reason, elapsedMs });
        const result = await gemini.complete(input);
        logger.info("Gemini 2차 응답", { model: GEMINI_FALLBACK_TEXT_MODEL, reason, elapsedMs: now() - startedAt });
        return result;
      }
    },
  };
}
