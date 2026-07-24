import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTacticFlavor, extractTacticLabel } from "../tacticFlavor";

// 회귀 테스트(2026-07-24) — 이 모듈은 mockClient.ts(대사 생성)와 analyzeConversation.ts(대사 분석,
// "시도된 수법" 판정)가 예전엔 각자 따로 구현해 서로 어긋났던 flavor 추출 로직을 하나로 합친
// 결과물이다. 실제 scenarioPrompts 콘텐츠(예: loanScam.prompt.ts)가 쓰는 "라벨 — '인용구', '인용구'
// 처럼 ... 한다" 형식을 그대로 재현해 검증한다.

test("extractTacticLabel(): '—' 앞의 라벨만 취한다", () => {
  assert.equal(
    extractTacticLabel("권위·정당성 포장 — '정부 지원 대상자시고요' 처럼 신뢰를 유도한다."),
    "권위·정당성 포장",
  );
});

test("extractTacticFlavor(): 인용구가 있으면 인용구만 뽑아 쉼표로 합친다(따옴표 제거)", () => {
  const tactic =
    "확인 절차 차단 — '직접 방문하시면 안 됩니다', '유선으로만 처리 가능합니다' 처럼 제3자·기관 재확인을 막으려 한다.";
  assert.equal(extractTacticFlavor(tactic), "직접 방문하시면 안 됩니다, 유선으로만 처리 가능합니다");
});

test("extractTacticFlavor(): 인용구가 없으면 '—' 이후 설명부 전체로 폴백한다", () => {
  const tactic = "다급함 조성 — 지금 당장 도와줘야 해, 더 늦으면 큰일나";
  assert.equal(extractTacticFlavor(tactic), "지금 당장 도와줘야 해, 더 늦으면 큰일나");
});

test("extractTacticFlavor(): 구조화 마커([[LINK:..]]/[[SIGNAL:..]])는 인용구 뒤에 그대로 살려 붙인다", () => {
  const tactic = "스미싱 링크 — '택배가 반송될 예정입니다' [[LINK:parcel-1]] 처럼 클릭을 유도한다.";
  assert.equal(extractTacticFlavor(tactic), "택배가 반송될 예정입니다 [[LINK:parcel-1]]");
});
