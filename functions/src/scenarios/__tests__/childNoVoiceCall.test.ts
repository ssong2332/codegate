// ⭐ A2 ㉠(실기기 신고 2026-11-01 · 사용자 결정 "권고대로") — 메신저 자녀 사칭은 통화로 넘어가지 않는다. 폰 고장 핑계로 목소리를 숨기는 실제 수법과 맞추고,
// 참가자가 건 보이스톡은 받지 않는 연출만 남는다. 다른 메신저 루트의 통화 넘김은 바꾸지 않는다(목록 고정).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_SCENARIOS } from "../publicMeta";
import { resolveScenarioEscalation, resolveSessionEscalation } from "../escalation";
import { FLOW_VARIANTS, resolveSessionScenarioPrompt } from "../flowVariants";
import { findMockScreenItem, isMockScreenReachable } from "../mockScreens";

const CHILD = "messenger-child-impersonation-kakao";
const LEVELS = ["beginner", "intermediate", "advanced"] as const;

test("[A2 ㉠] 자녀 사칭 — 세 난이도 · 챌린지 모두 통화 넘김 없음 · 변형 플래그 0 · 대사 지시에 통화 신호 0", () => {
  for (const level of LEVELS) {
    assert.equal(resolveScenarioEscalation(PUBLIC_SCENARIOS[CHILD], level), undefined, level);
    assert.equal(resolveSessionEscalation({ scenarioId: CHILD, difficultyLevel: level, challengeId: "c1" }, PUBLIC_SCENARIOS), undefined, `${level} 챌린지`);
  }
  for (const v of FLOW_VARIANTS.filter((x) => x.scenarioId === CHILD)) {
    assert.equal(v.escalatesToVoice, undefined, v.variantId);
    const prompt = resolveSessionScenarioPrompt(CHILD, v.variantId)!;
    const text = [prompt.personaPrompt, ...prompt.weakenedTactics].join("\n");
    assert.equal(text.includes("[[SIGNAL:ESCALATE_VOICE]]"), false, `${v.variantId}: 통화 넘김 신호 지시 0`);
    assert.equal(text.includes("그럼 내가 지금 전화할게"), false, `${v.variantId}: 네가 먼저 전화하겠다는 지시 0`);
    assert.ok(prompt.personaPrompt.includes("네 쪽에서 전화를 걸지 않고"), `${v.variantId}: 채팅으로만`);
  }
});

test("[A2 ㉠] 통화가 없어도 보험 앱 설치 화면은 고급에서 그대로 열린다(설치 뒤 다음 단계가 통화가 아닌 항목)", () => {
  const item = findMockScreenItem(CHILD, "child-insurance-install")!;
  assert.ok(item);
  assert.equal(isMockScreenReachable({ scenarioId: CHILD, difficultyLevel: "advanced", flowVariantId: "fv-tdgg" }, item), true);
});

test("[A2 ㉠ 보고] 다른 메신저 루트의 통화 넘김은 그대로다(바꾸지 않음 — 목록 고정)", () => {
  const escalating = Object.entries(PUBLIC_SCENARIOS)
    .filter(([, meta]) => meta.channel === "messenger")
    .flatMap(([id, meta]) => LEVELS.filter((level) => resolveScenarioEscalation(meta, level)).map((level) => `${id}/${level}`));
  assert.deepEqual(escalating.sort(), [
    "messenger-parcel-smishing-sms/advanced",
    "messenger-subsidy-smishing-sms/advanced",
    "messenger-subsidy-smishing-sms/beginner",
    "messenger-subsidy-smishing-sms/intermediate",
  ]);
});
