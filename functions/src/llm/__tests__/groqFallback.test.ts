// Groq 3차 예비(2026-10-18, Architecture.md §74) — 판정표·단계 전환·중복 생성 방지·Groq 요청 형태·배선.
//
// ⛔ 라이브 호출 0건 — Groq는 fetch 주입으로, Gemini 체인은 가짜 클라이언트로 흉내 낸다.
// 실호출 샘플은 PR 본문(§74.2 프로브)에 따로 둔다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import {
  GeminiStageTimeoutError,
  isGroqFallbackEligible,
  tagServedBy,
  withGroqFallback,
  withStageDeadline,
} from "../groqFallback";
import { GROQ_CHAT_COMPLETIONS_URL, GROQ_TEXT_MODEL, GroqApiError, GroqLlmClient } from "../groqClient";
import { OPENING_TRIGGER_TURN } from "../geminiClient";
import { completeWithFallback, GROQ_RESERVE_MS, LLM_FIRST_TURN_TIMEOUT_MS, LLM_OVERLOAD_MIN_ATTEMPT_MS, LLM_TIMEOUT_MS, withTimeout } from "../index";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "../types";
import { GEMINI_KEY_SECRETS, LLM_TEXT_SECRETS } from "../../shared/config";

const INPUT: LlmCompletionInput = { systemPrompt: "(system)", messages: [{ role: "user", content: "여보세요?" }] };
const GEMINI_OK: LlmCompletionResult = { text: "Gemini 응답", isMock: false };
const GROQ_OK: LlmCompletionResult = { text: "Groq 응답", isMock: false };

function apiError(status: number | undefined, body: unknown): Error {
  const error = new Error(JSON.stringify(body));
  if (status !== undefined) Object.assign(error, { status });
  return error;
}

