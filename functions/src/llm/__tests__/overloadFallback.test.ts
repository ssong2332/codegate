// Gemini 과부하 대체 모델(gemini-3.5-flash-lite) 1회 — 명세 5 테스트 ①~⑪.
//
// ⭐ 시계는 주입한다(now) — 벽시계를 쓰지 않으므로 부하와 무관하게 결정적이다.
// ⛔ 라이브 호출 0건. 실제 요청의 모델 확인은 globalThis.fetch 스텁으로만 한다(geminiClient.test.ts 방식).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { GEMINI_FALLBACK_TEXT_MODEL, GEMINI_TEXT_MODEL, GeminiLlmClient } from "../geminiClient";
import { withOverloadFallback } from "../overloadFallback";
import type { OverloadFallbackOptions } from "../overloadFallback";
import { withOverloadRetry } from "../overloadRetry";
import { LLM_FIRST_TURN_TIMEOUT_MS, LLM_OVERLOAD_MIN_ATTEMPT_MS, LLM_OVERLOAD_RETRY_DELAYS_MS, LLM_TIMEOUT_MS, withTimeout } from "../index";
import type { LlmClient, LlmCompletionResult } from "../types";

const INPUT = { systemPrompt: "(system)", messages: [] };
const PRIMARY_OK: LlmCompletionResult = { text: "기본 모델 응답", isMock: false };
const FALLBACK_OK: LlmCompletionResult = { text: "대체 모델 응답", isMock: false };

// ── 오류 픽스처 — @google/genai ApiError 형태(status 숫자 + message = JSON.stringify(본문)) ──
function apiError(status: number | undefined, body: unknown): Error {
  const error = new Error(JSON.stringify(body));
  if (status !== undefined) Object.assign(error, { status });
  return error;
}
const BODY_503 = {
  error: { code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" },
};
const BODY_429 = {
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    message: "You exceeded your current quota.",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }],
      },
    ],
  },
};
const err503 = () => apiError(503, BODY_503);
const err429 = () => apiError(429, BODY_429);
const errEmpty = () => new Error("Gemini 텍스트 응답이 비어 있습니다(candidates/safety 차단 가능성).");
const errDeadline = () => new HttpsError("deadline-exceeded", "LLM 응답이 10000ms 내에 오지 않았습니다(AC-004 목표 초과).");
const errFetch = () => new TypeError("fetch failed");

// ── 하네스 ──────────────────────────────────────────────────────────────────────
/** 회차별 결과를 순서대로 내는 가짜 클라이언트. `atMs`는 그 시도가 끝나는 시각(주입 시계). */
function scripted(steps: { result: LlmCompletionResult | Error; atMs?: number }[], clock?: { t: number }) {
  let calls = 0;
  const client: LlmClient = {
    providerName: "gemini",
    async complete() {
      const step = steps[Math.min(calls, steps.length - 1)];
      calls += 1;
      if (clock && step.atMs !== undefined) clock.t = step.atMs;
      if (step.result instanceof Error) throw step.result;
      return step.result;
    },
  };
  return { client, calls: () => calls };
}

function harness(overrides: Partial<OverloadFallbackOptions> = {}) {
  const clock = { t: 0 };
  const options: OverloadFallbackOptions = {
    budgetMs: LLM_TIMEOUT_MS,
    minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS,
    now: () => clock.t,
    ...overrides,
  };
  return { clock, options };
}

function captureLogger() {
  const original = { warn: logger.warn, info: logger.info };
  const entries: { level: string; msg: unknown; data: Record<string, unknown> }[] = [];
  logger.warn = ((msg: unknown, data: Record<string, unknown>) => entries.push({ level: "warn", msg, data })) as typeof logger.warn;
  logger.info = ((msg: unknown, data: Record<string, unknown>) => entries.push({ level: "info", msg, data })) as typeof logger.info;
  return {
    entries,
    restore: () => {
      logger.warn = original.warn;
      logger.info = original.info;
    },
  };
}

/** G170 — 대체 모델 로그는 숫자와 모델명만 싣는다. */
function assertNumbersAndModelOnly(entries: { msg: unknown; data: Record<string, unknown> }[]): void {
  for (const entry of entries.filter((e) => String(e.msg).startsWith("Gemini 대체 모델"))) {
    for (const [key, value] of Object.entries(entry.data)) {
      if (key === "model") assert.equal(value, GEMINI_FALLBACK_TEXT_MODEL, "model 필드는 대체 모델명이어야 한다");
      else assert.equal(typeof value, "number", `G170 — ${key}는 숫자여야 한다`);
    }
  }
}

