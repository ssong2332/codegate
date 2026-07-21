import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeOverallResult,
  purgeSessionArtifacts,
  sessionStoragePrefix,
  type PurgeDeps,
} from "../purge";

test("sessionStoragePrefix()는 Database.md Storage Layout 컨벤션과 1:1인 경로를 만든다", () => {
  assert.equal(sessionStoragePrefix("uid-1", "session-1"), "users/uid-1/sessions/session-1/");
});

test("computeOverallResult(): 대상이 없으면 success(지울 것이 애초에 없던 경우는 실패가 아니다)", () => {
  assert.equal(computeOverallResult([]), "success");
});

test("computeOverallResult(): 전부 success면 success", () => {
  assert.equal(
    computeOverallResult([
      { kind: "storage", ref: "a", result: "success" },
      { kind: "elevenlabs_voice", ref: "v1", result: "success" },
    ]),
    "success",
  );
});

test("computeOverallResult(): 일부만 실패하면 partial(ADR-0003 부분 실패 처리)", () => {
  assert.equal(
    computeOverallResult([
      { kind: "storage", ref: "a", result: "success" },
      { kind: "storage", ref: "b", result: "failed" },
    ]),
    "partial",
  );
});

test("computeOverallResult(): 전부 실패하면 failed", () => {
  assert.equal(
    computeOverallResult([
      { kind: "storage", ref: "a", result: "failed" },
      { kind: "elevenlabs_voice", ref: "v1", result: "failed" },
    ]),
    "failed",
  );
});

/** 항상 성공하는 fake deps — happy path 검증용. */
function fakeDeps(files: string[]): PurgeDeps & { deletedPaths: string[]; deletedVoiceIds: string[] } {
  const deletedPaths: string[] = [];
  const deletedVoiceIds: string[] = [];
  return {
    deletedPaths,
    deletedVoiceIds,
    listStorageFiles: async () => files,
    deleteStorageFile: async (path) => {
      deletedPaths.push(path);
    },
    deleteVoice: async (id) => {
      deletedVoiceIds.push(id);
    },
  };
}

test("purgeSessionArtifacts(): Storage 파일 2개 + voiceId 있음 → 3개 target 전부 success, overallResult success (AC-021)", async () => {
  const deps = fakeDeps([
    "users/u1/sessions/s1/voice_input.webm",
    "users/u1/sessions/s1/synth/a1.mp3",
  ]);

  const result = await purgeSessionArtifacts("s1", "u1", "mock-voice-abc", deps);

  assert.equal(result.overallResult, "success");
  assert.equal(result.targets.length, 3);
  assert.deepEqual(
    result.targets.filter((t) => t.kind === "storage").map((t) => t.ref),
    ["users/u1/sessions/s1/voice_input.webm", "users/u1/sessions/s1/synth/a1.mp3"],
  );
  assert.deepEqual(result.targets.filter((t) => t.kind === "elevenlabs_voice"), [
    { kind: "elevenlabs_voice", ref: "mock-voice-abc", result: "success" },
  ]);
  assert.deepEqual(deps.deletedPaths, [
    "users/u1/sessions/s1/voice_input.webm",
    "users/u1/sessions/s1/synth/a1.mp3",
  ]);
  assert.deepEqual(deps.deletedVoiceIds, ["mock-voice-abc"]);
});

test("purgeSessionArtifacts(): voiceId가 없으면(클론 전 종료) ElevenLabs target을 만들지 않는다", async () => {
  const deps = fakeDeps(["users/u1/sessions/s1/voice_input.webm"]);

  const result = await purgeSessionArtifacts("s1", "u1", undefined, deps);

  assert.equal(result.targets.length, 1);
  assert.equal(result.targets[0]?.kind, "storage");
  assert.equal(deps.deletedVoiceIds.length, 0);
});

test("purgeSessionArtifacts(): Storage 파일 1개 삭제 실패해도 나머지는 계속 처리하고 partial로 집계된다", async () => {
  const deps = fakeDeps([]);
  deps.listStorageFiles = async () => ["users/u1/sessions/s1/a.webm", "users/u1/sessions/s1/b.mp3"];
  deps.deleteStorageFile = async (path) => {
    if (path.endsWith("a.webm")) {
      throw new Error("storage delete failed");
    }
  };

  const result = await purgeSessionArtifacts("s1", "u1", "mock-voice-xyz", deps);

  assert.equal(result.overallResult, "partial");
  const storageTargets = result.targets.filter((t) => t.kind === "storage");
  assert.deepEqual(
    storageTargets.map((t) => t.result),
    ["failed", "success"],
  );
});

test("purgeSessionArtifacts(): ElevenLabs 삭제 실패해도 Storage 삭제는 이미 완료된 채로 partial 집계된다", async () => {
  const deps = fakeDeps(["users/u1/sessions/s1/voice_input.webm"]);
  deps.deleteVoice = async () => {
    throw new Error("elevenlabs delete failed");
  };

  const result = await purgeSessionArtifacts("s1", "u1", "mock-voice-fail", deps);

  assert.equal(result.overallResult, "partial");
  assert.equal(deps.deletedPaths.length, 1);
  const voiceTarget = result.targets.find((t) => t.kind === "elevenlabs_voice");
  assert.equal(voiceTarget?.result, "failed");
});

test("purgeSessionArtifacts(): 지울 Storage 파일이 없어도(빈 세션) 실패로 취급하지 않는다", async () => {
  const deps = fakeDeps([]);

  const result = await purgeSessionArtifacts("s1", "u1", undefined, deps);

  assert.deepEqual(result.targets, []);
  assert.equal(result.overallResult, "success");
});

test("purgeSessionArtifacts(): listStorageFiles 자체가 실패하면 prefix를 failed target으로 남긴다(재시도 근거)", async () => {
  const deps = fakeDeps([]);
  deps.listStorageFiles = async () => {
    throw new Error("storage list failed");
  };

  const result = await purgeSessionArtifacts("s1", "u1", undefined, deps);

  assert.equal(result.targets.length, 1);
  assert.equal(result.targets[0]?.result, "failed");
  assert.equal(result.targets[0]?.ref, "users/u1/sessions/s1/");
  assert.equal(result.overallResult, "failed");
});
