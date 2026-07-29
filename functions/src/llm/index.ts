// LLM 어댑터(Claude|Gemini 교체점) (Track A, T7, DECISIONS #11).
// voice/provider.ts·realtime/provider.ts의 프로바이더 선택 패턴과 동일 — 구현체 선택 지점을 이
// 팩토리 함수 1곳으로 단일화한다.
//
// 2026-07-24 갱신(사용자 실측 신고 반영) — GEMINI_API_KEY가 이미 확보돼 realtime/provider.ts가
// 실시간 음성 경로에서 실제로 쓰고 있었는데, 이 팩토리는 그 사실과 무관하게 항상 MockLlmClient만
// 반환하고 있었다(텍스트 대화가 음성 통화와 달리 문맥을 전혀 반영 못하는 원인). realtime/
// provider.ts의 readSecret 패턴을 그대로 재사용해 GEMINI_API_KEY가 있으면 실제 Gemini 텍스트
// 생성으로 격상한다. Claude(LLM_API_KEY/LLM_PROVIDER)는 여전히 placeholder라 그 분기는 TODO로 남김.
export type { LlmClient, LlmCompletionInput, LlmCompletionResult, LlmMessage, LlmMessageRole } from "./types";
export { MockLlmClient } from "./mockClient";
export { GeminiLlmClient } from "./geminiClient";

import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { GEMINI_KEY_SECRETS } from "../shared/config";
import { MockLlmClient } from "./mockClient";
import { createRotatingGeminiClient, readAttemptedKeys } from "./rotatingClient";
import type { GeminiKeySlot } from "./rotatingClient";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "./types";

/** realtime/provider.ts의 readSecret과 동일 규칙(모듈 경계상 별도 파일에 중복, 같은 컨벤션이라
 * 의도적) — defineSecret은 바인딩 안 된 컨텍스트(단위 테스트 등)에서 throw하므로 안전하게 감싸고,
 * .env.example의 "YOUR_" placeholder가 그대로 들어온 경우도 "미설정"으로 본다. */
function readSecret(param: { value: () => string }): string {
  try {
    const value = param.value();
    return !value || value.startsWith("YOUR_") ? "" : value;
  } catch {
    return "";
  }
}

/**
 * 설정된 Gemini 키 슬롯을 **선언 순서대로** 돌려준다(T132, Architecture.md §37.5 (2)).
 *
 * ⭐ "없는 슬롯은 조용히 건너뛴다"가 기존 `readSecret`으로 이미 성립한다 — 바인딩 안 된 컨텍스트의
 * throw와 `.env.example`의 `YOUR_` placeholder를 둘 다 ""로 만들기 때문이다. 그래서 **2번 키가
 * 없는 환경은 길이 1짜리 배열을 받고 오늘과 동일하게 동작한다**(§37.6 증거 ③).
 * ⛔ 값은 슬롯 이름과 짝지어 돌려주지만, **관측(로그)에 나가는 것은 이름과 인덱스뿐**이다(G170).
 */
