#!/usr/bin/env node
// 2026-10-27 — 실시간 통화 사기범 음성의 **턴 간 높낮이(F0) 흔들림** 오프라인 분석(앱 코드 아님 · 실 키 0 · 과금 0).
// 입력: scripts/live-loudness-probe.mjs `--turns N`이 남긴 `<id>-<rep>.wav`(24kHz mono PCM16) + `<id>-<rep>.turns.json`(턴 끝 샘플 위치).
//   turns.json이 없으면 0.7초 이상 무음을 경계로 나눈 구간을 턴 대신 쓴다(옛 WAV용 — 결과 표에 "무음 분할"로 표시).
// 방법: 12kHz로 낮춘 뒤 YIN(문턱 0.15 · 60~400Hz · 10ms 간격)으로 프레임 F0를 구하고, 말소리 크기 문턱을 넘는 유성 프레임만 쓴다.
//   턴 F0 = 그 턴 유성 프레임 F0의 중앙값. 유성 0.5초 미만 턴은 통계에서 뺀다. 반음 = 12·log2(f / 100Hz).
//   세션 지표: 턴 F0 중앙값(Hz) · 턴 간 표준편차(반음) · 최대-최소 폭(반음) · 세션 중앙값에서 2반음 이상 벗어난 턴 수.
//   보조 지표(구 단위): 턴 안을 0.3초 이상 무음으로 다시 나눈 구(유성 0.4초 이상)의 같은 지표 — 한 턴 안에서 목소리를 바꾸는 경우용.
//
// node scripts/live-pitch-analyze.mjs <wav 폴더> [--out <결과 md>]   ·   node scripts/live-pitch-analyze.mjs --selftest
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const FMIN = 60, FMAX = 400, YIN_THRESHOLD = 0.15, HOP_SEC = 0.01;
const MIN_TURN_VOICED_SEC = 0.5, MIN_PHRASE_VOICED_SEC = 0.4, JUMP_ST = 2;

export function readWav(file) {
  const b = readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error(`WAV 아님: ${file}`);
  let off = 12, sampleRate = 0, channels = 1, bits = 16, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === "fmt ") { channels = b.readUInt16LE(off + 10); sampleRate = b.readUInt32LE(off + 12); bits = b.readUInt16LE(off + 22); }
    if (id === "data") data = b.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size & 1);
  }
  if (!data || bits !== 16) throw new Error(`PCM16 data 없음: ${file}`);
  const n = Math.floor(data.length / 2 / channels);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = data.readInt16LE(i * 2 * channels) / 32768;
  return { sampleRate, samples: out };
}

/** 정수배 다운샘플(창 씌운 sinc 저역 통과 후 솎기). */
function downsample(x, factor) {
  if (factor <= 1) return x;
  const taps = 31, half = 15, fc = 0.45 / factor, h = new Float32Array(taps);
  let sum = 0;
  for (let i = 0; i < taps; i += 1) {
    const k = i - half;
    const sinc = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k);
    h[i] = sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1)));
    sum += h[i];
  }
  for (let i = 0; i < taps; i += 1) h[i] /= sum;
  const out = new Float32Array(Math.floor(x.length / factor));
  for (let o = 0; o < out.length; o += 1) {
    const c = o * factor;
    let acc = 0;
    for (let i = 0; i < taps; i += 1) { const j = c + i - half; if (j >= 0 && j < x.length) acc += h[i] * x[j]; }
    out[o] = acc;
  }
  return out;
}

