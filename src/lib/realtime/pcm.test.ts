import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GEMINI_INPUT_SAMPLE_RATE,
  base64ToFloat32,
  floatToPcm16,
  pcm16ToBase64,
} from "./pcm.ts";

test("floatToPcm16: 48kHz 입력을 16kHz로 다운샘플한다(Live API 입력 규격)", () => {
  const input = new Float32Array(300);
  const pcm = floatToPcm16(input, 48000, GEMINI_INPUT_SAMPLE_RATE);
  assert.equal(pcm.length, 100, "48k→16k는 1/3로 줄어야 한다");
});

test("floatToPcm16: 이미 16kHz면 길이를 유지한다", () => {
  const input = new Float32Array(64);
  assert.equal(floatToPcm16(input, 16000, 16000).length, 64);
});

test("floatToPcm16: 범위를 벗어난 값을 클리핑한다(wrap-around 잡음 방지)", () => {
  const pcm = floatToPcm16(new Float32Array([2, -2]), 16000, 16000);
  assert.equal(pcm[0], 32767);
  assert.equal(pcm[1], -32768);
});

test("floatToPcm16: 진폭을 16-bit 정수로 옮긴다", () => {
  const pcm = floatToPcm16(new Float32Array([0, 1, -1]), 16000, 16000);
  assert.equal(pcm[0], 0);
  assert.equal(pcm[1], 32767);
  assert.equal(pcm[2], -32768);
});

test("base64 왕복: 보낸 오디오가 그대로 복원된다(포맷 불일치로 인한 무음/잡음 방지)", () => {
  const original = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const restored = base64ToFloat32(pcm16ToBase64(floatToPcm16(original, 16000, 16000)));
  assert.equal(restored.length, original.length);
  for (let i = 0; i < original.length; i += 1) {
    // 16-bit 양자화 오차만 허용한다.
    assert.ok(
      Math.abs(restored[i] - original[i]) < 0.001,
      `sample ${i}: ${restored[i]} vs ${original[i]}`,
    );
  }
});

test("base64ToFloat32: 빈 입력을 빈 배열로 처리한다(재생 루프가 터지지 않게)", () => {
  assert.equal(base64ToFloat32("").length, 0);
});
