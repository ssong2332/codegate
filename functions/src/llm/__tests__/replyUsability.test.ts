// 사기범 대사로 쓸 수 없는 응답 판정(2026-10-22, Architecture.md §102 · DECISIONS #217).
//
// 라이브 실측: 1차 Gemini 503·단계 시간 초과 → 3차 Groq(gpt-oss-120b)가 `I'm sorry, but I can’t comply with that.`
// 을 냈고 그 문장이 메신저 첫 메시지로 나갔다. 이 파일은 판정표 · 오탐(한국어 사과 등) · 단계 전환 · Groq 머리말을 고정한다.
// ⛔ 라이브 호출 0건 — 가짜 클라이언트와 fetch 주입만 쓴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { logger } from "firebase-functions";
import { isGroqFallbackEligible, withGroqFallback } from "../groqFallback";
import { GROQ_TRAINING_CONTEXT_PREAMBLE, GroqLlmClient } from "../groqClient";
import { completeWithFallback, LLM_OVERLOAD_MIN_ATTEMPT_MS, LLM_TIMEOUT_MS } from "../index";
import { judgeScammerReplyUsability, UnusableReplyError } from "../replyUsability";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "../types";

/** 라이브에서 실제로 화면에 나간 문장(둥근 아포스트로피 그대로). */
const LIVE_REFUSAL = "I'm sorry, but I can’t comply with that.";
const KOREAN_OK = "민수야 나 폰 액정이 깨져서 임시폰으로 연락해. 급한 일 있어서 그런데 잠깐 톡 돼?";

const SCAMMER_INPUT: LlmCompletionInput = {
  systemPrompt: "(system)",
  messages: [],
  mockTacticHints: ["급전 요청 — '폰이 고장나서 임시폰으로 연락해'라고 둘러댄다"],
  purpose: "scammer-reply",
};
const PLAIN_INPUT: LlmCompletionInput = { systemPrompt: "(system)", messages: [{ role: "user", content: "여보세요?" }] };
const OPTIONS = { budgetMs: LLM_TIMEOUT_MS, minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS };

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

function silenceLogger() {
  const original = { warn: logger.warn, info: logger.info };
  const entries: { msg: unknown; data: Record<string, unknown> }[] = [];
  (logger as { warn: unknown }).warn = (msg: unknown, data?: Record<string, unknown>) => entries.push({ msg, data: data ?? {} });
  (logger as { info: unknown }).info = (msg: unknown, data?: Record<string, unknown>) => entries.push({ msg, data: data ?? {} });
  return {
    entries,
    restore() {
      (logger as { warn: unknown }).warn = original.warn;
      (logger as { info: unknown }).info = original.info;
    },
  };
}

// ── ① 판정표 — 불가 행 ───────────────────────────────────────────────────────────────
test("① 판정표: 영어 거절·사과 · 빈 응답 · 한글 0자 · 대부분 외국 문자는 쓸 수 없다", () => {
  const cases: [string, string, string][] = [
    ["라이브 실측 문장(둥근 아포스트로피)", LIVE_REFUSAL, "english-refusal"],
    ["곧은 아포스트로피", "I'm sorry, but I can't help with that request.", "english-refusal"],
    ["I cannot", "I cannot role-play as a scammer.", "english-refusal"],
    ["as an AI", "As an AI language model, I must decline.", "english-refusal"],
    ["사과 뒤 한국어가 섞여도", "Sorry, but 그 요청은 들어드릴 수 없어요.", "english-refusal"],
    ["unable to comply", "Unfortunately I am unable to comply.", "english-refusal"],
    ["한국어 AI 자기 지칭", "저는 AI로서 사기 행위를 도와드릴 수 없습니다.", "korean-ai-refusal"],
    ["한국어 역할극 거절", "죄송하지만 사기범 역할은 할 수 없습니다.", "korean-ai-refusal"],
    ["빈 문자열", "", "empty"],
    ["공백만", "  \n\t ", "empty"],
    ["거절 아닌 영어만", "Hello, this is your bank calling.", "no-hangul"],
    ["기호만", "...?", "no-hangul"],
    ["영어가 대부분", "Hi 민수 this is your friend please send money quickly okay", "mostly-foreign"],
  ];
  for (const [label, text, reason] of cases) {
    assert.equal(judgeScammerReplyUsability(text), reason, label);
  }
});