test("상수: 대체 모델은 gemini-3.5-flash-lite(비-preview·비-별칭), 기본 모델과 다르다 · 기본값 무변경", () => {
  assert.equal(GEMINI_FALLBACK_TEXT_MODEL, "gemini-3.5-flash-lite");
  assert.ok(!GEMINI_FALLBACK_TEXT_MODEL.includes("latest"));
  assert.ok(!GEMINI_FALLBACK_TEXT_MODEL.includes("preview"));
  assert.notEqual(GEMINI_FALLBACK_TEXT_MODEL, GEMINI_TEXT_MODEL);
  assert.equal(GEMINI_TEXT_MODEL, "gemini-3.1-flash-lite");
  assert.equal(LLM_TIMEOUT_MS, 10_000);
  assert.equal(LLM_FIRST_TURN_TIMEOUT_MS, 20_000);
  assert.equal(LLM_OVERLOAD_MIN_ATTEMPT_MS, 2000);
});

test("① 기본 성공 → 대체 미호출, 대체 로그 0건", async () => {
  const { options } = harness();
  const primary = scripted([{ result: PRIMARY_OK }]);
  const fallback = scripted([{ result: FALLBACK_OK }]);
  const log = captureLogger();
  try {
    assert.deepEqual(await withOverloadFallback(primary.client, fallback.client, options).complete(INPUT), PRIMARY_OK);
    assert.equal(primary.calls(), 1);
    assert.equal(fallback.calls(), 0);
    assert.equal(log.entries.filter((e) => String(e.msg).startsWith("Gemini 대체 모델")).length, 0);
  } finally {
    log.restore();
  }
});

test("② 기본 503(재시도 2회 후에도) → 대체 1회 성공 → 대체 결과·isMock false·로그 model=대체", async () => {
  // 실제 withOverloadRetry를 안쪽에 둔다(배선과 같은 순서) — 재시도를 다 쓴 뒤에만 대체가 불린다.
  const clock = { t: 0 };
  const primary = scripted([
    { result: err503(), atMs: 300 },
    { result: err503(), atMs: 1100 },
    { result: err503(), atMs: 2900 },
  ], clock);
  const retried = withOverloadRetry(primary.client, {
    delaysMs: LLM_OVERLOAD_RETRY_DELAYS_MS,
    budgetMs: LLM_TIMEOUT_MS,
    minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS,
    sleep: async () => {},
    now: () => clock.t,
  });
  let fallbackCalls = 0;
  const fallback: LlmClient = {
    providerName: "gemini",
    async complete() {
      fallbackCalls += 1;
      assert.equal(primary.calls(), 3, "대체는 기본 모델 재시도(최대 2회)를 다 쓴 뒤에만 불려야 한다");
      clock.t = 4200;
      return FALLBACK_OK;
    },
  };
  const log = captureLogger();
  try {
    const result = await withOverloadFallback(retried, fallback, { budgetMs: LLM_TIMEOUT_MS, minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS, now: () => clock.t }).complete(INPUT);
    assert.deepEqual(result, FALLBACK_OK);
    assert.equal(result.isMock, false, "대체 응답은 실 Gemini라 isMock false — llmProvider sticky 태그(mock 전용)와 충돌 없음");
    assert.equal(fallbackCalls, 1);
    const success = log.entries.find((e) => e.msg === "Gemini 대체 모델 응답");
    assert.ok(success, "대체 성공 로그가 남아야 한다");
    assert.equal(success.level, "info");
    assert.deepEqual(success.data, { model: GEMINI_FALLBACK_TEXT_MODEL, elapsedMs: 4200 });
    assertNumbersAndModelOnly(log.entries);
  } finally {
    log.restore();
  }
});