function fake(result: LlmCompletionResult | Error, providerName: LlmClient["providerName"] = "gemini") {
  const inputs: LlmCompletionInput[] = [];
  const client: LlmClient = {
    providerName,
    async complete(input) {
      inputs.push(input);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { client, inputs };
}

function captureLogger() {
  const original = { warn: logger.warn, info: logger.info };
  const entries: { level: string; msg: unknown; data: Record<string, unknown> }[] = [];
  (logger as { warn: unknown }).warn = (msg: unknown, data?: Record<string, unknown>) =>
    entries.push({ level: "warn", msg, data: data ?? {} });
  (logger as { info: unknown }).info = (msg: unknown, data?: Record<string, unknown>) =>
    entries.push({ level: "info", msg, data: data ?? {} });
  return {
    entries,
    restore() {
      (logger as { warn: unknown }).warn = original.warn;
      (logger as { info: unknown }).info = original.info;
    },
  };
}

const OPTIONS = { budgetMs: LLM_TIMEOUT_MS, minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS };

// ── ① 판정표 전수 ─────────────────────────────────────────────────────────────────
test("① 판정표: 429·5xx·Gemini 단계 시간 초과만 Groq로 넘어간다(4xx 입력 오류·안전 차단·네트워크·바깥 deadline은 아니요)", () => {
  const yes: [string, unknown][] = [
    ["429(일일 쿼터)", apiError(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED" } })],
    ["500", apiError(500, { error: { code: 500, status: "INTERNAL" } })],
    ["503", apiError(503, { error: { code: 503, status: "UNAVAILABLE" } })],
    ["504", apiError(504, { error: { code: 504, status: "DEADLINE_EXCEEDED" } })],
    ["status 없음 + 본문 code 429", apiError(undefined, { error: { code: 429 } })],
    ["status 없음 + 본문 code 503", apiError(undefined, { error: { code: 503 } })],
    ["Gemini 단계 시간 초과", new GeminiStageTimeoutError(7000)],
  ];
  const no: [string, unknown][] = [
    ["400", apiError(400, { error: { code: 400, status: "INVALID_ARGUMENT" } })],
    ["401", apiError(401, { error: { code: 401 } })],
    ["403", apiError(403, { error: { code: 403 } })],
    ["404(모델 종료)", apiError(404, { error: { code: 404 } })],
    ["안전 차단/빈 응답", new Error("Gemini 텍스트 응답이 비어 있습니다(candidates/safety 차단 가능성).")],
    ["네트워크 fetch failed", new TypeError("fetch failed")],
    ["바깥 withTimeout deadline-exceeded", new HttpsError("deadline-exceeded", "LLM 응답이 10000ms 내에 오지 않았습니다.")],
    ["문자열 에러", "boom"],
    ["산문에 429만(필드 아님)", new Error("got 429 from upstream")],
  ];
  for (const [label, error] of yes) assert.equal(isGroqFallbackEligible(error), true, label);
  for (const [label, error] of no) assert.equal(isGroqFallbackEligible(error), false, label);
});

// ── ② 데코레이터 동작 ──────────────────────────────────────────────────────────────
test("② Gemini 성공이면 Groq를 부르지 않는다(결과·providerName 그대로)", async () => {
  const gemini = fake(GEMINI_OK);
  const groq = fake(GROQ_OK, "groq");
  const client = withGroqFallback(gemini.client, groq.client, OPTIONS);
  assert.equal(client.providerName, "gemini", "G176 — providerName 위임");
  assert.deepEqual(await client.complete(INPUT), GEMINI_OK);
  assert.equal(groq.inputs.length, 0);
});

test("③ Gemini 429 → Groq 1회, 응답에 servedBy: groq · 같은 입력 전달 · 성공 로그", async () => {
  const log = captureLogger();
  try {
    const gemini = fake(apiError(429, { error: { code: 429 } }));
    const groq = fake(GROQ_OK, "groq");
    const result = await withGroqFallback(gemini.client, groq.client, OPTIONS).complete(INPUT);
    assert.deepEqual(result, { ...GROQ_OK, servedBy: "groq" });
    assert.equal(groq.inputs.length, 1);
    assert.equal(groq.inputs[0].systemPrompt, INPUT.systemPrompt);
    assert.deepEqual(groq.inputs[0].messages, INPUT.messages);
    assert.ok(groq.inputs[0].signal instanceof AbortSignal, "Groq 호출에는 남은 예산짜리 취소 신호가 붙는다");
    const ok = log.entries.find((e) => e.msg === "Groq 3차 예비 응답");
    assert.ok(ok);
    assert.equal(ok.data.reason, "http-429");
    assert.equal(ok.data.model, GROQ_TEXT_MODEL);
  } finally {
    log.restore();
  }
});

test("④ 4xx 입력 오류·안전 차단이면 Groq를 부르지 않고 원래 에러를 던진다", async () => {
  for (const error of [apiError(400, { error: { code: 400 } }), new Error("Gemini 텍스트 응답이 비어 있습니다.")]) {
    const groq = fake(GROQ_OK, "groq");
    await assert.rejects(withGroqFallback(fake(error).client, groq.client, OPTIONS).complete(INPUT), (e) => e === error);
    assert.equal(groq.inputs.length, 0);
  }
});

test("⑤ Groq도 실패하면 Groq 에러를 던진다(재시도·추가 단계 없음) · 실패 로그에 상태만", async () => {
  const log = captureLogger();
  try {
    const groqError = new GroqApiError(429, "tokens", "rate_limit_exceeded");
    const groq = fake(groqError, "groq");
    await assert.rejects(
      withGroqFallback(fake(apiError(503, { error: { code: 503 } })).client, groq.client, OPTIONS).complete(INPUT),
      (e) => e === groqError,
    );
    assert.equal(groq.inputs.length, 1, "Groq 재시도 없음");
    const fail = log.entries.find((e) => e.msg === "Groq 3차 예비 실패");
    assert.equal(fail?.data.status, 429);
    assert.equal(fail?.data.reason, "http-503");
  } finally {
    log.restore();
  }
});

test("⑥ 예산 경계 — 남은 시간 < minAttemptMs면 Groq 생략, = 이면 시도", async () => {
  const clock = { t: 0 };
  const slowFail = (atMs: number): LlmClient => ({
    providerName: "gemini",
    async complete() {
      clock.t = atMs;
      throw apiError(429, { error: { code: 429 } });
    },
  });
  const options = { ...OPTIONS, now: () => clock.t };
  const groqSkip = fake(GROQ_OK, "groq");
  clock.t = 0;
  await assert.rejects(withGroqFallback(slowFail(8001), groqSkip.client, options).complete(INPUT));
  assert.equal(groqSkip.inputs.length, 0, "남은 1999ms < 2000ms면 생략");
  const groqRun = fake(GROQ_OK, "groq");
  clock.t = 0;
  assert.equal((await withGroqFallback(slowFail(8000), groqRun.client, options).complete(INPUT)).text, "Groq 응답");
  assert.equal(groqRun.inputs.length, 1, "남은 2000ms = minAttemptMs면 시도");
});

// ── ⑦ 단계 시간 상한 + 중복 생성 방지 ──────────────────────────────────────────────
test("⑦ Gemini가 단계 상한을 넘기면 그 요청을 abort하고 Groq 1회 — 늦은 Gemini 응답은 결과로 쓰이지 않는다", async () => {
  let geminiSignal: AbortSignal | undefined;
  let geminiLateResolve: ((r: LlmCompletionResult) => void) | undefined;
  const slowGemini: LlmClient = {
    providerName: "gemini",
    complete(input) {
      geminiSignal = input.signal;
      return new Promise((resolve) => {
        geminiLateResolve = resolve;
      });
    },
  };
  const groq = fake(GROQ_OK, "groq");
  const client = withTimeout(
    withGroqFallback(withStageDeadline(slowGemini, 30), groq.client, { budgetMs: 2000, minAttemptMs: 100 }),
    2000,
  );
  const result = await client.complete(INPUT);
  assert.equal(result.servedBy, "groq");
  assert.equal(result.text, "Groq 응답");
  assert.equal(groq.inputs.length, 1, "Groq 1회만");
  assert.ok(geminiSignal?.aborted, "단계 상한에서 Gemini 요청이 취소돼야 한다(계속 생성하지 않는다)");
  // 상한 이후 Gemini가 뒤늦게 답해도 이미 반환된 결과는 바뀌지 않는다(저장은 반환값 1개로 1회).
  geminiLateResolve?.(GEMINI_OK);
  await new Promise((r) => setImmediate(r));
  assert.equal(result.text, "Groq 응답");
});

test("⑦-b 단계 상한 안에 Gemini가 답하면 Groq를 부르지 않는다 · 바깥 signal이 끊기면 안쪽도 끊긴다", async () => {
  const groq = fake(GROQ_OK, "groq");
  const quick = fake(GEMINI_OK);
  const result = await withGroqFallback(withStageDeadline(quick.client, 1000), groq.client, OPTIONS).complete(INPUT);
  assert.deepEqual(result, GEMINI_OK);
  assert.equal(groq.inputs.length, 0);

  let inner: AbortSignal | undefined;
  const hanging: LlmClient = {
    providerName: "gemini",
    complete(input) {
      inner = input.signal;
      return new Promise(() => undefined);
    },
  };
  const outer = new AbortController();
  const pending = withStageDeadline(hanging, 50).complete({ ...INPUT, signal: outer.signal });
  outer.abort();
  assert.ok(inner?.aborted, "바깥 취소가 안쪽 Gemini 요청으로 전달돼야 한다");
  await assert.rejects(pending, GeminiStageTimeoutError);
});

test("⑧ tagServedBy는 단계 이름만 붙이고 이미 있으면 덮지 않는다 · Mock 강등은 servedBy: mock", async () => {
  assert.deepEqual(await tagServedBy(fake(GEMINI_OK).client, "gemini-primary").complete(INPUT), {
    ...GEMINI_OK,
    servedBy: "gemini-primary",
  });
  const already = fake({ ...GEMINI_OK, servedBy: "gemini-fallback" });
  assert.equal((await tagServedBy(already.client, "gemini-primary").complete(INPUT)).servedBy, "gemini-fallback");
  const log = captureLogger();
  try {
    const mock = await completeWithFallback(fake(new Error("x")).client, INPUT);
    assert.equal(mock.isMock, true);
    assert.equal(mock.servedBy, "mock");
  } finally {
    log.restore();
  }
});

// ── ⑨ GroqLlmClient 요청 형태 ─────────────────────────────────────────────────────
function fetchStub(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return { impl, calls };
}

const OK_BODY = (content: string) => ({
  choices: [{ message: { content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 4141, completion_tokens: 99 },
});

test("⑨ Groq 요청: 고정 모델 ID · reasoning low · 추론문 제외 · system 먼저 · 키는 헤더에만 · signal 전달", async () => {
  const log = captureLogger();
  try {
    const stub = fetchStub(200, OK_BODY("네, 안녕하십니까."));
    const controller = new AbortController();
    const result = await new GroqLlmClient("TEST_KEY_NOT_REAL", stub.impl).complete({ ...INPUT, signal: controller.signal });
    assert.deepEqual(result, { text: "네, 안녕하십니까.", isMock: false });
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].url, GROQ_CHAT_COMPLETIONS_URL);
    assert.equal(stub.calls[0].init.signal, controller.signal);
    const sent = JSON.parse(String(stub.calls[0].init.body));
    assert.equal(sent.model, "openai/gpt-oss-120b");
    assert.equal(sent.reasoning_effort, "low");
    assert.equal(sent.include_reasoning, false);
    assert.equal(sent.messages[0].role, "system");
    assert.equal(sent.messages[0].content, "(system)");
    assert.ok(!String(stub.calls[0].init.body).includes("TEST_KEY_NOT_REAL"), "키가 본문에 섞이면 안 된다");
    assert.equal((stub.calls[0].init.headers as Record<string, string>).Authorization, "Bearer TEST_KEY_NOT_REAL");
    const ok = log.entries.find((e) => e.msg === "Groq 텍스트 생성 성공");
    assert.equal(ok?.data.promptTokens, 4141);
    assert.ok(!JSON.stringify(log.entries).includes("안녕하십니까"), "G170 — 응답 본문은 로그에 없다");
    assert.ok(!JSON.stringify(log.entries).includes("TEST_KEY_NOT_REAL"), "G170 — 키는 로그에 없다");
  } finally {
    log.restore();
  }
});

test("⑨-b 오프닝(messages 빈 배열)이면 Gemini와 같은 트리거 턴을 넣는다", async () => {
  const log = captureLogger();
  try {
    const stub = fetchStub(200, OK_BODY("여보세요."));
    await new GroqLlmClient("k", stub.impl).complete({ systemPrompt: "(s)", messages: [] });
    const sent = JSON.parse(String(stub.calls[0].init.body));
    assert.deepEqual(sent.messages[1], { role: "user", content: OPENING_TRIGGER_TURN });
  } finally {
    log.restore();
  }
});

test("⑨-c Groq HTTP 오류는 숫자 status를 가진 GroqApiError — 메시지에 Groq 본문(조직 ID 등)이 섞이지 않는다", async () => {
  const log = captureLogger();
  try {
    const stub = fetchStub(429, {
      error: { type: "tokens", code: "rate_limit_exceeded", message: "Rate limit reached in organization `org_SECRET123`" },
    });
    await assert.rejects(new GroqLlmClient("k", stub.impl).complete(INPUT), (e: unknown) => {
      assert.ok(e instanceof GroqApiError);
      assert.equal(e.status, 429);
      assert.ok(!e.message.includes("org_SECRET123"));
      return true;
    });
    assert.ok(!JSON.stringify(log.entries).includes("org_SECRET123"));
    for (const status of [400, 500]) {
      await assert.rejects(new GroqLlmClient("k", fetchStub(status, {}).impl).complete(INPUT), (e: unknown) => (e as GroqApiError).status === status);
    }
  } finally {
    log.restore();
  }
});

test("⑨-d 빈 응답이면 던진다(바깥 Mock 강등이 흡수)", async () => {
  const log = captureLogger();
  try {
    await assert.rejects(new GroqLlmClient("k", fetchStub(200, OK_BODY("  ")).impl).complete(INPUT), /비어 있습니다/);
    await assert.rejects(new GroqLlmClient("k", fetchStub(200, { choices: [] }).impl).complete(INPUT), /비어 있습니다/);
  } finally {
    log.restore();
  }
});

test("⑨-e 가명 처리: 이름·생년월일은 Groq로 가지 않고, 응답의 가명은 원문으로 되돌아온다", async () => {
  const log = captureLogger();
  try {
    let sentBody = "";
    const impl = async (_url: string, init: RequestInit) => {
      sentBody = String(init.body);
      const sent = JSON.parse(sentBody) as { messages: { content: string }[] };
      // 모델이 가명으로 되부르는 상황을 흉내 낸다 — 마지막 사용자 턴의 가명을 그대로 인용.
      const pseudoName = /정하윤|한지호/.exec(sent.messages.map((m) => m.content).join("\n"))?.[0] ?? "";
      return new Response(JSON.stringify(OK_BODY(`${pseudoName}님, 확인 감사합니다.`)), { status: 200 });
    };
    const result = await new GroqLlmClient("k", impl).complete({
      systemPrompt: "(s)",
      messages: [
        { role: "assistant", content: "성함과 생년월일을 말씀해 주시겠습니까?" },
        { role: "user", content: "[훈련참가자입력:데이터시작]\n홍길동이요, 1990년 1월 2일생이에요\n[훈련참가자입력:데이터끝]" },
      ],
    });
    assert.ok(!sentBody.includes("홍길동"), "이름 원문이 전송되면 안 된다");
    assert.ok(!sentBody.includes("1990년 1월 2일"), "생년월일 원문이 전송되면 안 된다");
    assert.equal(result.text, "홍길동님, 확인 감사합니다.", "사용자에게는 원래 이름이 보여야 한다");
    const ok = log.entries.find((e) => e.msg === "Groq 텍스트 생성 성공");
    assert.equal(ok?.data.pseudonymizedNames, 1);
    assert.equal(ok?.data.pseudonymizedBirthdates, 1);
    assert.ok(!JSON.stringify(log.entries).includes("홍길동"), "G170 — 탐지 원문은 로그에 없다");
  } finally {
    log.restore();
  }
});

// ── ⑩ 배선·시크릿 ─────────────────────────────────────────────────────────────────
const INDEX_SRC = path.resolve(__dirname, "../../../src/llm/index.ts");

function getLlmClientCode(src: string): string {
  const body = src.slice(src.indexOf("export function getLlmClient("), src.indexOf("export async function completeWithFallback("));
  return body
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

function groqWiringViolations(code: string): string[] {
  const v: string[] = [];
  if (!/const groqKey = keys\.length > 0 \? getGroqApiKey\(\) : "";/.test(code)) v.push("Groq 키는 Gemini 키가 있을 때만 읽어야 한다(Groq 단독 공급자 금지)");
  if (!/const geminiBudgetMs = groqKey \? timeoutMs - GROQ_RESERVE_MS : timeoutMs;/.test(code)) v.push("Gemini 예산은 Groq 있을 때만 줄어야 한다");
  if (!/const client = groqKey\s*\?\s*withGroqFallback\(withStageDeadline\(gemini, geminiBudgetMs\), new GroqLlmClient\(groqKey\), \{\s*budgetMs: timeoutMs,\s*minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS,?\s*\}\)\s*:\s*gemini;/.test(code)) {
    v.push("client = groqKey ? withGroqFallback(withStageDeadline(gemini, geminiBudgetMs), Groq, {budgetMs: timeoutMs…}) : gemini 이어야 한다");
  }
  if ((code.match(/withGroqFallback\(/g) ?? []).length !== 1) v.push("withGroqFallback은 1곳");
  if (!/return withTimeout\(client, timeoutMs\);/.test(code)) v.push("withTimeout이 가장 바깥");
  return v;
}

test("⑩ getLlmClient 배선: withTimeout(withGroqFallback(withStageDeadline(Gemini 체인), Groq), timeoutMs) — 위반 0", () => {
  assert.deepEqual(groqWiringViolations(getLlmClientCode(readFileSync(INDEX_SRC, "utf8"))), []);
});

test("⑩-역검증: 오염본(단계 상한 누락·Groq 단독·예산 상수화·Groq가 바깥 상한 밖)은 전부 잡힌다", () => {
  const code = getLlmClientCode(readFileSync(INDEX_SRC, "utf8"));
  const contaminated: Record<string, string> = {
    "단계 상한 누락": code.replace("withStageDeadline(gemini, geminiBudgetMs)", "gemini"),
    "Groq 단독(키 무조건 읽기)": code.replace('keys.length > 0 ? getGroqApiKey() : ""', "getGroqApiKey()"),
    "예산 상수화": code.replace("budgetMs: timeoutMs,\n        minAttemptMs", "budgetMs: LLM_TIMEOUT_MS,\n        minAttemptMs"),
    "Groq가 바깥 상한 밖": code.replace("return withTimeout(client, timeoutMs);", "return withGroqFallback(withTimeout(client, timeoutMs), x, y);"),
  };
  for (const [label, src] of Object.entries(contaminated)) {
    assert.notEqual(src, code, `${label}: 오염이 적용되지 않았다`);
    assert.ok(groqWiringViolations(src).length > 0, `${label}: 스캔이 잡지 못했다`);
  }
});

test("⑪ 예산 상수: Groq 몫 3초 — 일반 턴 Gemini 7초 · 첫 턴 17초, Groq 몫은 최소 시도 여유 이상", () => {
  assert.equal(GROQ_RESERVE_MS, 3000);
  assert.equal(LLM_TIMEOUT_MS - GROQ_RESERVE_MS, 7000);
  assert.equal(LLM_FIRST_TURN_TIMEOUT_MS - GROQ_RESERVE_MS, 17000);
  assert.ok(GROQ_RESERVE_MS >= LLM_OVERLOAD_MIN_ATTEMPT_MS);
});

test("⑫ 시크릿: GROQ_API_KEY는 LLM_TEXT_SECRETS에만 있고 Gemini 키 순환 배열에는 없다(키 1개)", () => {
  assert.deepEqual(GEMINI_KEY_SECRETS.map((s) => s.name), ["GEMINI_API_KEY", "GEMINI_API_KEY2"]);
  assert.deepEqual(LLM_TEXT_SECRETS.map((s) => s.name), ["GEMINI_API_KEY", "GEMINI_API_KEY2", "GROQ_API_KEY"]);
  assert.equal(LLM_TEXT_SECRETS.filter((s) => s.name.startsWith("GROQ")).length, 1, "Groq 키 순환 금지(한도는 조직 단위)");
});
