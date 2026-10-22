// 사기범 대사 1차 Claude(2026-10-22, Architecture.md §103) — 요청 형태 · 2차 전환 판정표 · 용도별 라우팅 · 예산 · 시크릿 선언.
//
// ⛔ 라이브 호출 0건 — Claude는 `messages.create` 주입으로, Gemini는 가짜 클라이언트로 흉내 낸다.
// 실호출 근거는 scripts/messenger-model-compare-probe.mjs 측정(PR 본문)에 둔다.
import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { logger } from "firebase-functions";
import { CLAUDE_TEXT_MODEL, ClaudeLlmClient, ClaudeNoReplyError } from "../claudeClient";
import { withGeminiAfterClaude } from "../claudeFallback";
import { OPENING_TRIGGER_TURN } from "../geminiClient";
import { GROQ_TRAINING_CONTEXT_PREAMBLE } from "../groqClient";
import { tagServedBy, withGroqFallback, withStageDeadline } from "../groqFallback";
import { CLAUDE_GEMINI_RESERVE_MS, GROQ_RESERVE_MS, LLM_OVERLOAD_MIN_ATTEMPT_MS, LLM_TIMEOUT_MS, routeScammerReply } from "../index";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "../types";
import { wrapUserInputAsData } from "../../roleplay/promptAssembly";
import { CLAUDE_API_KEY, GEMINI_KEY_SECRETS, LLM_TEXT_SECRETS } from "../../shared/config";

// 로그는 숫자만 싣는지 아래에서 본다 — 테스트 출력은 조용히.
for (const level of ["info", "warn"] as const) (logger as unknown as Record<string, unknown>)[level] = () => undefined;

const SCAMMER: LlmCompletionInput = {
  systemPrompt: "(system)",
  messages: [{ role: "user", content: "여보세요?" }],
  purpose: "scammer-reply",
};

function message(text: string, stopReason: Anthropic.Message["stop_reason"] = "end_turn"): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: CLAUDE_TEXT_MODEL,
    content: text ? [{ type: "text", text, citations: null }] : [],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20 },
  } as unknown as Anthropic.Message;
}

