// §145(DECISIONS #259) 목소리 파일 업로드 — 판정표 UF(파일) · UD(길이) · WAV 변환 · 화면 배선.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_RECORDING_SECONDS,
  MIN_RECORDING_SECONDS,
  UPLOAD_MAX_BYTES,
  UPLOAD_MESSAGES,
  UPLOAD_SAMPLE_RATE,
  encodeWav16kMono,
  judgeUploadDuration,
  judgeUploadFile,
} from "./uploadedVoice.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

test("[UF] 파일 판정표 — 크기 · 형식", () => {
  const rows: [{ size: number; type: string; name: string }, string][] = [
    [{ size: 0, type: "audio/wav", name: "a.wav" }, "empty"], // UF1
    [{ size: UPLOAD_MAX_BYTES + 1, type: "audio/mpeg", name: "a.mp3" }, "too_big"], // UF2
    [{ size: UPLOAD_MAX_BYTES, type: "audio/mpeg", name: "a.mp3" }, "ok"], // UF2 경계
    [{ size: 1000, type: "audio/mp4", name: "voice.m4a" }, "ok"], // UF3 MIME
    [{ size: 1000, type: "", name: "voice.M4A" }, "ok"], // UF3 MIME 없음 · 확장자
    [{ size: 1000, type: "", name: "voice.webm" }, "ok"],
    [{ size: 1000, type: "video/mp4", name: "clip.mp4" }, "not_audio"], // UF4
    [{ size: 1000, type: "image/png", name: "a.png" }, "not_audio"],
    [{ size: 1000, type: "", name: "voice.wav.exe" }, "not_audio"],
  ];
  for (const [file, want] of rows) assert.equal(judgeUploadFile(file), want, JSON.stringify(file));
});

test("[UD] 길이 판정표 — 즉석 녹음과 같은 기준(20초 ~ 1분)", () => {
  const rows: [number, string][] = [
    [Number.NaN, "decode_failed"], // UD4
    [0, "decode_failed"],
    [19.9, "too_short"], // UD1
    [20, "ok"], // UD3
    [60, "ok"],
    [60.5, "ok"], // 인코더 꼬리 여유
    [60.6, "too_long"], // UD2
    [600, "too_long"],
  ];
  for (const [sec, want] of rows) assert.equal(judgeUploadDuration(sec), want, String(sec));
  for (const v of ["empty", "too_big", "not_audio", "decode_failed", "too_short", "too_long"] as const) {
    assert.ok(UPLOAD_MESSAGES[v].length > 0);
  }
});

test("[기준 대조] 업로드 길이 기준 = 즉석 녹음 훅 상수", () => {
  const hook = read("src/lib/recording/useVoiceRecorder.ts");
  const constOf = (name: string) => Number(hook.match(new RegExp(`export const ${name} = (\\d+);`))?.[1]);
  assert.equal(MIN_RECORDING_SECONDS, constOf("MIN_RECORDING_SECONDS"));
  assert.equal(MAX_RECORDING_SECONDS, constOf("MAX_RECORDING_SECONDS"));
});

test("[WAV] 48kHz 스테레오 → 16kHz 모노 16bit · 채널 평균 · 머리말", () => {
  const n = 48_000;
  const left = new Float32Array(n).fill(0.75);
  const right = new Float32Array(n).fill(-0.25);
  const wav = encodeWav16kMono([left, right], 48_000);
  const v = new DataView(wav.buffer);
  const tag = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
  assert.equal(tag(0), "RIFF");
  assert.equal(tag(8), "WAVE");
  assert.equal(v.getUint16(22, true), 1, "모노");
  assert.equal(v.getUint32(24, true), UPLOAD_SAMPLE_RATE);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), UPLOAD_SAMPLE_RATE * 2, "1초 = 16000 표본");
  assert.equal(wav.length, 44 + UPLOAD_SAMPLE_RATE * 2);
  assert.ok(Math.abs(v.getInt16(44 + 100 * 2, true) - 0.25 * 0x7fff) <= 1);
  // 범위 밖 값은 자른다
  const loud = encodeWav16kMono([new Float32Array(160).fill(3)], 16_000);
  assert.equal(new DataView(loud.buffer).getInt16(44, true), 0x7fff);
});

test("[storage.rules] 1분 변환 WAV가 녹음 경로 크기 상한 안에 든다", () => {
  const rules = read("storage.rules");
  const mb = Number(rules.match(/request\.resource\.size < (\d+) \* 1024 \* 1024/)?.[1]);
  assert.ok(mb > 0, "규칙 상한을 읽지 못함");
  const oneMinute = 44 + (MAX_RECORDING_SECONDS + 0.5) * UPLOAD_SAMPLE_RATE * 2;
  assert.ok(oneMinute < mb * 1024 * 1024, `${oneMinute} < ${mb}MB`);
  assert.match(rules, /contentType\.matches\('audio\/\.\*'\)/, "audio/* 검사는 그대로");
});

test("[배선] 업로드는 보내기 녹음에만 · 확인 체크 없이는 못 고름 · 녹음과 같은 저장 · 클론 경로", () => {
  const page = read("src/app/onboarding/record/page.tsx");
  assert.match(page, /const canUpload = isSendRecording && profileFormOk && uploadOwnerChecked && !preparingFile;/);
  assert.equal(page.split('type="file"').length - 1, 1, "파일 입력은 한 곳");
  assert.match(page, /disabled=\{!canUpload\}\s*onChange/);
  assert.equal(page.split("uploadBytes(").length - 1, 1, "업로드 · 녹음이 같은 호출 하나");
  assert.equal(page.split("createVoiceClone(").length - 1, 1);
  assert.match(page, /const source = uploaded\s*\? \{ blob: uploaded\.wav, contentType: "audio\/wav" \}/);
  assert.match(page, /\{UPLOAD_OWNER_CONFIRM_TEXT\}/);
  // 업로드 블록은 isSendRecording 안에만 있다
  const fileAt = page.indexOf('type="file"');
  const blockAt = page.lastIndexOf("{isSendRecording && (", fileAt);
  assert.ok(blockAt > 0 && !page.slice(blockAt, fileAt).includes("{recorder.status ==="), "업로드 입력이 보내기 블록 밖");
});