test("③ 기본 503 → 대체 503 → 대체 에러를 던진다(재시도·추가 대체 없음)", async () => {
  const { clock, options } = harness();
  const primary = scripted([{ result: err503(), atMs: 1000 }], clock);
  const fallbackError = err503();
  const fallback = scripted([{ result: fallbackError, atMs: 2500 }, { result: FALLBACK_OK }], clock);
  const log = captureLogger();
  try {
    await assert.rejects(
      () => withOverloadFallback(primary.client, fallback.client, options).complete(INPUT),
      (thrown) => thrown === fallbackError,
    );
    assert.equal(primary.calls(), 1);
    assert.equal(fallback.calls(), 1, "대체는 정확히 1회");
    const failed = log.entries.find((e) => e.msg === "Gemini 대체 모델 실패");
    assert.ok(failed);
    assert.equal(failed.level, "warn");
    assert.deepEqual(failed.data, { model: GEMINI_FALLBACK_TEXT_MODEL, elapsedMs: 2500 });
    assertNumbersAndModelOnly(log.entries);
  } finally {
    log.restore();
  }
});

test("④ 기본 429 → 대체 미호출·같은 에러 그대로 throw", async () => {
  const { options } = harness();
  const error = err429();
  const primary = scripted([{ result: error }]);
  const fallback = scripted([{ result: FALLBACK_OK }]);
  await assert.rejects(() => withOverloadFallback(primary.client, fallback.client, options).complete(INPUT), (t) => t === error);
  assert.equal(fallback.calls(), 0);
});

test("⑤ 빈 응답/안전 차단 · deadline-exceeded · fetch failed → 대체 미호출", async () => {
  const cases: [string, Error][] = [
    ["빈 응답/안전 차단", errEmpty()],
    ["deadline-exceeded", errDeadline()],
    ["fetch failed", errFetch()],
  ];
  for (const [label, error] of cases) {
    const { options } = harness();
    const primary = scripted([{ result: error }]);
    const fallback = scripted([{ result: FALLBACK_OK }]);
    await assert.rejects(() => withOverloadFallback(primary.client, fallback.client, options).complete(INPUT), (t) => t === error);
    assert.equal(fallback.calls(), 0, `${label}: 대체하면 안 된다`);
  }
});

test("⑥ 예산 부족(10초 예산, 8.5초 경과에 503) → 대체 생략하고 기본 에러를 던진다", async () => {
  // 8500 + 2000 = 10500 > 10000 ⇒ 생략.
  const { clock, options } = harness();
  const error = err503();
  const primary = scripted([{ result: error, atMs: 8500 }], clock);
  const fallback = scripted([{ result: FALLBACK_OK }]);
  const log = captureLogger();
  try {
    await assert.rejects(() => withOverloadFallback(primary.client, fallback.client, options).complete(INPUT), (t) => t === error);
    assert.equal(fallback.calls(), 0, "바깥 withTimeout에 잘릴 시도라 만들지 않는다");
    const skipped = log.entries.find((e) => e.msg === "Gemini 대체 모델 — 예산 부족으로 생략");
    assert.ok(skipped);
    assert.equal(skipped.level, "warn");
    assert.deepEqual(skipped.data, { elapsedMs: 8500, budgetMs: 10_000 });
    assertNumbersAndModelOnly(log.entries);
  } finally {
    log.restore();
  }
});

test("⑥-경계: `경과 + minAttemptMs`가 예산과 **같으면** 대체를 시도한다(명세의 `<=` 그대로)", async () => {
  const { clock, options } = harness();
  const primary = scripted([{ result: err503(), atMs: 8000 }], clock);
  const fallback = scripted([{ result: FALLBACK_OK }]);
  const log = captureLogger();
  try {
    assert.deepEqual(await withOverloadFallback(primary.client, fallback.client, options).complete(INPUT), FALLBACK_OK);
    assert.equal(fallback.calls(), 1);
  } finally {
    log.restore();
  }
});

test("⑦ 20초 예산(첫 턴)이면 같은 상황(8.5초 경과에 503)에서 대체를 실행한다", async () => {
  const { clock, options } = harness({ budgetMs: LLM_FIRST_TURN_TIMEOUT_MS });
  const primary = scripted([{ result: err503(), atMs: 8500 }], clock);
  const fallback = scripted([{ result: FALLBACK_OK, atMs: 9800 }], clock);
  const log = captureLogger();
  try {
    assert.deepEqual(await withOverloadFallback(primary.client, fallback.client, options).complete(INPUT), FALLBACK_OK);
    assert.equal(fallback.calls(), 1);
    assert.equal(log.entries.filter((e) => e.msg === "Gemini 대체 모델 — 예산 부족으로 생략").length, 0);
  } finally {
    log.restore();
  }
});