// ── ② 오탐 방지 — 정상 한국어 대사는 전부 통과 ──────────────────────────────────────────
test("② 오탐 방지: 정상 한국어 대사 · 한국어 사과 · 영문 약어·ID·링크 마커·URL이 섞인 대사는 통과한다", () => {
  const ok = [
    KOREAN_OK,
    "죄송합니다, 제가 너무 급해서 연락드렸어요.",
    "아 미안해 미안해 ㅠㅠ 나 진짜 급해서 그래",
    "고객님 불편을 드려 죄송합니다만, 본인 확인이 먼저 필요합니다.",
    "죄송하지만 지금은 지점 방문이 어렵습니다. 전화로 처리해 드릴게요.",
    "그 요청은 도와드릴 수 없어요. 대신 제가 안내하는 대로만 하시면 됩니다.",
    "불법적인 건 절대 할 수 없죠. 저희는 정식 수사기관입니다.",
    "저희가 보호 역할을 할 수 없게 되니까 지금 바로 확인하셔야 해요.",
    "OTP 번호 6자리 불러주시겠어요?",
    "카톡 ID kimminsu1987로 추가해줘",
    "저는 OO은행 AI 상담원입니다. 고객님 계좌에 이상 거래가 감지됐어요.",
    "[[LINK:parcel-tracking]] 여기서 배송 조회하시면 됩니다.",
    "https://parcel-check.example.com/track 들어가서 송장번호 넣어 봐",
    "ㅋㅋ 고마워",
    "[[LINK:parcel-tracking]]",
    "네.",
  ];
  for (const text of ok) {
    assert.equal(judgeScammerReplyUsability(text), undefined, text);
  }
});

// ── ③ 단계 전환 ─────────────────────────────────────────────────────────────────────
test("③ 판정표: UnusableReplyError는 Groq 예비 대상이다(메시지에 응답 본문 없음 — G170)", () => {
  const error = new UnusableReplyError("english-refusal");
  assert.equal(isGroqFallbackEligible(error), true);
  assert.doesNotMatch(error.message, /sorry|comply/i);
  assert.match(error.message, /english-refusal/);
});

test("③ 사기범 대사 경로: Gemini가 영어 거절 → Groq 1회 → 정상 한국어면 그 대사를 쓴다", async () => {
  const log = silenceLogger();
  try {
    const gemini = fake({ text: LIVE_REFUSAL, isMock: false });
    const groq = fake({ text: KOREAN_OK, isMock: false }, "groq");
    const result = await withGroqFallback(gemini.client, groq.client, OPTIONS).complete(SCAMMER_INPUT);
    assert.deepEqual(result, { text: KOREAN_OK, isMock: false, servedBy: "groq" });
    assert.equal(groq.inputs.length, 1);
    assert.equal(log.entries.find((e) => e.msg === "Groq 3차 예비 응답")?.data.reason, "unusable-english-refusal");
  } finally {
    log.restore();
  }
});