/** 프레임별 { f0(0 = 무성), rms }. 프레임 i의 중심 ≈ i·hop. */
export function trackF0(samples, sampleRate) {
  const factor = Math.max(1, Math.floor(sampleRate / 12000));
  const x = downsample(samples, factor);
  const sr = sampleRate / factor;
  const tauMin = Math.floor(sr / FMAX), tauMax = Math.ceil(sr / FMIN);
  const W = Math.ceil(sr * 0.025), hop = Math.round(sr * HOP_SEC);
  const d = new Float64Array(tauMax + 2);
  const frames = [];
  for (let start = 0; start + W + tauMax + 1 < x.length; start += hop) {
    let e = 0;
    for (let j = 0; j < W; j += 1) e += x[start + j] * x[start + j];
    const rms = Math.sqrt(e / W);
    let f0 = 0;
    if (rms > 1e-3) {
      for (let tau = 1; tau <= tauMax + 1; tau += 1) {
        let s = 0;
        for (let j = 0; j < W; j += 1) { const v = x[start + j] - x[start + j + tau]; s += v * v; }
        d[tau] = s;
      }
      let running = 0, best = -1;
      const cm = new Float64Array(tauMax + 2);
      cm[0] = 1;
      for (let tau = 1; tau <= tauMax + 1; tau += 1) { running += d[tau]; cm[tau] = running > 0 ? (d[tau] * tau) / running : 1; }
      for (let tau = tauMin; tau <= tauMax; tau += 1) {
        if (cm[tau] < YIN_THRESHOLD) { while (tau + 1 <= tauMax && cm[tau + 1] < cm[tau]) tau += 1; best = tau; break; }
      }
      if (best > 0) {
        const a = cm[best - 1], b = cm[best], c = cm[best + 1];
        const denom = a - 2 * b + c;
        const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
        f0 = sr / (best + Math.max(-1, Math.min(1, shift)));
      }
    }
    frames.push({ f0, rms });
  }
  return { frames, hopSec: hop / sr };
}

const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const st = (hz) => 12 * Math.log2(hz / 100);
const stdev = (a) => { if (a.length < 2) return 0; const m = a.reduce((p, q) => p + q, 0) / a.length; return Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / (a.length - 1)); };

/** 말소리 크기 문턱: 상위 프레임 RMS 중앙값보다 20dB 낮은 값(최소 -45dBFS). */
function voicedGate(frames) {
  const loud = frames.map((f) => f.rms).filter((r) => r > 1e-3).sort((p, q) => q - p);
  const top = loud.length ? loud[Math.floor(loud.length * 0.1)] : 0;
  return Math.max(10 ** (-45 / 20), top / 10);
}

/** 프레임 구간 [a,b)를 무음(gapSec 이상 저음량)으로 나눈 하위 구간들. */
function splitBySilence(frames, a, b, gate, hopSec, gapSec) {
  const out = [];
  let segStart = -1, quiet = 0;
  const gapFrames = Math.round(gapSec / hopSec);
  for (let i = a; i < b; i += 1) {
    const loud = frames[i].rms >= gate;
    if (loud) { if (segStart < 0) segStart = i; quiet = 0; }
    else if (segStart >= 0) { quiet += 1; if (quiet >= gapFrames) { out.push([segStart, i - quiet + 1]); segStart = -1; quiet = 0; } }
  }
  if (segStart >= 0) out.push([segStart, b - quiet]);
  return out;
}

function segmentStats(frames, gate, a, b, hopSec) {
  const f0s = [];
  for (let i = a; i < b; i += 1) if (frames[i].f0 > 0 && frames[i].rms >= gate) f0s.push(frames[i].f0);
  return { voicedSec: +(f0s.length * hopSec).toFixed(2), f0Hz: f0s.length ? +median(f0s).toFixed(1) : null };
}

function summarize(units, minVoiced) {
  const ok = units.filter((u) => u.f0Hz && u.voicedSec >= minVoiced);
  const sts = ok.map((u) => st(u.f0Hz));
  const mid = median(sts);
  return {
    n: ok.length,
    medianHz: ok.length ? +(100 * 2 ** (mid / 12)).toFixed(1) : null,
    sdSt: +stdev(sts).toFixed(2),
    rangeSt: sts.length ? +(Math.max(...sts) - Math.min(...sts)).toFixed(2) : 0,
    jumps: sts.filter((s) => Math.abs(s - mid) >= JUMP_ST).length,
  };
}

