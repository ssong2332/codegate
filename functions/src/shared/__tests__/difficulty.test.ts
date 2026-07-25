import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DIFFICULTY_LEVEL,
  DIFFICULTY_LEVELS,
  isDifficultyLevel,
  normalizeDifficultyLevel,
} from "../difficulty";

// T72 · Architecture.md §15.3.2 · AC-064("조용히 임의 난이도로 진행하지 않는다" — 폴백은 항상
// 중급이고 그 사실이 호출부로 관측 가능해야 한다).

test("DIFFICULTY_LEVELS는 사용자가 고르는 3단계 그대로다(초급/중급/고급)", () => {
  assert.deepEqual([...DIFFICULTY_LEVELS], ["beginner", "intermediate", "advanced"]);
  assert.equal(DEFAULT_DIFFICULTY_LEVEL, "intermediate");
});

test("isDifficultyLevel(): enum 값만 통과시킨다", () => {
  for (const level of DIFFICULTY_LEVELS) {
    assert.equal(isDifficultyLevel(level), true);
  }
  for (const bad of ["hard", "easy", "", "BEGINNER", null, undefined, 3, {}]) {
    assert.equal(isDifficultyLevel(bad), false, `enum 밖 값은 거부해야 한다: ${String(bad)}`);
  }
});

test("normalizeDifficultyLevel(): 부재·enum 밖 값은 전부 intermediate로 확정한다(하위호환 읽기 규칙)", () => {
  assert.equal(normalizeDifficultyLevel(undefined), "intermediate");
  assert.equal(normalizeDifficultyLevel(null), "intermediate");
  assert.equal(normalizeDifficultyLevel(""), "intermediate");
  assert.equal(normalizeDifficultyLevel("hard"), "intermediate");
  assert.equal(normalizeDifficultyLevel(42), "intermediate");
});

test("normalizeDifficultyLevel(): 유효한 값은 그대로 보존한다(임의 난이도 치환 금지)", () => {
  assert.equal(normalizeDifficultyLevel("beginner"), "beginner");
  assert.equal(normalizeDifficultyLevel("intermediate"), "intermediate");
  assert.equal(normalizeDifficultyLevel("advanced"), "advanced");
});