function capture(reply: Anthropic.Message | Error) {
  const calls: Array<{ params: Anthropic.MessageCreateParamsNonStreaming; options: { signal?: AbortSignal } }> = [];
  const create = async (params: Anthropic.MessageCreateParamsNonStreaming, options: { signal?: AbortSignal }) => {
    calls.push({ params, options });
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { calls, client: new ClaudeLlmClient("test-key", create) };
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

// ── 1. 요청 형태 ──────────────────────────────────────────────────────────────────────────────

test("[§103] 요청 — 고정 모델 · 추론 끔(between_tools) · 사기범 경로 훈련 맥락 머리말 · 신호 전달", async () => {
  const { calls, client } = capture(message("오랜만이다ㅋㅋ"));
  const controller = new AbortController();
  const result = await client.complete({ ...SCAMMER, signal: controller.signal });
  assert.deepEqual(result, { text: "오랜만이다ㅋㅋ", isMock: false });
  const { params, options } = calls[0];
  assert.equal(params.model, "claude-sonnet-5-5");
  assert.deepEqual(params.thinking, { type: "between_tools" });
  assert.ok(String(params.system).startsWith(GROQ_TRAINING_CONTEXT_PREAMBLE), "측정과 같은 머리말");
  assert.ok(String(params.system).endsWith("(system)"), "조립된 프롬프트(가드레일 포함)는 뒤에 그대로");
  assert.equal(options.signal, controller.signal);
});

test("[§103] 용도가 없으면(되감기 판정 등) 머리말을 붙이지 않는다", async () => {
  const { calls, client } = capture(message("{}"));
  await client.complete({ systemPrompt: "(judge)", messages: [{ role: "user", content: "답" }] });
  assert.equal(calls[0].params.system, "(judge)");
});

test("[§103] 오프닝(빈 이력)과 사기범 첫마디로 시작하는 이력 — user 트리거 턴을 앞에 둔다", async () => {
  const { calls, client } = capture(message("안녕"));
  await client.complete({ ...SCAMMER, messages: [] });
  assert.deepEqual(calls[0].params.messages, [{ role: "user", content: OPENING_TRIGGER_TURN }]);
  await client.complete({ ...SCAMMER, messages: [{ role: "assistant", content: "오랜만이다" }, { role: "user", content: "누구세요?" }] });
  assert.equal(calls[1].params.messages[0].role, "user");
  assert.equal(calls[1].params.messages[0].content, OPENING_TRIGGER_TURN);
  assert.equal(calls[1].params.messages.length, 3);
});

test("[§103] 외부 공급자로 나가는 사용자 이름은 가명으로 바꾸고 응답에서 되돌린다", async () => {
  const { calls, client } = capture(message("정하윤님 맞으시죠?"));
  const result = await client.complete({
    ...SCAMMER,
    messages: [{ role: "user", content: wrapUserInputAsData("제 이름은 김철수입니다") }],
  });
  assert.equal(JSON.stringify(calls[0].params.messages).includes("김철수"), false, "원래 이름이 나가지 않는다");
  assert.equal(result.text, "김철수님 맞으시죠?");
});

test("[§103] 거절(stop_reason refusal)·빈 응답은 ClaudeNoReplyError — 2차로 넘기는 신호", async () => {
  await assert.rejects(capture(message("", "refusal")).client.complete(SCAMMER), ClaudeNoReplyError);
  await assert.rejects(capture(message("   ")).client.complete(SCAMMER), ClaudeNoReplyError);
});

test("[§103] 이미 끊긴 신호면 요청을 시작하지 않는다", async () => {
  const { calls, client } = capture(message("x"));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.complete({ ...SCAMMER, signal: controller.signal }));
  assert.equal(calls.length, 0);
});

// ── 2. 1차 → 2차 판정표 ───────────────────────────────────────────────────────────────────────

const GEMINI_OK: LlmCompletionResult = { text: "Gemini 응답", isMock: false };
const OPTS = { budgetMs: 7000, minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS };

test("[§103 표] Claude 성공 → 2차 호출 없음", async () => {
  const gemini = fake(GEMINI_OK);
  const chain = withGeminiAfterClaude(fake({ text: "오랜만이다ㅋㅋ 잘 지냈어?", isMock: false }, "claude").client, gemini.client, OPTS);
  assert.equal((await chain.complete(SCAMMER)).text, "오랜만이다ㅋㅋ 잘 지냈어?");
  assert.equal(gemini.inputs.length, 0);
});

for (const [label, error] of [
  ["401(키 만료)", Object.assign(new Error("auth"), { status: 401 })],
  ["400(모델 변경 등)", Object.assign(new Error("bad"), { status: 400 })],
  ["429", Object.assign(new Error("rate"), { status: 429 })],
  ["529(과부하)", Object.assign(new Error("overloaded"), { status: 529 })],
  ["네트워크 오류", new TypeError("fetch failed")],
  ["거절", new ClaudeNoReplyError("refusal")],
] as const) {
  test(`[§103 표] Claude ${label} → Gemini 2차 1회`, async () => {
    const gemini = fake(GEMINI_OK);
    const chain = withGeminiAfterClaude(fake(error, "claude").client, gemini.client, OPTS);
    assert.equal((await chain.complete(SCAMMER)).text, "Gemini 응답");
    assert.equal(gemini.inputs.length, 1);
  });
}

test("[§103 표] Claude가 쓸 수 없는 대사(영어 거절문)를 내면 → Gemini 2차", async () => {
  const gemini = fake(GEMINI_OK);
  const claude = fake({ text: "I'm sorry, but I can't help with that.", isMock: false }, "claude");
  const chain = withGeminiAfterClaude(claude.client, gemini.client, OPTS);
  assert.equal((await chain.complete(SCAMMER)).text, "Gemini 응답");
});

test("[§103 표] 바깥 신호가 이미 끊겼으면 2차를 부르지 않는다", async () => {
  const gemini = fake(GEMINI_OK);
  const controller = new AbortController();
  controller.abort();
  const chain = withGeminiAfterClaude(fake(new Error("aborted"), "claude").client, gemini.client, OPTS);
  await assert.rejects(chain.complete({ ...SCAMMER, signal: controller.signal }));
  assert.equal(gemini.inputs.length, 0);
});

test("[§103 표] 예산 부족(경과 + 최소 시도 > 예산)이면 2차를 부르지 않는다", async () => {
  let t = 0;
  const gemini = fake(GEMINI_OK);
  const slow: LlmClient = {
    providerName: "claude",
    async complete() {
      t = 5500;
      throw new Error("late");
    },
  };
  const chain = withGeminiAfterClaude(slow, gemini.client, { ...OPTS, now: () => t });
  await assert.rejects(chain.complete(SCAMMER), /late/);
  assert.equal(gemini.inputs.length, 0);
});

test("[§103 표] Gemini 2차도 실패하면 그 에러를 던진다(3차 Groq 판정은 groqFallback이 한다)", async () => {
  const geminiError = Object.assign(new Error("503"), { status: 503 });
  const chain = withGeminiAfterClaude(fake(new Error("x"), "claude").client, fake(geminiError).client, OPTS);
  await assert.rejects(chain.complete(SCAMMER), (e) => e === geminiError);
});

test("[§103] Claude 단계 상한 — 응답이 늦으면 요청을 취소하고 2차가 답한다", async () => {
  let aborted = false;
  const hanging: LlmClient = {
    providerName: "claude",
    complete(input) {
      return new Promise((_, reject) => {
        input.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("AbortError"));
        });
      });
    },
  };
  const chain = withGeminiAfterClaude(
    withStageDeadline(tagServedBy(hanging, "claude-primary"), 30),
    tagServedBy(fake(GEMINI_OK).client, "gemini-fallback"),
    OPTS,
  );
  const result = await chain.complete(SCAMMER);
  assert.equal(result.servedBy, "gemini-fallback");
  assert.ok(aborted, "늦은 Claude 요청은 취소된다(중복 생성 방지)");
});

