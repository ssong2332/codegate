// LLM 어댑터(Claude|Gemini 교체점) (Track A, T7, DECISIONS #11).
// voice/provider.ts·realtime/provider.ts의 프로바이더 선택 패턴과 동일 — 구현체 선택 지점을 이
// 팩토리 함수 1곳으로 단일화한다.
//
// 2026-07-24 갱신(사용자 실측 신고 반영) — GEMINI_API_KEY가 이미 확보돼 realtime/provider.ts가
// 실시간 음성 경로에서 실제로 쓰고 있었는데, 이 팩토리는 그 사실과 무관하게 항상 MockLlmClient만
// 반환하고 있었다(텍스트 대화가 음성 통화와 달리 문맥을 전혀 반영 못하는 원인). realtime/
// provider.ts의 readSecret 패턴을 그대로 재사용해 GEMINI_API_KEY가 있으면 실제 Gemini 텍스트
// 생성으로 격상한다. Claude(LLM_API_KEY/LLM_PROVIDER)는 여전히 placeholder라 그 분기는 TODO로 남김.
export type { LlmClient, LlmCompletionInput, LlmCompletionResult, LlmMessage, LlmMessageRole, LlmServedBy } from "./types";
export { MockLlmClient } from "./mockClient";
export { GeminiLlmClient } from "./geminiClient";
export { GroqLlmClient } from "./groqClient";
export { ClaudeLlmClient } from "./claudeClient";

