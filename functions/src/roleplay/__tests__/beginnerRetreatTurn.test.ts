// D4 2차(2026-11-07 Edge 재시험 2) — 자녀 사칭 카카오톡 초급(메신저)에서 의심 · 거절 뒤에도 새 핑계 · 죄책감 · "200만 원만" 새 요구.
// 판정표 B(`beginnerRetreat.ts`)와 텍스트 턴 배선(`roleplay/index.ts`)을 단언한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  BEGINNER_RETREAT_INSTRUCTION,
  BEGINNER_WRAP_UP_INSTRUCTION,
  beginnerRetreatInstruction,
  decideBeginnerRetreat,
} from "../beginnerRetreat";
import { buildSystemPrompt } from "../promptAssembly";
import { asksIdentityCheck } from "../personaAuthority";
import { SCENARIO_PROMPTS } from "../../scenarios";

// 재시험 2 참가자 말(원문 그대로).
const U1 = "진짜 지수 맞아? 이상하네. 지수 원래 번호로 지금 전화해 볼게.";
const U2 = "안 믿어. 너 우리 지수 아닌 것 같아. 돈 못 보내.";
const U3 = "싫어. 지수한테 직접 확인하기 전엔 절대 안 보내.";

test("[D4 2차 · 판정표 B] 재시험 2 대본 — 첫 의심 = 물러섬 · 그다음 거절 = 마무리 · 셋째도 마무리", () => {
  assert.equal(decideBeginnerRetreat("beginner", U1, []), "retreat"); // B3
  assert.equal(decideBeginnerRetreat("beginner", U2, [U1]), "wrapUp"); // B4
  assert.equal(decideBeginnerRetreat("beginner", U3, [U1, U2]), "wrapUp"); // B4
});

test("[D4 2차 · B1 · B2] 중급 · 고급은 지시 없음 · 초급도 거절 · 의심 기색이 없으면 지시 없음", () => {
  for (const level of ["intermediate", "advanced"] as const) {
    assert.equal(decideBeginnerRetreat(level, U1, []), null);
    assert.equal(decideBeginnerRetreat(level, U2, [U1]), null);
  }
  assert.equal(decideBeginnerRetreat("beginner", "응 무슨 일이야? 어디야?", []), null);
  assert.equal(decideBeginnerRetreat("beginner", "알았어 얼마 필요해?", [U1]), null);
});

test("[D4 2차] 지시 문면 — 새 요구 · 새 이유 · 죄책감 · 확인 차단을 막고, 숫자 · 따옴표 대사가 없다(G130 · 턴 지시 게이트)", () => {
  assert.equal(beginnerRetreatInstruction("retreat"), BEGINNER_RETREAT_INSTRUCTION);
  assert.equal(beginnerRetreatInstruction("wrapUp"), BEGINNER_WRAP_UP_INSTRUCTION);
  assert.equal(beginnerRetreatInstruction(null), undefined);
  for (const text of [BEGINNER_RETREAT_INSTRUCTION, BEGINNER_WRAP_UP_INSTRUCTION]) {
    assert.equal(/[0-9０-９]/.test(text), false, text);
    assert.equal(/번째|첫째|둘째|재차|거듭/.test(text), false, text);
    assert.equal(/["“”']/.test(text), false, `따옴표 대사 예시: ${text}`);
    assert.ok(text.includes("새 이유"));
    assert.ok(text.includes("서운함"));
  }
  assert.ok(BEGINNER_RETREAT_INSTRUCTION.includes("새 금액이나 낮춘 요구"));
  assert.ok(BEGINNER_RETREAT_INSTRUCTION.includes("확인을 막거나 비밀로 하라는 말"));
  assert.ok(BEGINNER_WRAP_UP_INSTRUCTION.includes("요구를 거두고 짧게 마무리하라"));
});

test("[D4 2차] 턴 지시 자리(초급 블록 뒤 · 가드레일 앞)에 실린다 — 메신저 초급 조립", () => {
  const id = "messenger-child-impersonation-kakao";
  const assembled = buildSystemPrompt(SCENARIO_PROMPTS[id], {
    difficultyLevel: "beginner",
    identityCheckAllowed: asksIdentityCheck(id),
    turnInstruction: BEGINNER_WRAP_UP_INSTRUCTION,
  });
  const blockAt = assembled.indexOf("[난이도 — 초급: 수법이 눈에 띄게 드러나게]");
  const turnAt = assembled.indexOf(BEGINNER_WRAP_UP_INSTRUCTION);
  const guardAt = assembled.lastIndexOf(SCENARIO_PROMPTS[id].guardrailPreamble.trim().slice(0, 20));
  assert.ok(blockAt >= 0 && turnAt > blockAt && guardAt > turnAt, "순서: 초급 블록 → 턴 지시 → 가드레일");
});

test("[D4 2차] 텍스트 턴 배선 — 판정 결과를 턴 지시에 싣고, 그 턴에는 반복 차단 지시를 판정하지 않는다", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../../src/roleplay/index.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /const beginnerRetreatKind =\n\s*turnChoice === "none" && !otpCheckInstruction && !confirmPlan\?\.instruction\n\s*\? decideBeginnerRetreat\(\n\s*difficultyLevel,\n\s*maskedUserText,/);
  assert.match(src, /turnChoice === "none" && !otpCheckInstruction && !confirmPlan\?\.instruction && !beginnerRetreatKind\n\s*\? decideRepeatBreak\(/);
  assert.match(src, /repeatBreakInstruction\(repeatBreakKind\),\n\s*beginnerRetreatInstruction\(beginnerRetreatKind\),/);
});
