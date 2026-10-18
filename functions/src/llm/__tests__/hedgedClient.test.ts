// LLM 예비 요청 데코레이터(llm/hedgedClient.ts) — 순수 동작 테스트 + getLlmClient 배선 소스 스캔.
// 타이머는 `opts.schedule`로 주입해 테스트가 직접 "4초 경과"를 일으킨다(실제 대기 0).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { withHedge } from "../hedgedClient";
import type { HedgeSchedule } from "../hedgedClient";
import { LLM_HEDGE_DELAY_MS, LLM_TIMEOUT_MS } from "../index";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "../types";

const INPUT: LlmCompletionInput = { systemPrompt: "(system)", messages: [{ role: "user", content: "(u)" }] };

type Deferred = {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
};

/** 호출마다 미결 Promise를 만들고 테스트가 직접 끝내는 가짜 클라이언트. */
function controlledClient(providerName: LlmClient["providerName"] = "gemini") {
  const calls: Deferred[] = [];
  const inputs: LlmCompletionInput[] = [];
  const client: LlmClient = {
    providerName,
    complete(input) {
      inputs.push(input);
      return new Promise<LlmCompletionResult>((resolve, reject) => {
        calls.push({ resolve: (text) => resolve({ text, isMock: false }), reject });
      });
    },
  };
  return { client, calls, inputs };
}

