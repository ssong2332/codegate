import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTacticCategory, TACTIC_CATEGORIES } from "../tacticCategory";
import { extractTacticLabel } from "../../scenarios/tacticFlavor";
import { SCENARIO_PROMPTS } from "../../scenarios";

// T74 / AC-068 · Architecture.md §15.4.2 — 실패 아카이브의 "수법별 묶기" 그룹 키 정규화.

// ⚠️ 드리프트 방지 테스트(§15.4.2 "필수") — 13개 시나리오의 **모든** weakenedTactics 라벨이
// 카테고리에 매핑되는지 확인한다. 새 시나리오·라벨이 추가되면 이 테스트가 먼저 깨져 규칙표 갱신을
// 강제한다(scenarios.test.ts의 미러 드리프트 탐지와 같은 발상). 여기서 `other`가 하나라도 나오면
// 그 수법은 아카이브에서 원문 문자열끼리만 묶여 "이 수법에 3번 넘어갔습니다"가 흩어진다(§15.6 G14).
test("13개 시나리오의 모든 weakenedTactics 라벨이 other로 떨어지지 않는다(드리프트 방지, §15.4.2)", () => {
  const unmapped: string[] = [];
  let labelCount = 0;
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    for (const tactic of prompt.weakenedTactics) {
      const label = extractTacticLabel(tactic);
      labelCount += 1;
      if (resolveTacticCategory(label) === "other") unmapped.push(`${scenarioId}: ${label}`);
    }
  }
  assert.equal(Object.keys(SCENARIO_PROMPTS).length, 13, "시나리오 13종 전수 검사 전제");
  assert.ok(labelCount > 0, "라벨을 하나도 읽지 못했다면 테스트 자체가 무의미하다");
  assert.deepEqual(unmapped, [], `카테고리 미매핑 라벨(규칙표 갱신 필요): ${unmapped.join(" / ")}`);
});

// 이 화면의 존재 이유 — 표기가 다른 같은 수법이 하나로 묶여야 반복 횟수가 드러난다.
test("표기가 다른 긴급성 라벨 4종이 하나의 urgency로 묶인다(§15.4.2 실측 목록)", () => {
  for (const label of ["긴급성 조성", "다급함 조성", "마감 압박", "촉박한 결정 압박"]) {
    assert.equal(resolveTacticCategory(label), "urgency", label);
  }
});

test("표기가 다른 확인 차단 라벨 4종이 하나의 verification_block으로 묶인다(§15.4.2 실측 목록)", () => {
  for (const label of ["확인 절차 차단", "확인 차단", "확인 전화 차단 유도", "원격 확인 차단"]) {
    assert.equal(resolveTacticCategory(label), "verification_block", label);
  }
});

// 순서가 load-bearing이라는 사실을 고정한다 — 한 라벨에 두 카테고리 단어가 함께 있을 때 위 행이
// 이긴다. 순서를 바꾸면 과거 집계와 새 집계가 조용히 갈라지므로 테스트로 못박는다.
test("규칙표 순서: 위에서 먼저 매치하는 행이 이긴다", () => {
  // 권위(7행) + 긴급(5행) → 5행이 이긴다.
  assert.equal(resolveTacticCategory("권위·긴급상황 암시"), "urgency");
  // 비밀 유지(4행 확인 차단) + 비밀번호가 아닌 "비밀"(8행 affection) → 4행이 이긴다.
  assert.equal(resolveTacticCategory("비밀 유지 요구"), "verification_block");
  // 비밀번호(2행)는 4행의 "비밀 유지"보다 먼저 매치한다.
  assert.equal(resolveTacticCategory("비밀번호 요구"), "personal_info_demand");
});

// "확인"만으로 verification_block에 넣으면 긴급성 수법까지 삼킨다 — 회귀 방어.
test("'속사포 확인질문'은 확인 차단이 아니라 urgency다", () => {
  assert.equal(resolveTacticCategory("속사포 확인질문"), "urgency");
  assert.equal(resolveTacticCategory("본인확인 빙자 정보 수집"), "personal_info_demand");
});

test("빈 라벨·미지의 라벨은 other로 떨어진다(발명하지 않는다)", () => {
  assert.equal(resolveTacticCategory(""), "other");
  assert.equal(resolveTacticCategory("   "), "other");
  // analyzeConversation이 매치된 수법을 못 찾았을 때 쓰는 폴백 라벨도 other다(정상 동작).
  assert.equal(resolveTacticCategory("약화된 사기 수법"), "other");
});

test("카테고리 enum은 고정 10종이다(§15.4.2)", () => {
  assert.equal(TACTIC_CATEGORIES.length, 10);
  assert.ok(TACTIC_CATEGORIES.includes("other"));
});
