// Gemini 과부하(503 UNAVAILABLE) 짧은 지수 백오프 재시도 (2026-10-18, implementer 명세 4).
//
// 근거:
// - #292 배포 후 2026-10-18T04:05:03Z 첫 사용자 턴이 Gemini 503 UNAVAILABLE로 922ms 만에 실패해
//   Mock으로 강등됐다. 시간 상한(20초)은 무관했다 — 시간을 거의 안 쓰고 거절당한 것이다.
// - 조정 세션 H1 프로브(2026-10-18 03:12~03:28Z, 20회): 503 11회, 거절 응답은 0.6~8초 안에 왔다
//   ⇒ 상한 안에 짧게 다시 물어볼 여지가 있다.
//
// 429와 분리한 이유: 쿼터 소진(429)은 몇 초 기다려도 풀리지 않고, 키 전환은 rotatingClient.ts가
// 담당한다. 그래서 이 데코레이터는 429를 **건드리지 않고 그대로 던진다**(isOverloadError가 false).
// 키 순환기가 붙인 `geminiAttemptedKeys` 속성도 같은 에러 객체를 다시 던지므로 보존된다.
//
// ⚠️ 한계(추정, 미확인): 503 거절 응답이 무료 등급 쿼터(일일·분당)에 집계되는지는 확인하지 않았다.
// 집계된다면 재시도 1회마다 쿼터를 1건 더 쓴다 — 최대 재시도 2회로 묶은 이유 중 하나다.
// 확인 방법: AI Studio 사용량 화면에서 503이 난 시각의 요청 수 증가를 대조한다.
//
// ⛔ 배치: `withTimeout`이 **가장 바깥**이다(llm/index.ts) — 예산(budgetMs)은 바깥 시간 상한과
// 같은 값이고, 이 데코레이터는 그 안에서 "잘릴 게 뻔한 시도"를 만들지 않으려고 미리 포기할 뿐이다.
// ⛔ `providerName`은 그대로 위임한다(G176 — rewind/judge.ts가 `!== "mock"`으로 판정 진입을 가른다).
// ⛔ 로그는 숫자뿐이다(G170) — 프롬프트·응답·에러 본문·키를 싣지 않는다.
import { logger } from "firebase-functions";
import { isOverloadError } from "./overloadClass";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "./types";

export interface OverloadRetryOptions {
  /** 재시도 전 대기(ms). 길이가 곧 최대 재시도 횟수다. */
  readonly delaysMs: readonly number[];
  /** 전체 예산(ms) — 바깥 withTimeout의 상한과 같은 값. */
  readonly budgetMs: number;
  /** 재시도 1회가 쓸모 있으려면 남아 있어야 하는 최소 시간(ms). */
  readonly minAttemptMs: number;
  /** 테스트 주입점(기본값 = setTimeout). */
  readonly sleep?: (ms: number) => Promise<void>;
  /** 테스트 주입점(기본값 = Date.now). */
  readonly now?: () => number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 과부하(503)일 때만 `delaysMs` 순서대로 기다렸다가 다시 시도한다.
 * - 과부하가 아니면(429·deadline-exceeded·fetch failed 등) 그 에러를 즉시 그대로 던진다.
 * - 대기 전에 `경과 + 대기 + minAttemptMs > budgetMs`이면 재시도하지 않고 마지막 에러를 던진다.
 * - 재시도를 다 써도 실패하면 마지막 에러를 던진다.
 */
export function withOverloadRetry(client: LlmClient, options: OverloadRetryOptions): LlmClient {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  return {
    providerName: client.providerName,
    async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
      const startedAt = now();
      for (let attempt = 1; ; attempt += 1) {
        try {
          const result = await client.complete(input);
          if (attempt > 1) {
            logger.info("Gemini 과부하 재시도 성공", { attempts: attempt, elapsedMs: now() - startedAt });
          }
          return result;
        } catch (error) {
          const delayMs = options.delaysMs[attempt - 1];
          if (!isOverloadError(error) || delayMs === undefined) throw error;

          const elapsedMs = now() - startedAt;
          if (elapsedMs + delayMs + options.minAttemptMs > options.budgetMs) {
            logger.warn("Gemini 과부하 — 예산 부족으로 재시도 생략", {
              attempt,
              elapsedMs,
              budgetMs: options.budgetMs,
            });
            throw error;
          }

          logger.warn("Gemini 과부하(503) — 재시도", { attempt, delayMs, elapsedMs });
          await sleep(delayMs);
        }
      }
    },
  };
}
