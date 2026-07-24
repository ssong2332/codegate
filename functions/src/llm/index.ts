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
import { GEMINI_API_KEY } from "../shared/config";
import { GeminiLlmClient } from "./geminiClient";
import { MockLlmClient } from "./mockClient";
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
 * onCall 핸들러는 `{ secrets: [GEMINI_API_KEY] }`를 옵션에 선언해야 한다(realtime/index.ts의
 * createRealtimeCall과 동일한 이유 — Firebase Functions v2는 선언되지 않은 secret을 배포 환경에서
 * 런타임에 주입하지 않는다). 현재 sendMessage(roleplay/index.ts)·createSession(session/index.ts)·
 * consentChallenge(challenge/userAccess.ts) 3곳이 해당하며 이번 변경에서 함께 선언했다.
 */
export function getLlmClient(): LlmClient {
  const geminiKey = readSecret(GEMINI_API_KEY);
  const client = geminiKey ? new GeminiLlmClient(geminiKey) : new MockLlmClient();
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
 */
export async function completeWithFallback(
  primary: LlmClient,
  input: LlmCompletionInput,
): Promise<LlmCompletionResult> {
  try {
    return await primary.complete(input);
  } catch {
    return await new MockLlmClient().complete(input);
  }
}
