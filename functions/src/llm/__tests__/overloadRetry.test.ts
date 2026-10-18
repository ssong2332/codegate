// Gemini 과부하(503) 짧은 백오프 재시도 — 명세 4 테스트 ①~⑪.
//
// ⭐ 대기·시계는 주입한다(sleep·now) — 벽시계를 쓰지 않으므로 부하와 무관하게 결정적이다.
// ⛔ 라이브 호출 0건. 실 SDK 오류 형태 확인은 globalThis.fetch 스텁으로만 한다
// (geminiKeyRotation.test.ts의 방식 재사용).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { GeminiLlmClient } from "../geminiClient";
import { isOverloadError } from "../overloadClass";
import { withOverloadRetry } from "../overloadRetry";
import type { OverloadRetryOptions } from "../overloadRetry";
import { createRotatingGeminiClient, readAttemptedKeys } from "../rotatingClient";
import {
  LLM_OVERLOAD_MIN_ATTEMPT_MS,
  LLM_OVERLOAD_RETRY_DELAYS_MS,
  LLM_TIMEOUT_MS,
  withTimeout,
} from "../index";
import type { LlmClient, LlmCompletionResult } from "../types";

const INPUT = { systemPrompt: "(system)", messages: [] };
const OK: LlmCompletionResult = { text: "실제 응답", isMock: false };

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
const BODY_500 = { error: { code: 500, message: "Internal error encountered.", status: "INTERNAL" } };
const err503 = () => apiError(503, BODY_503);

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

function harness(overrides: Partial<OverloadRetryOptions> = {}) {
  const clock = { t: 0 };
  const sleeps: number[] = [];
  const options: OverloadRetryOptions = {
    delaysMs: LLM_OVERLOAD_RETRY_DELAYS_MS,
    budgetMs: LLM_TIMEOUT_MS,
    minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.t += ms;
    },
    now: () => clock.t,
    ...overrides,
  };
  return { clock, sleeps, options };
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

test("상수: 대기 [500, 1500] · 최소 시도 2000ms · 시간 상한 10초는 그대로", () => {
  assert.deepEqual([...LLM_OVERLOAD_RETRY_DELAYS_MS], [500, 1500]);
  assert.equal(LLM_OVERLOAD_MIN_ATTEMPT_MS, 2000);
  assert.equal(LLM_TIMEOUT_MS, 10_000);
});

test("① 첫 시도 성공 → 1회 호출, 대기 0회", async () => {
  const { sleeps, options } = harness();
  const fake = scripted([{ result: OK }]);
  const result = await withOverloadRetry(fake.client, options).complete(INPUT);
  assert.deepEqual(result, OK);
  assert.equal(fake.calls(), 1);
  assert.deepEqual(sleeps, []);
});

test("② 503 → 성공 → 2회 호출, 대기 500", async () => {
  const { sleeps, options } = harness();
  const fake = scripted([{ result: err503() }, { result: OK }]);
  const log = captureLogger();
  try {
    const result = await withOverloadRetry(fake.client, options).complete(INPUT);
    assert.deepEqual(result, OK);
    assert.equal(fake.calls(), 2);
    assert.deepEqual(sleeps, [500]);
    const success = log.entries.find((e) => e.msg === "Gemini 과부하 재시도 성공");
    assert.ok(success, "재시도 성공 로그가 남아야 한다");
    assert.deepEqual(success.data, { attempts: 2, elapsedMs: 500 });
  } finally {
    log.restore();
  }
});

test("③ 503·503 → 성공 → 3회 호출, 대기 500·1500, 로그는 숫자 필드뿐", async () => {
  const { sleeps, options } = harness();
  const fake = scripted([{ result: err503() }, { result: err503() }, { result: OK }]);
  const log = captureLogger();
  try {
    const result = await withOverloadRetry(fake.client, options).complete(INPUT);
    assert.deepEqual(result, OK);
    assert.equal(fake.calls(), 3);
    assert.deepEqual(sleeps, [500, 1500]);
    const retries = log.entries.filter((e) => e.msg === "Gemini 과부하(503) — 재시도");
    assert.deepEqual(
      retries.map((e) => e.data),
      [
        { attempt: 1, delayMs: 500, elapsedMs: 0 },
        { attempt: 2, delayMs: 1500, elapsedMs: 500 },
      ],
    );
    for (const entry of log.entries) {
      for (const value of Object.values(entry.data)) assert.equal(typeof value, "number", "G170 — 로그는 숫자만");
    }
  } finally {
    log.restore();
  }
});