export function analyzeSession(samples, sampleRate, turnEnds /* 샘플 위치 배열 | null */) {
  const { frames, hopSec } = trackF0(samples, sampleRate);
  const gate = voicedGate(frames);
  const toFrame = (s) => Math.min(frames.length, Math.round(s / sampleRate / hopSec));
  let bounds;
  let mode;
  if (turnEnds?.length) {
    mode = "turns.json";
    bounds = [];
    let prev = 0;
    for (const end of turnEnds) { const e = toFrame(end); if (e > prev) bounds.push([prev, e]); prev = e; }
  } else {
    mode = "무음 분할";
    bounds = splitBySilence(frames, 0, frames.length, gate, hopSec, 0.7);
  }
  const turns = bounds.map(([a, b], i) => ({ turn: i + 1, ...segmentStats(frames, gate, a, b, hopSec) }));
  const phrases = bounds.flatMap(([a, b], i) =>
    splitBySilence(frames, a, b, gate, hopSec, 0.3).map(([pa, pb]) => ({ turn: i + 1, ...segmentStats(frames, gate, pa, pb, hopSec) })));
  return { mode, turns, phrases, turnStats: summarize(turns, MIN_TURN_VOICED_SEC), phraseStats: summarize(phrases, MIN_PHRASE_VOICED_SEC) };
}

// ── 자가 검증: 합성 유성음(배음 + 약한 떨림) ─────────────────────────────────────────────────
function synth(sr, segments /* [{hz, sec} | {silence}] */) {
  const parts = [];
  for (const seg of segments) {
    const n = Math.round(sr * (seg.sec ?? seg.silence));
    const a = new Float32Array(n);
    if (seg.hz) {
      let phase = 0;
      for (let i = 0; i < n; i += 1) {
        const f = seg.hz * (1 + 0.01 * Math.sin((2 * Math.PI * 5 * i) / sr));
        phase += (2 * Math.PI * f) / sr;
        a[i] = 0.3 * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
      }
    }
    parts.push(a);
  }
  const total = parts.reduce((p, q) => p + q.length, 0);
  const out = new Float32Array(total);
  let at = 0;
  const ends = [];
  for (const p of parts) { out.set(p, at); at += p.length; ends.push(at); }
  return { out, ends };
}

