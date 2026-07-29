// Gemini 키 순환(failover) (T132, Architecture.md §37.3·§37.5).
//
// **무상태 순차 순환 (a)** — 매 요청 1번 키부터 시작하고, `daily` 판정이면 다음 키로 넘긴다.
// 소진 상태를 **어디에도 기록하지 않는다**. 근거: 429는 쿼터를 소모하지 않으므로 죽은 키를 매번
// 다시 때리는 대가가 **지연뿐**이다. 반대안(Firestore에 소진 기록)은 태평양 자정 리셋의 시간대
// 처리 + 오염된 상태가 멀쩡한 키를 하루 종일 죽이는 조용한 실패 + 핫 경로 Firestore 왕복을 사고,
// 사는 것은 헛왕복 1회뿐이라 §37.3이 기각했다.
//
// ⛔ **이 순환기는 `GeminiLlmClient` *바깥*의 데코레이터여야 한다**(§37.5 (1)). 클래스 안에 넣으면
// `__tests__/geminiClient.test.ts`의 `calls === 1`(재시도 금지 회귀 단언)이 즉시 깨지고, 그 단언이
// 표현하는 "실패를 재시도하지 않는다"는 의도 자체가 흐려진다.
// ⛔ **`withTimeout`은 이 순환기 *바깥*이다**(llm/index.ts) — 뒤집으면 키마다 10초라 2키에서
// 최대 20초가 되어 AC-004가 깨진다.
// ⛔ **`providerName`은 `"gemini"`를 그대로 위임한다**(G176) — rewind/judge.ts:69가
// `providerName !== "mock"`으로 되감기 LLM 판정 진입을 가르므로, 새 이름을 쓰면 되감기가 조용히
// 규칙 폴백으로 전락한다.
// ⛔ **키 값·그 일부·길이·해시를 로그·응답·에러 어디에도 남기지 말 것**(G170). 관측에 남기는 것은
// **1-based 인덱스**와 **슬롯 이름**(`GEMINI_API_KEY2`)뿐이다.
import { logger } from "firebase-functions";
import { GeminiLlmClient } from "./geminiClient";
import { classifyQuotaError } from "./quotaClass";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "./types";

/** 순서 있는 키 슬롯. `slot`은 시크릿 **이름**이고 `key`는 값이다(값은 절대 관측에 나가지 않는다). */
export interface GeminiKeySlot {
  /** `"GEMINI_API_KEY"` / `"GEMINI_API_KEY2"` … — 로그에 남는 것은 이쪽뿐이다. */
  readonly slot: string;
  readonly key: string;
}

/**
 * 던져진 에러에 "몇 개의 키를 시도했는가"를 붙이는 속성 이름.
 * completeWithFallback의 Mock 강등 로그가 이것을 읽어, **전 키 소진으로 Mock에 도달한 것**과
 * **단일 키 실패로 도달한 것**을 구분한다(§37.4). 없으면 "키를 늘렸는데 여전히 Mock"의 원인을
 * 가릴 수 없다.
 */
const ATTEMPTED_KEYS_PROP = "geminiAttemptedKeys";

function tagAttemptedKeys(error: unknown, attemptedKeys: number): void {
  if (typeof error !== "object" || error === null) return;
  try {
    Object.defineProperty(error, ATTEMPTED_KEYS_PROP, {
      value: attemptedKeys,
      enumerable: false, // 직렬화(로그·응답)에 자동으로 섞이지 않게 한다.
      configurable: true,
    });
  } catch {
    // frozen 에러 객체 등 — 로그 필드 하나를 잃을 뿐이므로 호출 경로를 막지 않는다.
  }
}

export function readAttemptedKeys(error: unknown): number | undefined {
  const value = (error as Record<string, unknown> | null)?.[ATTEMPTED_KEYS_PROP];
  return typeof value === "number" ? value : undefined;
}

/** 로그 문자열에 키 값이 섞여 들어갈 여지를 원천 차단한다(G170 방어선 — 정적 grep이 못 잡는 경로용). */
function redactKeys(text: string, slots: readonly GeminiKeySlot[]): string {
  let redacted = text;
  for (const { key } of slots) {
    if (key) redacted = redacted.split(key).join("[REDACTED]");
  }
  return redacted;
}

/**
 * 키 목록을 순서대로 시도하는 LlmClient 데코레이터.
 *
 * - `daily` 판정이면 **다음 키로** 넘어간다.
 * - `minute` / `unknown` / `not-quota`는 ⛔ **키를 바꾸지 않고 그대로 던진다**(= 오늘의 동작,
 *   `completeWithFallback`이 Mock 강등으로 흡수). `unknown`의 기본값이 보수인 이유는 §37.2 (a).
 * - 키가 **1개**면 순환할 곳이 없으므로 429에 **즉시 던진다 — 추가 왕복 0회**(§37.5 (2) 하드 요구).
 *
 * `makeClient`는 테스트 주입점이다(기본값 = 실제 GeminiLlmClient).
 */
export function createRotatingGeminiClient(
  slots: readonly GeminiKeySlot[],
  makeClient: (apiKey: string) => LlmClient = (apiKey) => new GeminiLlmClient(apiKey),
): LlmClient {
  return {
    providerName: "gemini",
    async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
      let lastError: unknown = new Error("Gemini 키가 하나도 설정되지 않았습니다.");

      for (let index = 0; index < slots.length; index += 1) {
        const slot = slots[index];
        try {
          return await makeClient(slot.key).complete(input);
        } catch (error) {
          lastError = error;
          const classification = classifyQuotaError(error);
          const attemptedKeys = index + 1;
          const isLastKey = index === slots.length - 1;

          if (classification.quotaClass !== "not-quota") {
            // ⛔ 삼키지 않는다(G173). `quotaClass`가 §37.8 (b)의 유일한 조기 경보다 —
            // Google이 quotaId 문자열을 바꾸면 이 분류가 조용히 `unknown`으로 수렴하는데,
            // 그때 동작은 "키를 안 바꾼다"= 오늘의 동작이라 **회귀는 아니지만 기능이 조용히 죽는다**.
            logger.warn("Gemini 429 분류", {
              geminiKeyIndex: attemptedKeys,
              geminiKeySlot: slot.slot,
              quotaClass: classification.quotaClass,
              attemptedKeys,
              retryDelay: classification.retryDelay,
              quotaId: classification.quotaId,
              usedFallbackRule: classification.usedFallbackRule,
              messageHead: classification.messageHead
                ? redactKeys(classification.messageHead, slots)
                : undefined,
            });
          }

          if (classification.quotaClass !== "daily" || isLastKey) {
            tagAttemptedKeys(error, attemptedKeys);
            throw error;
          }

          logger.warn("일일 429 — 다음 키로 전환", {
            geminiKeyIndex: attemptedKeys,
            geminiKeySlot: slot.slot,
            quotaClass: classification.quotaClass,
            attemptedKeys,
            retryDelay: classification.retryDelay,
          });
        }
      }

      throw lastError;
    },
  };
}