test("④ 503×3 → 마지막 에러를 던진다, 3회 호출(최대 재시도 2회), 키 순환기 태그 보존", async () => {
  const { sleeps, options } = harness();
  const errors = [err503(), err503(), err503()];
  let calls = 0;
  // 실제 키 순환기를 거치게 해 `geminiAttemptedKeys` 태그가 붙은 **같은 객체**가 나오는지 본다.
  const rotating = createRotatingGeminiClient([{ slot: "GEMINI_API_KEY", key: "SENTINEL-KEY-AAA" }], () => ({
    providerName: "gemini",
    async complete() {
      throw errors[calls++];
    },
  }));
  const log = captureLogger();
  try {
    await assert.rejects(
      () => withOverloadRetry(rotating, options).complete(INPUT),
      (thrown) => {
        assert.equal(thrown, errors[2], "마지막 에러 객체 그대로(교체 금지)");
        assert.equal(readAttemptedKeys(thrown), 1, "키 순환기가 붙인 태그가 살아 있어야 한다");
        return true;
      },
    );
    assert.equal(calls, 3);
    assert.deepEqual(sleeps, [500, 1500]);
  } finally {
    log.restore();
  }
});

test("⑤ 429 → 재시도 없이 그대로 던진다(키 순환 분류 무간섭)", async () => {
  const { sleeps, options } = harness();
  const error429 = apiError(429, BODY_429);
  let calls = 0;
  const rotating = createRotatingGeminiClient([{ slot: "GEMINI_API_KEY", key: "SENTINEL-KEY-AAA" }], () => ({
    providerName: "gemini",
    async complete() {
      calls += 1;
      throw error429;
    },
  }));
  const log = captureLogger();
  try {
    await assert.rejects(
      () => withOverloadRetry(rotating, options).complete(INPUT),
      (thrown) => thrown === error429 && readAttemptedKeys(thrown) === 1,
    );
    assert.equal(calls, 1, "429는 이 데코레이터의 재시도 대상이 아니다");
    assert.deepEqual(sleeps, []);
    // 키 순환기의 429 분류 로그는 그대로 남는다(분류 무간섭) — 재시도 로그는 0건.
    assert.ok(log.entries.some((e) => e.msg === "Gemini 429 분류"));
    assert.equal(log.entries.filter((e) => String(e.msg).startsWith("Gemini 과부하")).length, 0);
  } finally {
    log.restore();
  }
});

test("⑥ 500 · fetch failed · deadline-exceeded → 재시도 없음", async () => {
  const cases: [string, Error][] = [
    ["500", apiError(500, BODY_500)],
    ["fetch failed", new TypeError("fetch failed")],
    ["deadline-exceeded", new HttpsError("deadline-exceeded", "LLM 응답이 10000ms 내에 오지 않았습니다(AC-004 목표 초과).")],
  ];
  for (const [label, error] of cases) {
    const { sleeps, options } = harness();
    const fake = scripted([{ result: error }, { result: OK }]);
    await assert.rejects(() => withOverloadRetry(fake.client, options).complete(INPUT), (thrown) => thrown === error);
    assert.equal(fake.calls(), 1, `${label}: 재시도하면 안 된다`);
    assert.deepEqual(sleeps, [], `${label}: 대기하면 안 된다`);
  }
});

test("⑦ 예산 부족(budget 10초, 경과 7.5초에서 503) → 재시도 생략하고 그 에러를 던진다", async () => {
  // 1회차 503(0.5초) → 대기 500 → 2회차 503(7.5초): 7500 + 1500 + 2000 = 11000 > 10000 ⇒ 생략.
  const { clock, sleeps, options } = harness();
  const last = err503();
  const fake = scripted([{ result: err503(), atMs: 500 }, { result: last, atMs: 7500 }, { result: OK }], clock);
  const log = captureLogger();
  try {
    await assert.rejects(() => withOverloadRetry(fake.client, options).complete(INPUT), (thrown) => thrown === last);
    assert.equal(fake.calls(), 2, "3회차는 바깥 withTimeout에 잘릴 시도라 만들지 않는다");
    assert.deepEqual(sleeps, [500]);
    const skipped = log.entries.find((e) => e.msg === "Gemini 과부하 — 예산 부족으로 재시도 생략");
    assert.ok(skipped);
    assert.deepEqual(skipped.data, { attempt: 2, elapsedMs: 7500, budgetMs: 10_000 });
  } finally {
    log.restore();
  }
});