function selftest() {
  const sr = 24000;
  const fails = [];
  const check = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) fails.push(msg); };
  // (1) 순음 정확도 — 남성 대역 · 여성 대역
  for (const hz of [85, 110, 150, 220, 300]) {
    const { out } = synth(sr, [{ hz, sec: 1.5 }]);
    const r = analyzeSession(out, sr, [out.length]);
    const err = Math.abs(st(r.turns[0].f0Hz) - st(hz));
    check(err < 0.2, `순음 ${hz}Hz → ${r.turns[0].f0Hz}Hz (오차 ${err.toFixed(3)}반음 < 0.2)`);
  }
  // (2) 같은 목소리 4턴 — 흔들림 0 근처 · 튄 턴 0
  const steady = synth(sr, [{ hz: 115, sec: 1.2 }, { silence: 0.4 }, { hz: 115, sec: 1.0 }, { silence: 0.4 }, { hz: 115, sec: 1.4 }, { silence: 0.4 }, { hz: 115, sec: 1.1 }]);
  const steadyEnds = [steady.ends[1], steady.ends[3], steady.ends[5], steady.ends[6]];
  const s = analyzeSession(steady.out, sr, steadyEnds);
  check(s.turnStats.n === 4 && s.turnStats.sdSt < 0.1 && s.turnStats.jumps === 0, `고정 115Hz 4턴 → n ${s.turnStats.n} · sd ${s.turnStats.sdSt} · 튄 턴 ${s.turnStats.jumps}`);
  // (3) 3명처럼 — 115 / 115·2^(4/12) / 115·2^(-3/12) / 115 → 폭 7반음 · 튄 턴 2
  const hzs = [115, 115 * 2 ** (4 / 12), 115 * 2 ** (-3 / 12), 115];
  const multi = synth(sr, hzs.flatMap((hz) => [{ hz, sec: 1.2 }, { silence: 0.4 }]));
  const m = analyzeSession(multi.out, sr, [multi.ends[1], multi.ends[3], multi.ends[5], multi.ends[7]]);
  check(Math.abs(m.turnStats.rangeSt - 7) < 0.3 && m.turnStats.jumps === 2, `115 · +4 · -3 · 0반음 → 폭 ${m.turnStats.rangeSt}(기대 7) · 튄 턴 ${m.turnStats.jumps}(기대 2)`);
  // (4) 한 턴 안에서 목소리 바꾸기 — 턴 지표는 1턴뿐, 구 지표가 잡는다
  const inTurn = synth(sr, [{ hz: 115, sec: 1.0 }, { silence: 0.4 }, { hz: 115 * 2 ** (5 / 12), sec: 1.0 }, { silence: 0.4 }, { hz: 115, sec: 1.0 }]);
  const it = analyzeSession(inTurn.out, sr, [inTurn.out.length]);
  check(it.phraseStats.n === 3 && Math.abs(it.phraseStats.rangeSt - 5) < 0.3, `한 턴 3구(0 · +5 · 0반음) → 구 n ${it.phraseStats.n} · 폭 ${it.phraseStats.rangeSt}(기대 5)`);
  // (5) turns.json 없이 무음 분할(0.7초 문턱보다 긴 1초 무음)
  const gapped = synth(sr, hzs.flatMap((hz) => [{ hz, sec: 1.2 }, { silence: 1.0 }]));
  const ns = analyzeSession(gapped.out, sr, null);
  check(ns.mode === "무음 분할" && ns.turnStats.n === 4, `무음 분할 → 구간 ${ns.turnStats.n}(기대 4)`);
  // (6) 무음 · 잡음 구간은 유성으로 잡지 않는다
  const noise = new Float32Array(sr);
  let seed = 7;
  for (let i = 0; i < noise.length; i += 1) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; noise[i] = 0.002 * ((seed / 0x7fffffff) * 2 - 1); }
  const nz = analyzeSession(noise, sr, [noise.length]);
  check(nz.turnStats.n === 0, `저음량 잡음 1초 → 유효 턴 ${nz.turnStats.n}(기대 0)`);
  console.log(fails.length ? `자가 검증 실패 ${fails.length}건` : "자가 검증 전부 통과");
  process.exitCode = fails.length ? 1 : 0;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) return selftest();
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) throw new Error("사용법: node scripts/live-pitch-analyze.mjs <wav 폴더> [--out <md>] | --selftest");
  const outIdx = args.indexOf("--out");
  const outMd = outIdx >= 0 ? args[outIdx + 1] : null;
  const rows = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".wav")).sort()) {
    const base = name.slice(0, -4);
    const { sampleRate, samples } = readWav(path.join(dir, name));
    const tj = path.join(dir, `${base}.turns.json`);
    const turnsDoc = existsSync(tj) ? JSON.parse(readFileSync(tj, "utf8")) : null;
    const r = analyzeSession(samples, sampleRate, turnsDoc?.turns?.map((t) => t.endSample) ?? null);
    rows.push({ session: base, seconds: +(samples.length / sampleRate).toFixed(1), ...r, texts: turnsDoc?.turns?.map((t) => t.text) ?? [] });
  }
  writeFileSync(path.join(dir, "pitch-analysis.json"), JSON.stringify(rows, null, 2), "utf8");
  const lines = [
    "| 세션 | 분할 | 길이(초) | 유효 턴 | 턴 F0 중앙값(Hz) | 턴 간 표준편차(반음) | 턴 최대-최소(반음) | 2반음 이상 튄 턴 | 구 수 | 구 표준편차(반음) | 구 최대-최소(반음) | 2반음 이상 튄 구 |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.session} | ${r.mode} | ${r.seconds} | ${r.turnStats.n}/${r.turns.length} | ${r.turnStats.medianHz} | ${r.turnStats.sdSt} | ${r.turnStats.rangeSt} | ${r.turnStats.jumps} | ${r.phraseStats.n} | ${r.phraseStats.sdSt} | ${r.phraseStats.rangeSt} | ${r.phraseStats.jumps} |`),
    "",
    ...rows.flatMap((r) => [`### ${r.session} 턴별`, "| 턴 | 유성(초) | F0(Hz) | 세션 중앙값 대비(반음) | 자막 |", "|---|---|---|---|---|",
      ...r.turns.map((t, i) => `| ${t.turn} | ${t.voicedSec} | ${t.f0Hz ?? "-"} | ${t.f0Hz && r.turnStats.medianHz ? (st(t.f0Hz) - st(r.turnStats.medianHz)).toFixed(2) : "-"} | ${(r.texts[i] ?? "").replace(/\|/g, "/").slice(0, 80)} |`), ""]),
  ];
  const md = lines.join("\n");
  console.log(md);
  if (outMd) writeFileSync(outMd, md, "utf8");
}

main();
