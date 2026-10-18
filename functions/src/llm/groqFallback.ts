// Groq 3차 예비 단계 (2026-10-18, Architecture.md §74.3 판정표가 정본).
//
// 순서: 1차 gemini-3.1-flash-lite → 2차 gemini-3.5-flash-lite(#296, 503일 때만) → **3차 Groq**.
// 1·2차(기존 Gemini 체인)는 그대로 두고 이 파일의 두 데코레이터로 바깥을 감싼다(llm/index.ts).
//
// | Gemini 체인의 최종 오류                                                    | Groq 시도 |
// |----------------------------------------------------------------------------|-----------|
// | 숫자 `status` 429 · 500~599 (본문 JSON `error.code`가 그 값인 경우 포함)     | 예, 1회   |
// | Gemini 단계 시간 상한 초과(`GeminiStageTimeoutError`)                       | 예, 1회   |
// | 400·401·403·404 등 4xx 입력 오류 · 안전 차단/빈 응답 · 네트워크 오류 · 그 밖 | 아니요    |
// Groq 호출이 실패하면(어떤 오류든) 그 에러를 던진다 — 재시도·추가 단계 없음(바깥 Mock 강등이 흡수).
// `경과 + minAttemptMs > budgetMs`이면 Groq를 시도하지 않는다(잘릴 게 뻔한 호출을 만들지 않는다).
//
// ⭐ 단계 시간 상한: 바깥 `withTimeout`은 **가장 바깥**이라(§37.5 (1)) 그것이 터지면 Groq도 못 탄다.
// 그래서 Gemini 체인에만 `timeoutMs - GROQ_RESERVE_MS`짜리 안쪽 상한을 건다 → 상한을 넘기면 Gemini
// 요청을 **취소**(AbortSignal)하고 Groq로 넘어간다. 총합은 여전히 바깥 `withTimeout` 하나로 갇힌다.
//
// ⭐ 중복 생성·저장 방지: (1) 단계는 **순차**다 — Groq는 Gemini가 실패·취소된 뒤에만 시작한다.
// (2) Gemini 단계 상한 초과 시 진행 중 요청을 abort한다(늦게 온 Gemini 응답이 버려지는 대신 아예 생성이 멈춘다).
// (3) Groq 호출도 남은 예산으로 abort된다. (4) 저장은 호출부(sendMessage)가 `completeWithFallback`의
// **반환값 1개**로 1회만 한다 — 이 계층은 저장을 하지 않는다.
//
// ⛔ `providerName`은 1차를 그대로 위임한다(G176 — rewind/judge.ts가 `!== "mock"`으로 판정 진입을 가른다).
// ⛔ 로그는 숫자·단계 이름만(G170).
import { logger } from "firebase-functions";
import { GROQ_TEXT_MODEL } from "./groqClient";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "./types";

/** Gemini 단계 시간 상한 초과 — Groq 단계로 넘어가는 신호다. */
export class GeminiStageTimeoutError extends Error {
  constructor(readonly stageMs: number) {
    super(`Gemini 단계가 ${stageMs}ms 안에 끝나지 않았습니다(Groq 단계로 전환).`);
    this.name = "GeminiStageTimeoutError";
  }
}

function readStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") return status;
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== "string") return undefined;
  try {
    const code = (JSON.parse(message) as { error?: { code?: unknown } } | null)?.error?.code;
    return typeof code === "number" ? code : undefined;
  } catch {
    return undefined;
  }
}

/** 판정표 "예" 행이면 true. 그 밖은 전부 false(⛔ 임의 확장 금지). */
export function isGroqFallbackEligible(error: unknown): boolean {
  if (error instanceof GeminiStageTimeoutError) return true;
  const status = readStatus(error);
  if (status === undefined) return false;
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * `client`를 `stageMs` 안쪽 상한으로 감싼다. 넘기면 진행 중 요청을 abort하고 `GeminiStageTimeoutError`를
 * 던진다. 바깥에서 들어온 `input.signal`도 이어 받는다(둘 중 먼저 끊기는 쪽).
 */
export function withStageDeadline(client: LlmClient, stageMs: number): LlmClient {
  return {
    providerName: client.providerName,
    async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
      const controller = new AbortController();
      const onOuterAbort = (): void => controller.abort();
      input.signal?.addEventListener("abort", onOuterAbort, { once: true });
      let timer: NodeJS.Timeout | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new GeminiStageTimeoutError(stageMs));
        }, stageMs);
      });
      const attempt = client.complete({ ...input, signal: controller.signal });
      // 상한에 진 시도의 늦은 거절(AbortError)이 처리되지 않은 거절로 남지 않게 한다.
      attempt.catch(() => undefined);
      try {
        return await Promise.race([attempt, deadline]);
      } finally {
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", onOuterAbort);
      }
    },
  };
}

export interface GroqFallbackOptions {
  /** 전체 예산(ms) — 바깥 withTimeout 상한과 같은 값. */
  readonly budgetMs: number;
  /** Groq 시도 1회가 쓸모 있으려면 남아 있어야 하는 최소 시간(ms). */
  readonly minAttemptMs: number;
  /** 테스트 주입점(기본값 = Date.now). */
  readonly now?: () => number;
}

/**
 * `primary`(Gemini 체인)가 판정표 "예" 오류로 끝나고 예산이 남으면 `groq`를 1회 부른다.
 * Groq 호출에는 남은 예산짜리 abort 신호를 건다(바깥 상한에 진 뒤 계속 생성하지 않게).
 */
export function withGroqFallback(primary: LlmClient, groq: LlmClient, options: GroqFallbackOptions): LlmClient {
  const now = options.now ?? Date.now;
  return {
    providerName: primary.providerName,
    async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
      const startedAt = now();
      try {
        return await primary.complete(input);
      } catch (error) {
        if (!isGroqFallbackEligible(error)) throw error;

        const elapsedMs = now() - startedAt;
        const remainingMs = options.budgetMs - elapsedMs;
        if (remainingMs < options.minAttemptMs) {
          logger.warn("Groq 3차 예비 — 예산 부족으로 생략", { elapsedMs, budgetMs: options.budgetMs });
          throw error;
        }

        const reason = error instanceof GeminiStageTimeoutError ? "stage-timeout" : `http-${readStatus(error)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), remainingMs);
        try {
          const result = await groq.complete({ ...input, signal: controller.signal });
          logger.info("Groq 3차 예비 응답", { model: GROQ_TEXT_MODEL, reason, elapsedMs: now() - startedAt });
          return { ...result, servedBy: "groq" };
        } catch (groqError) {
          logger.warn("Groq 3차 예비 실패", {
            model: GROQ_TEXT_MODEL,
            reason,
            status: readStatus(groqError),
            elapsedMs: now() - startedAt,
          });
          throw groqError;
        } finally {
          clearTimeout(timer);
        }
      }
    },
  };
}

/** 응답에 단계 표시를 붙인다(관측 전용 — 결과의 다른 필드는 건드리지 않는다). 이미 붙어 있으면 그대로 둔다. */
export function tagServedBy(client: LlmClient, servedBy: NonNullable<LlmCompletionResult["servedBy"]>): LlmClient {
  return {
    providerName: client.providerName,
    async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
      const result = await client.complete(input);
      return result.servedBy ? result : { ...result, servedBy };
    },
  };
}
