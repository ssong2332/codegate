import { test } from "node:test";
import assert from "node:assert/strict";
import { voiceInputStoragePath } from "../index";

test("voiceInputStoragePath()는 Database.md Storage Layout과 1:1인 고정 경로를 만든다", () => {
  const path = voiceInputStoragePath("uid-1", "session-1");
  assert.equal(path, "users/uid-1/sessions/session-1/voice_input.webm");
});