test("⑦-경계: `경과 + 대기 + minAttemptMs`가 예산과 **같으면** 재시도한다(명세의 `>` 그대로)", async () => {
  // 1회차 503이 7.5초에 옴: 7500 + 500 + 2000 = 10000 — 초과가 아니므로 재시도.
  const { clock, sleeps, options } = harness();
  const fake = scripted([{ result: err503(), atMs: 7500 }, { result: OK, atMs: 8000 }], clock);
  const log = captureLogger();
  try {
    assert.deepEqual(await withOverloadRetry(fake.client, options).complete(INPUT), OK);
    assert.equal(fake.calls(), 2);
    assert.deepEqual(sleeps, [500]);
  } finally {
    log.restore();
  }
});

test("⑧ status가 없고 메시지 JSON의 UNAVAILABLE(또는 code 503)만 있는 형태도 과부하로 재시도한다", async () => {
  const shapes: [string, Error][] = [
    ["status UNAVAILABLE만", apiError(undefined, { error: { status: "UNAVAILABLE", message: "x" } })],
    ["code 503만", apiError(undefined, { error: { code: 503, message: "x" } })],
  ];
  for (const [label, error] of shapes) {
    assert.equal(isOverloadError(error), true, label);
    const { sleeps, options } = harness();
    const fake = scripted([{ result: error }, { result: OK }]);
    const log = captureLogger();
    try {
      assert.deepEqual(await withOverloadRetry(fake.client, options).complete(INPUT), OK, label);
      assert.equal(fake.calls(), 2, label);
      assert.deepEqual(sleeps, [500], label);
    } finally {
      log.restore();
    }
  }
});

