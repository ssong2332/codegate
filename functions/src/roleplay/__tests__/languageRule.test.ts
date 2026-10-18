// 언어 고정 규칙(2026-10-18 사용자 신고 — 실시간 통화 중 AI가 갑자기 외국어로 말함) 회귀 테스트.
//
// 근거: Live 네이티브 오디오 모델은 언어 코드 지정을 지원하지 않고, 말하는 언어 제한은 시스템 지시로만 가능하다
// (https://ai.google.dev/gemini-api/docs/live-api/capabilities). ⇒ 문면이 모든 경로의 시스템 프롬프트에 실리는지 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { logger } from "firebase-functions";
import { buildSystemPrompt, LANGUAGE_RULE } from "../promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { GroqLlmClient } from "../../llm/groqClient";

const DIFFICULTIES = [undefined, "beginner", "intermediate", "advanced"] as const;

test("[언어] 규칙 문면: 항상 한국어로만 말하고, 못 알아들었으면 한국어로 되묻는다", () => {
  assert.match(LANGUAGE_RULE, /항상 한국어로만 말한다/);
  assert.match(LANGUAGE_RULE, /다른 언어로 들리거나/);
  assert.match(LANGUAGE_RULE, /알아듣기 어렵/);
  assert.match(LANGUAGE_RULE, /한국어로 되묻는다/);
});

test("[언어] 실측 사례 — \"그래요?\"가 \"creo?\"(스페인어)로 전사돼 모델이 스페인어로 답함: 외국어·뜻 없는 소리는 한국어 짧은 되물음으로 간주하라고 지시한다", () => {
  assert.match(LANGUAGE_RULE, /상대는 한국어로 말하고 있다/);
  assert.match(LANGUAGE_RULE, /외국어 단어나 뜻 없는 소리로 들리면/);
  for (const shortReply of ["그래요?", "네?", "뭐라고요?"]) assert.ok(LANGUAGE_RULE.includes(shortReply), shortReply);
  assert.match(LANGUAGE_RULE, /스페인어/);
  assert.match(LANGUAGE_RULE, /그 언어를 따라가지 말고/);
});

test("[언어] 전 시나리오 × 전 난이도 × Live/텍스트 옵션에서 규칙이 정확히 1번 실리고, 가드레일은 여전히 맨 끝이다", () => {
  const ids = Object.keys(SCENARIO_PROMPTS);
  assert.ok(ids.length >= 10, `시나리오 수집이 ${ids.length}건 — 거짓 초록 방지`);
  let checked = 0;
  for (const id of ids) {
    const scenario = SCENARIO_PROMPTS[id]!;
    for (const difficultyLevel of DIFFICULTIES) {
      for (const toolDrivenTiming of [false, true]) {
        const prompt = buildSystemPrompt(scenario, {
          ...(difficultyLevel ? { difficultyLevel } : {}),
          toolDrivenTiming,
          turnInstruction: "(턴 지시)",
        });
        assert.equal(prompt.split(LANGUAGE_RULE).length - 1, 1, `${id}/${difficultyLevel}/${toolDrivenTiming}: 규칙 1회`);
        assert.ok(
          prompt.indexOf(LANGUAGE_RULE) < prompt.lastIndexOf(scenario.guardrailPreamble),
          `${id}: 규칙은 가드레일 앞`,
        );
        assert.ok(prompt.trimEnd().endsWith(scenario.guardrailPreamble.trimEnd()), `${id}: 가드레일 최후미 불변`);
        checked += 1;
      }
    }
  }
  assert.equal(checked, ids.length * DIFFICULTIES.length * 2);
});

test("[언어] 시스템 프롬프트를 만드는 호출부 3곳(Live 토큰·sendMessage·오프닝)이 모두 buildSystemPrompt를 쓴다 — 우회 경로 0", () => {
  const src = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8");
  assert.match(src("realtime/geminiProvider.ts"), /systemInstruction: systemPrompt/);
  assert.match(src("realtime/geminiProvider.ts"), /const systemPrompt = buildSystemPrompt\(/);
  assert.match(src("roleplay/index.ts"), /systemPrompt: buildSystemPrompt\(/);
  assert.match(src("roleplay/openingLine.ts"), /systemPrompt: buildSystemPrompt\(/);
});

test("[언어] Groq 3차 예비 요청의 system 메시지에도 규칙이 실린다", async () => {
  const systemPrompt = buildSystemPrompt(SCENARIO_PROMPTS["institutional-impersonation"]!, { difficultyLevel: "advanced" });
  let sent = "";
  const original = logger.info;
  (logger as { info: unknown }).info = () => undefined;
  try {
    await new GroqLlmClient("k", async (_u, init) => {
      sent = String(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "네." } }] }), { status: 200 });
    }).complete({ systemPrompt, messages: [{ role: "user", content: "hello?" }] });
  } finally {
    (logger as { info: unknown }).info = original;
  }
  assert.ok((JSON.parse(sent).messages[0].content as string).includes(LANGUAGE_RULE));
});
