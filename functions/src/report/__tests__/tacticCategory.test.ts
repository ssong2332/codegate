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
test("전 시나리오의 모든 weakenedTactics 라벨이 other로 떨어지지 않는다(드리프트 방지, §15.4.2)", () => {
  const unmapped: string[] = [];
  let labelCount = 0;
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    for (const tactic of prompt.weakenedTactics) {
      const label = extractTacticLabel(tactic);
      labelCount += 1;
      if (resolveTacticCategory(label) === "other") unmapped.push(`${scenarioId}: ${label}`);
    }
  }
  // T95(2026-07-26) — 확인 무력화 전용 시나리오 1종 추가로 14종이다(추가만, 삭제·통합 0건).
  assert.equal(Object.keys(SCENARIO_PROMPTS).length, 14, "시나리오 14종 전수 검사 전제");
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

// ── T82(2026-07-26) 수법 분류 드리프트 4건 회귀 가드 ────────────────────────
//
// **무엇이 있었나**: 오케스트레이터가 `resolveTacticCategory`를 직접 실행해 v1.6 축 체계가 곧
// 저작할 라벨 4개가 전부 `other`로 떨어지는 것을 실측했다(docs/Tasks.md "구현 전 통합 확인" 표).
// 이 라벨들은 아직 콘텐츠에 없어서 위의 13종 전수 드리프트 테스트에 걸리지 않는다 — T83/T84/T85가
// 콘텐츠를 저작하는 순간 `other`로 떨어져 실패 아카이브의 묶기가 흩어졌을 것이다(§15.6 G14 재발).
//
// **고친 방향**: 드리프트 테스트를 완화하지 않고 **규칙표 패턴만 넓혔다**(§15.10.5 — enum append는
// 하지 않는다. `TACTIC_CATEGORIES`는 10종 그대로다).
//
// | 라벨 | 축 | 이전 | 이후 | 넓힌 행 |
// |---|---|---|---|---|
// | 확인 시도 무력화 | D3 | other | verification_block | 4행 `확인[^]{0,6}무력화` |
// | 확인 무력화 | D3 | other | verification_block | 〃 |
// | 권한 허용 유도 | E3 | other | link_or_install | 3행 `권한` |
// | 절차·서류 정당화 | D4 | other | authority | 7행 `정당화` |
test("축 D3 계열 '확인 무력화' 라벨이 verification_block으로 묶인다(T82 드리프트 4건 #1·#2)", () => {
  assert.equal(resolveTacticCategory("확인 시도 무력화"), "verification_block");
  assert.equal(resolveTacticCategory("확인 무력화"), "verification_block");
});

test("축 E3 계열 '권한 허용 유도' 라벨이 link_or_install로 묶인다(T82 드리프트 4건 #3)", () => {
  assert.equal(resolveTacticCategory("권한 허용 유도"), "link_or_install");
  // 이미 정상 분류되던 설치 계열은 그대로다 — "원격"을 추가할 필요가 없었다는 실측(§15.10.9 G33 정정).
  for (const label of ["모의 앱 설치", "원격제어 앱 설치", "앱 설치 지시"]) {
    assert.equal(resolveTacticCategory(label), "link_or_install", label);
  }
});

test("축 D4 계열 '절차·서류 정당화' 라벨이 authority로 묶인다(T82 드리프트 4건 #4)", () => {
  assert.equal(resolveTacticCategory("절차·서류 정당화"), "authority");
  // 이미 이 행에 있던 형제 라벨과 같은 묶음이어야 의미가 있다(loanScam.prompt.ts).
  assert.equal(resolveTacticCategory("권위·정당성 포장"), "authority");
});

test("규칙표 확장이 기존 분류를 흔들지 않는다(T82 회귀 — 순서 load-bearing 유지)", () => {
  // 3행에 "권한"을 넣었다고 권위(7행) 라벨이 링크·설치로 끌려가면 안 된다.
  assert.equal(resolveTacticCategory("권위 암시"), "authority");
  assert.equal(resolveTacticCategory("권위·긴급상황 암시"), "urgency"); // 5행이 7행보다 위
  // 4행에 "확인 …무력화"를 넣었다고 긴급성 계열 확인 라벨을 삼키면 안 된다.
  assert.equal(resolveTacticCategory("속사포 확인질문"), "urgency");
  assert.equal(resolveTacticCategory("본인확인 빙자 정보 수집"), "personal_info_demand");
  // "무력화"만으로는 매치하지 않는다("확인"과 함께일 때만 잡는다).
  assert.equal(resolveTacticCategory("무력화"), "other");
});