/** 예약을 붙잡아 두고 `fire()`로 "지연 경과"를 일으키는 스케줄러. */
function manualSchedule() {
  const state: { fn?: () => void; ms?: number; cancelled: boolean } = { cancelled: false };
  const schedule: HedgeSchedule = (fn, ms) => {
    state.fn = fn;
    state.ms = ms;
    return () => {
      state.cancelled = true;
    };
  };
  const fire = (): void => {
    if (!state.cancelled) state.fn?.();
  };
  return { schedule, fire, state };
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

test("[①] 지연 안에 A가 성공하면 그 결과 · 호출 1회 · 예약 취소", async () => {
  const { client, calls } = controlledClient();
  const timer = manualSchedule();
  const pending = withHedge(client, 4_000, { schedule: timer.schedule }).complete(INPUT);
  assert.equal(timer.state.ms, 4_000);
  calls[0].resolve("A");
  assert.equal((await pending).text, "A");
  timer.fire(); // 취소된 뒤 경과해도 예비 요청이 나가지 않는다.
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(timer.state.cancelled, true);
});

test("[②] 지연 안에 A가 실패하면 예비 요청 없이 그대로 throw · 호출 1회", async () => {
  const { client, calls } = controlledClient();
  const timer = manualSchedule();
  const pending = withHedge(client, 4_000, { schedule: timer.schedule }).complete(INPUT);
  const error = Object.assign(new Error("503"), { attemptedKeys: ["GEMINI_API_KEY"] });
  calls[0].reject(error);
  await assert.rejects(pending, (err: unknown) => err === error);
  timer.fire();
  await flush();
  assert.equal(calls.length, 1);
});

test("[③] A가 지연되면 B를 1회 보내고, B가 먼저 성공하면 B 결과 · 호출 2회 · 같은 입력", async () => {
  const { client, calls, inputs } = controlledClient();
  const timer = manualSchedule();
  const pending = withHedge(client, 4_000, { schedule: timer.schedule }).complete(INPUT);
  await flush();
  timer.fire();
  assert.equal(calls.length, 2);
  assert.equal(inputs[1], INPUT);
  calls[1].resolve("B");
  assert.equal((await pending).text, "B");
  calls[0].resolve("A-late"); // 진 쪽이 늦게 끝나도 결과는 바뀌지 않는다.
  await flush();
  assert.equal(calls.length, 2);
});

test("[④] B 발사 후 A가 먼저 성공하면 A 결과", async () => {
  const { client, calls } = controlledClient();
  const timer = manualSchedule();
  const pending = withHedge(client, 4_000, { schedule: timer.schedule }).complete(INPUT);
  timer.fire();
  calls[0].resolve("A");
  assert.equal((await pending).text, "A");
  calls[1].resolve("B-late");
  await flush();
  assert.equal(calls.length, 2);
});

test("[⑤] B 발사 후 한쪽이 실패해도 다른 쪽 성공 결과를 돌려준다(양 방향)", async () => {
  {
    const { client, calls } = controlledClient();
    const timer = manualSchedule();
    const pending = withHedge(client, 4_000, { schedule: timer.schedule }).complete(INPUT);
    timer.fire();
    calls[0].reject(new Error("A 실패"));
    await flush();
    calls[1].resolve("B");
    assert.equal((await pending).text, "B");
  }
  {
    const { client, calls } = controlledClient();
    const timer = manualSchedule();
    const pending = withHedge(client, 4_000, { schedule: timer.schedule }).complete(INPUT);
    timer.fire();
    calls[1].reject(new Error("B 실패"));
    await flush();
    calls[0].resolve("A");
    assert.equal((await pending).text, "A");
  }
});

test("[⑥] 둘 다 실패하면 마지막 실패를 그 에러 그대로 던진다", async () => {
  const { client, calls } = controlledClient();
  const timer = manualSchedule();
  const pending = withHedge(client, 4_000, { schedule: timer.schedule }).complete(INPUT);
  timer.fire();
  const first = new Error("B 먼저 실패");
  const last = Object.assign(new Error("A 나중 실패"), { attemptedKeys: ["GEMINI_API_KEY", "GEMINI_API_KEY_2"] });
  calls[1].reject(first);
  await flush();
  calls[0].reject(last);
  await assert.rejects(pending, (err: unknown) => {
    assert.equal(err, last);
    assert.deepEqual((err as { attemptedKeys?: string[] }).attemptedKeys, ["GEMINI_API_KEY", "GEMINI_API_KEY_2"]);
    return true;
  });
});

test("[⑦] providerName은 내부 클라이언트 것을 위임한다(G176)", () => {
  assert.equal(withHedge(controlledClient("gemini").client, 4_000).providerName, "gemini");
  assert.equal(withHedge(controlledClient("mock").client, 4_000).providerName, "mock");
});

test("[실시간] 기본 setTimeout 경로 — 짧은 지연에서 B가 실제로 나가고 먼저 성공한 쪽이 이긴다", async () => {
  let n = 0;
  const client: LlmClient = {
    providerName: "gemini",
    complete() {
      n += 1;
      const delay = n === 1 ? 200 : 10;
      const text = n === 1 ? "A" : "B";
      return new Promise((resolve) => setTimeout(() => resolve({ text, isMock: false }), delay));
    },
  };
  const result = await withHedge(client, 20).complete(INPUT);
  assert.equal(result.text, "B");
  assert.equal(n, 2);
});

test("[상수] LLM_HEDGE_DELAY_MS === 4000 이고 LLM_TIMEOUT_MS(10000)는 그대로다", () => {
  assert.equal(LLM_HEDGE_DELAY_MS, 4_000);
  assert.equal(LLM_TIMEOUT_MS, 10_000);
  assert.ok(LLM_HEDGE_DELAY_MS < LLM_TIMEOUT_MS);
});

// ⑧ getLlmClient 배선 — 실 Gemini만 withTimeout(withHedge(...))로, withTimeout이 가장 바깥.
const LLM_INDEX_SRC = readFileSync(path.resolve(__dirname, "../../../src/llm/index.ts"), "utf8");

function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

const GEMINI_WIRING =
  /withTimeout\(\s*withHedge\(\s*createRotatingGeminiClient\(\s*keys\s*\)\s*,\s*LLM_HEDGE_DELAY_MS\s*\)\s*,\s*LLM_TIMEOUT_MS\s*\)/;

/** 실 Gemini 배선이 정확히 그 순서로 1곳 있고, Mock에는 예비 요청이 붙지 않는가. */
function hedgeWiringOk(source: string): boolean {
  const code = codeOnly(source);
  const geminiMatches = code.match(new RegExp(GEMINI_WIRING.source, "g")) ?? [];
  const hedgeCalls = code.match(/withHedge\(/g) ?? [];
  const mockHedged = /withHedge\(\s*new\s+MockLlmClient/.test(code);
  return geminiMatches.length === 1 && hedgeCalls.length === 1 && !mockHedged;
}

test("[⑧ 배선] getLlmClient — withTimeout(withHedge(createRotatingGeminiClient(keys), LLM_HEDGE_DELAY_MS), LLM_TIMEOUT_MS)", () => {
  assert.equal(hedgeWiringOk(LLM_INDEX_SRC), true);
});

test("[⑧ 역검증] 순서를 뒤집거나 예비 요청을 빼거나 Mock에 붙인 오염본은 같은 판정식이 실패시킨다", () => {
  const inverted =
    "return withHedge(withTimeout(createRotatingGeminiClient(keys), LLM_TIMEOUT_MS), LLM_HEDGE_DELAY_MS);";
  assert.equal(hedgeWiringOk(inverted), false);

  const noHedge = "return withTimeout(createRotatingGeminiClient(keys), LLM_TIMEOUT_MS);";
  assert.equal(hedgeWiringOk(noHedge), false);

  const mockHedged = [
    "const client = keys.length > 0 ? createRotatingGeminiClient(keys) : new MockLlmClient();",
    "return withTimeout(withHedge(client, LLM_HEDGE_DELAY_MS), LLM_TIMEOUT_MS);",
  ].join("\n");
  assert.equal(hedgeWiringOk(mockHedged), false);

  const commented = "// return withTimeout(withHedge(createRotatingGeminiClient(keys), LLM_HEDGE_DELAY_MS), LLM_TIMEOUT_MS);";
  assert.equal(hedgeWiringOk(commented), false);

  assert.equal(hedgeWiringOk(LLM_INDEX_SRC), true, "정본은 같은 판정식을 통과한다");
});
