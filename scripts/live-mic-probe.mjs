#!/usr/bin/env node
// 실기기 신고(2026-11-02 · 카드사 고급 "내 말이 인식이 잘 안 된다") 재현 도구 — 운영 서버 코드로 토큰을 발급하고(`createCallCredentials` 그대로),
// 브라우저 클라(`GeminiVoiceSession.tsx`)처럼 마이크 프레임을 실시간으로 보낸다.
//   - 프레임 = 16kHz PCM16 40ms(640샘플) · 발화 사이에도 방 소음 프레임을 계속 보낸다(실제 마이크처럼).
//   - 반이중 게이트 = 사기범 오디오가 "재생 중"이면 프레임을 버린다(재생 종료 예측 + `agentSpeechGate.ts` 대기: 턴 진행 중 4000ms · 턴 끝 250ms).
//   - 첫 신호 = 클라 `OPENING_TRIGGER_TURN`(받는 통화).
// 무엇을 보나: 참가자 발화마다 입력 전사(inputTranscription)가 오는가 · 사기범이 답하는가 · 버린 프레임 수.
//
// ⛔ 측정 전용 — 앱 코드를 바꾸지 않는다. 키는 --secret 파일의 --key-var 줄에서 메모리로만 읽는다(출력 0 · 대체 키 0).
// ⛔ 실 키 과금 — 매번 메인 승인 필요. 한 번 실행 = 1세션. 429 · RESOURCE_EXHAUSTED면 <out>/STOP-429를 쓰고 즉시 멈춘다(있으면 시작하지 않는다).
//
// 사용법(저장소 루트 · `npm --prefix functions run build` 뒤):
//   node scripts/live-mic-probe.mjs --secret <functions/.secret.local> --key-var GEMINI_API_KEY2 --clips <폴더(clipN.wav 16kHz mono)> \
//     --out <폴더> --tag <이름> [--scenario card-company-impersonation] [--variant fv-k3dn] [--leg 0] [--gain-db 0] [--overlap-ms 0]
//   --gain-db   참가자 음성 크기(dB · 음수 = 작게)
//   --overlap-ms 사기범 재생이 끝나기 이 시간 전에 말하기 시작(겹쳐 말하기 — 게이트가 앞부분을 버린다)

import { createRequire } from "node:module";
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const require = createRequire(path.join(repoRoot, "functions", "package.json"));
const { GoogleGenAI, Modality } = require("@google/genai");
const { GeminiRealtimeProvider } = require(path.join(repoRoot, "functions", "lib", "realtime", "geminiProvider.js"));

const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
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
function readWavPcm(file) {
  const buf = readFileSync(file);
  let off = 12;
  while (off < buf.length - 8) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") return new Int16Array(buf.buffer.slice(buf.byteOffset + off + 8, buf.byteOffset + off + 8 + size));
    off += 8 + size;
  }
  throw new Error(`data 청크 없음: ${file}`);
}

// 클라와 같은 값(`GeminiVoiceSession.tsx` OPENING_TRIGGER_TURN · `agentSpeechGate.ts`).
const OPENING_TRIGGER_TURN =
  "(전화가 방금 연결됐다. 지금 막 전화를 받은 상대에게 캐릭터로서 자연스럽게 첫 마디를 건네라. 첫 마디는 짧게 — 신분(사칭 기관·관계)과 전화를 건 이유를 짧은 한두 문장(5초 안팎)으로만 밝히고, 멈춰서 상대의 대답을 기다려라. 다짜고짜 요구나 압박부터 하지 말고, 자세한 설명은 상대가 반응한 뒤 다음 턴에 이어가라.)";
const TAIL_GRACE_MS = 250;
const STALL_GRACE_MS = 4000;
const FRAME_SAMPLES = 640; // 40ms @16kHz
const FRAME_MS = 40;
const NOISE_RMS = 0.004; // 조용한 방(약 -48dBFS)
const OUTPUT_RATE = 24000;
const REPLY_TIMEOUT_MS = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const out = argVal("--out", "");
const tag = argVal("--tag", "run");
if (!out) throw new Error("--out 필요");
mkdirSync(out, { recursive: true });
if (existsSync(path.join(out, "STOP-429"))) {
  console.error("STOP-429 있음 — 시작하지 않는다");
  process.exit(3);
}
const clipsDir = argVal("--clips", "");
const clipFiles = readdirSync(clipsDir).filter((f) => /^clip\d+\.wav$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
const phrases = JSON.parse(readFileSync(path.join(clipsDir, "phrases.json"), "utf8").replace(/^﻿/, ""));
const gain = Math.pow(10, Number(argVal("--gain-db", "0")) / 20);
const overlapMs = Number(argVal("--overlap-ms", "0"));
const scenarioId = argVal("--scenario", "card-company-impersonation");
const variant = argVal("--variant", "fv-k3dn");
const legIndex = argVal("--leg", "0");

const t0 = Date.now();
const now = () => Date.now() - t0;
const events = [];
const ev = (e) => {
  events.push({ t: now(), ...e });
  console.log(JSON.stringify({ t: now(), ...e }).slice(0, 220));
};
let stop429 = false;
const check429 = (text) => {
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(String(text))) {
    stop429 = true;
    writeFileSync(path.join(out, "STOP-429"), `${tag} ${new Date().toISOString()} ${String(text).slice(0, 200)}\n`);
  }
};

