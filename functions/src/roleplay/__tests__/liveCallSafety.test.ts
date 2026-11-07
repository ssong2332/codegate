// 2026-11-07(Edge 시나리오 시험 판 3 · 16 · 23) — Live 전용 [실시간 통화 — 반드시 지킬 것] 블록(L1 표식 · L2 비밀번호 · L3 실제 회사명).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLiveCallSafetyBlock,
  buildSystemPrompt,
  LIVE_CALL_COMPANY_RULE,
  LIVE_CALL_MARKER_RULE,
  LIVE_CALL_PASSWORD_RULE,
  LIVE_CALL_SAFETY_HEAD,
  scenarioUsesControlMarkers,
} from "../promptAssembly";
import {
  BANK_SECURITY_VERIFY_SCAM_SCENARIO_ID,
  COURIER_CUSTOMS_SCAM_SCENARIO_ID,
  MESSENGER_PARCEL_SMISHING_SMS_SCENARIO_ID,
  SCENARIO_PROMPTS,
} from "../../scenarios";
import { asksIdentityCheck } from "../personaAuthority";
import { REAL_COMPANY_NAME_RULES, compileCompanyRule } from "../../guardrails/realCompanyNames";
import type { DifficultyLevel } from "../../shared/difficulty";

const LEVELS: DifficultyLevel[] = ["beginner", "intermediate", "advanced"];

test("회귀 0 — liveSpeechStyle 부재 · false면 전 시나리오 × 3난이도에서 블록이 없다", () => {
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    for (const difficultyLevel of LEVELS) {
      const identityCheckAllowed = asksIdentityCheck(id);
      const base = buildSystemPrompt(prompt, { difficultyLevel, identityCheckAllowed });
      assert.ok(!base.includes(LIVE_CALL_SAFETY_HEAD), `${id}/${difficultyLevel}`);
      assert.equal(buildSystemPrompt(prompt, { difficultyLevel, identityCheckAllowed, liveSpeechStyle: false }), base);
    }
  }
});

test("Live — 전 시나리오에 블록 1회 · [진행 강제] 뒤 · 가드레일 최후미 유지 · L2 · L3는 항상", () => {
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const live = buildSystemPrompt(prompt, { difficultyLevel: "advanced", identityCheckAllowed: asksIdentityCheck(id), liveSpeechStyle: true });
    assert.equal(live.split(LIVE_CALL_SAFETY_HEAD).length - 1, 1, `${id}: 블록 1회`);
    assert.ok(live.indexOf("[진행 강제") < live.indexOf(LIVE_CALL_SAFETY_HEAD), `${id}: [진행 강제] 뒤`);
    assert.ok(live.includes(LIVE_CALL_PASSWORD_RULE), `${id}: L2`);
    assert.ok(live.includes(LIVE_CALL_COMPANY_RULE), `${id}: L3`);
    assert.ok(live.trimEnd().endsWith(prompt.guardrailPreamble.trimEnd()), `${id}: 가드레일 최후미`);
  }
});

test("[판 23] L1 — 겹대괄호 표식을 쓰는 시나리오(메신저 · 문자 → 통화)에만 싣는다", () => {
  const parcel = SCENARIO_PROMPTS[MESSENGER_PARCEL_SMISHING_SMS_SCENARIO_ID];
  assert.ok(scenarioUsesControlMarkers(parcel), "택배 스미싱 문면에 표식이 있다(전제)");
  const parcelLive = buildSystemPrompt(parcel, { difficultyLevel: "advanced", identityCheckAllowed: asksIdentityCheck(MESSENGER_PARCEL_SMISHING_SMS_SCENARIO_ID), liveSpeechStyle: true });
  assert.ok(parcelLive.includes(LIVE_CALL_MARKER_RULE));
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const live = buildSystemPrompt(prompt, { difficultyLevel: "advanced", identityCheckAllowed: asksIdentityCheck(id), liveSpeechStyle: true });
    assert.equal(live.includes(LIVE_CALL_MARKER_RULE), scenarioUsesControlMarkers(prompt), id);
  }
  // 처음부터 통화인 시나리오(택배 통관 · 은행 사칭)는 표식 이야기를 꺼내지 않는다.
  assert.equal(scenarioUsesControlMarkers(SCENARIO_PROMPTS[COURIER_CUSTOMS_SCAM_SCENARIO_ID]), false);
  assert.equal(scenarioUsesControlMarkers(SCENARIO_PROMPTS[BANK_SECURITY_VERIFY_SCAM_SCENARIO_ID]), false);
});

test("[판 3] L2 — 비밀번호를 말로 묻지 말라는 줄이 [진행 강제]의 '계좌 비밀번호' 예시보다 뒤에 있고 우선을 밝힌다", () => {
  const prompt = SCENARIO_PROMPTS[BANK_SECURITY_VERIFY_SCAM_SCENARIO_ID];
  const live = buildSystemPrompt(prompt, { difficultyLevel: "advanced", identityCheckAllowed: asksIdentityCheck(BANK_SECURITY_VERIFY_SCAM_SCENARIO_ID), liveSpeechStyle: true });
  const example = live.indexOf("계좌 비밀번호");
  assert.ok(example >= 0 && example < live.indexOf(LIVE_CALL_PASSWORD_RULE), "예시 뒤에 금지 줄");
  assert.match(LIVE_CALL_PASSWORD_RULE, /우선한다/);
  // 판 33(메인 추가 자료) — 은행 사칭 · 기관 사칭 수법 문면에 "계좌 비밀번호" 예시가 있다(2026-11-07부터 앱 안 본인 인증 입력 유도형). 수법 목록보다도 우선임을 밝힌다.
  assert.ok(live.indexOf("계좌 비밀번호까지") >= 0 && live.indexOf("계좌 비밀번호까지") < live.indexOf(LIVE_CALL_PASSWORD_RULE), "수법 문면 뒤");
  assert.match(LIVE_CALL_PASSWORD_RULE, /수법 목록/);
  for (const difficultyLevel of LEVELS) {
    const p = buildSystemPrompt(prompt, { difficultyLevel, identityCheckAllowed: asksIdentityCheck(BANK_SECURITY_VERIFY_SCAM_SCENARIO_ID), liveSpeechStyle: true });
    assert.ok(p.includes(LIVE_CALL_PASSWORD_RULE), `은행 사칭 ${difficultyLevel}`);
  }
  assert.match(LIVE_CALL_PASSWORD_RULE, /화면에서 인증/);
  assert.match(LIVE_CALL_PASSWORD_RULE, /인증번호는 이 줄의 대상이 아니다/);
});

test("[판 16] L3 — 블록에 실제 회사 이름 예시가 없다(예시가 그 이름을 부르지 않게)", () => {
  const block = buildLiveCallSafetyBlock(true);
  for (const rule of REAL_COMPANY_NAME_RULES) {
    const pattern = compileCompanyRule(rule);
    pattern.lastIndex = 0;
    assert.equal(pattern.test(block), false, rule.label);
  }
});
