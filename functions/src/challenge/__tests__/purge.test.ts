import { test } from "node:test";
import assert from "node:assert/strict";
import { purgeChallengeArtifacts, selectChallengesToPurge, type ChallengePurgeDeps } from "../purge";

function fakeDeps(shouldFail = false): ChallengePurgeDeps & { deletedVoiceIds: string[] } {
  const deletedVoiceIds: string[] = [];
  return {
    deletedVoiceIds,
    deleteVoice: async (id) => {
      if (shouldFail) throw new Error("elevenlabs delete failed");
      deletedVoiceIds.push(id);
    },
  };
}

test("purgeChallengeArtifacts(): voice 삭제 성공 → 단일 target success, overallResult success(AC-041)", async () => {
  const deps = fakeDeps();
  const result = await purgeChallengeArtifacts("mock-voice-challenge-1", deps);

  assert.equal(result.overallResult, "success");
  assert.deepEqual(result.targets, [
    { kind: "elevenlabs_voice", ref: "mock-voice-challenge-1", result: "success" },
  ]);
  assert.deepEqual(deps.deletedVoiceIds, ["mock-voice-challenge-1"]);
});

test("purgeChallengeArtifacts(): voice 삭제 실패 → target failed, overallResult failed(재시도 근거로 기록)", async () => {
  const deps = fakeDeps(true);
  const result = await purgeChallengeArtifacts("mock-voice-challenge-2", deps);

  assert.equal(result.overallResult, "failed");
  assert.equal(result.targets[0]?.result, "failed");
  assert.equal(deps.deletedVoiceIds.length, 0);
});

test("selectChallengesToPurge(): retentionDeleteAt 도달 + 아직 안 지워진 챌린지만 선택한다", () => {
  const now = new Date("2026-08-20T00:00:00Z").getTime();
  const candidates = [
    { id: "due-pending", status: "pending", retentionDeleteAtMs: now - 1000 },
    { id: "due-in-progress", status: "in_progress", retentionDeleteAtMs: now },
    { id: "already-deleted", status: "deleted", retentionDeleteAtMs: now - 1000 },
    { id: "not-yet-due", status: "pending", retentionDeleteAtMs: now + 1000 },
  ];

  const ids = selectChallengesToPurge(candidates, now);

  assert.deepEqual(ids.sort(), ["due-in-progress", "due-pending"]);
});

test("selectChallengesToPurge(): 빈 목록이면 빈 배열", () => {
  assert.deepEqual(selectChallengesToPurge([], Date.now()), []);
});

test("selectChallengesToPurge(): 전부 이미 deleted면 아무것도 선택하지 않는다(스케줄 재실행 시 중복 폐기 방지)", () => {
  const now = Date.now();
  const candidates = [
    { id: "a", status: "deleted", retentionDeleteAtMs: now - 5000 },
    { id: "b", status: "deleted", retentionDeleteAtMs: now - 1 },
  ];
  assert.deepEqual(selectChallengesToPurge(candidates, now), []);
});
