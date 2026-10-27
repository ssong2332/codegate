#!/usr/bin/env node
// §114.1(2026-10-23) — Gemini Live 사기범 음성의 **시나리오별 원본 크기** 측정 프로브(앱 코드 아님).
// 빌드된 functions/lib에서 앱과 같은 함수로 시스템 프롬프트 · 음성을 조립하고, 오프닝 + 순응 텍스트 턴 3개 동안 받은 PCM을 모은다.
// 원본 말소리 RMS · 꼭대기와, 앱과 같은 정규화 함수(`src/lib/realtime/loudnessNormalizer.ts` — 받은 청크 경계 그대로)를 거친 값을 함께 낸다.
// ⛔ 키는 --secret <파일>의 `<--key-var>=` 줄에서 메모리로만 읽는다(출력 · 파일 기록 0). 대체 키로 넘어가지 않는다.
// ⛔ 429(RESOURCE_EXHAUSTED · quota)가 1회라도 나면 STOP-429 파일을 만들고 즉시 멈춘다. 세션 상한 14(스크립트 고정).
//
// npm --prefix functions run build 후
// node --experimental-strip-types scripts/live-loudness-probe.mjs --secret <메인 체크아웃 functions/.secret.local> --key-var GEMINI_API_KEY2 --out <스크래치 폴더> [--only id,id] [--repeat institutional-impersonation]
// 2026-10-27(목소리 높낮이 흔들림) — `--turns N`: 순응 답을 N개(최대 `LONG_REPLIES` 길이)로 늘리고, 턴 경계(샘플 위치) · 사기범 자막을
//   `<id>-<rep>.turns.json`에 남긴다(분석은 scripts/live-pitch-analyze.mjs). 자막 수신(outputAudioTranscription)은 앱과 같게 이 모드에서만 켠다.
// `--fn-root <워크트리>/functions`: 수정 전 기준 등 다른 트리의 빌드된 lib으로 프롬프트를 조립한다(전수 검수 프로브와 같은 방식).
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeChunk, INITIAL_LOUDNESS_STATE, speechRms, dbfs } from "../src/lib/realtime/loudnessNormalizer.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const fnRoot = path.resolve(argVal("--fn-root", path.join(path.resolve(here, ".."), "functions")));
const require = createRequire(path.join(fnRoot, "package.json"));
const L = (p) => require(path.join(fnRoot, "lib", p));

const { GoogleGenAI, Modality } = require("@google/genai");
const { buildSystemPrompt } = L("roleplay/promptAssembly.js");
const { resolveSessionScenarioPrompt, listFlowVariants } = L("scenarios/flowVariants.js");
const { sessionDeclaresInCallSms, sessionDeclaredSmsPurposes, sessionTransferSmsOpensLanding } = L("inCallSms/smsGate.js");
const { isL3Procedural } = L("roleplay/l3Depth.js");
const { asksIdentityCheck } = L("roleplay/personaAuthority.js");
const { speakerGenderFor } = L("realtime/scenarioVoice.js");
const { GEMINI_LIVE_MODEL, pickGeminiVoiceName } = L("realtime/geminiProvider.js");
const { resolveSessionAccountNumber, resolveFictionalBankName } = L("shared/fictionalBank.js");

const MAX_SESSIONS = 14;
// Gemini 프리셋 음성이 닿는 통화형 시나리오 13종(`scenarioVoice.ts` 표에서 notApplicable 제외 + 택배 스미싱 고급 통화 leg).
const SCENARIOS = [
  "institutional-impersonation", "bank-security-verify-scam", "kidnapping-threat", "reputation-blackmail-scam",
  "loan-refinance-scam", "card-company-impersonation", "tax-refund-scam", "courier-customs-scam",
  "messenger-subsidy-smishing-sms", "card-delivery-call", "asset-protection-notice-call", "prosecution-cooperation-call",
  "messenger-parcel-smishing-sms",
];
const OPENING =
  "(전화가 방금 연결됐다. 지금 막 전화를 받은 상대에게 캐릭터로서 자연스럽게 첫 마디를 건네라. 다짜고짜 요구나 압박부터 하지 말고, 먼저 신분(사칭 기관·관계)과 전화를 건 이유를 1~2문장으로 밝히며 상황을 설명한 뒤에 이어가라.)";
