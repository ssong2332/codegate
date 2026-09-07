// §59.10 커밋 D — 천장(백스톱) 순수 판정 회귀(§59.9 R6 · G388 · G390).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TOOL_WINDOW_MAX_BOUNDARIES,
  TOOL_WINDOW_STALL_SEC,
  shouldFireBackstop,
} from "./toolWindow.ts";

test("[상수] 판단값이 architect 원문과 같다(§59.8)", () => {
  assert.equal(TOOL_WINDOW_MAX_BOUNDARIES, 2);
  assert.equal(TOOL_WINDOW_STALL_SEC, 90);
});

// (b) 상한 전에는 발동하지 않는다 — 도구가 있고, 실패하지 않았고, 경계·초 둘 다 상한 미만.
test("[(b) 상한 전 미발동] toolAvailable && 경계 0/실패 없음 ⇒ false", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: 0,
      secondsSinceLastBoundary: 0,
      toolCallFailed: false,
    }),
    false,
  );
});

test("[(b) 상한 전 미발동] 경계 1(< 2)·초 89(< 90) ⇒ false", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: TOOL_WINDOW_MAX_BOUNDARIES - 1,
      secondsSinceLastBoundary: TOOL_WINDOW_STALL_SEC - 1,
      toolCallFailed: false,
    }),
    false,
  );
});

// (a) 하한 이후 상한(경계) 초과 시 강제 발동.
test("[(a) 상한(경계) 도달] boundariesSinceDue === TOOL_WINDOW_MAX_BOUNDARIES ⇒ true", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: TOOL_WINDOW_MAX_BOUNDARIES,
      secondsSinceLastBoundary: 0,
      toolCallFailed: false,
    }),
    true,
  );
});

test("[(a) 상한(경계) 초과] boundariesSinceDue > TOOL_WINDOW_MAX_BOUNDARIES ⇒ true", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: TOOL_WINDOW_MAX_BOUNDARIES + 5,
      secondsSinceLastBoundary: 0,
      toolCallFailed: false,
    }),
    true,
  );
});

// (a) 하한 이후 상한(시간) 초과 시 강제 발동.
test("[(a) 상한(시간) 도달] secondsSinceLastBoundary === TOOL_WINDOW_STALL_SEC ⇒ true", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: 0,
      secondsSinceLastBoundary: TOOL_WINDOW_STALL_SEC,
      toolCallFailed: false,
    }),
    true,
  );
});

test("[(a) 상한(시간) 초과] secondsSinceLastBoundary > TOOL_WINDOW_STALL_SEC ⇒ true", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: 0,
      secondsSinceLastBoundary: TOOL_WINDOW_STALL_SEC + 30,
      toolCallFailed: false,
    }),
    true,
  );
});

// (c) 도구 미선언 ⇒ 지연 0(즉시) — G388 회귀 0의 유일한 레버. 다른 값이 전부 "닫힌 창"이어도 true.
test("[(c)/G388] toolAvailable=false ⇒ 다른 값과 무관하게 항상 즉시(true)", () => {
  const combos = [
    { boundariesSinceDue: 0, secondsSinceLastBoundary: 0, toolCallFailed: false },
    { boundariesSinceDue: 0, secondsSinceLastBoundary: 0, toolCallFailed: true },
    { boundariesSinceDue: 99, secondsSinceLastBoundary: 999, toolCallFailed: false },
  ];
  for (const combo of combos) {
    assert.equal(
      shouldFireBackstop({ toolAvailable: false, ...combo }),
      true,
      `toolAvailable=false, ${JSON.stringify(combo)}에서도 즉시 발동해야 한다`,
    );
  }
});

// G390 — 도구 경로 실패는 창을 즉시 닫는다(경계·초가 전부 0이어도).
test("[G390] toolCallFailed=true ⇒ 경계·초가 0이어도 즉시 발동", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: 0,
      secondsSinceLastBoundary: 0,
      toolCallFailed: true,
    }),
    true,
  );
});

// (d)의 전제 — "모델이 정상 처리"는 이 함수 바깥(호출부가 아예 이 함수를 부르지 않게 되는 것,
// pickDueInCallSms류의 "이미 처리됨" 필터)에서 보장된다. 이 순수 함수 자신은 입력이 "아직 처리
// 안 됨 + 창 안"이면 항상 false를 내야 그 보장이 성립한다 — 위 (b) 테스트가 그 조건을 고정한다.
test("[경계값] 경계·초 모두 상한 바로 아래 + 도구 있음 + 실패 없음 ⇒ false(마지막 안전 여유)", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: TOOL_WINDOW_MAX_BOUNDARIES - 1,
      secondsSinceLastBoundary: TOOL_WINDOW_STALL_SEC - 1,
      toolCallFailed: false,
    }),
    false,
  );
});
