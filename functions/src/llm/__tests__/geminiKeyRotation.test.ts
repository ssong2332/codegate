// T132 키 순환(failover) 완료 증거 (Architecture.md §37.6 ①~⑤).
//
// ⭐ 전건이 **라이브 쿼터 0**으로 돌아간다 — geminiClient.test.ts:178-186의 `globalThis.fetch`
// 스텁 방식을 그대로 재사용해 429 본문을 주입한다. ⛔ 라이브로 일일 20건을 태워 증명하지 않는다
// (G179 — 예산이 이미 적자다).
//
// ⛔ 키 값을 픽스처·로그·커밋 메시지에 쓰지 않는다(G170). 하네스는 **센티넬 더미 문자열**을 쓰고,
// 증거 ④ⓑ가 그 문자열이 관측 어디에도 안 나타남을 동적으로 단언한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { logger } from "firebase-functions";
import { classifyQuotaError } from "../quotaClass";
import { createRotatingGeminiClient, readAttemptedKeys } from "../rotatingClient";
import { completeWithFallback, getGeminiApiKeys, getLlmClient, withTimeout } from "../index";
import type { GeminiKeySlot } from "../rotatingClient";
import type { LlmClient } from "../types";

// ── 센티넬 키(§37.6 ④ⓑ) ────────────────────────────────────────────────────────
// 실제 키가 아니라 **식별 가능한 더미**다. 이 문자열이 로그·반환값·에러에 단 한 번이라도
// 나타나면 증거 ④가 실패한다.
const SENTINEL_A = "SENTINEL-KEY-AAA";
const SENTINEL_B = "SENTINEL-KEY-BBB";
const TWO_SLOTS: GeminiKeySlot[] = [
  { slot: "GEMINI_API_KEY", key: SENTINEL_A },
  { slot: "GEMINI_API_KEY2", key: SENTINEL_B },
];
const ONE_SLOT: GeminiKeySlot[] = [{ slot: "GEMINI_API_KEY", key: SENTINEL_A }];

const INPUT = { systemPrompt: "(system)", messages: [] };

// ── 429 픽스처 ────────────────────────────────────────────────────────────────
// 일일 소진 원문의 형태(사용자 실측 인용) — ⭐ `retryDelay`가 **일일** 429에도 함께 실려 온다.
// 그래서 retryDelay는 판별력이 0이고 분류에 쓰면 안 된다(G169).
const DAILY_429 = {
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    message: "You exceeded your current quota.",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [
          {
            quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
            quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
          },
        ],
      },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "49s" },
    ],
  },
};

// ⚠️ `PerMinute` 문자열 형태는 **실측되지 않은 유추**다(§37.2 2행) — 분당 429의 quotaId를 실제로
// 관측한 사람은 아무도 없다. 이 행이 아무것도 못 잡고 `unknown`으로 떨어져도 회귀가 아니다:
// 두 판정의 **행동이 같기 때문**(둘 다 키를 바꾸지 않는다).
const MINUTE_429 = {
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    message: "You exceeded your current quota.",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [
          {
            quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
            quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
          },
        ],
      },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "31s" },
    ],
  },
};

// geminiClient.test.ts:183의 기성 픽스처와 **동일한 형태** — details[]가 없는 산문형 429.
// §37.2 4·6행(2차 규칙 → `unknown`)이 실제로 도달 가능함을 증명하는 자리다(죽은 게이트 방지).
const PROSE_429 = {
  error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "You exceeded your current quota." },
};

const OK_BODY = { candidates: [{ content: { role: "model", parts: [{ text: "정상 응답" }] } }] };

// ── fetch 하네스 ───────────────────────────────────────────────────────────────
interface FetchHarness {
  restore: () => void;
  /** 호출 횟수. */
  calls: () => number;
  /** 회차별 `x-goog-api-key` 헤더. ⛔ 값을 출력하지 않고 `!==` 비교에만 쓴다(G170). */
  apiKeyHeaders: () => (string | null)[];
}

function readApiKeyHeader(init: unknown): string | null {
  const headers = (init as { headers?: unknown } | undefined)?.headers;
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get("x-goog-api-key");
  const record = headers as Record<string, string>;
  return record["x-goog-api-key"] ?? record["X-Goog-Api-Key"] ?? null;
}