test("⑧-실형태: 실제 SDK(GeminiLlmClient)가 HTTP 503에 던지는 에러가 과부하로 판정된다(fetch 스텁, 라이브 0건)", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify(BODY_503), { status: 503, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;
  try {
    let thrown: unknown;
    try {
      await new GeminiLlmClient("SENTINEL-KEY-AAA").complete(INPUT);
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown, "503 응답이면 SDK가 던져야 한다");
    assert.equal(isOverloadError(thrown), true, "SDK의 실제 503 에러 형태를 과부하로 판정해야 한다");
    assert.equal(fetchCalls, 1, "SDK 자체가 재시도하지 않는다(이중 재시도 아님)");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("⑨ providerName을 그대로 위임한다(G176) — withTimeout으로 감싸도 'gemini'", async () => {
  const { options } = harness();
  const fake = scripted([{ result: err503() }, { result: OK }]);
  const wrapped = withTimeout(withOverloadRetry(fake.client, options), LLM_TIMEOUT_MS);
  assert.equal(withOverloadRetry(fake.client, options).providerName, "gemini");
  assert.equal(wrapped.providerName, "gemini");
  const mockLike: LlmClient = { providerName: "mock", complete: async () => OK };
  assert.equal(withOverloadRetry(mockLike, options).providerName, "mock", "이름을 지어내지 않는다");
  const log = captureLogger();
  try {
    assert.deepEqual(await wrapped.complete(INPUT), OK, "바깥 withTimeout 안에서 재시도가 성공한다");
  } finally {
    log.restore();
  }
});

// ── ⑩ getLlmClient 배선 소스 스캔 ─────────────────────────────────────────────────
// 단위 테스트에서는 defineSecret이 바인딩되지 않아 키가 0개라 실 Gemini 분기를 동적으로 못 탄다
// ⇒ 소스 스캔으로 배선을 못박고, 오염본으로 스캔이 실제로 가르는지 역검증한다.
// 형태: `client = keys.length > 0 ? withOverloadRetry(createRotatingGeminiClient(keys), {…budgetMs: timeoutMs…}) : new MockLlmClient();`
//       `return withTimeout(client, timeoutMs);` — withTimeout이 가장 바깥(firstTurnTimeout.test.ts의 기존 단언과 공존).
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

function wiringViolations(body: string): string[] {
  const code = codeOnly(body);
  const violations: string[] = [];
  const geminiBranch = /keys\.length > 0\s*\?\s*withOverloadRetry\(createRotatingGeminiClient\(keys\), \{([\s\S]*?)\}\)\s*:\s*new MockLlmClient\(\);/.exec(code);
  if (!geminiBranch) {
    violations.push("실 Gemini 분기가 withOverloadRetry(createRotatingGeminiClient(keys), {…})이고 Mock 분기가 맨 MockLlmClient여야 한다");
  } else {
    const opts = geminiBranch[1];
    if (!/budgetMs: timeoutMs\b/.test(opts)) violations.push("budgetMs가 인자 timeoutMs여야 한다");
    if (!/delaysMs: LLM_OVERLOAD_RETRY_DELAYS_MS\b/.test(opts)) violations.push("delaysMs가 LLM_OVERLOAD_RETRY_DELAYS_MS여야 한다");
    if (!/minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS\b/.test(opts)) violations.push("minAttemptMs가 LLM_OVERLOAD_MIN_ATTEMPT_MS여야 한다");
  }
  if (!/return withTimeout\(client, timeoutMs\);/.test(code)) violations.push("withTimeout(client, timeoutMs)가 가장 바깥이어야 한다");
  if ((code.match(/withTimeout\(/g) ?? []).length !== 1) violations.push("withTimeout은 정확히 1번(가장 바깥)만 감싸야 한다");
  if ((code.match(/withOverloadRetry\(/g) ?? []).length !== 1) violations.push("withOverloadRetry는 정확히 1곳(실 Gemini)만 감싸야 한다");
  if (/withOverloadRetry\(\s*new MockLlmClient/.test(code)) violations.push("Mock에 과부하 재시도를 붙이면 안 된다");
  return violations;
}

test("⑩ getLlmClient 배선: 실 Gemini만 withTimeout(withOverloadRetry(rotating, {budgetMs: timeoutMs}), timeoutMs) — 현재 소스 위반 0", () => {
  const body = getLlmClientBody(readFileSync(INDEX_SRC, "utf8"));
  assert.deepEqual(wiringViolations(body), []);
});

test("⑩-역검증: 오염본(순서 뒤집기·Mock에 부착·재시도 누락·예산 상수화)은 전부 위반으로 잡힌다", () => {
  const body = getLlmClientBody(readFileSync(INDEX_SRC, "utf8"));
  const retryCall = /withOverloadRetry\(createRotatingGeminiClient\(keys\), \{[\s\S]*?\}\)/.exec(body);
  assert.ok(retryCall, "역검증 기준 문자열을 찾지 못했다(소스 형태가 바뀌었다)");
  const opts = retryCall[0].slice(retryCall[0].indexOf("{"));
  const contaminated: Record<string, string> = {
    "순서 뒤집기(withTimeout이 안쪽)": body
      .replace(retryCall[0], "withTimeout(createRotatingGeminiClient(keys), timeoutMs)")
      .replace("return withTimeout(client, timeoutMs);", `return withOverloadRetry(client, ${opts});`),
    "Mock에 부착": body.replace(": new MockLlmClient();", `: withOverloadRetry(new MockLlmClient(), ${opts});`),
    "재시도 누락": body.replace(retryCall[0], "createRotatingGeminiClient(keys)"),
    "예산 상수화": body.replace("budgetMs: timeoutMs", "budgetMs: LLM_TIMEOUT_MS"),
  };
  for (const [label, src] of Object.entries(contaminated)) {
    assert.notEqual(src, body, `${label}: 오염이 적용되지 않았다(거짓 OK 방지)`);
    assert.ok(wiringViolations(src).length > 0, `${label}: 스캔이 잡지 못했다`);
  }
});

test("⑪ isOverloadError 판정표 전수", () => {
  const yes: [string, unknown][] = [
    ["status 503(SDK 형태)", err503()],
    ["status 503 + 비JSON 메시지", Object.assign(new Error("Service Unavailable"), { status: 503 })],
    ["status 없음 + error.status UNAVAILABLE", apiError(undefined, { error: { status: "UNAVAILABLE" } })],
    ["status 없음 + error.code 503", apiError(undefined, { error: { code: 503 } })],
  ];
  const no: [string, unknown][] = [
    ["429(일일 쿼터)", apiError(429, BODY_429)],
    ["429 + 본문 UNAVAILABLE(모순 형태 — 숫자 status 우선)", apiError(429, BODY_503)],
    ["400", apiError(400, { error: { code: 400, status: "INVALID_ARGUMENT" } })],
    ["401", apiError(401, { error: { code: 401, status: "UNAUTHENTICATED" } })],
    ["403", apiError(403, { error: { code: 403, status: "PERMISSION_DENIED" } })],
    ["404", apiError(404, { error: { code: 404, status: "NOT_FOUND" } })],
    ["500", apiError(500, BODY_500)],
    ["deadline-exceeded", new HttpsError("deadline-exceeded", "LLM 응답이 10000ms 내에 오지 않았습니다(AC-004 목표 초과).")],
    ["빈 응답 에러", new Error("Gemini 텍스트 응답이 비어 있습니다(candidates/safety 차단 가능성).")],
    ["네트워크 오류 fetch failed", new TypeError("fetch failed")],
    ["산문에 high demand만(필드 아님)", new Error("This model is currently experiencing high demand")],
    ["null", null],
    ["문자열", "503"],
  ];
  for (const [label, error] of yes) assert.equal(isOverloadError(error), true, `예여야 한다: ${label}`);
  for (const [label, error] of no) assert.equal(isOverloadError(error), false, `아니요여야 한다: ${label}`);
});
