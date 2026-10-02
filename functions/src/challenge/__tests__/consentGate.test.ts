import { test } from "node:test";
import assert from "node:assert/strict";
import { decideConsentGate } from "../consentGate";
import { CHALLENGE_STATUS_ON_EXPERIENCE_END } from "../../shared/challengeCompletion";

test("decideConsentGate(): 만료된 링크는 최초 진입(status=pending)이면 거부한다(AC-048)", () => {
  const result = decideConsentGate({
    linkExpired: true,
    retentionExpired: false,
    status: "pending",
    existingSessionUid: null,
    callerUid: "anon-1",
  });
  assert.deepEqual(result, { action: "reject", message: "이 링크는 만료되었습니다." });
});

test("decideConsentGate(): status=pending·미만료면 최초 동의로 생성한다(AC-040)", () => {
  const result = decideConsentGate({
    linkExpired: false,
    retentionExpired: false,
    status: "pending",
    existingSessionUid: null,
    callerUid: "anon-1",
  });
  assert.deepEqual(result, { action: "create" });
});

test("decideConsentGate(): 이미 소진(consented)됐지만 같은 uid가 돌아오면 재개를 허용한다(§14.4 중도 이탈 복귀)", () => {
  const result = decideConsentGate({
    linkExpired: false,
    retentionExpired: false,
    status: "consented",
    existingSessionUid: "anon-1",
    callerUid: "anon-1",
  });
  assert.deepEqual(result, { action: "resume" });
});

test("decideConsentGate(): 이미 소진(in_progress)됐지만 같은 uid면 재개를 허용한다", () => {
  const result = decideConsentGate({
    linkExpired: false,
    retentionExpired: false,
    status: "in_progress",
    existingSessionUid: "anon-1",
    callerUid: "anon-1",
  });
  assert.deepEqual(result, { action: "resume" });
});

test("decideConsentGate(): T38 Major 수정 — 링크(3일)는 지났지만 보존기간(30일) 내면 같은 uid의 재개를 허용한다(§14.4)", () => {
  const result = decideConsentGate({
    linkExpired: true,
    retentionExpired: false,
    status: "in_progress",
    existingSessionUid: "anon-1",
    callerUid: "anon-1",
  });
  assert.deepEqual(result, { action: "resume" });
});

test("decideConsentGate(): 재개 시점에 보존기간(30일)까지 지났으면 같은 uid라도 거부한다", () => {
  const result = decideConsentGate({
    linkExpired: true,
    retentionExpired: true,
    status: "in_progress",
    existingSessionUid: "anon-1",
    callerUid: "anon-1",
  });
  assert.deepEqual(result, {
    action: "reject",
    message: "보존 기간이 지나 더 이상 이어갈 수 없습니다.",
  });
});

test("decideConsentGate(): 이미 소진됐고 다른 uid가 시도하면 거부한다(링크 재유포 방지)", () => {
  const result = decideConsentGate({
    linkExpired: false,
    retentionExpired: false,
    status: "in_progress",
    existingSessionUid: "anon-1",
    callerUid: "anon-2",
  });
  assert.deepEqual(result, {
    action: "reject",
    message: "이미 다른 사람이 동의한 챌린지입니다.",
  });
});

test("decideConsentGate(): 소진됐는데 아직 체험 세션을 찾지 못했으면(경합/이상 상태) 거부한다", () => {
  const result = decideConsentGate({
    linkExpired: false,
    retentionExpired: false,
    status: "consented",
    existingSessionUid: null,
    callerUid: "anon-1",
  });
  assert.equal(result.action, "reject");
});

for (const status of ["completed", "expired", "reported", "deleted"] as const) {
  test(`decideConsentGate(): status=${status}면 더 이상 진행할 수 없다고 거부한다`, () => {
    const result = decideConsentGate({
      linkExpired: false,
      retentionExpired: false,
      status,
      existingSessionUid: null,
      callerUid: "anon-1",
    });
    assert.deepEqual(result, {
      action: "reject",
      message: "더 이상 진행할 수 없는 챌린지입니다.",
    });
  });
}

// T181 S-6(docs/Architecture.md §69.4 · §69.8) — T181이 "재개 → 거절"로 바꾸는 바로 그 칸이다. 위
// 반복문은 existingSessionUid: null만 넣으므로 **같은 uid의 완료 후 재진입**을 직접 고정한 테스트가
// 없었다. status는 서버가 실제로 쓰는 값(CHALLENGE_STATUS_ON_EXPERIENCE_END)을 그대로 넣는다(G428).
// 동의 게이트 코드는 무변경이다 — 바뀌는 것은 그 값이 이제 실제로 쓰인다는 사실뿐이다(§14.4 설계 복구).
test("[T181 S-6] 체험 완료(서버 전이 값) + 같은 uid + 보존기간 내 재진입 ⇒ 재개가 아니라 거절한다", () => {
  const sameUidWithinRetention = {
    linkExpired: false,
    retentionExpired: false,
    existingSessionUid: "anon-1",
    callerUid: "anon-1",
  } as const;
  const afterCompletion = decideConsentGate({ ...sameUidWithinRetention, status: CHALLENGE_STATUS_ON_EXPERIENCE_END });
  assert.deepEqual(afterCompletion, {
    action: "reject",
    message: "더 이상 진행할 수 없는 챌린지입니다.",
  });
  // 대조(같은 입력 · 체험 중) — 중도 이탈 복귀는 그대로 재개다(§69.4 첫 행 무변경).
  const duringExperience = decideConsentGate({ ...sameUidWithinRetention, status: "in_progress" });
  assert.deepEqual(duringExperience, { action: "resume" });
});
