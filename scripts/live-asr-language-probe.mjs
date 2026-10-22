#!/usr/bin/env node
// §105.2.4 · §105.2.5 — Live 입력(전사 언어 힌트 · 발화 시작 감지) 실측 도구. gemini-3.8-live에 앱과 같은 경로(authTokens.create의
// liveConnectConstraints → 토큰으로 live.connect)로 붙어 두 가지를 본다.
//   clips — 짧은 한국어 발화(clipN.wav)를 하나씩 보내 입력 전사 · 응답을 모은다(언어 오인식 · 한 음절 미감지).
//   echo  — 모델이 길게 말하는 동안 "스피커 소리가 마이크로 되돌아온 것"(모델 출력의 감쇠 · 지연 사본) + 방 소음을 실시간으로
//           보내 모델이 스스로 끊기는지(serverContent.interrupted)를 센다(§50.8 자기 끊김 회귀 — 앱의 반이중 게이트가 없다고
//           가정한 최악 조건).
//
// ⛔ 측정 전용 — 앱 코드를 바꾸지 않는다.
// ⛔ 키는 --secret <파일>의 `<--key-var>=` 줄에서 메모리로만 읽는다(출력 · 파일 기록 0). 대체 키로 넘어가지 않는다.
// ⛔ 실 키 과금 — 매번 메인 승인 필요. 한 번 실행에 세션 최대 3(고정) · 429면 즉시 멈춘다.
//
// 사용법(저장소 루트):
//   node scripts/live-asr-language-probe.mjs --secret <functions/.secret.local> --key-var GEMINI_API_KEY2 \
//     --clips <wav 폴더(16kHz mono 16-bit · clipN.wav + phrases.json)> --out <폴더> \
//     --runs <test:mode:prefixMs,...>   (예: clips:hints:150,echo:hints:300,echo:hints:150)
//   --modes none,hints,vocab 만 주면 종전처럼 clips 시험을 prefix 300으로 돌린다.

import { createRequire } from "node:module";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const require = createRequire(path.join(repoRoot, "functions", "package.json"));
const { GoogleGenAI, Modality, StartSensitivity, EndSensitivity } = require("@google/genai");

const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