const apiKey = readApiKey();
// --silence-ms N — 발화 끝 판정(`silenceDurationMs`)만 바꿔 본다(측정용 · 나머지 토큰 설정은 운영 그대로). 토큰 발급 직전에 그 한 값만 덮는다.
const silenceOverride = argVal("--silence-ms", "");
if (silenceOverride) {
  const tokensProto = Object.getPrototypeOf(new GoogleGenAI({ apiKey: "x" }).authTokens);
  const originalCreate = tokensProto.create;
  tokensProto.create = function (params) {
    const detection = params?.config?.liveConnectConstraints?.config?.realtimeInputConfig?.automaticActivityDetection;
    if (!detection) throw new Error("토큰 설정에 automaticActivityDetection 없음 — 덮지 않고 멈춘다");
    detection.silenceDurationMs = Number(silenceOverride);
    return originalCreate.call(this, params);
  };
}
const provider = new GeminiRealtimeProvider(apiKey);
const creds = await provider.createCallCredentials({
  sessionId: `live-mic-probe-${tag}`,
  scenarioId,
  voiceId: "",
  difficultyLevel: "advanced",
  fictionalBankName: undefined,
  ...(variant ? { flowVariantId: variant } : {}),
  channel: undefined,
  hangupRelay: undefined,
  ...(legIndex !== "" && variant ? { callLeg: { legIndex: Number(legIndex), voiceSlot: 0 } } : {}),
}).catch((e) => {
  check429(e?.message ?? e);
  throw e;
});
ev({ ev: "token", model: creds.geminiModel, tools: creds.liveTools });

// ── 재생 · 게이트 흉내 ──
let nextPlayAt = 0; // 예약 재생 종료 시각(ms · t0 기준)
let agentSpeaking = false;
let turnInProgress = false;
let gateTimer = null;
const scheduleGateClose = () => {
  if (gateTimer) clearTimeout(gateTimer);
  const remaining = Math.max(0, nextPlayAt - now());
  gateTimer = setTimeout(() => {
    agentSpeaking = false;
    turnInProgress = false;
    ev({ ev: "gateOpen" });
  }, remaining + (turnInProgress ? STALL_GRACE_MS : TAIL_GRACE_MS));
};

let scammerText = "";
let inputText = "";
let scammerTurns = 0;
let waiters = [];
const notify = (kind) => {
  for (const w of [...waiters]) w(kind);
};
const waitFor = (pred, timeoutMs) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters = waiters.filter((w) => w !== fn);
      resolve(false);
    }, timeoutMs);
    const fn = (kind) => {
      if (!pred(kind)) return;
      clearTimeout(timer);
      waiters = waiters.filter((w) => w !== fn);
      resolve(true);
    };
    waiters.push(fn);
  });

const ai = new GoogleGenAI({ apiKey: creds.geminiToken, httpOptions: { apiVersion: "v1alpha" } });
let closed = false;
const session = await ai.live.connect({
  model: creds.geminiModel,
  config: { responseModalities: [Modality.AUDIO] },
  callbacks: {
    onmessage: (m) => {
      if (m.toolCall) {
        const calls = m.toolCall.functionCalls ?? [];
        ev({ ev: "toolCall", calls: calls.map((c) => c.name) });
        // 앱은 도구 결과를 돌려준다 — 여기서는 대화를 막지 않는 최소 응답(측정 대상은 입력 인식).
        session.sendToolResponse({
          functionResponses: calls.map((c) => ({ id: c.id, name: c.name, response: { status: c.name === "end_call" ? "blocked_min_turns" : "goal_pending" } })),
        });
        return;
      }
      const sc = m.serverContent;
      if (!sc) return;
      if (sc.inputTranscription?.text) {
        inputText += sc.inputTranscription.text;
        notify("input");
      }
      if (sc.outputTranscription?.text) scammerText += sc.outputTranscription.text;
      for (const part of sc.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (!data || part.thought) continue;
        const ms = (Buffer.from(data, "base64").length / 2 / OUTPUT_RATE) * 1000;
        nextPlayAt = Math.max(nextPlayAt, now()) + ms;
        if (!agentSpeaking) {
          agentSpeaking = true;
          ev({ ev: "agentSpeaking" });
        }
        turnInProgress = true;
        scheduleGateClose();
      }
      if (sc.interrupted) {
        ev({ ev: "interrupted", text: scammerText });
        nextPlayAt = now();
        scammerText = "";
        turnInProgress = false;
        scheduleGateClose();
      }
      if (sc.turnComplete) {
        scammerTurns += 1;
        ev({ ev: "turnComplete", n: scammerTurns, text: scammerText.trim() });
        scammerText = "";
        turnInProgress = false;
        scheduleGateClose();
        notify("turn");
      }
    },
    onerror: (e) => {
      ev({ ev: "error", msg: String(e?.message ?? e) });
      check429(e?.message ?? e);
    },
    onclose: (e) => {
      closed = true;
      ev({ ev: "close", code: e?.code, reason: e?.reason });
      check429(e?.reason ?? "");
      notify("close");
    },
  },
});

