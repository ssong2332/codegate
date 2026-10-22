#!/usr/bin/env node
// §105.2.4(OQ-A105) — Live 입력 전사 언어 힌트(ko-KR) 실측 도구. 실시간 통화(gemini-3.8-live)에서 짧은 한국어 발화가
// 외국어로 전사되는지(사용자 실기 2026-10-22: "isso" · "un" · "ascensor"), `inputAudioTranscription.languageHints`를 걸면
// ① 토큰 발급 ② 연결이 되는지 ③ 전사가 한국어로 나오는지를 같은 음성으로 비교한다.
//
// ⛔ 측정 전용 — 앱 코드를 바꾸지 않는다. 앱과 같은 경로(authTokens.create의 liveConnectConstraints → 토큰으로 live.connect)를 쓴다.
// ⛔ 키는 --secret <파일>의 `<--key-var>=` 줄에서 메모리로만 읽는다(출력 · 파일 기록 0). 대체 키로 넘어가지 않는다.
// ⛔ 실 키 과금 — 매번 메인 승인 필요. 기본 2세션(mode none · hints).
//
// 사용법(저장소 루트):
//   node scripts/live-asr-language-probe.mjs --secret <functions/.secret.local> --key-var GEMINI_API_KEY2 \
//     --clips <wav 폴더(16kHz mono 16-bit · clipN.wav + phrases.json)> --out <폴더> [--modes none,hints]

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
  none: {}, // 현행(자동 감지)
  hints: { languageHints: { languageCodes: ["ko-KR"] } }, // SDK 2.13 형태(Developer API는 languageCodes 직접 지정을 거부)
  // 맞장구 · 훈련 대화에 자주 나오는 말로 인식을 기울인다(언어 지정 없음 — 자동 감지 그대로).
  vocab: {
    customVocabulary: ["네", "응", "어", "아니요", "그래요", "누구세요", "이체", "보관 지갑", "계좌", "인증번호", "만 원", "검찰", "은행"],
  },
};
const SYSTEM = "너는 한국어 전화 통화 상대다. 상대가 무슨 말을 하든 한국어로 한 문장만 짧게 답한다.";
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

async function runMode(apiKey, mode, clips, phrases) {
  const result = { mode, tokenOk: false, connectOk: false, error: null, clips: [] };
  const client = new GoogleGenAI({ apiKey });
  const now = Date.now();
  let token;
  try {
    token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + 10 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
        liveConnectConstraints: {
          model: MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: SYSTEM,
            speechConfig: { languageCode: "ko-KR" },
            inputAudioTranscription: MODES[mode],
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
                prefixPaddingMs: 300,
                endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
                silenceDurationMs: 400,
              },
            },
          },
        },
        httpOptions: { apiVersion: "v1alpha" },
      },
    });
    result.tokenOk = Boolean(token?.name);
  } catch (e) {
    result.error = `token: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`;
    return result;
  }

  let current = null;
  let turnDone = null;
  let closed = false;
  const live = new GoogleGenAI({ apiKey: token.name, httpOptions: { apiVersion: "v1alpha" } });
  let session;
  try {
    session = await live.live.connect({
      model: MODEL,
      config: { responseModalities: [Modality.AUDIO] },
      callbacks: {
        onmessage: (m) => {
          const sc = m.serverContent;
          if (!current) return;
          if (sc?.inputTranscription?.text) current.input += sc.inputTranscription.text;
          if (sc?.outputTranscription?.text) current.output += sc.outputTranscription.text;
          if (sc?.turnComplete) turnDone?.();
        },
        onerror: (e) => {
          result.error = `socket: ${e?.message ?? "error"}`;
        },
        onclose: (e) => {
          closed = true;
          if (!result.error && e?.code && e.code !== 1000) result.error = `close ${e.code} ${String(e.reason ?? "").slice(0, 200)}`;
          turnDone?.();
        },
      },
    });
    result.connectOk = true;
  } catch (e) {
    result.error = `connect: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`;
    return result;
  }
  await sleep(500);
  if (closed) return result;

  const silence = Buffer.alloc(16000 * 2); // 1초 무음(발화 종료 감지용)
  for (let i = 0; i < clips.length && !closed; i += 1) {
    current = { phrase: phrases[i], input: "", output: "" };
    const done = new Promise((r) => {
      turnDone = r;
      setTimeout(r, 12_000);
    });
    const pcm = Buffer.concat([readWavPcm(clips[i]), silence]);
    // 앱과 비슷한 크기(약 128ms)로 잘라 실시간 속도로 보낸다.
    const chunk = 4096;
    for (let o = 0; o < pcm.length && !closed; o += chunk) {
      session.sendRealtimeInput({ audio: { data: pcm.subarray(o, o + chunk).toString("base64"), mimeType: "audio/pcm;rate=16000" } });
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

const apiKey = readApiKey();
const clipDir = argVal("--clips", "");
if (!clipDir) throw new Error("--clips <폴더> 필요");
const phrases = JSON.parse(readFileSync(path.join(clipDir, "phrases.json"), "utf8").replace(/^﻿/, ""));
const clips = readdirSync(clipDir)
  .filter((f) => /^clip\d+\.wav$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  .map((f) => path.join(clipDir, f));
const outDir = path.resolve(argVal("--out", path.join(repoRoot, "asr-probe-out")));
mkdirSync(outDir, { recursive: true });
// 승인 범위 상한 — 세션 수를 넘기지 않는다(넘기려면 다시 승인).
const MAX_SESSIONS = 3;
const modes = argVal("--modes", "none,hints").split(",").filter((m) => m in MODES).slice(0, MAX_SESSIONS);

const all = [];
for (const mode of modes) {
  const r = await runMode(apiKey, mode, clips, phrases);
  all.push(r);
  console.log(`[asr-probe] mode=${mode} token=${r.tokenOk} connect=${r.connectOk} clips=${r.clips.length} error=${r.error ?? "-"}`);
  for (const c of r.clips) console.log(`  "${c.phrase}" → in="${c.input.trim()}" | out="${c.output.trim().slice(0, 60)}"`);
  // 429(할당량)면 즉시 멈춘다 — 남은 모드를 돌리지 않는다.
  if (r.error && /429|RESOURCE_EXHAUSTED|quota/i.test(r.error)) {
    console.log("[asr-probe] STOP-429 — 남은 모드 중단");
    break;
  }
}
writeFileSync(path.join(outDir, `asr-probe-${Date.now()}.json`), JSON.stringify(all, null, 2));