test("⑧ providerName을 그대로 위임한다(G176) — withTimeout으로 감싸도 'gemini'", async () => {
  const { options } = harness();
  const primary = scripted([{ result: err503() }]);
  const fallback = scripted([{ result: FALLBACK_OK }]);
  const wrapped = withOverloadFallback(primary.client, fallback.client, options);
  assert.equal(wrapped.providerName, "gemini");
  assert.equal(withTimeout(wrapped, LLM_TIMEOUT_MS).providerName, "gemini");
  const mockLike: LlmClient = { providerName: "mock", complete: async () => PRIMARY_OK };
  assert.equal(withOverloadFallback(mockLike, fallback.client, options).providerName, "mock", "이름을 지어내지 않는다");
  const log = captureLogger();
  try {
    assert.deepEqual(await withTimeout(wrapped, LLM_TIMEOUT_MS).complete(INPUT), FALLBACK_OK, "바깥 withTimeout 안에서 대체가 성공한다");
  } finally {
    log.restore();
  }
});

// ── ⑨ GeminiLlmClient의 model 인자 — 실제 요청 URL과 성공 로그 ─────────────────────────
function stubSseFetch(replyText: string) {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    const payload = { candidates: [{ content: { role: "model", parts: [{ text: replyText }] } }] };
    return new Response(`data: ${JSON.stringify(payload)}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as unknown as typeof globalThis.fetch;
  return { urls, restore: () => (globalThis.fetch = originalFetch) };
}

test("⑨ GeminiLlmClient: model 인자를 실제 요청과 성공 로그에 쓴다 · 인자가 없으면 기본 모델", async () => {
  const cases: [string, GeminiLlmClient, string, string][] = [
    ["대체 모델 인자", new GeminiLlmClient("test-key", GEMINI_FALLBACK_TEXT_MODEL), GEMINI_FALLBACK_TEXT_MODEL, GEMINI_TEXT_MODEL],
    ["인자 없음", new GeminiLlmClient("test-key"), GEMINI_TEXT_MODEL, GEMINI_FALLBACK_TEXT_MODEL],
  ];
  for (const [label, client, expected, other] of cases) {
    const fetchStub = stubSseFetch("네.");
    const log = captureLogger();
    try {
      const result = await client.complete(INPUT);
      assert.deepEqual(result, { text: "네.", isMock: false }, label);
    } finally {
      log.restore();
      fetchStub.restore();
    }
    assert.equal(fetchStub.urls.length, 1, `${label}: 요청 1건`);
    assert.ok(fetchStub.urls[0].includes(`models/${expected}:`), `${label}: 요청 URL에 ${expected}(실제: ${fetchStub.urls[0]})`);
    assert.ok(!fetchStub.urls[0].includes(`models/${other}:`), `${label}: 요청 URL에 ${other}가 있으면 안 된다`);
    const success = log.entries.filter((e) => e.msg === "Gemini 텍스트 생성 성공");
    assert.equal(success.length, 1, label);
    assert.equal(success[0].data.model, expected, `${label}: 성공 로그 model은 실제 호출 모델`);
  }
});

// ── ⑩ getLlmClient 배선 소스 스캔 ─────────────────────────────────────────────────
// 단위 테스트에서는 defineSecret이 바인딩되지 않아 키가 0개라 실 Gemini 분기를 동적으로 못 탄다
// ⇒ 소스 스캔으로 배선을 못박고, 오염본으로 스캔이 실제로 가르는지 역검증한다.
// 형태: `primary = keys.length > 0 ? withOverloadRetry(rotating(keys), {…}) : new MockLlmClient();`
//       `gemini = keys.length > 0 ? withOverloadFallback(primary, tagServedBy(rotating(keys, 대체 모델), "gemini-fallback"), {budgetMs: geminiBudgetMs…}) : primary;`
//       (2026-10-18 §75 — 변수명이 client → gemini로 바뀌고 Groq 3차 예비가 그 바깥 `client`가 됐다)
//       `return withTimeout(client, timeoutMs);` — overloadRetry.test.ts ⑩·firstTurnTimeout.test.ts의 기존 단언과 공존.
const INDEX_SRC = path.resolve(__dirname, "../../../src/llm/index.ts");

function getLlmClientBody(src: string): string {
  const start = src.indexOf("export function getLlmClient(");
  const end = src.indexOf("export async function completeWithFallback(");
  assert.ok(start >= 0 && end > start, "getLlmClient 본문을 찾지 못했다");
  return src.slice(start, end);
}

function codeOnly(body: string): string {
  return body
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const PRIMARY_RE = /const primary =\s*keys\.length > 0\s*\?\s*withOverloadRetry\(tagServedBy\(createRotatingGeminiClient\(keys\), "gemini-primary"\), \{[\s\S]*?\}\)\s*:\s*new MockLlmClient\(\);/;
const CLIENT_RE = /const gemini =\s*keys\.length > 0\s*\?\s*withOverloadFallback\(\s*primary,\s*tagServedBy\(\s*createRotatingGeminiClient\(keys, \(apiKey\) => new GeminiLlmClient\(apiKey, GEMINI_FALLBACK_TEXT_MODEL\)\),\s*"gemini-fallback",?\s*\),\s*\{([^}]*)\},?\s*\)\s*:\s*primary;/;

// ⚠️ 이 스캔은 `budgetMs: geminiBudgetMs`라는 **이름**만 본다 — 그 값이 인자 timeoutMs에서 파생되는지는
// overloadRetry.test.ts ⑩이 `const geminiBudgetMs = groqKey ? timeoutMs - GROQ_RESERVE_MS : timeoutMs` 정규식으로 고정한다(두 파일이 짝).
function wiringViolations(body: string): string[] {
  const code = codeOnly(body);
  const violations: string[] = [];
  if (!PRIMARY_RE.test(code)) violations.push("primary가 withOverloadRetry(rotating(keys), {…}) / Mock 분기가 맨 MockLlmClient여야 한다");
  const clientBranch = CLIENT_RE.exec(code);
  if (!clientBranch) {
    violations.push("client가 withOverloadFallback(primary, rotating(keys, 대체 모델), {…}) / Mock 분기가 primary 그대로여야 한다");
  } else {
    if (!/budgetMs: geminiBudgetMs\b/.test(clientBranch[1])) violations.push("대체의 budgetMs가 Gemini 체인 예산 geminiBudgetMs여야 한다");
    if (!/minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS\b/.test(clientBranch[1])) violations.push("대체의 minAttemptMs가 LLM_OVERLOAD_MIN_ATTEMPT_MS여야 한다");
  }
  if (!/return withTimeout\(client, timeoutMs\);/.test(code)) violations.push("withTimeout(client, timeoutMs)가 가장 바깥이어야 한다");
  if ((code.match(/withTimeout\(/g) ?? []).length !== 1) violations.push("withTimeout은 정확히 1번(가장 바깥)만 감싸야 한다");
  if ((code.match(/withOverloadFallback\(/g) ?? []).length !== 1) violations.push("withOverloadFallback은 정확히 1곳(실 Gemini)만 감싸야 한다");
  if (/withOverloadRetry\(\s*withOverloadFallback/.test(code)) violations.push("대체가 재시도 안쪽에 있으면 안 된다");
  if (/withOverloadFallback\(\s*new MockLlmClient/.test(code)) violations.push("Mock에 대체 모델을 붙이면 안 된다");
  return violations;
}

test("⑩ getLlmClient 배선: withTimeout(withOverloadFallback(withOverloadRetry(rotating), rotating(대체)), timeoutMs), Mock 무변경 — 현재 소스 위반 0", () => {
  const body = getLlmClientBody(readFileSync(INDEX_SRC, "utf8"));
  assert.deepEqual(wiringViolations(body), []);
});

test("⑩-역검증: 오염본(대체를 재시도 안쪽·Mock에 부착·대체 누락·대체 모델 누락·예산 상수화)은 전부 위반으로 잡힌다", () => {
  const body = getLlmClientBody(readFileSync(INDEX_SRC, "utf8"));
  const clientDecl = /const gemini =\s*keys\.length > 0\s*\?\s*withOverloadFallback\([\s\S]*?\)\s*:\s*primary;/.exec(body);
  assert.ok(clientDecl, "역검증 기준 문자열을 찾지 못했다(소스 형태가 바뀌었다)");
  const fallbackCall = /withOverloadFallback\([\s\S]*?\{[^}]*\},?\s*\)/.exec(clientDecl[0]);
  assert.ok(fallbackCall, "역검증 기준 문자열(withOverloadFallback 호출)을 찾지 못했다");
  const contaminated: Record<string, string> = {
    "대체를 재시도 안쪽에 둠": body
      .replace(clientDecl[0], "const gemini = primary;")
      .replace(
        'withOverloadRetry(tagServedBy(createRotatingGeminiClient(keys), "gemini-primary"), {',
        "withOverloadRetry(withOverloadFallback(createRotatingGeminiClient(keys), createRotatingGeminiClient(keys, (apiKey) => new GeminiLlmClient(apiKey, GEMINI_FALLBACK_TEXT_MODEL)), { budgetMs: timeoutMs, minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS }), {",
      ),
    "Mock에 부착": body.replace(": primary;", `: ${fallbackCall[0].replace(/primary,/, "new MockLlmClient(),")};`),
    "대체 누락": body.replace(clientDecl[0], "const gemini = primary;"),
    "대체 모델 누락(기본 모델로 대체)": body.replace("new GeminiLlmClient(apiKey, GEMINI_FALLBACK_TEXT_MODEL)", "new GeminiLlmClient(apiKey)"),
    "예산 상수화": body.replace(/(withOverloadFallback\([\s\S]*?)budgetMs: geminiBudgetMs/, "$1budgetMs: LLM_TIMEOUT_MS"),
  };
  for (const [label, src] of Object.entries(contaminated)) {
    assert.notEqual(src, body, `${label}: 오염이 적용되지 않았다(거짓 OK 방지)`);
    assert.ok(wiringViolations(src).length > 0, `${label}: 스캔이 잡지 못했다`);
  }
});

test("⑪ 판정표 전수 — 과부하만 대체 1회, 나머지는 대체 없이 원래 에러", async () => {
  const yes: [string, Error][] = [
    ["status 503(SDK 형태)", err503()],
    ["status 503 + 비JSON 메시지", Object.assign(new Error("Service Unavailable"), { status: 503 })],
    ["status 없음 + error.status UNAVAILABLE", apiError(undefined, { error: { status: "UNAVAILABLE" } })],
    ["status 없음 + error.code 503", apiError(undefined, { error: { code: 503 } })],
  ];
  const no: [string, Error][] = [
    ["429(일일 쿼터)", err429()],
    ["429 + 본문 UNAVAILABLE(숫자 status 우선)", apiError(429, BODY_503)],
    ["400", apiError(400, { error: { code: 400, status: "INVALID_ARGUMENT" } })],
    ["401", apiError(401, { error: { code: 401, status: "UNAUTHENTICATED" } })],
    ["403", apiError(403, { error: { code: 403, status: "PERMISSION_DENIED" } })],
    ["404", apiError(404, { error: { code: 404, status: "NOT_FOUND" } })],
    ["500", apiError(500, { error: { code: 500, status: "INTERNAL" } })],
    ["빈 응답/안전 차단", errEmpty()],
    ["deadline-exceeded", errDeadline()],
    ["네트워크 오류 fetch failed", errFetch()],
    ["산문에 high demand만(필드 아님)", new Error("This model is currently experiencing high demand")],
  ];
  const log = captureLogger();
  try {
    for (const [label, error] of yes) {
      const { options } = harness();
      const primary = scripted([{ result: error }]);
      const fallback = scripted([{ result: FALLBACK_OK }]);
      assert.deepEqual(await withOverloadFallback(primary.client, fallback.client, options).complete(INPUT), FALLBACK_OK, label);
      assert.equal(fallback.calls(), 1, `예(대체 1회)여야 한다: ${label}`);
    }
    for (const [label, error] of no) {
      const { options } = harness();
      const primary = scripted([{ result: error }]);
      const fallback = scripted([{ result: FALLBACK_OK }]);
      await assert.rejects(() => withOverloadFallback(primary.client, fallback.client, options).complete(INPUT), (t) => t === error, label);
      assert.equal(fallback.calls(), 0, `아니요(대체 없음)여야 한다: ${label}`);
    }
  } finally {
    log.restore();
  }
});