function readApiKey() {
  const secret = argVal("--secret", "");
  const keyVar = argVal("--key-var", "GEMINI_API_KEY2");
  if (!secret) throw new Error("--secret <파일> 필요");
  const line = readFileSync(secret, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${keyVar}=`));
  if (!line) throw new Error(`${keyVar} 줄 없음 — 다른 키로 대체하지 않고 멈춘다`);
  let v = line.slice(keyVar.length + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v.split(",")[0].trim();
}

const MODEL = "gemini-3.8-live"; // functions/src/realtime/geminiProvider.ts GEMINI_LIVE_MODEL
const MODES = {
  none: {}, // 언어 자동 감지(§105.2.4 이전)
  hints: { languageHints: { languageCodes: ["ko-KR"] } }, // 현행(§105.2.4)
  vocab: {
    customVocabulary: ["네", "응", "어", "아니요", "그래요", "누구세요", "이체", "보관 지갑", "계좌", "인증번호", "만 원", "검찰", "은행"],
  },
};
const SYSTEM_CLIPS = "너는 한국어 전화 통화 상대다. 상대가 무슨 말을 하든 한국어로 한 문장만 짧게 답한다.";
const SYSTEM_ECHO =
  "너는 한국어 전화 상담원이다. 질문을 받으면 끊지 말고 5~6문장으로 차근차근 자세히 설명한다. 한 번에 이어서 말한다.";
const ECHO_QUESTIONS = [
  "보관 지갑으로 옮기는 절차를 처음부터 끝까지 자세히 설명해 주세요.",
  "계좌가 왜 위험한지, 지금 무엇을 해야 하는지 차례대로 길게 설명해 주세요.",
  "인증번호 확인 과정이 어떻게 되는지 단계별로 자세히 알려 주세요.",
];
// 에코 조건(판단값): 스피커 → 마이크 되돌림 -14dB · 120ms 지연(에코 제거가 덜 된 휴대폰 스피커 통화의 거친 근사) + 방 소음 약 -42dBFS RMS.
const ECHO_GAIN = 0.2;
const ECHO_DELAY_MS = 120;
const NOISE_RMS = 0.008;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readWavPcm(file) {
  const buf = readFileSync(file);
  // RIFF 헤더에서 data 청크를 찾는다.
  let off = 12;
  while (off < buf.length - 8) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") return buf.subarray(off + 8, off + 8 + size);
    off += 8 + size;
  }
  throw new Error(`data 청크 없음: ${file}`);
}

async function openSession(apiKey, { mode, prefixMs, system }, callbacks) {
  const client = new GoogleGenAI({ apiKey });
  const now = Date.now();
  const token = await client.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(now + 10 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
      liveConnectConstraints: {
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: system,
          speechConfig: { languageCode: "ko-KR" },
          inputAudioTranscription: MODES[mode],
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
              prefixPaddingMs: prefixMs,
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
              silenceDurationMs: 400,
            },
          },
        },
      },
      httpOptions: { apiVersion: "v1alpha" },
    },
  });
  if (!token?.name) throw new Error("token: name 없음");
  const live = new GoogleGenAI({ apiKey: token.name, httpOptions: { apiVersion: "v1alpha" } });
  return live.live.connect({ model: MODEL, config: { responseModalities: [Modality.AUDIO] }, callbacks });
}

const errText = (e) => (e instanceof Error ? e.message : String(e?.message ?? e)).slice(0, 300);

async function runClips(apiKey, run, clips, phrases) {
  const result = { ...run, connectOk: false, error: null, clips: [] };
  let current = null;
  let turnDone = null;
  let closed = false;
  let session;
  try {
    session = await openSession(apiKey, { ...run, system: SYSTEM_CLIPS }, {
      onmessage: (m) => {
        const sc = m.serverContent;
        if (!current) return;
        if (sc?.inputTranscription?.text) current.input += sc.inputTranscription.text;
        if (sc?.outputTranscription?.text) current.output += sc.outputTranscription.text;
        if (sc?.turnComplete) turnDone?.();
      },
      onerror: (e) => {
        result.error = `socket: ${errText(e)}`;
      },
      onclose: (e) => {
        closed = true;
        if (!result.error && e?.code && e.code !== 1000) result.error = `close ${e.code} ${String(e.reason ?? "").slice(0, 200)}`;
        turnDone?.();
      },
    });
    result.connectOk = true;
  } catch (e) {
    result.error = errText(e);
    return result;
  }
  await sleep(500);
  const silence = Buffer.alloc(16000 * 2); // 1초 무음(발화 종료 감지용)
  for (let i = 0; i < clips.length && !closed; i += 1) {
    current = { phrase: phrases[i], input: "", output: "" };
    const done = new Promise((r) => {
      turnDone = r;
      setTimeout(r, 12_000);
    });
    const pcm = Buffer.concat([readWavPcm(clips[i]), silence]);
    // 앱과 비슷한 크기(약 128ms)로 잘라 실시간 속도로 보낸다.
    for (let o = 0; o < pcm.length && !closed; o += 4096) {
      session.sendRealtimeInput({ audio: { data: pcm.subarray(o, o + 4096).toString("base64"), mimeType: "audio/pcm;rate=16000" } });
      await sleep(128);
    }
    await done;
    result.clips.push(current);
    current = null;
    await sleep(800);
  }
  try {
    session.close();
  } catch {
    // 무시
  }
  return result;
}

/** 24kHz PCM16 → 16kHz Float(선형 보간) — 모델 출력을 "마이크로 되돌아온 소리"로 만든다. */
function downsample24to16(buf) {
  const n = Math.floor(buf.length / 2);
  const outLen = Math.floor((n * 2) / 3);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * 1.5;
    const a = Math.floor(pos);
    const frac = pos - a;
    const s0 = buf.readInt16LE(Math.min(a, n - 1) * 2) / 32768;
    const s1 = buf.readInt16LE(Math.min(a + 1, n - 1) * 2) / 32768;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

async function runEcho(apiKey, run) {
  const result = { ...run, connectOk: false, error: null, turns: [] };
  let closed = false;
  let turn = null;
  let turnDone = null;
  // 재생 대기열(16kHz float) — 모델 출력이 몰려 와도 실제 재생 속도로 마이크에 섞는다.
  let echoQueue = [];
  let echoPending = 0;
  let session;
  try {
    session = await openSession(apiKey, { ...run, system: SYSTEM_ECHO }, {
      onmessage: (m) => {
        const sc = m.serverContent;
        if (m.data && turn) {
          const f = downsample24to16(Buffer.from(m.data, "base64"));
          echoQueue.push(f);
          echoPending += f.length;
          turn.audioSec += f.length / 16000;
        }
        if (!turn) return;
        if (sc?.interrupted) turn.interrupted += 1;
        if (sc?.inputTranscription?.text) turn.falseInput += sc.inputTranscription.text;
        if (sc?.outputTranscription?.text) turn.output += sc.outputTranscription.text;
        if (sc?.turnComplete) {
          turn.turnComplete = true;
          turnDone?.();
        }
      },
      onerror: (e) => {
        result.error = `socket: ${errText(e)}`;
      },
      onclose: (e) => {
        closed = true;
        if (!result.error && e?.code && e.code !== 1000) result.error = `close ${e.code} ${String(e.reason ?? "").slice(0, 200)}`;
        turnDone?.();
      },
    });
    result.connectOk = true;
  } catch (e) {
    result.error = errText(e);
    return result;
  }

  // 마이크 송출 루프 — 128ms마다 2048샘플: 지연된 에코 + 소음. 에코 대기열이 비면 소음만.
  const FRAME = 2048;
  const delaySamples = Math.round((ECHO_DELAY_MS / 1000) * 16000);
  let delayLine = new Float32Array(delaySamples);
  let micRunning = true;
  const micLoop = (async () => {
    while (micRunning && !closed) {
      const frame = new Float32Array(FRAME);
      let filled = 0;
      while (filled < FRAME && echoQueue.length > 0) {
        const head = echoQueue[0];
        const take = Math.min(head.length, FRAME - filled);
        frame.set(head.subarray(0, take), filled);
        filled += take;
        echoPending -= take;
        if (take === head.length) echoQueue.shift();
        else echoQueue[0] = head.subarray(take);
      }
      // 지연선: [지연된 과거 | 이번 프레임] 에서 앞 FRAME만 내보낸다.
      const joined = new Float32Array(delayLine.length + FRAME);
      joined.set(delayLine, 0);
      joined.set(frame, delayLine.length);
      const out = joined.subarray(0, FRAME);
      delayLine = joined.slice(FRAME);
      const pcm = Buffer.alloc(FRAME * 2);
      for (let i = 0; i < FRAME; i += 1) {
        // 균일 잡음 × √3 = RMS NOISE_RMS
        const noise = (Math.random() * 2 - 1) * NOISE_RMS * Math.sqrt(3);
        const v = Math.max(-1, Math.min(1, out[i] * ECHO_GAIN + noise));
        pcm.writeInt16LE(Math.round(v * 32767), i * 2);
      }
      try {
        session.sendRealtimeInput({ audio: { data: pcm.toString("base64"), mimeType: "audio/pcm;rate=16000" } });
      } catch {
        // 무시
      }
      await sleep(128);
    }
  })();

  await sleep(1500);
  for (const q of ECHO_QUESTIONS) {
    if (closed) break;
    turn = { question: q, interrupted: 0, turnComplete: false, audioSec: 0, output: "", falseInput: "" };
    const done = new Promise((r) => {
      turnDone = r;
      setTimeout(r, 40_000);
    });
    session.sendClientContent({ turns: [{ role: "user", parts: [{ text: q }] }], turnComplete: true });
    await done;
    // 남은 재생(에코)이 다 나갈 때까지 + 2초 소음만.
    while (echoPending > 0 && !closed) await sleep(128);
    await sleep(2000);
    result.turns.push({ ...turn, output: turn.output.trim().slice(0, 120), falseInput: turn.falseInput.trim() });
    turn = null;
  }
  micRunning = false;
  await micLoop;
  try {
    session.close();
  } catch {
    // 무시
  }
  return result;
}

const apiKey = readApiKey();
const clipDir = argVal("--clips", "");
const outDir = path.resolve(argVal("--out", path.join(repoRoot, "asr-probe-out")));
mkdirSync(outDir, { recursive: true });

let runs;
const runsArg = argVal("--runs", "");
if (runsArg) {
  runs = runsArg.split(",").map((s) => {
    const [test, mode, prefix] = s.split(":");
    return { test, mode, prefixMs: Number(prefix) };
  });
} else {
  runs = argVal("--modes", "none,hints").split(",").map((mode) => ({ test: "clips", mode, prefixMs: 300 }));
}
runs = runs.filter((r) => (r.test === "clips" || r.test === "echo") && r.mode in MODES && Number.isFinite(r.prefixMs));
// 승인 범위 상한 — 세션 수를 넘기지 않는다(넘기려면 다시 승인).
const MAX_SESSIONS = 3;
runs = runs.slice(0, MAX_SESSIONS);

let clips = [];
let phrases = [];
if (runs.some((r) => r.test === "clips")) {
  if (!clipDir) throw new Error("--clips <폴더> 필요");
  phrases = JSON.parse(readFileSync(path.join(clipDir, "phrases.json"), "utf8").replace(/^﻿/, ""));
  clips = readdirSync(clipDir)
    .filter((f) => /^clip\d+\.wav$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .map((f) => path.join(clipDir, f));
}

const all = [];
for (const run of runs) {
  const r = run.test === "clips" ? await runClips(apiKey, run, clips, phrases) : await runEcho(apiKey, run);
  all.push(r);
  console.log(`[asr-probe] ${run.test} mode=${run.mode} prefix=${run.prefixMs} connect=${r.connectOk} error=${r.error ?? "-"}`);
  for (const c of r.clips ?? []) console.log(`  "${c.phrase}" → in="${c.input.trim()}" | out="${c.output.trim().slice(0, 60)}"`);
  for (const t of r.turns ?? [])
    console.log(
      `  Q="${t.question.slice(0, 20)}…" interrupted=${t.interrupted} turnComplete=${t.turnComplete} audioSec=${t.audioSec.toFixed(1)} falseInput="${t.falseInput}" out="${t.output.slice(0, 50)}"`,
    );
  // 429(할당량)면 즉시 멈춘다 — 남은 실행을 돌리지 않는다.
  if (r.error && /429|RESOURCE_EXHAUSTED|quota/i.test(r.error)) {
    console.log("[asr-probe] STOP-429 — 남은 실행 중단");
    break;
  }
}
writeFileSync(path.join(outDir, `asr-probe-${Date.now()}.json`), JSON.stringify(all, null, 2));