import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { CLAUDE_API_KEY, GEMINI_KEY_SECRETS, GROQ_API_KEY } from "../shared/config";
import { ClaudeLlmClient } from "./claudeClient";
import { withGeminiAfterClaude } from "./claudeFallback";
import { GEMINI_FALLBACK_TEXT_MODEL, GeminiLlmClient } from "./geminiClient";
import { GroqLlmClient } from "./groqClient";
import { assertUsableScammerReply, tagServedBy, withGroqFallback, withStageDeadline } from "./groqFallback";
import { MockLlmClient } from "./mockClient";
import { withOverloadFallback } from "./overloadFallback";
import { withOverloadRetry } from "./overloadRetry";
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
 * 세션의 **첫 사용자 턴**(sendMessage) 전용 LLM 시간 제한(2026-10-18, 사용자 결정 C — OQ-A62 해당분 확정).
 *
 * 근거: 첫 sendMessage가 `elapsedMs:10002` 타임아웃 → Mock 강등(2026-10-17T07:58:14Z·
 * 2026-10-18T02:20:34Z·PR #289 배포 후 재발). 첫 턴만 1차·예비 요청이 **둘 다** 10초를 넘겨 지연이
 * 요청 간 상관돼 있었다 — 같은 요청을 한 번 더 보내도(예비 요청) 소용없었다.
 * AC-004 목표(95% 턴 ≤10초)와의 관계: **첫 턴 1건만 예외**로, Mock 강등(문맥 없는 대사) 대신 더
 * 기다리게 한 사용자 결정이다. 오프닝(createSession)·되감기 판정·이후 턴은 `LLM_TIMEOUT_MS` 그대로.
 * 20초는 Cloud Functions onCall 기본 실행 제한(60초) 안이다.
 */
export const LLM_FIRST_TURN_TIMEOUT_MS = 20_000;

/**
 * Gemini 과부하(503 UNAVAILABLE) 재시도 전 대기(ms) — 0.5초 → 1.5초, 최대 재시도 2회(2026-10-18).
 * 근거·429와의 분리·한계는 `overloadRetry.ts` 머리 주석.
 */
export const LLM_OVERLOAD_RETRY_DELAYS_MS: readonly number[] = [500, 1500];

/** 재시도 1회가 바깥 시간 상한에 잘리지 않으려면 남아 있어야 하는 최소 시간(ms). */
export const LLM_OVERLOAD_MIN_ATTEMPT_MS = 2000;

/**
 * Groq 3차 예비에 남겨 두는 시간(ms, 2026-10-18 · Architecture.md §75.4).
 * Groq 키가 있을 때만 Gemini 체인(1·2차)의 예산이 `timeoutMs - 이 값`으로 줄고, 그 상한을 넘기면 Gemini
 * 요청을 취소하고 Groq로 넘어간다(일반 턴 7초 + 3초 · 첫 턴 17초 + 3초). Groq 키가 없으면 쓰지 않는다
 * (= 기존 동작 그대로). 근거: 실제 시스템 프롬프트 Groq 프로브 성공 2/2가 0.79~1.02초(§75.2).
 */
export const GROQ_RESERVE_MS = 3000;

/**
 * Groq 키(하나만)를 읽는다 — 없거나 placeholder면 "". 값은 관측에 나가지 않는다(G170).
 * ⛔ 키 여러 개를 돌려 쓰는 구조로 바꾸지 말 것 — Groq 한도는 조직 단위다(§75.2).
 */
export function getGroqApiKey(): string {
  return readSecret(GROQ_API_KEY);
}

/** 키 부재 로그는 인스턴스당 1회만(매 턴 반복하지 않는다). */
let groqDisabledLogged = false;

/**
 * 사기범 대사 체인에서 Gemini 2차에 남겨 두는 시간(ms, 2026-10-22 · §107) — Claude 1차 단계 상한은
 * `geminiBudgetMs - 이 값`이다. 근거: 2차 gemini-3.5-flash-lite 실측 p95 1.86초(78호출).
 */
export const CLAUDE_GEMINI_RESERVE_MS = 2000;

/** Claude 키(하나만)를 읽는다 — 없거나 placeholder면 "". 값은 관측에 나가지 않는다(G170). */
export function getClaudeApiKey(): string {
  return readSecret(CLAUDE_API_KEY);
}

let claudeDisabledLogged = false;

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
 * ⭐ 2026-10-22(§107): `CLAUDE_API_KEY`가 있으면 **사기범 대사 경로(`purpose: "scammer-reply"`)만** 1차 Claude
 * (claude-sonnet-5-5) → 2차 gemini-3.5-flash-lite → 3차 Groq로 보낸다(`buildScammerReplyChain`). 되감기 판정처럼
 * 용도가 없는 호출은 아래 기존 Gemini 체인 그대로다. `LLM_PROVIDER` 값은 여전히 읽지 않는다.
 *
 * ⚠️ 호출부 주의: 이 함수를 (직접 또는 generateOpeningLine/sendMessage를 통해 간접) 호출하는 모든
 * onCall 핸들러는 `{ secrets: [...GEMINI_KEY_SECRETS] }`를 옵션에 선언해야 한다(realtime/index.ts의
 * createRealtimeCall과 동일한 이유 — Firebase Functions v2는 선언되지 않은 secret을 배포 환경에서
 * 런타임에 주입하지 않는다).
 * ⭐ 갱신(2026-10-22, §107): 지금 선언은 `LLM_TEXT_SECRETS`(Gemini 키 슬롯 + GROQ_API_KEY + CLAUDE_API_KEY)이고,
 * 선언 정합은 secretDeclarationGate 테스트가 기계적으로 대조한다. 아래 목록은 T132 시점 이력이다.
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
export function getLlmClient(timeoutMs: number = LLM_TIMEOUT_MS): LlmClient {
  const keys = getGeminiApiKeys();
  // Groq는 **3차 예비**일 뿐 단독 공급자로 쓰지 않는다(§75.1) — Gemini 키가 없으면 읽지도 않는다(= 지금처럼 Mock).
  const groqKey = keys.length > 0 ? getGroqApiKey() : "";
  if (keys.length > 0 && !groqKey && !groqDisabledLogged) {
    groqDisabledLogged = true;
    logger.info("Groq 3차 예비 비활성 — GROQ_API_KEY 없음");
  }
  // Gemini 체인(1·2차)의 예산 — Groq가 있으면 3초를 남기고 끝나야 한다. 없으면 기존과 같은 timeoutMs.
  const geminiBudgetMs = groqKey ? timeoutMs - GROQ_RESERVE_MS : timeoutMs;
  // 과부하 재시도(withOverloadRetry)는 **실 Gemini에만** 감싼다 — Mock은 throw하지 않는다.
  // 예산(budgetMs)은 Gemini 체인의 몫이다(Groq가 없으면 바깥 withTimeout과 같은 timeoutMs).
  // tagServedBy는 응답에 단계 이름만 붙인다(관측 전용 — 재시도·순환 동작 무관).
  const primary =
    keys.length > 0
      ? withOverloadRetry(tagServedBy(createRotatingGeminiClient(keys), "gemini-primary"), {
          delaysMs: LLM_OVERLOAD_RETRY_DELAYS_MS,
          budgetMs: geminiBudgetMs,
          minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS,
        })
      : new MockLlmClient();
  // 과부하 대체 모델(withOverloadFallback, 2026-10-18)도 **실 Gemini에만** — 재시도를 다 쓴 뒤의 최종
  // 과부하에만 GEMINI_FALLBACK_TEXT_MODEL로 1회 묻는다(재시도 바깥, withTimeout 안쪽). 같은 키 순환기를
  // 대체 모델용으로 하나 더 만든다(429 키 전환 규칙이 대체 호출에도 그대로 적용된다).
  const gemini =
    keys.length > 0
      ? withOverloadFallback(
          primary,
          tagServedBy(
            createRotatingGeminiClient(keys, (apiKey) => new GeminiLlmClient(apiKey, GEMINI_FALLBACK_TEXT_MODEL)),
            "gemini-fallback",
          ),
          { budgetMs: geminiBudgetMs, minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS },
        )
      : primary;
  // Groq 3차 예비(2026-10-18, §75) — 429·5xx·Gemini 단계 시간 초과에서만 1회. Gemini 체인에는 안쪽
  // 단계 상한(withStageDeadline)이 걸려, 상한을 넘기면 Gemini 요청을 취소하고 넘어온다.
  const client = groqKey
    ? withGroqFallback(withStageDeadline(gemini, geminiBudgetMs), new GroqLlmClient(groqKey), {
        budgetMs: timeoutMs,
        minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS,
      })
    : gemini;
  // §107(2026-10-22) — 사기범 대사 경로만 1차 Claude → 2차 gemini-3.5-flash-lite → 3차 Groq. 그 밖(되감기 판정 등)은 위 체인 그대로.
  const scammerClient = buildScammerReplyChain(keys, groqKey, timeoutMs, geminiBudgetMs);
  const routed = scammerClient ? routeScammerReply(client, scammerClient) : client;
  // ⛔ withTimeout이 순환기·과부하 재시도·대체 모델·Groq **바깥**이다(§37.5 (1)) — 모든 시도의 **총합**이 timeoutMs로 갇힌다.
  // 뒤집으면 키마다 시간 제한이 걸려 2키에서 2배가 되어 AC-004 목표가 깨진다.
  // 예비 요청(withHedge, PR #289)은 2026-10-18 되돌렸다 — 배포 후 실측에서 예비 요청 승리 0/2,
  // 4초 초과 호출 3/3으로 Gemini 호출만 2배가 됐고, 첫 턴은 1차·예비 둘 다 10초를 넘겨 지연이
  // 요청 간 상관돼 있었다(예비 요청이 구조적으로 무효). 대신 첫 턴만 LLM_FIRST_TURN_TIMEOUT_MS를 쓴다.
  return withTimeout(routed, timeoutMs);
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
  const startedAt = Date.now();
  try {
    const result = await primary.complete(input);
    // §102 — 사기범 대사 경로의 마지막 그물. Groq 키가 없어 withGroqFallback을 거치지 않은 Gemini 응답도
    // 여기서 판정한다(쓸 수 없으면 아래 catch로 → Mock 강등 = 시나리오 수법 문구로 만든 안전한 대사).
    assertUsableScammerReply(input, result);
    return result;
  } catch (error) {
    // T132 — `attemptedKeys`가 있어야 **전 키 소진으로 Mock에 도달한 것**과 **단일 키 실패로
    // 도달한 것**을 구분할 수 있다(§37.4). 없으면 "키를 늘렸는데 여전히 Mock"의 원인을 가릴 수 없다.
    // (순환기를 거치지 않은 실패 — 예: withTimeout의 deadline-exceeded — 에서는 undefined다.)
    //
    // §56.8 A안 ② — `elapsedMs`가 없으면 **"10.1초라 아깝게 잘렸다"와 "47초라 모델이 죽었다"가
    // 같은 줄로 보인다**(§56이 실제로 그 구분을 못 해 원인을 미확정으로 남겼다). 타임아웃 문자열은
    // 항상 `LLM_TIMEOUT_MS` **상수**를 그대로 인용할 뿐 실제 소요를 담지 않는다 ⇒ 실측값을 따로 잰다.
    // ⛔ 실패 사유는 에러 메시지까지만 — 프롬프트·응답 본문은 여기서도 싣지 않는다(G170).
    logger.warn("LLM 1차 클라이언트 실패 — Mock으로 강등", {
      providerName: primary.providerName,
      elapsedMs: Date.now() - startedAt,
      attemptedKeys: readAttemptedKeys(error),
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...(await new MockLlmClient().complete(input)), servedBy: "mock" };
  }
}

/**
 * 사기범 대사 체인(§107) — Claude 키와 Gemini 키가 **둘 다** 있을 때만 만든다(없으면 undefined = 기존 체인 그대로).
 *
 * 예산(일반 턴 10초 · Groq 있음): Claude ≤ 5초 → Gemini 2차 ≥ 2초 남김 → Groq 3초.
 *   - Claude 단계 상한 = `geminiBudgetMs - CLAUDE_GEMINI_RESERVE_MS`(일반 5초 · 첫 턴 15초 · Groq 없으면 8초).
 *     근거: 실측 p95 3.59초 · 최대 5.31초(132호출) — 5초를 넘기는 드문 호출은 2차로 넘기는 편이 빠르다.
 *   - 1·2차 합계는 기존 Gemini 체인과 같은 `geminiBudgetMs`(상한을 넘기면 Groq로).
 * 2차는 대체 모델 순환기를 그대로 쓴다(429 키 전환 규칙 동일). 과부하 재시도는 두지 않는다 — 남은 시간이 2초 남짓이다.
 */
function buildScammerReplyChain(
  keys: GeminiKeySlot[],
  groqKey: string,
  timeoutMs: number,
  geminiBudgetMs: number,
): LlmClient | undefined {
  const claudeKey = keys.length > 0 ? getClaudeApiKey() : "";
  if (!claudeKey) {
    if (keys.length > 0 && !claudeDisabledLogged) {
      claudeDisabledLogged = true;
      logger.info("Claude 1차 비활성 — CLAUDE_API_KEY 없음(사기범 대사도 Gemini 체인)");
    }
    return undefined;
  }
  const claude = withStageDeadline(
    tagServedBy(new ClaudeLlmClient(claudeKey), "claude-primary"),
    geminiBudgetMs - CLAUDE_GEMINI_RESERVE_MS,
  );
  const geminiSecond = tagServedBy(
    createRotatingGeminiClient(keys, (apiKey) => new GeminiLlmClient(apiKey, GEMINI_FALLBACK_TEXT_MODEL)),
    "gemini-fallback",
  );
  const firstTwo = withGeminiAfterClaude(claude, geminiSecond, {
    budgetMs: geminiBudgetMs,
    minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS,
  });
  return groqKey
    ? withGroqFallback(withStageDeadline(firstTwo, geminiBudgetMs), new GroqLlmClient(groqKey), {
        budgetMs: timeoutMs,
        minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS,
      })
    : firstTwo;
}

/**
 * `purpose === "scammer-reply"`만 사기범 대사 체인으로 보내고 나머지는 기존 체인으로 보낸다.
 * ⛔ `providerName`은 기존 체인 것을 그대로 쓴다(G176 — rewind/judge.ts가 `!== "mock"`으로 판정 진입을 가른다).
 */
export function routeScammerReply(defaultClient: LlmClient, scammerClient: LlmClient): LlmClient {
  return {
    providerName: defaultClient.providerName,
    complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
      return (input.purpose === "scammer-reply" ? scammerClient : defaultClient).complete(input);
    },
  };
}
