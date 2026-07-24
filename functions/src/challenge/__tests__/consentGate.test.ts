import { test } from "node:test";
import assert from "node:assert/strict";
import { decideConsentGate } from "../consentGate";

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
