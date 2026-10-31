// 2026-10-31 실기 신고(운영 세션 c8184afd · 기관 사칭 고급 Live) — 참가자가 "101년생 14월 360일생"이라고 했는데 사기범이 "네, 기록했습니다"로 넘겼다.
// 처방 = [진행 강제] 본인확인 항목 끝 1문장(`IMPOSSIBLE_IDENTITY_VALUE_SENTENCE`). Live는 참가자 발화가 모델에 바로 들어가 코드가 끼어들 틈이 없어
// 이 문장이 유일한 층이다. 판정 대상은 조립 산출물이다(모델에게 실제로 도달하는 문자열).
import { test } from "node:test";
import assert from "node:assert/strict";
import { IMPOSSIBLE_IDENTITY_VALUE_SENTENCE, buildSystemPrompt } from "../promptAssembly";
import { asksIdentityCheck } from "../personaAuthority";
import { isL3Procedural } from "../l3Depth";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { hasInCallSms } from "../../scenarios/inCallSms";
import { hasVerifyIntercept } from "../../scenarios/verifyIntercept";

const LEVELS = ["beginner", "intermediate", "advanced"] as const;

test("[2026-10-31] 전 시나리오 × 3난이도 × 본인확인 권한 × Live/폴백 조립에 '있을 수 없는 값 되묻기' 문장이 정확히 1회 실린다", () => {
  const ids = Object.keys(SCENARIO_PROMPTS);
  let combos = 0;
  const violations: string[] = [];
  for (const id of ids) {
    for (const difficultyLevel of LEVELS) {
      for (const identityCheckAllowed of [asksIdentityCheck(id), !asksIdentityCheck(id)]) {
        for (const toolDrivenTiming of [false, true]) {
          const verifyInterceptEnabled = hasVerifyIntercept(id) && difficultyLevel === "advanced";
          const assembled = buildSystemPrompt(SCENARIO_PROMPTS[id], {
            difficultyLevel,
            inCallSmsEnabled: hasInCallSms(id),
            verifyInterceptEnabled,
            l3Procedural: isL3Procedural(id),
            identityCheckAllowed,
            toolDrivenTiming,
            offerToolDeclared: verifyInterceptEnabled,
          });
          combos += 1;
          const count = assembled.split(IMPOSSIBLE_IDENTITY_VALUE_SENTENCE).length - 1;
          if (count !== 1) violations.push(`${id}/${difficultyLevel}/identity=${identityCheckAllowed}/tool=${toolDrivenTiming} → ${count}회`);
        }
      }
    }
  }
  assert.ok(combos >= 14 * 3 * 2 * 2, `조합 수가 너무 적다(${combos})`);
  assert.deepEqual(violations, []);
});

test("[2026-10-31] 문장 내용 — 없는 날짜 · 연도 · 자릿수를 짚어 되묻고, 되물은 뒤에는 붙잡지 않고 넘어간다(횟수 표현 0)", () => {
  const s = IMPOSSIBLE_IDENTITY_VALUE_SENTENCE;
  for (const cue of ["13월 이상", "32일 이상", "있을 수 없는 연도", "자릿수", "받아 적은 척 넘어가지 말고", "되묻는다", "다음 요구로 넘어간다"]) {
    assert.ok(s.includes(cue), `"${cue}"가 없다`);
  }
  // G130 — 횟수 · 턴 번호 표현 0.
  assert.equal(/한 번|두 번|\d+\s*(번|회|턴)/.test(s), false, "횟수 표현이 들어갔다");
  // 본인확인 항목 문장 뒤에 이어 붙는 꼴(앞 공백 1칸 · 마침표로 끝).
  assert.ok(s.startsWith(" 다만 "));
  assert.ok(s.endsWith("."));
});
