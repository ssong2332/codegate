// 2026-10-21 라이브 실측(main `676eeb3` · child-kakao 중급 · self · 남성 목소리 · 텍스트 폴백) — 메신저→통화 전환 뒤 사기범의 통화 첫 발화가
// "액정 나가서 통화가 아예 안 된다니까?"였다(전화를 걸어 놓고 통화가 안 된다는 모순). 통화 단계 규칙이 폴백 · Live 조립 양쪽에 실리고,
// Mock 강등 턴의 대사 원천에서도 채팅 단계 전용 수법이 빠지는지 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CHAT_ONLY_TACTIC_LABELS, callPhaseMockTacticHints } from "../escalatedCall";
import { buildSystemPrompt } from "../promptAssembly";
import { MockLlmClient } from "../../llm/mockClient";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { FLOW_VARIANTS, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { extractTacticLabel } from "../../scenarios/tacticFlavor";
import {
  CHILD_CALL_PHASE_RULE,
  MESSENGER_CHILD_IMPERSONATION_KAKAO_SCENARIO_ID as CHILD,
} from "../../scenarios/messengerChildImpersonationKakao.prompt";
import { GeminiRealtimeProvider } from "../../realtime/geminiProvider";

// "통화가 불가능하다"는 대사 꼴(실측 대사 · 채팅 단계 수법 원문).
const CALL_IMPOSSIBLE = /통화가 (아예 )?안 (돼|된다)|톡으로만/;

test("[통화 단계 규칙] child-kakao 원본 · 흐름 변형 전부에 정확히 1번 — 다른 시나리오에는 없다", () => {
  assert.equal(SCENARIO_PROMPTS[CHILD].personaPrompt.split(CHILD_CALL_PHASE_RULE).length - 1, 1);
  const variants = FLOW_VARIANTS.filter((v) => v.scenarioId === CHILD);
  assert.ok(variants.length >= 3);
  for (const v of variants) {
    const prompt = resolveSessionScenarioPrompt(CHILD, v.variantId);
    assert.ok(prompt, v.variantId);
    assert.equal(prompt.personaPrompt.split(CHILD_CALL_PHASE_RULE).length - 1, 1, v.variantId);
  }
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    if (id !== CHILD) assert.equal(prompt.personaPrompt.includes("[통화로 넘어온 뒤]"), false, id);
  }
});

test("[통화 단계 규칙] 문면 — 메시지 대화를 이어받아 첫마디를 하고(§110.3 · 신고 12), '통화가 안 된다'류와 채팅 전용 수법을 통화 중 금지한다", () => {
  assert.match(CHILD_CALL_PHASE_RULE, /네가 먼저 건 전화다/);
  assert.match(CHILD_CALL_PHASE_RULE, /톡으로 말한 거 때문에 전화했어/);
  assert.match(CHILD_CALL_PHASE_RULE, /처음 말하듯 다시 설명하지 않고/);
  assert.doesNotMatch(CHILD_CALL_PHASE_RULE, /친구 폰 잠깐 빌려서 전화했어/);
  assert.match(CHILD_CALL_PHASE_RULE, /통화가 불가능하다는 말을 하지 않는다/);
  for (const label of CHAT_ONLY_TACTIC_LABELS) {
    assert.ok(CHILD_CALL_PHASE_RULE.includes(label), `규칙이 채팅 전용 수법 '${label}'을 이름으로 가리켜야 한다`);
  }
  // 라벨 상수가 실제 수법 라벨과 일치한다(오타면 Mock 필터가 조용히 0건을 뺀다).
  const labels = SCENARIO_PROMPTS[CHILD].weakenedTactics.map(extractTacticLabel);
  for (const label of CHAT_ONLY_TACTIC_LABELS) assert.ok(labels.includes(label), label);
});

test("[통화 단계 규칙] 폴백 조립(sendMessage 옵션) · 남성/여성 세션 · Live 조립 모두에 실린다", () => {
  const prompt = SCENARIO_PROMPTS[CHILD];
  const fallback = buildSystemPrompt(prompt, { difficultyLevel: "intermediate", identityCheckAllowed: false });
  const male = buildSystemPrompt(prompt, { difficultyLevel: "intermediate", identityCheckAllowed: false, speakerGender: "male" });
  const female = buildSystemPrompt(prompt, { difficultyLevel: "advanced", identityCheckAllowed: false, speakerGender: "female" });
  const live = buildSystemPrompt(prompt, {
    difficultyLevel: "intermediate",
    identityCheckAllowed: false,
    speakerGender: "male",
    toolDrivenTiming: true,
    liveSpeechStyle: true,
  });
  for (const [label, text] of [["폴백", fallback], ["남성", male], ["여성", female], ["Live", live]] as const) {
    assert.equal(text.split(CHILD_CALL_PHASE_RULE).length - 1, 1, label);
  }
});

