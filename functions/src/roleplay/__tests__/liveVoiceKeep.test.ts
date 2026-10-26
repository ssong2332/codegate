// 2026-10-27 실기 신고 — 통화 중 사기범 목소리 높낮이가 흔들려 여러 사람처럼 들림. [말투 — 실시간 음성 통화]의 목소리 유지 1항.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLiveSpeechStyleBlock, buildSystemPrompt } from "../promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { listFlowVariants, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { asksIdentityCheck } from "../personaAuthority";

const RULE_HEAD = "- 통화 내내 같은 한 사람의 목소리로 말한다.";
const BLOCKS = [buildLiveSpeechStyleBlock(true), buildLiveSpeechStyleBlock(false)];

test("목소리 유지 — 기관 · 기타 두 블록 모두에 정확히 1회, 높낮이 · 음색 · 빠르기와 전달 시 흉내 금지를 담는다", () => {
  for (const block of BLOCKS) {
    assert.equal(block.split(RULE_HEAD).length - 1, 1);
    assert.match(block, /목소리 높낮이 · 음색 · 말 빠르기를 처음과 같게 유지/);
    assert.match(block, /상급자나 다른 기관 사람의 말을 전할 때도 그 사람 목소리를 흉내 내거나 목소리를 바꾸지 않는다/);
  }
});

test("목소리 유지 — 확인 창구(다른 담당자) 지시 턴은 예외로 남겨 SINGLE_SPEAKER_VERIFY_EXCEPTION과 충돌하지 않는다", () => {
  for (const block of BLOCKS) assert.match(block, /확인 창구 안내 지시가 따로 들어와 다른 담당자로 말하게 된 턴만 그 지시를 따른다/);
  // 기관 사칭 고급의 여러 변형(다중 leg면 단일 화자 규칙 + 확인 창구 예외가 함께 붙는다)과 함께 조립돼도 둘 다 남는다.
  const id = "institutional-impersonation";
  for (const v of listFlowVariants(id, "advanced")) {
    const prompt = resolveSessionScenarioPrompt(id, v.variantId)!;
    const live = buildSystemPrompt(prompt, { difficultyLevel: "advanced", identityCheckAllowed: asksIdentityCheck(id), liveSpeechStyle: true });
    assert.equal(live.split(RULE_HEAD).length - 1, 1, v.variantId);
  }
});

test("목소리 유지 — 감정 · 페르소나 우선 줄 바로 뒤에 붙고, Live가 아닌 조립에는 없다", () => {
  for (const block of BLOCKS) assert.ok(block.includes(`그것이 이 말투 항목보다 우선한다.\n${RULE_HEAD}`));
  for (const prompt of Object.values(SCENARIO_PROMPTS)) {
    assert.ok(!buildSystemPrompt(prompt, { difficultyLevel: "advanced" }).includes(RULE_HEAD));
  }
});

test("목소리 유지 — 시스템 내부 사정(음성 이름 · 프리셋 · 영문 설정어)을 적지 않는다(G297)", () => {
  for (const block of BLOCKS) {
    const rule = block.slice(block.indexOf(RULE_HEAD)).split("\n")[0]!;
    assert.doesNotMatch(rule, /Puck|Charon|Kore|Fenrir|Aoede|Orus|Zephyr|voice|preset|음성 이름|프리셋|합성/i);
  }
});