export function getGeminiApiKeys(): GeminiKeySlot[] {
  return GEMINI_KEY_SECRETS.map((param) => ({ slot: param.name, key: readSecret(param) })).filter(
    (entry) => entry.key !== "",
  );
}

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
 * 구현체 선택 지점(교체점, 단일화, 타임아웃 래핑 포함).
 *
 * GEMINI_API_KEY가 있으면 실제 Gemini 텍스트 생성(GeminiLlmClient)을 쓴다 — realtime/provider.ts가
 * 같은 키로 이미 실시간 음성 경로에 쓰고 있는 것과 동일한 자격증명이다. 없으면(placeholder 포함)
 * MockLlmClient로 강등한다.
 *
 * TODO(LLM_API_KEY/ANTHROPIC 확보 후): LLM_PROVIDER==="claude"일 때 `ClaudeLlmClient` 분기를
 * 추가한다(DECISIONS #11). 지금은 LLM_API_KEY가 여전히 placeholder라 이 분기는 만들지 않는다.
 *
 * ⚠️ 호출부 주의: 이 함수를 (직접 또는 generateOpeningLine/sendMessage를 통해 간접) 호출하는 모든
 * onCall 핸들러는 `{ secrets: [...GEMINI_KEY_SECRETS] }`를 옵션에 선언해야 한다(realtime/index.ts의
 * createRealtimeCall과 동일한 이유 — Firebase Functions v2는 선언되지 않은 secret을 배포 환경에서
 * 런타임에 주입하지 않는다).
 *
 * ⭐ 해당 핸들러는 **5곳**이다(T132에서 전수 grep으로 정정 — 이전 주석은 "3곳"이라 적어
 * rewind·realtime을 빠뜨리고 있었다. 목록을 손으로 유지하는 방식 자체가 그 드리프트를 낳았고,
 * 그래서 키 목록은 이제 `GEMINI_KEY_SECRETS` 단일 배열을 스프레드한다):
 *   1. sendMessage        — roleplay/index.ts
 *   2. createSession      — session/index.ts
 *   3. consentChallenge   — challenge/userAccess.ts
 *   4. judgeRewindAnswer  — rewind/index.ts
 *   5. createRealtimeCall — realtime/index.ts (ELEVENLABS_API_KEY와 함께)
 * ⚠️ deliverVerifyOffer·deliverVerifyReconnect(verifyIntercept/index.ts)는 getRealtimeProvider를
 * 부르면서도 시크릿 선언이 아예 없다 — **선재 결함이며 T133 별건**이다(이 목록에 넣지 않는다).
 */
export function getLlmClient(): LlmClient {
  const keys = getGeminiApiKeys();
  const client = keys.length > 0 ? createRotatingGeminiClient(keys) : new MockLlmClient();
  // ⛔ withTimeout이 순환기 **바깥**이다(§37.5 (1)) — 모든 시도의 **총합**이 10초로 갇힌다.
  // 뒤집으면 키마다 10초라 2키에서 최대 20초가 되어 AC-004 목표가 깨진다.
  return withTimeout(client, LLM_TIMEOUT_MS);
}

/**
 * reviewer 리뷰 Major #1 수정(2026-07-24) — sendMessage(roleplay/index.ts)는 LLM 호출 전에 이미
 * 사용자 턴을 원자적으로 커밋한다(동시 탭 방지용 트랜잭션, #8). 그 뒤 `getLlmClient()`가 반환한
 * 실 클라이언트(GeminiLlmClient)가 실패(안전필터 차단·타임아웃·네트워크 등)하면, 그냥 던질 경우
 * "답 없는 사용자 턴"이 영구히 남고 재시도 시 연속된 user 턴이 쌓인다(대화 이력 오염). Mock은 순수
 * 로컬 규칙 기반 생성기라 절대 throw하지 않으므로, 실패 시 Mock으로 강등해 턴을 절대 답 없이 남기지
 * 않는다 — createRealtimeCall의 실패 폴백(provider 실패→mock 강등, P-4 "핵심 루프 비차단")과 동일한
 * 철학. `withTimeout`처럼 별도 함수로 분리한 이유도 같다 — 호출부가 이 폴백 로직을 직접 신경 쓸
 * 필요 없이 `completeWithFallback(getLlmClient(), input)`만 부르면 되고, fake client로 실패를
 * 흉내내 유닛 테스트할 수 있다(`llm/__tests__/completeWithFallback.test.ts`).
 *
 * reviewer/QA 리뷰 Minor(2026-07-24, 두 차례 지적) — 폴백 발동 자체를 아무 데도 남기지 않으면
 * Gemini가 지속 장애(쿼터 소진·전역 안전필터 오류 등)를 겪어도 대화가 계속 자연스럽게 이어져 아무도
 * 눈치채지 못한 채 사용자가 신고했던 원래 버그(문맥 미반영 Mock)로 조용히 되돌아갈 수 있다.
 * `logger.warn`으로 최소한의 운영 신호만 남긴다 — 사용자에게 노출되는 대사 자체는 여전히 정상
 * Mock 응답이라 대화 흐름은 안 끊긴다(P-4 비차단 원칙 유지), 관측 가능성만 보강.
 */
export async function completeWithFallback(
  primary: LlmClient,
  input: LlmCompletionInput,
): Promise<LlmCompletionResult> {
  try {
    return await primary.complete(input);
  } catch (error) {
    // T132 — `attemptedKeys`가 있어야 **전 키 소진으로 Mock에 도달한 것**과 **단일 키 실패로
    // 도달한 것**을 구분할 수 있다(§37.4). 없으면 "키를 늘렸는데 여전히 Mock"의 원인을 가릴 수 없다.
    // (순환기를 거치지 않은 실패 — 예: withTimeout의 deadline-exceeded — 에서는 undefined다.)
    logger.warn("LLM 1차 클라이언트 실패 — Mock으로 강등", {
      providerName: primary.providerName,
      attemptedKeys: readAttemptedKeys(error),
      error: error instanceof Error ? error.message : String(error),
    });
    return await new MockLlmClient().complete(input);
  }
}
