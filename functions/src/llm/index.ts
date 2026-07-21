// LLM 어댑터(Claude|Gemini 교체점) (Track A, T7, DECISIONS #11).
// voice/provider.ts의 getVoiceProvider() 패턴과 동일 — 구현체 선택 지점을 이 팩토리 함수 1곳으로
// 단일화한다. 지금은 LLM_API_KEY가 준비되지 않아(functions/.env 없음, functions/.env.example만
// 존재 — OQ-14와 별개로 LLM 쪽 키도 미확보 상태를 T7 시점에 직접 확인함) 항상 MockLlmClient를
// 반환한다.
export type { LlmClient, LlmCompletionInput, LlmCompletionResult, LlmMessage, LlmMessageRole } from "./types";
export { MockLlmClient } from "./mockClient";

import { HttpsError } from "firebase-functions/v2/https";
import { MockLlmClient } from "./mockClient";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "./types";

// AC-004 목표(95% 턴 기준 ≤10초, API.md sendMessage Errors "deadline-exceeded(LLM 지연, AC-004
// 목표 p95≤10s)" 근거) — QA가 지적한 갭(타임아웃 처리 부재) 반영. voice 모듈의 CLONE_HARD_TIMEOUT_MS
// 패턴과 대칭되는 LLM 쪽 하드 타임아웃. voice처럼 soft/hard 2단계로 나눌 근거(DECISIONS #9에 해당하는
// LLM 전용 결정)가 아직 없어, 지금은 AC-004 목표값 자체를 단일 하드 컷오프로 사용한다 — 실측 후
// architect가 별도 값으로 조정할 수 있다(OQ-9 여전히 open).
export const LLM_TIMEOUT_MS = 10_000;

/**
 * LlmClient.complete()을 Promise.race로 감싸 LLM_TIMEOUT_MS 초과 시 `deadline-exceeded`
 * HttpsError를 던진다. getLlmClient()가 반환하는 모든 구현체(Mock이든 향후 Claude/Gemini든)에
 * 공통 적용되도록 팩토리 단계에서 감싼다 — 호출부(sendMessage/generateOpeningLine)가 각자
 * 타임아웃을 신경 쓸 필요가 없다. Mock은 항상 즉시 응답하므로 지금은 이 경로가 실제로 발동하지
 * 않지만, 실 LLM 연동 시 무한 대기를 방지하는 안전망이다(QA 지적, Action Item).
 */
export function withTimeout(client: LlmClient, timeoutMs: number): LlmClient {
  return {
    providerName: client.providerName,
    async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
      let timer: NodeJS.Timeout;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new HttpsError(
              "deadline-exceeded",
              `LLM 응답이 ${timeoutMs}ms 내에 오지 않았습니다(AC-004 목표 초과).`,
            ),
          );
        }, timeoutMs);
      });
      try {
        return await Promise.race([client.complete(input), timeout]);
      } finally {
        clearTimeout(timer!);
      }
    },
  };
}

/**
 * 구현체 선택 지점(교체점, 단일화) — 지금은 항상 MockLlmClient를 반환한다(타임아웃 래핑 포함).
 *
 * TODO(LLM_API_KEY 확보 후): functions/src/shared/config.ts의 LLM_API_KEY/LLM_PROVIDER를 읽어
 * `new ClaudeLlmClient()` | `new GeminiLlmClient()` 분기를 추가한다(DECISIONS #11). 예:
 *   const provider = LLM_PROVIDER.value(); // "claude" | "gemini"
 *   const client = hasLlmApiKey
 *     ? (provider === "gemini" ? new GeminiLlmClient() : new ClaudeLlmClient())
 *     : new MockLlmClient();
 *   return withTimeout(client, LLM_TIMEOUT_MS);
 * Claude/Gemini 실구현체는 이번 태스크(T7) 범위 밖 — 실제 LLM API를 호출하는 코드는 아직 만들지
 * 않는다(PRD Risks: 실 LLM 없이는 "인격 유지·실시간 적응"이 진짜로 검증되지 않음을 보고에 남김).
 */
export function getLlmClient(): LlmClient {
  return withTimeout(new MockLlmClient(), LLM_TIMEOUT_MS);
}
