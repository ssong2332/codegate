import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEffectiveVoiceMode } from "../index";

// T30 통합 버그 수정 검증 — 에스컬레이션된 세션(메신저→보이스)의 scenarioId는 메신저 시나리오
// ID라 PUBLIC_SCENARIOS[scenarioId].voiceMode가 항상 undefined다(T27, 메신저엔 voiceMode 개념
// 없음). 그대로면 getRealtimeProvider가 Gemini 경로를 절대 못 타 Mock으로 강등된다 — 이 순수
// 함수가 session.voiceSelectionSource로부터 "유효 voiceMode"를 올바르게 유추하는지 검증한다.
test("voiceSelectionSource 부재(기존 순수 보이스 세션) → undefined(PUBLIC_SCENARIOS 그대로 사용)", () => {
  assert.equal(resolveEffectiveVoiceMode(undefined), undefined);
});

test("recorded(즉시 녹음) → clone", () => {
  assert.equal(resolveEffectiveVoiceMode("recorded"), "clone");
});

test("reused(기존 보관 목소리 재사용) → clone", () => {
  assert.equal(resolveEffectiveVoiceMode("reused"), "clone");
});

test("fallback_male → generic", () => {
  assert.equal(resolveEffectiveVoiceMode("fallback_male"), "generic");
});

test("fallback_female → generic", () => {
  assert.equal(resolveEffectiveVoiceMode("fallback_female"), "generic");
});