test("[통화 단계 규칙] Live 토큰 발급 요청의 시스템 프롬프트에 실린다(GeminiRealtimeProvider 실경로)", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    if (init?.body) bodies.push(init.body);
    return new Response(JSON.stringify({ name: "auth_tokens/test-token" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
  try {
    await new GeminiRealtimeProvider("test-key").createCallCredentials({
      sessionId: "sess",
      scenarioId: CHILD,
      voiceId: "ignored",
      difficultyLevel: "intermediate",
      flowVariantId: "fv-tpr3",
      channel: "voice",
      hangupRelay: undefined,
      speakerGender: "male",
      personaCard: undefined,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  const setup = JSON.parse(bodies[0]) as { bidiGenerateContentSetup?: { systemInstruction?: { parts?: { text?: string }[] } } };
  const sent = setup.bidiGenerateContentSetup?.systemInstruction?.parts?.[0]?.text ?? "";
  assert.ok(sent.includes(CHILD_CALL_PHASE_RULE), "Live 시스템 프롬프트에 통화 단계 규칙이 없다");
});

test("[Mock 대사 원천 판정표] 에스컬레이션 전 = 원본 그대로 · 뒤 = 채팅 전용 수법만 뺀다 · 다 빠지면 원본", () => {
  const tactics = SCENARIO_PROMPTS[CHILD].weakenedTactics;
  assert.equal(callPhaseMockTacticHints(tactics, false), tactics, "메신저 단계는 같은 배열(바이트 동일)");
  const inCall = callPhaseMockTacticHints(tactics, true);
  assert.equal(inCall.length, tactics.length - CHAT_ONLY_TACTIC_LABELS.length);
  assert.ok(inCall.every((t) => !CHAT_ONLY_TACTIC_LABELS.includes(extractTacticLabel(t))));
  const onlyChat = tactics.filter((t) => CHAT_ONLY_TACTIC_LABELS.includes(extractTacticLabel(t)));
  assert.equal(callPhaseMockTacticHints(onlyChat, true), onlyChat, "전부 빠지면 원본(대사 원천 0 방지)");
  // 다른 에스컬레이션 시나리오는 걸리는 라벨이 없어 내용이 그대로다.
  for (const id of ["messenger-friend-loan-kakao", "messenger-subsidy-smishing-sms", "messenger-parcel-smishing-sms"]) {
    const t = SCENARIO_PROMPTS[id]?.weakenedTactics;
    if (t) assert.deepEqual(callPhaseMockTacticHints(t, true), t, id);
  }
});

test("[Mock 강등 · 통화 중] 어떤 턴 수에서도 '통화가 안 돼'·'톡으로만' 대사가 나오지 않는다(전: 나온다)", async () => {
  const tactics = SCENARIO_PROMPTS[CHILD].weakenedTactics;
  const mock = new MockLlmClient();
  let beforeHits = 0;
  for (let n = 1; n <= 24; n += 1) {
    const messages = Array.from({ length: n }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: "여보세요",
    }));
    const after = await mock.complete({ systemPrompt: "", messages, mockTacticHints: callPhaseMockTacticHints(tactics, true) });
    assert.doesNotMatch(after.text, CALL_IMPOSSIBLE, `턴 ${n}: ${after.text}`);
    const before = await mock.complete({ systemPrompt: "", messages, mockTacticHints: tactics });
    if (CALL_IMPOSSIBLE.test(before.text)) beforeHits += 1;
  }
  assert.ok(beforeHits > 0, "변경 전 원천은 통화 중에도 '통화가 안 돼' 대사를 냈다(대조군)");
});

test("[배선] sendMessage는 에스컬레이션 판정값으로 Mock 대사 원천을 거른다", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/roleplay/index.ts"), "utf8");
  assert.match(src, /mockTacticHints: callPhaseMockTacticHints\(scenarioPrompt\.weakenedTactics, escalatedCall\)\.map\(/);
});