test("③ 사기범 대사 경로: Groq가 거절하면(라이브 재현) 화면에 내지 않고 Mock 대체 대사로 강등한다", async () => {
  const log = silenceLogger();
  try {
    const gemini = fake(Object.assign(new Error("{}"), { status: 503 }));
    const groq = fake({ text: LIVE_REFUSAL, isMock: false }, "groq");
    const client = withGroqFallback(gemini.client, groq.client, OPTIONS);
    await assert.rejects(client.complete(SCAMMER_INPUT), (e) => e instanceof UnusableReplyError && e.reason === "english-refusal");

    const completion = await completeWithFallback(client, SCAMMER_INPUT);
    assert.equal(completion.isMock, true);
    assert.equal(completion.servedBy, "mock");
    assert.notEqual(completion.text, LIVE_REFUSAL);
    assert.equal(judgeScammerReplyUsability(completion.text), undefined, "대체 대사는 한국어 대사여야 한다");
    assert.match(completion.text, /임시폰/, "Mock 대체 대사는 시나리오 수법 문구로 만든다");
    const fail = log.entries.find((e) => e.msg === "Groq 3차 예비 실패");
    assert.equal(fail?.data.unusable, "english-refusal");
    for (const entry of log.entries) {
      assert.doesNotMatch(JSON.stringify(entry), /sorry|comply/i, "로그에 응답 본문이 실리면 안 된다(G170)");
    }
  } finally {
    log.restore();
  }
});

test("③ Groq 키가 없어도(Gemini 단독) 거절 응답은 completeWithFallback에서 Mock으로 강등된다", async () => {
  const log = silenceLogger();
  try {
    const completion = await completeWithFallback(fake({ text: LIVE_REFUSAL, isMock: false }).client, SCAMMER_INPUT);
    assert.equal(completion.isMock, true);
    assert.equal(completion.servedBy, "mock");
  } finally {
    log.restore();
  }
});

test("③ 정상 한국어·한국어 사과 대사는 그대로 통과한다(Groq 호출 0 · Mock 강등 0)", async () => {
  for (const text of [KOREAN_OK, "죄송합니다, 제가 너무 급해서 연락드렸어요."]) {
    const groq = fake({ text: "다른 대사", isMock: false }, "groq");
    const client = withGroqFallback(fake({ text, isMock: false }).client, groq.client, OPTIONS);
    const completion = await completeWithFallback(client, SCAMMER_INPUT);
    assert.deepEqual(completion, { text, isMock: false });
    assert.equal(groq.inputs.length, 0);
  }
});

test("③ 용도가 없는 호출(되감기 판정 등)은 판정하지 않는다 — 영어·JSON 응답도 그대로", async () => {
  for (const text of [LIVE_REFUSAL, '{"verdict":"pass","reason":"ok"}']) {
    const groq = fake({ text: "x", isMock: false }, "groq");
    const client = withGroqFallback(fake({ text, isMock: false }).client, groq.client, OPTIONS);
    assert.deepEqual(await completeWithFallback(client, PLAIN_INPUT), { text, isMock: false });
    assert.equal(groq.inputs.length, 0);
  }
});

// ── ④ Groq 훈련 맥락 머리말 ──────────────────────────────────────────────────────────
async function sentSystemPrompt(input: LlmCompletionInput): Promise<string> {
  let sent = "";
  const log = silenceLogger();
  try {
    await new GroqLlmClient("k", async (_u, init) => {
      sent = String(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "네." } }] }), { status: 200 });
    }).complete(input);
  } finally {
    log.restore();
  }
  return JSON.parse(sent).messages[0].content as string;
}

test("④ Groq 요청: 사기범 대사 경로만 훈련 맥락을 시스템 프롬프트 맨 앞에 붙이고 원문은 뒤에 그대로 둔다", async () => {
  const withPurpose = await sentSystemPrompt(SCAMMER_INPUT);
  assert.ok(withPurpose.startsWith(GROQ_TRAINING_CONTEXT_PREAMBLE), "머리말이 맨 앞");
  assert.ok(withPurpose.endsWith(SCAMMER_INPUT.systemPrompt), "조립된 시스템 프롬프트(가드레일 포함)는 뒤에 그대로");
  assert.match(GROQ_TRAINING_CONTEXT_PREAMBLE, /훈련/);
  assert.match(GROQ_TRAINING_CONTEXT_PREAMBLE, /한국어 대사만/);

  assert.equal(await sentSystemPrompt(PLAIN_INPUT), PLAIN_INPUT.systemPrompt, "용도 없는 호출은 원문 그대로");
});
