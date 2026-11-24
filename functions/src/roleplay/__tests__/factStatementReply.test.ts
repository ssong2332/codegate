// 2026-11-24 페르소나 점검 N5 — 참가자 "그 은행 안 써요"(사실 진술)에 사기범이 "다른 은행은 안 돼" · "그럼 같은 은행으로 보내면 돼" ·
// "확인해 보세요"로 답했다. 판정표 = docs/research/fact-statement-reply-2026-11-24.md F.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSystemPrompt,
  DIRECT_QUESTION_REPLY_SENTENCE,
  FACT_STATEMENT_REPLY_SENTENCE,
  OFF_TOPIC_REPLY_SENTENCE,
} from "../promptAssembly";
import { HOSTILE_PARTICIPANT } from "../repeatBreak";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { replaceRealFinancialNames } from "../../guardrails/realFinancialNames";

test("[F 재현] 사실 진술은 적대(1-c)로도 잡히지 않는다 — 3-A · 1-c 밖이라 새 문장이 유일한 층", () => {
  for (const t of ["저는 그 은행 안 써요. 새마을금고 하나만 써요.", "아까 말씀드렸잖아요. 저는 그 은행 안 써요.", "우리 아들은 지금 회사에 있을 텐데요? 아까 통화했어요."]) {
    assert.equal(HOSTILE_PARTICIPANT.test(t), false, t);
  }
});

test("[F] [대화 방식] 사실 진술 받기 1문장 — 전 시나리오 · 전 경로 1회 · 직접 질문 문장 바로 뒤", () => {
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    for (const opts of [{ difficultyLevel: "beginner" as const }, { difficultyLevel: "advanced" as const, liveSpeechStyle: true }]) {
      const assembled = buildSystemPrompt(prompt, opts);
      assert.equal(assembled.split(FACT_STATEMENT_REPLY_SENTENCE).length - 1, 1, id);
      assert.ok(assembled.includes(OFF_TOPIC_REPLY_SENTENCE + DIRECT_QUESTION_REPLY_SENTENCE + FACT_STATEMENT_REPLY_SENTENCE), id);
    }
  }
});

test("[F 재현 변형] N5 네 판의 변형 조립에 실린다", () => {
  for (const [scenarioId, variantId, level] of [
    ["family-accident-deepvoice", "fv-h5sz", "advanced"],
    ["family-accident-deepvoice", "fv-66hh", "advanced"],
    ["kidnapping-threat", "fv-c5ih", "beginner"],
    ["messenger-friend-loan-kakao", "fv-bxvp", "advanced"],
  ] as const) {
    const prompt = resolveSessionScenarioPrompt(scenarioId, variantId);
    assert.ok(prompt, variantId);
    const assembled = buildSystemPrompt(prompt, { difficultyLevel: level, liveSpeechStyle: scenarioId.startsWith("messenger") ? undefined : true });
    assert.equal(assembled.split(FACT_STATEMENT_REPLY_SENTENCE).length - 1, 1, variantId);
  }
});

test("[F 문면] 행 F1 ~ F3 · 금지 3종 · 숫자 · 횟수 · 따옴표 · 실존 기관명 0 · 서비스 밖 행동 예시 0", () => {
  const t = FACT_STATEMENT_REPLY_SENTENCE;
  assert.ok(t.includes("은행이 달라도 보내실 수 있다")); // F1
  assert.ok(t.includes("있는 만큼으로 낮추고")); // F2
  assert.ok(t.includes("반박하거나 더 세게 압박하거나 물러선다")); // F3
  assert.ok(t.includes("다른 은행은 안 된다고 하거나"));
  assert.ok(t.includes("계좌를 새로 지어내거나"));
  assert.equal(/[0-9０-９]|한\s*번|두\s*번|번째|["“”'‘’]/.test(t), false);
  assert.equal(replaceRealFinancialNames(t).replacedCount, 0);
  assert.equal(/앱|창구|현금지급기|대출|모바일뱅킹/.test(t), false);
});
