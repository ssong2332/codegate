// D1(docs/Architecture.md §54.9 (1), 사용자 요청 R-B) — 목업 TTS 산출물은 **무음**이다.
//
// ⛔ 이 파일을 지우지 말 것: 무음이어도 **재생 가능한 WAV**여야 한다는 계약의 유일한 수호자다.
// 깨진 WAV면 클라의 `<audio>`가 `onEnded`를 쏘지 않아 폴백의 자동청취 재개가 멈춘다(§54.9 (1) 4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMockSilentWavBuffer, buildMockSilentWavDataUri } from "../mockAudio";

const DATA_START = 44;
// 8000Hz × 0.6초 × 16bit mono = 4800 샘플 → 헤더 44 + 데이터 9600 바이트. 무음화 전후 **동일**하다
// (§54.9 (1) 1 "WAV 헤더·길이·샘플레이트는 그대로").
const EXPECTED_BYTE_LENGTH = 44 + 4800 * 2;

test("buildMockSilentWavBuffer: 전 샘플이 0인 무음 WAV다(D1 — 소리로 목업을 알리지 않는다)", () => {
  const buf = buildMockSilentWavBuffer();

  assert.equal(buf.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(buf.subarray(8, 12).toString("ascii"), "WAVE");
  assert.equal(buf.subarray(36, 40).toString("ascii"), "data");

  // ⭐ 무음 계약 — 예전에는 정반대(비무음)를 단언했다. 목업 식별은 소리가 아니라 `isMock`·
  // `mock-` 접두사·`MOCK_NOTICE`·화면 라벨이 담당한다(PRD.md:810은 "육안" 식별을 요구한다, §54.8).
  const hasNonZeroSample = buf.subarray(DATA_START).some((byte) => byte !== 0);
  assert.equal(hasNonZeroSample, false, "목업 오디오에 소리가 남아 있으면 안 된다(D1)");
});

test("buildMockSilentWavBuffer: 헤더 값과 전체 길이가 무음화 전과 같다(클라 계약 0줄 — §54.9 (1) 5)", () => {
  const buf = buildMockSilentWavBuffer();

  assert.equal(buf.byteLength, EXPECTED_BYTE_LENGTH, "0.6초·8kHz·16bit mono 길이가 유지돼야 한다");
  assert.equal(buf.readUInt32LE(4), 36 + 4800 * 2, "RIFF chunk size");
  assert.equal(buf.readUInt16LE(20), 1, "PCM");
  assert.equal(buf.readUInt16LE(22), 1, "mono");
  assert.equal(buf.readUInt32LE(24), 8000, "sample rate");
  assert.equal(buf.readUInt16LE(34), 16, "bits per sample");
  assert.equal(buf.readUInt32LE(40), 4800 * 2, "data chunk size");
});

test("buildMockSilentWavDataUri: 그 자체로 재생 가능한 data URI다(형태 무변경)", () => {
  const uri = buildMockSilentWavDataUri();

  assert.match(uri, /^data:audio\/wav;base64,/);

  const base64 = uri.split(",")[1];
  const decoded = Buffer.from(base64, "base64");
  assert.equal(decoded.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(decoded.byteLength, EXPECTED_BYTE_LENGTH);
  assert.equal(
    decoded.subarray(DATA_START).some((byte) => byte !== 0),
    false,
    "data URI로 실려 나가는 바이트도 무음이어야 한다",
  );
});

// ⭐ 역검증(⛔ 생략 금지) — 위 무음 단언이 **실제로 판별력이 있는지**를 같은 출력에서 보인다.
// 정본 구현이 사인파(또는 어떤 소리든)로 되돌아간 상태를 이 파일 안에서만 재현해, 위와 **같은
// 검사식**이 그것을 빨간불로 잡아내는지 확인한다(소스는 무편집).
test("D1 역검증: 사인파로 되돌리면 같은 검사식이 실패로 잡는다", () => {
  const poisoned = Buffer.from(buildMockSilentWavBuffer()); // 복사본 — 정본 반환값은 건드리지 않는다
  const numSamples = (poisoned.byteLength - DATA_START) / 2;
  for (let i = 0; i < numSamples; i++) {
    const sample = 0.3 * Math.sin(2 * Math.PI * 880 * (i / 8000)); // 무음화 전의 880Hz "삐"
    poisoned.writeInt16LE(Math.round(sample * 32767), DATA_START + i * 2);
  }

  const poisonedHasSound = poisoned.subarray(DATA_START).some((byte) => byte !== 0);
  assert.equal(poisonedHasSound, true, "역검증 오염본에 소리가 들어가 있어야 대조가 성립한다");
  assert.notEqual(
    poisonedHasSound,
    buildMockSilentWavBuffer().subarray(DATA_START).some((byte) => byte !== 0),
    "무음 검사식이 사인파와 무음을 실제로 가른다",
  );
});
