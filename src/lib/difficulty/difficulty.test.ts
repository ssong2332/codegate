import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADVANCED_SELF_NOTICE,
  ADVANCED_SEND_NOTICE,
  DEFAULT_DIFFICULTY_LEVEL,
  DIFFICULTY_LABEL,
  DIFFICULTY_LEVELS,
  DIFFICULTY_SELF_DESCRIPTION,
  DIFFICULTY_SEND_DESCRIPTION,
  RECOMMENDED_DIFFICULTY_LEVEL,
  SCENARIO_TRAIT_LABEL,
  formatDifficultyLabel,
  isDifficultyLevel,
  normalizeDifficultyLevel,
  // node --experimental-strip-types로 컴파일 없이 직접 실행하므로 확장자를 명시한다
  // (src/lib/challenge/mapChallengeItems.test.ts 등 기존 테스트와 동일 관례).
} from "./index.ts";

// T72 · docs/UX.md UX-029/P-22 · docs/PRD.md AC-064/065/066/067.

test("[AC-064/P-22] 3단계 어휘는 초급/중급/고급 하나로 고정된다(전 구간 동일 라벨의 유일한 원천)", () => {
  assert.deepEqual([...DIFFICULTY_LEVELS], ["beginner", "intermediate", "advanced"]);
  assert.deepEqual(DIFFICULTY_LABEL, {
    beginner: "초급",
    intermediate: "중급",
    advanced: "고급",
  });
  // 모든 단계가 라벨·요약·self/send 설명을 빠짐없이 갖는다(화면이 값을 즉석에서 지어내지 않게).
  for (const level of DIFFICULTY_LEVELS) {
    assert.ok(DIFFICULTY_LABEL[level]);
    assert.ok(DIFFICULTY_SELF_DESCRIPTION[level]);
    assert.ok(DIFFICULTY_SEND_DESCRIPTION[level]);
    assert.ok(formatDifficultyLabel(level).startsWith(DIFFICULTY_LABEL[level]));
  }
});

test("[AC-064] 기본 강조는 중급이고, 폴백 기본값도 중급이다(서버 normalizeDifficultyLevel과 동일)", () => {
  assert.equal(RECOMMENDED_DIFFICULTY_LEVEL, "intermediate");
  assert.equal(DEFAULT_DIFFICULTY_LEVEL, "intermediate");
  assert.equal(normalizeDifficultyLevel(undefined), "intermediate");
  assert.equal(normalizeDifficultyLevel("hard"), "intermediate");
  assert.equal(normalizeDifficultyLevel("advanced"), "advanced");
  assert.equal(isDifficultyLevel("beginner"), true);
  assert.equal(isDifficultyLevel("expert"), false);
});

test("[AC-065] 고급 고지는 '겁주기'가 아니라 '언제든 멈출 수 있다'(AC-006)를 함께 알린다", () => {
  assert.ok(ADVANCED_SELF_NOTICE.includes("강한 압박"));
  assert.ok(
    ADVANCED_SELF_NOTICE.includes("훈련 종료"),
    "고급 고지에 상시 종료 컨트롤 안내가 포함돼야 한다(난이도가 안전장치를 약화하지 않음을 문면으로도 유지)",
  );
  // 발신(send) 고지도 동의·중단 가능성을 함께 알린다(AC-040 취지의 발신 측 대응).
  assert.ok(ADVANCED_SEND_NOTICE.includes("강한 압박"));
  assert.ok(ADVANCED_SEND_NOTICE.includes("동의"));
});

test("[AC-067] '난이도'라는 단어는 사용자가 고르는 3단계에만 쓴다 — 시나리오 고정 문자열은 '성향'으로 부른다", () => {
  assert.equal(SCENARIO_TRAIT_LABEL, "이 시나리오의 성향");
  assert.ok(
    !SCENARIO_TRAIT_LABEL.includes("난이도"),
    "시나리오 메타 라벨에 '난이도'가 들어가면 한 화면에서 같은 단어가 두 뜻으로 쓰인다",
  );
});