/** 회차별로 미리 정해진 응답을 돌려준다(1회차 429, 2회차 200 … 식). */
function stubFetch(responses: { status: number; body: unknown }[]): FetchHarness {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const apiKeyHeaders: (string | null)[] = [];
  globalThis.fetch = (async (_url: unknown, init?: unknown) => {
    apiKeyHeaders.push(readApiKeyHeader(init));
    const spec = responses[Math.min(calls, responses.length - 1)];
    calls += 1;
    return new Response(JSON.stringify(spec.body), {
      status: spec.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
  return {
    restore: () => {
      globalThis.fetch = originalFetch;
    },
    calls: () => calls,
    apiKeyHeaders: () => apiKeyHeaders,
  };
}

// ── logger 하네스(§37.6 ④ⓑ) ───────────────────────────────────────────────────
function captureLogger(): { restore: () => void; payloads: () => unknown[] } {
  const original = { warn: logger.warn, info: logger.info, error: logger.error, debug: logger.debug };
  const payloads: unknown[] = [];
  const record = (...args: unknown[]) => {
    payloads.push(args);
  };
  logger.warn = record as typeof logger.warn;
  logger.info = record as typeof logger.info;
  logger.error = record as typeof logger.error;
  logger.debug = record as typeof logger.debug;
  return {
    restore: () => {
      logger.warn = original.warn;
      logger.info = original.info;
      logger.error = original.error;
      logger.debug = original.debug;
    },
    payloads: () => payloads,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 증거 ① — 일일 429에서 **다음 키로 넘어간다**
// ══════════════════════════════════════════════════════════════════════════════
test("증거①: 일일 429(quotaId에 PerDay)면 다음 키로 넘어가 실제 Gemini 응답을 돌려준다", async () => {
  const fetchStub = stubFetch([
    { status: 429, body: DAILY_429 },
    { status: 200, body: OK_BODY },
  ]);
  const log = captureLogger();
  try {
    const result = await completeWithFallback(createRotatingGeminiClient(TWO_SLOTS), INPUT);

    // ⓐ 왕복 2회 — 1번 키가 죽었으므로 2번 키까지 갔다.
    assert.equal(fetchStub.calls(), 2, "일일 429면 다음 키로 한 번 더 시도해야 한다");
    // ⓑ 2번 키로 성공했으므로 텍스트는 실제 Gemini 산출물이다 ⇒ isMock:false가 **참**이다.
    //    (isMock 계약은 바뀌지 않았다 — "이번 호출의 텍스트가 Mock 산출물인가" 그대로다.)
    assert.equal(result.isMock, false, "2번 키로 성공했으면 Mock이 아니다");
    assert.equal(result.text, "정상 응답");
    // ⓒ ⭐ 실제로 **다른 키**를 썼는가 — ⓐ만으로는 "같은 키로 두 번"과 구분되지 않는다.
    //    ⛔ 헤더 값을 출력하지 않고 비교 결과만 단언한다(G170).
    const headers = fetchStub.apiKeyHeaders();
    assert.equal(headers.length, 2);
    assert.ok(headers[0], "1회차 요청에 x-goog-api-key 헤더가 실려야 한다");
    assert.notEqual(headers[0], headers[1], "2번째 요청은 반드시 다른 키로 나가야 한다(순환의 본체)");
  } finally {
    log.restore();
    fetchStub.restore();
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 증거 ② — 역검증(필수): 분당 429에서는 **키를 바꾸지 않는다**
// ⛔ ①과 같은 커밋·같은 출력 블록에 있어야 한다. 정상 경로만 보고 채택하지 않는 것이
//    이 저장소의 반복 교훈이다.
// ══════════════════════════════════════════════════════════════════════════════
test("증거②(역검증): 분당 429(quotaId에 PerMinute)면 키를 바꾸지 않고 Mock으로 강등된다", async () => {
  const fetchStub = stubFetch([
    { status: 429, body: MINUTE_429 },
    { status: 200, body: OK_BODY }, // ⛔ 여기에 도달하면 실패다 — 도달하지 않음을 calls()가 증명한다.
  ]);
  const log = captureLogger();
  try {
    const result = await completeWithFallback(createRotatingGeminiClient(TWO_SLOTS), INPUT);

    assert.equal(fetchStub.calls(), 1, "분당 제한은 같은 키가 잠시 뒤 회복된다 — 여기서 넘기면 멀쩡한 키의 하루치를 조기 소모한다(G168)");
    assert.equal(fetchStub.apiKeyHeaders().length, 1, "2번 키로 나간 요청이 있으면 안 된다");
    assert.equal(result.isMock, true, "키를 바꾸지 않으므로 오늘과 동일하게 Mock으로 흡수된다");
    assert.notEqual(result.text, "정상 응답");
  } finally {
    log.restore();
    fetchStub.restore();
  }
});

test("증거②-보강: 분류기가 PerMinute를 'minute'으로, PerDay를 'daily'로 가른다(retryDelay는 둘 다에 있다)", () => {
  const minute = classifyQuotaError({ status: 429, message: JSON.stringify(MINUTE_429) });
  const daily = classifyQuotaError({ status: 429, message: JSON.stringify(DAILY_429) });

  assert.equal(minute.quotaClass, "minute");
  assert.equal(daily.quotaClass, "daily");
  // ⛔ G169 — retryDelay는 **두 종류 모두**에 존재하므로 판별력이 0이다. 기록 전용.
  assert.equal(daily.retryDelay, "49s");
  assert.equal(minute.retryDelay, "31s");
  assert.ok(daily.retryDelay && minute.retryDelay, "retryDelay가 양쪽에 다 있다는 것이 분류에 쓸 수 없는 이유다");
});

test("분류기: 429가 아닌 실패는 'not-quota'이며 키를 바꾸지 않는다", async () => {
  assert.equal(classifyQuotaError({ status: 400, message: "Request contains an invalid argument." }).quotaClass, "not-quota");
  assert.equal(classifyQuotaError(new Error("network down")).quotaClass, "not-quota");

  const fetchStub = stubFetch([
    { status: 400, body: { error: { code: 400, status: "INVALID_ARGUMENT", message: "Request contains an invalid argument." } } },
    { status: 200, body: OK_BODY },
  ]);
  const log = captureLogger();
  try {
    const result = await completeWithFallback(createRotatingGeminiClient(TWO_SLOTS), INPUT);
    assert.equal(fetchStub.calls(), 1, "쿼터와 무관한 실패는 다음 키에서도 똑같이 실패한다 — 헛왕복을 만들지 않는다");
    assert.equal(result.isMock, true);
  } finally {
    log.restore();
    fetchStub.restore();
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 증거 ③ⓐ — 키가 **1개**뿐인 환경은 오늘과 동일하다(추가 왕복 0회)
// ══════════════════════════════════════════════════════════════════════════════
test("증거③ⓐ: 키가 1개면 일일 429에도 순환할 곳이 없어 즉시 던지고 Mock으로 강등된다(추가 왕복 0회)", async () => {
  const fetchStub = stubFetch([
    { status: 429, body: DAILY_429 },
    { status: 200, body: OK_BODY }, // 도달하면 안 된다.
  ]);
  const log = captureLogger();
  try {
    const result = await completeWithFallback(createRotatingGeminiClient(ONE_SLOT), INPUT);

    assert.equal(fetchStub.calls(), 1, "키 1개 환경의 왕복 수는 오늘과 같아야 한다(하드 요구)");
    assert.equal(result.isMock, true);
  } finally {
    log.restore();
    fetchStub.restore();
  }
});

test("증거③ⓐ-보강: 키가 0개면 팩토리가 MockLlmClient를 반환한다(오늘과 동일)", async () => {
  // 단위 테스트 컨텍스트에서는 defineSecret이 바인딩되지 않아 readSecret이 전부 ""를 돌려준다
  // ⇒ getGeminiApiKeys()가 빈 배열이고, getLlmClient()는 Mock으로 강등된다.
  assert.deepEqual(getGeminiApiKeys(), [], "미바인딩 컨텍스트에서는 설정된 키가 0개다");
  const result = await getLlmClient().complete(INPUT);
  assert.equal(result.isMock, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// 증거 ⑤ — `unknown` 분기가 실제로 도달 가능하다(죽은 게이트 방지)
// ══════════════════════════════════════════════════════════════════════════════
test("증거⑤: details[]가 없는 산문형 429는 'unknown'으로 분류되고 키를 바꾸지 않는다", async () => {
  // ⭐ 기존 픽스처(geminiClient.test.ts:183)와 동일한 형태를 그대로 쓴다.
  const classification = classifyQuotaError({ status: 429, message: JSON.stringify(PROSE_429) });
  assert.equal(classification.quotaClass, "unknown", "분류기가 여기에 'daily'를 돌려주면 §37.2 (a)의 비대칭이 뒤집힌다");
  assert.equal(classification.usedFallbackRule, true, "2차 규칙까지 내려온 사실이 관측돼야 한다");
  assert.ok(classification.messageHead, "⛔ 삼키지 않는다(G173) — message 앞 200자가 로그에 남아야 한다");

  const fetchStub = stubFetch([
    { status: 429, body: PROSE_429 },
    { status: 200, body: OK_BODY }, // 도달하면 안 된다.
  ]);
  const log = captureLogger();
  try {
    const result = await completeWithFallback(createRotatingGeminiClient(TWO_SLOTS), INPUT);
    assert.equal(fetchStub.calls(), 1, "unknown의 기본 행동은 '키를 바꾸지 않는다'(보수적 기본값)");
    assert.equal(result.isMock, true);

    const serialized = JSON.stringify(log.payloads());
    assert.ok(serialized.includes("unknown"), "quotaClass가 로그에 남아야 한다 — §37.8 (b)의 유일한 조기 경보다");
  } finally {
    log.restore();
    fetchStub.restore();
  }
});

test("증거⑤-보강: JSON.parse가 아예 실패해도(SDK 조립 방식 변경) 삼키지 않고 'unknown'으로 분류한다", () => {
  const parseFails = classifyQuotaError({ status: 429, message: "<html>429 Too Many Requests</html>" });
  assert.equal(parseFails.quotaClass, "unknown");
  assert.equal(parseFails.usedFallbackRule, true);
  assert.ok(parseFails.messageHead?.includes("429 Too Many Requests"));

  // 5행 — 파싱이 깨져도 **일일 소진은 놓치지 않는다**(1차 규칙의 대체가 아니라 하위 안전망).
  const rawDaily = classifyQuotaError({
    status: 429,
    message: "quota exceeded: GenerateRequestsPerDayPerProjectPerModel-FreeTier",
  });
  assert.equal(rawDaily.quotaClass, "daily");
  assert.equal(rawDaily.usedFallbackRule, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// 증거 ④ⓑ — 센티넬 키가 **관측 어디에도** 새지 않는다(동적 검증)
// 정적 grep만으로는 error.cause 같은 간접 경로를 못 잡는다.
// ══════════════════════════════════════════════════════════════════════════════
test("증거④ⓑ: 센티넬 키 값이 logger 페이로드·반환 객체·던져진 에러 어디에도 나타나지 않는다", async () => {
  const observed: unknown[] = [];

  for (const spec of [
    { name: "일일→순환", responses: [{ status: 429, body: DAILY_429 }, { status: 200, body: OK_BODY }] },
    { name: "분당→불변", responses: [{ status: 429, body: MINUTE_429 }, { status: 200, body: OK_BODY }] },
    { name: "산문형→unknown", responses: [{ status: 429, body: PROSE_429 }, { status: 200, body: OK_BODY }] },
    { name: "전키소진", responses: [{ status: 429, body: DAILY_429 }, { status: 429, body: DAILY_429 }] },
  ]) {
    const fetchStub = stubFetch(spec.responses);
    const log = captureLogger();
    try {
      // ⓐ 순환기를 직접 불러 **던져진 에러**를 잡는다(completeWithFallback이 삼키기 전).
      try {
        const raw = await createRotatingGeminiClient(TWO_SLOTS).complete(INPUT);
        observed.push(raw);
      } catch (error) {
        observed.push({
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          cause: error instanceof Error ? String((error as { cause?: unknown }).cause) : undefined,
          own: Object.getOwnPropertyNames(Object(error)).map((k) => String((error as Record<string, unknown>)[k])),
        });
      }
      // ⓑ 캡처한 모든 logger 페이로드.
      observed.push(log.payloads());
    } finally {
      log.restore();
      fetchStub.restore();
    }
  }

  const serialized = JSON.stringify(observed);
  assert.ok(serialized.length > 0, "관측 대상이 실제로 수집됐는지 먼저 확인한다(빈 문자열이면 이 단언은 무의미하다)");
  assert.equal(serialized.split(SENTINEL_A).length - 1, 0, "1번 키 값이 관측에 새어 나왔다(G170 위반)");
  assert.equal(serialized.split(SENTINEL_B).length - 1, 0, "2번 키 값이 관측에 새어 나왔다(G170 위반)");
  // 대조군 — 이 하네스가 실제로 문자열을 볼 수 있음을 증명한다(빈 캡처로 인한 거짓 통과 방지).
  assert.ok(serialized.includes("GEMINI_API_KEY"), "슬롯 **이름**은 로그에 남는다 — 하네스가 페이로드를 실제로 보고 있다는 대조군");
});

// ══════════════════════════════════════════════════════════════════════════════
// 배치 층 제약 — providerName · withTimeout 순서 · attemptedKeys
// ══════════════════════════════════════════════════════════════════════════════
test("순환기의 providerName은 'gemini' 그대로다(G176 — rewind/judge.ts가 !== \"mock\"으로 판정 진입을 가른다)", () => {
  assert.equal(createRotatingGeminiClient(TWO_SLOTS).providerName, "gemini");
  assert.equal(createRotatingGeminiClient(ONE_SLOT).providerName, "gemini");
});

test("withTimeout은 순환기 **바깥**이라 모든 시도의 총합이 예산 안에 갇힌다(AC-004)", async () => {
  // 키마다 60ms 걸려 일일 429로 죽는 클라이언트 2개 = 순차 합계 120ms.
  // withTimeout이 바깥이면 100ms 예산에서 **전체**가 끊긴다. 안쪽이면 키마다 100ms라 통과해버린다.
  const slowDailyFailure = (): LlmClient => ({
    providerName: "gemini",
    async complete() {
      await new Promise((resolve) => setTimeout(resolve, 60));
      throw Object.assign(new Error(JSON.stringify(DAILY_429)), {
        status: 429,
        message: JSON.stringify(DAILY_429),
      });
    },
  });
  const rotating = createRotatingGeminiClient(TWO_SLOTS, slowDailyFailure);
  const log = captureLogger();
  const startedAt = Date.now();
  try {
    await assert.rejects(
      () => withTimeout(rotating, 100).complete(INPUT),
      (error: Error) => error.message.includes("100ms"),
      "총합 예산(100ms)이 2키 합계(120ms)보다 먼저 끊어야 한다",
    );
  } finally {
    log.restore();
  }
  assert.ok(Date.now() - startedAt < 120, `타임아웃이 키마다 걸리면 안 된다(경과 ${Date.now() - startedAt}ms)`);
});

test("전 키가 일일 소진되면 attemptedKeys가 Mock 강등 로그에 남는다(단일 키 실패와 구분)", async () => {
  const fetchStub = stubFetch([
    { status: 429, body: DAILY_429 },
    { status: 429, body: DAILY_429 },
  ]);
  const log = captureLogger();
  try {
    const result = await completeWithFallback(createRotatingGeminiClient(TWO_SLOTS), INPUT);
    assert.equal(fetchStub.calls(), 2, "전 키를 다 시도한 뒤에야 Mock에 도달한다");
    assert.equal(result.isMock, true);

    const serialized = JSON.stringify(log.payloads());
    assert.ok(serialized.includes("\"attemptedKeys\":2"), `전 키 소진(2)이 강등 로그에 남아야 한다: ${serialized.slice(0, 400)}`);
  } finally {
    log.restore();
    fetchStub.restore();
  }
});

test("readAttemptedKeys: 순환기를 거치지 않은 에러에는 undefined다(없는 값을 지어내지 않는다)", () => {
  assert.equal(readAttemptedKeys(new Error("timeout")), undefined);
  assert.equal(readAttemptedKeys(undefined), undefined);
});
