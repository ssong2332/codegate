import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMockBeepWavBuffer, buildMockBeepWavDataUri } from "../mockAudio";

test("buildMockBeepWavBuffer returns a valid, non-silent WAV buffer", () => {
  const buf = buildMockBeepWavBuffer();

  assert.equal(buf.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(buf.subarray(8, 12).toString("ascii"), "WAVE");
  assert.equal(buf.subarray(36, 40).toString("ascii"), "data");

  // 무음(전부 0)이 아님을 확인 — beep 톤이 실제로 들어있어야 목업임이 청각적으로도 드러난다.
  const dataStart = 44;
  const hasNonZeroSample = buf.subarray(dataStart).some((byte) => byte !== 0);
  assert.equal(hasNonZeroSample, true);
});

test("buildMockBeepWavDataUri returns a self-contained playable data URI", () => {
  const uri = buildMockBeepWavDataUri();

  assert.match(uri, /^data:audio\/wav;base64,/);

  const base64 = uri.split(",")[1];
  const decoded = Buffer.from(base64, "base64");
  assert.equal(decoded.subarray(0, 4).toString("ascii"), "RIFF");
});