// ── 마이크 루프(40ms마다 1프레임 · 게이트 닫힘이면 버린다) ──
let speech = null; // { pcm, pos }
const stats = { sent: 0, dropped: 0, speechSent: 0, speechDropped: 0 };
const micTimer = setInterval(() => {
  if (closed) return;
  const frame = new Int16Array(FRAME_SAMPLES);
  let inSpeech = false;
  for (let i = 0; i < FRAME_SAMPLES; i++) {
    let v = (Math.random() * 2 - 1) * NOISE_RMS * 1.7;
    if (speech && speech.pos < speech.pcm.length) {
      v += (speech.pcm[speech.pos++] / 32768) * gain;
      inSpeech = true;
    }
    frame[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  if (speech && speech.pos >= speech.pcm.length) speech = null;
  if (agentSpeaking) {
    stats.dropped++;
    if (inSpeech) stats.speechDropped++;
    return;
  }
  stats.sent++;
  if (inSpeech) stats.speechSent++;
  try {
    session.sendRealtimeInput({ audio: { data: Buffer.from(frame.buffer).toString("base64"), mimeType: "audio/pcm;rate=16000" } });
  } catch {
    // 앱과 같다 — 한 프레임 실패로 통화를 끊지 않는다.
  }
}, FRAME_MS);

// ── 진행 ──
session.sendClientContent({ turns: [{ role: "user", parts: [{ text: OPENING_TRIGGER_TURN }] }], turnComplete: true });
ev({ ev: "openingSent" });
const results = [];
if (await waitFor((k) => k === "turn" || k === "close", 20000)) {
  for (let i = 0; i < clipFiles.length && !closed && !stop429; i++) {
    // 사기범 재생이 끝날 때(겹쳐 말하기면 그보다 overlap 전)까지 기다린다.
    while (!closed && now() < nextPlayAt - overlapMs) await sleep(20);
    if (overlapMs === 0) {
      while (!closed && agentSpeaking) await sleep(20);
      await sleep(600);
    }
    const before = { ...stats };
    inputText = "";
    const turnsBefore = scammerTurns;
    const pcm = readWavPcm(path.join(clipsDir, clipFiles[i]));
    speech = { pcm, pos: 0 };
    ev({ ev: "userSpeak", i, phrase: phrases[i], gateOpen: !agentSpeaking });
    const replied = await waitFor((k) => (k === "turn" && scammerTurns > turnsBefore) || k === "close", REPLY_TIMEOUT_MS + (pcm.length / 16000) * 1000);
    const row = {
      i,
      phrase: phrases[i],
      inputTranscript: inputText.trim(),
      replied,
      speechFramesSent: stats.speechSent - before.speechSent,
      speechFramesDropped: stats.speechDropped - before.speechDropped,
    };
    results.push(row);
    ev({ ev: "result", ...row });
    if (!replied) await sleep(3000);
  }
}
clearInterval(micTimer);
try {
  session.close();
} catch {
  // 이미 닫힘
}
const summary = {
  tag,
  scenarioId,
  variant,
  legIndex,
  gainDb: Number(argVal("--gain-db", "0")),
  silenceMs: silenceOverride || "운영값",
  overlapMs,
  stop429,
  utterances: results.length,
  recognized: results.filter((r) => r.inputTranscript.length > 0).length,
  replied: results.filter((r) => r.replied).length,
  results,
};
writeFileSync(path.join(out, `${tag}.json`), JSON.stringify({ summary, events }, null, 1));
console.log(JSON.stringify(summary, null, 1));
process.exit(stop429 ? 2 : 0);