test("[§103 사슬] Claude 실패 → Gemini 2차가 쓸 수 없는 대사 → 3차 Groq가 답한다(llm/index.ts와 같은 조립)", async () => {
  const groq = fake({ text: "헐 내 번호 저장 안 했어?", isMock: false }, "groq");
  const firstTwo = withGeminiAfterClaude(
    fake(Object.assign(new Error("overloaded"), { status: 529 }), "claude").client,
    tagServedBy(fake({ text: "I'm sorry, but I can't comply with that.", isMock: false }).client, "gemini-fallback"),
    OPTS,
  );
  const chain = withGroqFallback(withStageDeadline(firstTwo, 7000), groq.client, { budgetMs: 10_000, minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS });
  const result = await chain.complete(SCAMMER);
  assert.equal(result.servedBy, "groq");
  assert.equal(result.text, "헐 내 번호 저장 안 했어?");
});

// ── 3. 용도별 라우팅 · 예산 · 시크릿 ──────────────────────────────────────────────────────────

test("[§103] 라우팅 — 사기범 대사만 Claude 체인, 그 밖은 기존 체인 · providerName은 기존 체인 것(G176)", async () => {
  const legacy = fake({ text: "기존", isMock: false }, "gemini");
  const scammer = fake({ text: "사기범", isMock: false }, "claude");
  const routed = routeScammerReply(legacy.client, scammer.client);
  assert.equal(routed.providerName, "gemini");
  assert.equal((await routed.complete(SCAMMER)).text, "사기범");
  assert.equal((await routed.complete({ systemPrompt: "(judge)", messages: [] })).text, "기존");
  assert.equal(scammer.inputs.length, 1);
  assert.equal(legacy.inputs.length, 1);
});

test("[§103] 예산 — 일반 턴 Claude 5초 상한이 실측 p95(3.59초)보다 크고, 2차에 최소 시도 시간이 남는다", () => {
  const stageMs = LLM_TIMEOUT_MS - GROQ_RESERVE_MS - CLAUDE_GEMINI_RESERVE_MS;
  assert.equal(stageMs, 5000);
  assert.ok(stageMs > 3590);
  assert.ok(CLAUDE_GEMINI_RESERVE_MS >= LLM_OVERLOAD_MIN_ATTEMPT_MS, "2차 시도가 예산 부족으로 생략되지 않는다");
});

test("[§103] 시크릿 — LLM_TEXT_SECRETS에 CLAUDE_API_KEY가 있고, Gemini 키 순환 목록에는 섞이지 않는다", () => {
  assert.ok(LLM_TEXT_SECRETS.includes(CLAUDE_API_KEY));
  assert.equal((GEMINI_KEY_SECRETS as readonly unknown[]).includes(CLAUDE_API_KEY), false);
  assert.equal(CLAUDE_API_KEY.name, "CLAUDE_API_KEY");
});
