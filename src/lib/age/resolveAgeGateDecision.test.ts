// node:test 단위 테스트 (Track C, T14, AC-014) — 프론트엔드 테스트 러너 부재로 T15가 도입한
// `node --experimental-strip-types --test <file>` 패턴을 그대로 재사용한다
// (src/lib/history/mapHistoryItems.test.ts와 동일 실행법). 실행: 아래 보고서의 "테스트 실행" 참조.
import test from "node:test";
import assert from "node:assert/strict";
import { MIN_AGE, resolveAgeGateDecision } from "./resolveAgeGateDecision.ts";

test("AC-014: 최소 연령값은 만 14세로 확정되어 있다(OQ-8, PRD.md v0.6)", () => {
  assert.equal(MIN_AGE, 14);
});

test("AC-014: 만 14세 이상이라고 확인하면 통과(granted)한다", () => {
  assert.equal(resolveAgeGateDecision(true), "granted");
});

test("AC-014: 만 14세 미만이라고 확인하면 차단(blocked)한다 — 접근 제한", () => {
  assert.equal(resolveAgeGateDecision(false), "blocked");
});
