// §114(DECISIONS #229) — 사기범 음성 라우드니스 정규화(loudnessNormalizer.ts 머리 표) + Gemini 세션 배선(소스 스캔).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FRAME_SAMPLES,
  INITIAL_LOUDNESS_STATE,
  MAX_GAIN,
  MIN_GAIN,
  PEAK_CEILING,
  TARGET_SPEECH_RMS_DBFS,
  dbfs,
  normalizeChunk,
  speechRms,
  type LoudnessState,
} from "./loudnessNormalizer.ts";

const RATE = 24000;

/** 말소리 흉내 — 음절(약 200ms 소리 + 80ms 쉼)마다 진폭이 출렁이는 여러 사인의 합. 결정적(시드 고정). */
function speechLike(seconds: number, rmsDb: number, seed = 1): Float32Array {
  const n = Math.round(seconds * RATE);
  const raw = new Float32Array(n);
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const syllable = Math.round(0.28 * RATE);
  for (let i = 0; i < n; i += 1) {
    const pos = i % syllable;
    const voiced = pos < Math.round(0.2 * RATE);
    const env = voiced ? Math.sin((Math.PI * pos) / (0.2 * RATE)) : 0;
    const t = i / RATE;
    raw[i] = env * (0.6 * Math.sin(2 * Math.PI * 140 * t) + 0.3 * Math.sin(2 * Math.PI * 280 * t + 1) + 0.1 * (rand() * 2 - 1));
  }
  const scale = 10 ** (rmsDb / 20) / speechRms(raw);
  return raw.map((v) => v * scale);
}

/** Gemini처럼 청크(기본 40ms)로 나눠 흘려 보내고, 정규화된 전체와 최종 상태를 돌려준다. */
function stream(samples: Float32Array, chunk = 960, start: LoudnessState = INITIAL_LOUDNESS_STATE) {
  const out = new Float32Array(samples.length);
  let state = start;
  for (let at = 0; at < samples.length; at += chunk) {
    const r = normalizeChunk(samples.subarray(at, Math.min(samples.length, at + chunk)), state);
    out.set(r.out, at);
    state = r.state;
  }
  return { out, state };
}

test("[§114 정규화] 원본 크기가 −24 ~ −7dBFS(게인 범위 안)로 달라도 정규화 뒤 말소리 RMS가 목표 ±1dB(첫 1초 뒤 구간)", () => {
  for (const level of [-24, -21, -18, -12, -7]) {
    const input = speechLike(6, level, 7);
    const { out } = stream(input);
    const settled = out.subarray(RATE); // 첫 1초 이후
    const after = dbfs(speechRms(settled));
    assert.ok(Math.abs(after - TARGET_SPEECH_RMS_DBFS) <= 1, `입력 ${level}dBFS → ${after.toFixed(2)}dBFS`);
  }
});

test("[§114 정규화] 청크 크기(20 · 40 · 100 · 500ms)와 무관하게 같은 결과(±0.5dB)", () => {
  const input = speechLike(6, -12, 3);
  const results = [480, 960, 2400, 12000].map((c) => dbfs(speechRms(stream(input, c).out.subarray(RATE))));
  for (const r of results) assert.ok(Math.abs(r - results[0]!) <= 0.5, results.map((x) => x.toFixed(2)).join(" / "));
});

test("[§114 정규화] 게인 범위(−12 ~ +6dB) · 꼭대기 상한 · 무음은 그대로 0", () => {
  const veryQuiet = stream(speechLike(3, -50 + 10, 5)); // −40dBFS(게이트 위) — 목표까지 +20dB가 필요하지만 +6dB에서 멈춘다
  assert.ok(veryQuiet.state.gain <= MAX_GAIN + 1e-9);
  const veryLoud = stream(speechLike(3, -3, 5));
  assert.ok(veryLoud.state.gain >= MIN_GAIN - 1e-9);
  for (const r of [veryQuiet, veryLoud]) {
    let peak = 0;
    for (const v of r.out) peak = Math.max(peak, Math.abs(v));
    assert.ok(peak <= 1.0, `꼭대기 ${peak}`);
  }
  const silence = normalizeChunk(new Float32Array(FRAME_SAMPLES * 4), INITIAL_LOUDNESS_STATE);
  assert.ok(silence.out.every((v) => v === 0));
  assert.equal(silence.state.gain, 1, "잰 것이 없으면 게인 1 유지");
  assert.equal(silence.state.speechSamples, 0, "무음은 측정에서 빠진다");
  // 꼭대기 보호 — 큰 순간 하나가 있는 청크는 ceiling을 넘지 않게 게인이 내려간다
  const spike = new Float32Array(FRAME_SAMPLES * 2).fill(0.05);
  spike[100] = 0.9;
  const protectedChunk = normalizeChunk(spike, { speechSumSquares: 1e-6 * 48000, speechSamples: 48000, gain: MAX_GAIN });
  assert.ok(protectedChunk.state.gain * spike[100]! <= PEAK_CEILING + 1e-9); // Float32 저장값 기준
});

test("[§114 정규화] 직전 게인이 큰 채로 꼭대기 큰 청크가 와도 이동 구간에서 꼭대기 상한을 넘지 않는다(실측 +0.08dBFS 회귀)", () => {
  const chunk = new Float32Array(FRAME_SAMPLES * 4).fill(0.02);
  chunk[10] = 0.95; // 청크 맨 앞 — 이동 시작 게인이 그대로 곱해지는 자리
  const r = normalizeChunk(chunk, { speechSumSquares: 1e-4 * 96000, speechSamples: 96000, gain: MAX_GAIN });
  let peak = 0;
  for (const v of r.out) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= PEAK_CEILING + 1e-6, `꼭대기 ${peak}`);
});

test("[§114 정규화] 청크 사이 게인은 이어진다(직전 끝 게인에서 시작 — 딸깍 0) · 입력 배열은 바꾸지 않는다", () => {
  const input = speechLike(1, -10, 9);
  const copy = input.slice();
  const first = normalizeChunk(input.subarray(0, 960), INITIAL_LOUDNESS_STATE);
  assert.deepEqual(input, copy, "입력 무변경");
  const second = normalizeChunk(input.subarray(960, 1920), first.state);
  const g0 = second.out[0]! / input[960]!;
  if (Number.isFinite(g0) && input[960] !== 0) assert.ok(Math.abs(g0 - first.state.gain) < 1e-6, "둘째 청크 첫 샘플 = 직전 게인");
});

test("[§114 배선] Gemini 세션 — 받은 PCM을 정규화한 뒤 버퍼에 담고, 스피커 증폭(§108)은 그 뒤 노드 그대로", () => {
  const session = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8").replace(/\r\n/g, "\n");
  const at = session.indexOf("const normalized = normalizeChunk(samples, loudness);");
  assert.ok(at > 0, "정규화 호출");
  const copyAt = session.indexOf("buffer.copyToChannel(normalized.out, 0);");
  assert.ok(copyAt > at, "정규화 결과를 버퍼에 담는다");
  assert.ok(!session.includes("buffer.copyToChannel(samples, 0);"), "원본 PCM 직접 재생 0");
  assert.ok(session.includes("source.connect(outputGain ?? outputContext.destination);"), "그 뒤 통화/스피커 게인 · 컴프레서 · 리미터 체인 그대로");
  assert.ok(session.indexOf("noteChunkReceived(samples);") < at, "진단은 원본 기준(pcm.peakDb 의미 유지)");
});