const REPLIES = ["네, 맞는데요. 무슨 일이세요?", "네… 알겠습니다. 어떻게 하면 되나요?", "네, 말씀하신 대로 할게요."];
// --turns 모드 — 기관 사칭 고급처럼 단계가 긴 흐름이 끝까지 가도록 순응하되 조금씩 되묻는 답(사기범 턴 수를 늘리기 위함).
const LONG_REPLIES = [
  "네, 맞는데요. 무슨 일이세요?", "네? 제 명의로요? 저는 그런 적 없는데요.", "아… 그럼 어떻게 해야 하나요?",
  "네, 알겠습니다. 그 다음은요?", "담당하시는 분이 따로 계신 건가요? 그분이 뭐라고 하셨어요?", "네, 말씀하신 대로 할게요. 더 해야 할 게 있나요?",
  "잠깐만요, 메모 좀 할게요. 다시 한 번만 말씀해 주세요.", "네, 적었어요. 그럼 이제 어떻게 되는 거예요?", "알겠습니다. 시키는 대로 할게요.",
  "네, 다 했어요. 이제 끝난 건가요?",
];
const TURNS = Math.min(Number(argVal("--turns", "0")) || 0, LONG_REPLIES.length);

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
const API_KEY = readApiKey();
const scrub = (s) => String(s ?? "").replace(/key=[^&\s]+/gi, "key=***").replace(API_KEY, "***");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pcm16ToFloat(b64) {
  const buf = Buffer.from(b64, "base64");
  const out = new Float32Array(buf.length >> 1);
  for (let i = 0; i < out.length; i += 1) out[i] = buf.readInt16LE(i * 2) / 32768;
  return out;
}
function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function runOne(scenarioId, rep) {
  const level = "advanced";
  const sessionId = `loudness-probe-${scenarioId}-${rep}`;
  const variantId = listFlowVariants(scenarioId, level)[0]?.variantId;
  const scenarioPrompt = resolveSessionScenarioPrompt(scenarioId, variantId);
  if (!scenarioPrompt) throw new Error(`프롬프트 없음 ${scenarioId}`);
  const gender = speakerGenderFor(scenarioId) ?? listFlowVariants(scenarioId, level)[0]?.legs?.[0]?.speakerGender;
  const systemPrompt = buildSystemPrompt(scenarioPrompt, {
    difficultyLevel: level,
    inCallSmsEnabled: sessionDeclaresInCallSms(scenarioId, variantId),
    inCallSmsPurposes: sessionDeclaredSmsPurposes(scenarioId, variantId),
    transferSmsLink: sessionTransferSmsOpensLanding(scenarioId, variantId),
    l3Procedural: isL3Procedural(scenarioId),
    identityCheckAllowed: asksIdentityCheck(scenarioId),
    speakerGender: gender,
    fictionalBankName: resolveFictionalBankName({ sessionId }),
    sessionAccountNumber: resolveSessionAccountNumber(scenarioId),
    toolDrivenTiming: true,
    liveSpeechStyle: true,
  });
  const voiceName = pickGeminiVoiceName(scenarioId, sessionId, gender);
  const ai = new GoogleGenAI({ apiKey: API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  const chunks = [];
  let turnsDone = 0, closed = false, lastError = null, samplesSoFar = 0, turnText = "";
  const turnLog = [];
  let waiter = null;
  const session = await ai.live.connect({
    model: GEMINI_LIVE_MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: systemPrompt,
      speechConfig: { languageCode: "ko-KR", voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      ...(TURNS ? { outputAudioTranscription: {} } : {}),
    },
    callbacks: {
      onmessage: (m) => {
        if (m.data) { const c = pcm16ToFloat(m.data); chunks.push(c); samplesSoFar += c.length; }
        if (m.serverContent?.outputTranscription?.text) turnText += m.serverContent.outputTranscription.text;
        if (m.serverContent?.turnComplete) { turnsDone += 1; turnLog.push({ endSample: samplesSoFar, text: turnText.trim() }); turnText = ""; waiter?.(); }
      },
      onerror: (e) => { lastError = scrub(e?.message ?? e); },
      onclose: (e) => { closed = true; if (e?.code && e.code !== 1000) lastError = lastError ?? `close ${e.code} ${scrub(e.reason)}`; waiter?.(); },
    },
  });
  const waitTurn = (ms) => new Promise((resolve) => { const t = setTimeout(resolve, ms); waiter = () => { clearTimeout(t); waiter = null; resolve(); }; });
  session.sendClientContent({ turns: [{ role: "user", parts: [{ text: OPENING }] }], turnComplete: true });
  await waitTurn(45000);
  for (const reply of TURNS ? LONG_REPLIES.slice(0, TURNS) : REPLIES) {
    if (closed) break;
    await sleep(500);
    session.sendClientContent({ turns: [{ role: "user", parts: [{ text: reply }] }], turnComplete: true });
    await waitTurn(45000);
  }
  try { session.close(); } catch { /* 이미 닫힘 */ }
  if (lastError && /(^|\D)429(\D|$)|RESOURCE_EXHAUSTED|quota/i.test(lastError)) throw new Error(lastError);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  let state = INITIAL_LOUDNESS_STATE;
  const norm = new Float32Array(total);
  at = 0;
  for (const c of chunks) { const r = normalizeChunk(c, state); norm.set(r.out, at); at += c.length; state = r.state; }
  const peak = (a) => { let p = 0; for (const v of a) p = Math.max(p, Math.abs(v)); return p; };
  return {
    scenarioId, rep, variantId, voiceName, gender: gender ?? null, turnsDone, seconds: +(total / 24000).toFixed(1), chunks: chunks.length,
    medianChunkSamples: chunks.length ? chunks.map((c) => c.length).sort((a, b) => a - b)[chunks.length >> 1] : 0,
    rawSpeechRmsDb: +dbfs(speechRms(all)).toFixed(2), rawPeakDb: +dbfs(peak(all)).toFixed(2),
    normSpeechRmsDb: +dbfs(speechRms(norm)).toFixed(2), normPeakDb: +dbfs(peak(norm)).toFixed(2), finalGainDb: +dbfs(state.gain).toFixed(2),
    error: lastError, _wav: all, _turns: turnLog,
  };
}

const outDir = argVal("--out", "");
if (!outDir) throw new Error("--out <폴더> 필요");
mkdirSync(outDir, { recursive: true });
const stopFile = path.join(outDir, "STOP-429");
const only = argVal("--only", "");
const list = only ? only.split(",") : SCENARIOS;
const repeat = argVal("--repeat", "institutional-impersonation");
const jobs = [...list.map((id) => [id, 1]), ...(repeat && list.includes(repeat) ? [[repeat, 2]] : [])];
if (jobs.length > MAX_SESSIONS) throw new Error(`세션 ${jobs.length} > 상한 ${MAX_SESSIONS}`);
const results = [];
for (const [id, rep] of jobs) {
  if (existsSync(stopFile)) { console.log("STOP-429 있음 — 중단"); break; }
  try {
    const r = await runOne(id, rep);
    writeFileSync(path.join(outDir, `${id}-${rep}.wav`), wav(r._wav));
    if (TURNS) writeFileSync(path.join(outDir, `${id}-${rep}.turns.json`), JSON.stringify({ sampleRate: 24000, variantId: r.variantId, turns: r._turns }, null, 2), "utf8");
    delete r._wav; delete r._turns;
    results.push(r);
    console.log(JSON.stringify(r));
  } catch (e) {
    const msg = scrub(e?.message ?? e);
    const is429 = /(^|\D)429(\D|$)|RESOURCE_EXHAUSTED|quota/i.test(msg);
    results.push({ scenarioId: id, rep, error: msg.slice(0, 200), is429 });
    console.log(JSON.stringify({ scenarioId: id, rep, error: msg.slice(0, 200), is429 }));
    if (is429) { writeFileSync(stopFile, `${id}:${rep}`); console.log("429 감지 — 중단"); break; }
  }
  await sleep(3000);
}
writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2), "utf8");
console.log(`완료 ${results.length}세션 → ${path.join(outDir, "results.json")}`);
