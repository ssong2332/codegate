// Gemini 과부하 대체 모델 1회 시도 (2026-10-18, implementer 명세 5 판정표가 정본).
//
// 근거: 사용자 결정(2026-10-18) — "gemini-3.5-flash-lite를 503 재시도 후에도 실패할 때의 대체 모델로".
// 같은 시간대 프로브에서 기본 모델은 503 55%, 대체 모델은 5/5 성공(p50 1.25초) — 근거 수치는
// geminiClient.ts `GEMINI_FALLBACK_TEXT_MODEL` 주석.
//
// | 기본 모델 최종 오류(#295 재시도 이후)                                   | 대체 시도 |
// |--------------------------------------------------------------------------|-----------|
// | 과부하(`isOverloadError` true: 503/UNAVAILABLE)                          | 예, 1회   |
// | 429·안전 차단/빈 응답·`deadline-exceeded`·네트워크 오류·기타 HTTP        | 아니요    |
// 대체 호출이 실패하면(어떤 오류든) 그 에러를 던진다 — 재시도·추가 대체 없음(바깥 Mock 강등이 흡수).
//
// ⛔ 배치(llm/index.ts): `withTimeout(withOverloadFallback(withOverloadRetry(기본), 대체), timeoutMs)` —
// 재시도가 **안쪽**(대체는 재시도를 다 쓴 뒤의 최종 오류에만), `withTimeout`이 **가장 바깥**이다.
// 예산(budgetMs)은 바깥 시간 상한과 같은 값이고, 잘릴 게 뻔한 대체 시도는 만들지 않는다.
// ⛔ `providerName`은 그대로 위임한다(G176 — rewind/judge.ts가 `!== "mock"`으로 판정 진입을 가른다).
// ⛔ 로그는 숫자·모델명만(G170) — 프롬프트·응답·에러 본문·키를 싣지 않는다(에러 메시지는
//    completeWithFallback의 Mock 강등 로그가 담당).
//
// 세션 sticky 태그 `llmProvider`와의 관계: 그 태그는 `isMock`이 true일 때만 쓰인다
// (roleplay/index.ts·session/index.ts·challenge/userAccess.ts의 `...(isMock ? { llmProvider: "mock" } : {})`).
// 대체 모델 응답은 실 Gemini 응답이라 `isMock: false`를 그대로 돌려주므로 태그와 충돌하지 않는다 —
// 이 파일은 결과를 가공하지 않는다(테스트 ②가 고정).
import { logger } from "firebase-functions";
import { GEMINI_FALLBACK_TEXT_MODEL } from "./geminiClient";
import { isOverloadError } from "./overloadClass";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "./types";

export interface OverloadFallbackOptions {
  /** 전체 예산(ms) — 바깥 withTimeout의 상한과 같은 값. */
  readonly budgetMs: number;
  /** 대체 시도 1회가 쓸모 있으려면 남아 있어야 하는 최소 시간(ms). */
  readonly minAttemptMs: number;
  /** 테스트 주입점(기본값 = Date.now). */
  readonly now?: () => number;
}

/**
 * `primary`가 과부하로 최종 실패하고 `경과 + minAttemptMs <= budgetMs`이면 `fallback`을 1회 호출한다.
 * 그 밖에는 `primary`의 에러를 그대로 던진다.
 */
export function withOverloadFallback(
  primary: LlmClient,
  fallback: LlmClient,
  options: OverloadFallbackOptions,
): LlmClient {
  const now = options.now ?? Date.now;
  return {
    providerName: primary.providerName,
    async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
      const startedAt = now();
      try {
        return await primary.complete(input);
      } catch (error) {
        if (!isOverloadError(error)) throw error;

        const elapsedMs = now() - startedAt;
        if (elapsedMs + options.minAttemptMs > options.budgetMs) {
          logger.warn("Gemini 대체 모델 — 예산 부족으로 생략", { elapsedMs, budgetMs: options.budgetMs });
          throw error;
        }

        try {
          const result = await fallback.complete(input);
          logger.info("Gemini 대체 모델 응답", {
            model: GEMINI_FALLBACK_TEXT_MODEL,
            elapsedMs: now() - startedAt,
          });
          return result;
        } catch (fallbackError) {
          logger.warn("Gemini 대체 모델 실패", {
            model: GEMINI_FALLBACK_TEXT_MODEL,
            elapsedMs: now() - startedAt,
          });
          throw fallbackError;
        }
      }
    },
  };
}
