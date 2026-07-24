// deriveChallengeResultSummary 채널 게이팅 단위 테스트 (T49, MVP #20, Architecture.md §14.8.3,
// AC-055/OQ-31). 순수 함수라 Firestore 없이 검증 가능 — guardrails/purge.ts류 "순수 로직 분리"
// 관례와 동일.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveChallengeResultSummary } from "../userAccess";

const FAKE_REPORT = { sessionId: "s1" };

test("deriveChallengeResultSummary(): channel 생략(부재→voice) → {completed:true}만 반환한다(기존 동작 무회귀)", () => {
  const result = deriveChallengeResultSummary(FAKE_REPORT);
  assert.deepEqual(result, { completed: true });
});

test("deriveChallengeResultSummary(): channel='voice' → {completed:true}만 반환한다(현재 resistedMoments 미구현)", () => {
  const result = deriveChallengeResultSummary(FAKE_REPORT, "voice");
  assert.deepEqual(result, { completed: true });
});

test("deriveChallengeResultSummary(): channel='messenger' → suspicionTimeLabel/suspicionTurnIndex를 절대 포함하지 않는다(AC-055/OQ-31 구조적 고정)", () => {
  const result = deriveChallengeResultSummary(FAKE_REPORT, "messenger");
  assert.deepEqual(result, { completed: true });
  assert.equal("suspicionTimeLabel" in result, false);
  assert.equal("suspicionTurnIndex" in result, false);
});

test("deriveChallengeResultSummary(): voiceMode 생략(부재→clone) → {completed:true}만 반환한다(기존 동작 무회귀)", () => {
  const result = deriveChallengeResultSummary(FAKE_REPORT, "voice");
  assert.deepEqual(result, { completed: true });
});

test("deriveChallengeResultSummary(): channel='voice'+voiceMode='clone' → {completed:true}만 반환한다(현재 resistedMoments 미구현)", () => {
  const result = deriveChallengeResultSummary(FAKE_REPORT, "voice", "clone");
  assert.deepEqual(result, { completed: true });
});

test("deriveChallengeResultSummary(): channel='voice'+voiceMode='generic' → suspicionTimeLabel/suspicionTurnIndex를 절대 포함하지 않는다(AC-058/OQ-32 구조적 고정, D-34)", () => {
  const result = deriveChallengeResultSummary(FAKE_REPORT, "voice", "generic");
  assert.deepEqual(result, { completed: true });
  assert.equal("suspicionTimeLabel" in result, false);
  assert.equal("suspicionTurnIndex" in result, false);
});
