#!/usr/bin/env node
// 시나리오 소요 시간 측정 프로브(2026-10-21 · scenario-catalog-review) — stall-probe.mjs의 runLive를 바탕으로 만든 측정 전용 도구.
// ⛔ 앱 코드가 아니다. 빌드된 functions/lib에서 앱과 같은 함수로 같은 프롬프트·도구를 조립한다(앱 코드 변경 0).
// ⛔ 키는 --secret <파일>의 `<--key-var>=` 줄에서 메모리로만 읽는다(출력 · 파일 기록 0). 대체 키로 몰래 넘어가지 않는다.
//
// 재는 것(세션마다):
//   - 사기범 턴별 실제 오디오 길이(Live 출력 PCM 바이트 ÷ 샘플레이트) · 전사 글자 수 · 첫 소리 지연(벽시계)
//   - 통화 중 문자 도착 턴 · 돈/정보 요구가 처음 나온 턴 · 마지막 단계(선언 문자 전부 도착 + 요구)에 닿은 턴
// 사용자 발화는 텍스트 턴이다(음성 아님) — 참가자 말하는 시간은 보고서에서 글자 수로 추정해 더한다.
//
// node scripts/duration-probe.mjs --secret <path> [--key-var GEMINI_API_KEY2] [--out <dir>] [--max-sessions 30] [--only id:level,...]
//   [--variant fv-xxxx] [--responder comply|refuse-coin|site]   (§98 — 변형 고정 · 코인 단계 거절 응답기 · §99 — 문자 사이트를 단계대로 진행하는 응답기)
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const fnRoot = path.join(repoRoot, "functions");
const require = createRequire(path.join(fnRoot, "package.json"));
const args = process.argv.slice(2);
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const libDir = path.join(fnRoot, "lib");
const L = (p) => require(path.join(libDir, p));

const { GoogleGenAI, Modality, EndSensitivity, StartSensitivity } = require("@google/genai");
const { buildSystemPrompt } = L("roleplay/promptAssembly.js");
const { resolveSessionScenarioPrompt, listFlowVariants, findFlowVariant } = L("scenarios/flowVariants.js");
const { sessionDeclaresInCallSms, sessionDeclaredSmsPurposes, sessionTransferSmsOpensLanding, resolveDeclaredSms, planSmsBackstop, resolveSmsGate, buildSmsNudgeInstruction } = L("inCallSms/smsGate.js");
const { findInCallSmsItem, SMS_DECLINE_TOO_EARLY, SMS_DECLINE_ALREADY } = L("scenarios/inCallSms.js");
const { buildInCallSmsResponse } = L("inCallSms/buildDoc.js");
const { hasVerifyIntercept, findVerifyInterceptItem, VERIFY_DECLINE_TOO_EARLY } = L("scenarios/verifyIntercept.js");
const { isL3Procedural } = L("roleplay/l3Depth.js");
const { asksIdentityCheck } = L("roleplay/personaAuthority.js");
const { speakerGenderFor } = L("realtime/scenarioVoice.js");
const { GEMINI_LIVE_MODEL, pickGeminiVoiceName } = L("realtime/geminiProvider.js");
const liveTools = L("realtime/liveTools.js");
const { buildLiveToolDeclarations, declaresOfferVerificationDesk, declaresEndCall, LIVE_TOOL_SEND_PREPARED_SMS, LIVE_TOOL_OFFER_VERIFICATION_DESK } = liveTools;
const { resolveSessionAccountNumber } = L("shared/fictionalBank.js");

const LIVE_OPENING_TRIGGER =
  "(전화가 방금 연결됐다. 지금 막 전화를 받은 상대에게 캐릭터로서 자연스럽게 첫 마디를 건네라. 다짜고짜 요구나 압박부터 하지 말고, 먼저 신분(사칭 기관·관계)과 전화를 건 이유를 1~2문장으로 밝히며 상황을 설명한 뒤에 이어가라.)";

// 순순히 따르는 참가자(시나리오 끝까지 가는 경로 = 소요 시간의 위쪽 기준). 직전 사기범 말에 맞춰 **가짜 값**으로 답한다
// (1차 실행에서 고정 대본이 값을 주지 않아 사기범이 같은 요구를 되풀이했다 — 2026-10-21). 위에서부터 처음 맞는 행.
const RESPONDER = [
  [/인증\s?번호|인증 코드|숫자 여섯/, "382914요."],
  [/주민(등록)?\s?번호/, "육일공삼공이에 일 이 삼 사 오 육 칠이요."],
  [/카드\s?번호/, "1234 5678 9012 3456이요."],
  [/(유효\s?기간|뒷면|CVC|보안\s?코드)/i, "뒷면 번호는 382요."],
  [/비밀\s?번호/, "1234요."],
  [/생년월일|생일|몇 년생/, "61년 3월 2일이요."],
  [/성함|이름/, "김민수예요."],
  [/주소|사시는 곳|어디 사/, "대전에 살아요."],
  [/(코인|가상\s?자산|거래소)/, "네, 코인 사서 보냈어요."],
  [/(현금|인출|찾아\s?(오|두|놓|서))/, "네, 현금 찾아 놨어요."],
  [/(이체|송금|입금|보내\s?(주|셔|시)|옮기|옮겨|이관)/, "네, 보냈어요."],
  [/(설치|앱|링크|눌러|접속)/, "네, 눌러서 설치했어요."],
  [/(얼마|잔액|자산|예금|금액)/, "한 삼천만 원 정도 있어요."],
  [/(은행|거래하시)/, "은행 하나 쓰고 있어요."],
  [/(혼자|숙소|모텔|방에)/, "네, 지금 혼자 있어요."],
  [/(자녀|아이|아드님|따님|아들|딸)/, "우리 애요? 무사한 거죠? 시키는 대로 할게요."],
];
const FILLER = ["네? 무슨 일이죠?", "어머, 그래요? 어떻게 해야 돼요?", "네, 알겠어요.", "네, 말씀하세요.", "그 다음엔 어떻게 해요?"];
const OPENING_REPLY = "여보세요, 네 누구세요?";
const MAX_USER_TURNS = 18;
// §98(2026-10-21) — `--responder refuse-coin`: 코인 · 지갑 · 송금 단계부터는 거절만 한다(거부 시 위협 · 회유 격상을 재는 경로).
const REFUSE_COIN = /(코인|가상\s?자산|거래소|지갑|전송|송금|이체|적금|대출|해지)/;
const REFUSALS = ["코인은 못 사겠어요. 좀 이상해요.", "그건 안 할래요. 가족한테 먼저 물어볼게요.", "검찰이 왜 코인을 사라고 해요? 못 해요.", "싫어요, 안 보낼 거예요."];
const responderMode = argVal("--responder", "comply");
let refusalCount = 0;
// §99(2026-10-21) — `--responder site`: 사이트 링크 문자(카탈로그 fakeLandingId가 있는 transfer 문자)가 도착한 뒤에는 사이트 · 화면 · 진행 질문에
// 화면 순서대로 "어디까지 했다"만 답한다(실제 참가자가 앱 안 모의 사이트를 누르는 경로의 대리). 그 밖의 말은 comply와 같다.
const SITE_ASK = /(링크|사이트|화면|접속|들어가|어디까지|본인\s?확인|전환|검수|금액|이체|진행|코인|지갑|다음)/;
const SITE_PROGRESS = [
  "링크 들어가서 본인 확인 했어요.",
  "검수 대상이라고 예금이랑 적금 나와요. 전환 버튼 눌렀어요.",
  "금액 넣는 화면이에요. 삼천만 원 넣고 다음 눌렀어요.",
  "보관 지갑으로 이체 눌렀어요. 접수됐다고 나와요.",
];
const probeState = { siteDelivered: false, siteStep: 0 };
function respond(lastScammerText, userTurnIndex) {
  if (userTurnIndex === 0) return OPENING_REPLY;
  if (responderMode === "refuse-coin" && REFUSE_COIN.test(lastScammerText)) return REFUSALS[refusalCount++ % REFUSALS.length];
  if (responderMode === "site" && probeState.siteDelivered && probeState.siteStep < SITE_PROGRESS.length && SITE_ASK.test(lastScammerText)) {
    return SITE_PROGRESS[probeState.siteStep++];
  }
  for (const [re, reply] of RESPONDER) if (re.test(lastScammerText)) return reply;
  return FILLER[userTurnIndex % FILLER.length];
}
// 돈을 넘겼다고 답한 줄(= 시나리오 완주 시점의 기준).
const PAID = /보냈어요|찾아 놨어요/;

// 돈·정보를 실제로 넘기라는 요구(첫 등장 턴을 잰다). 소개 · 설명 문장과 겹치지 않게 행동 어미까지 본다.
const DEMAND = /(이체|송금|입금|옮겨|인출|현금|찾아\s?(오|주)|보내\s?(주|셔)|인증\s?번호|비밀\s?번호|카드\s?번호|계좌\s?번호|설치|링크|눌러|주민(등록)?\s?번호|생년월일|앱)/;

const VOICE_REGULAR = [
  "institutional-impersonation", "loan-refinance-scam", "tax-refund-scam", "card-company-impersonation",
  "courier-customs-scam", "kidnapping-threat", "reputation-blackmail-scam", "bank-security-verify-scam",
];
const VOICE_ADVANCED_ONLY = ["card-delivery-call", "asset-protection-notice-call", "prosecution-cooperation-call"];
const LEVELS = ["beginner", "intermediate", "advanced"];

const only = argVal("--only", "");
let plan = only
  ? only.split(",").map((s) => { const [id, level] = s.split(":"); return { id, level }; })
  : [...VOICE_REGULAR.flatMap((id) => LEVELS.map((level) => ({ id, level }))), ...VOICE_ADVANCED_ONLY.map((id) => ({ id, level: "advanced" }))];
const MAX_SESSIONS = Number(argVal("--max-sessions", "30"));
plan = plan.slice(0, MAX_SESSIONS);
const outDir = path.resolve(argVal("--out", path.join(repoRoot, "duration-out")));

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pcmSeconds(mimeType, bytes) {
  const m = /rate=(\d+)/.exec(mimeType ?? "");
  const rate = m ? Number(m[1]) : 24000;
  return bytes / (rate * 2); // 16-bit mono
}

async function runOne(scenarioId, level) {
  probeState.siteDelivered = false;
  probeState.siteStep = 0;
  const t0 = Date.now();
  const now = () => Date.now() - t0;
  // §98 — `--variant fv-xxxx`: 그 시나리오 변형이면 배정 풀 대신 그 변형(은퇴 변형 포함 — 이전/이후 비교용).
  const forced = argVal("--variant", "");
  const variantId = forced && findFlowVariant(forced)?.scenarioId === scenarioId ? forced : listFlowVariants(scenarioId, level)[0]?.variantId;
  const scenarioPrompt = resolveSessionScenarioPrompt(scenarioId, variantId);
  const { declared } = resolveDeclaredSms(scenarioId, variantId);
  const verifyEnabled = hasVerifyIntercept(scenarioId) && level === "advanced";
  const endCallScope = { channel: "voice", relay: undefined, liveAvailable: liveTools.END_CALL_LIVE_AVAILABLE };
  const declaresEnd = declaresEndCall(scenarioId, "voice", undefined, endCallScope.liveAvailable);
  const systemPrompt = buildSystemPrompt(scenarioPrompt, {
    difficultyLevel: level,
    inCallSmsEnabled: sessionDeclaresInCallSms(scenarioId, variantId),
    inCallSmsPurposes: sessionDeclaredSmsPurposes(scenarioId, variantId),
    // §99 — 앱(geminiProvider)과 같은 술어(계좌 문자의 이체 링크 — 이전 실행에는 빠져 있었다).
    transferSmsLink: sessionTransferSmsOpensLanding(scenarioId, variantId),
    verifyInterceptEnabled: verifyEnabled,
    l3Procedural: isL3Procedural(scenarioId),
    identityCheckAllowed: asksIdentityCheck(scenarioId),
    speakerGender: speakerGenderFor(scenarioId),
    sessionAccountNumber: resolveSessionAccountNumber(scenarioId),
    toolDrivenTiming: true,
    offerToolDeclared: declaresOfferVerificationDesk(scenarioId, level),
    hangupMode: declaresEnd ? "tool" : "none",
    liveSpeechStyle: true,
  });
  const tools = buildLiveToolDeclarations(scenarioId, level, variantId, endCallScope);
  const verifyItem = verifyEnabled ? findVerifyInterceptItem(scenarioId) : undefined;
  const ai = new GoogleGenAI({ apiKey: API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  const turns = [];
  const events = [];
  const delivered = [];
  let buf = "", audioBytes = 0, mime = "", firstAudioAt = null, sentAt = null;
  let scammerTurns = 0, userTurns = 0, closed = false, verifyPhase = "idle", announcedAtTurn = null;
  let waiters = [];
  const notify = (ev) => { for (const w of [...waiters]) w(ev); };
  const session = await ai.live.connect({
    model: GEMINI_LIVE_MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: systemPrompt,
      speechConfig: { languageCode: "ko-KR", voiceConfig: { prebuiltVoiceConfig: { voiceName: pickGeminiVoiceName(scenarioId, "duration-probe") } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW, prefixPaddingMs: 300, endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH, silenceDurationMs: 400 } },
      tools,
    },
    callbacks: {
      onmessage: (m) => {
        if (m.toolCall) { void handleToolCalls(m.toolCall.functionCalls ?? []); return; }
        const sc = m.serverContent;
        if (!sc) return;
        for (const p of sc.modelTurn?.parts ?? []) {
          if (p.inlineData?.data) {
            if (firstAudioAt === null) firstAudioAt = now();
            audioBytes += Buffer.from(p.inlineData.data, "base64").length;
            mime = p.inlineData.mimeType ?? mime;
          }
        }
        if (sc.outputTranscription?.text) buf += sc.outputTranscription.text;
        if (sc.turnComplete) {
          scammerTurns += 1;
          turns.push({
            role: "scammer", n: scammerTurns, text: buf, chars: buf.replace(/\s/g, "").length,
            audioSec: Number(pcmSeconds(mime, audioBytes).toFixed(2)),
            firstSoundMs: sentAt !== null && firstAudioAt !== null ? firstAudioAt - sentAt : null,
            smsDeliveredSoFar: delivered.length,
          });
          buf = ""; audioBytes = 0; firstAudioAt = null;
          notify({ type: "turnComplete" });
        }
      },
      onerror: (e) => events.push({ t: now(), ev: "error", msg: String(e?.message ?? e).replace(/key=[^&\s]+/gi, "key=***") }),
      onclose: (e) => { closed = true; events.push({ t: now(), ev: "close", code: e?.code, reason: e?.reason }); notify({ type: "close" }); },
    },
  });
  async function handleToolCalls(calls) {
    const responses = calls.map((c) => {
      if (c.name === LIVE_TOOL_SEND_PREPARED_SMS) {
        const g = resolveSmsGate({ purpose: c.args?.purpose, declared, delivered, userTurns: userTurns + 1 });
        let status = g.status, guidance;
        if (g.status === "allowed") {
          const item = findInCallSmsItem(scenarioId, g.item.smsId);
          delivered.push({ smsId: item.smsId, userTurnsAtArrival: userTurns + 1, by: "model" });
          if (item.kind === "account" && item.fakeLandingId) probeState.siteDelivered = true;
          status = "delivered";
          guidance = buildInCallSmsResponse(item, { placed: verifyPhase === "placed" }).announceInstruction;
        } else guidance = g.status === "already_delivered" ? SMS_DECLINE_ALREADY : SMS_DECLINE_TOO_EARLY;
        return { id: c.id, name: c.name, response: { status, guidance } };
      }
      if (c.name === LIVE_TOOL_OFFER_VERIFICATION_DESK && verifyItem) {
        if (verifyPhase !== "idle") return { id: c.id, name: c.name, response: { status: "already_announced" } };
        if (scammerTurns < verifyItem.availableAfterScammerTurns) return { id: c.id, name: c.name, response: { status: "too_early", guidance: VERIFY_DECLINE_TOO_EARLY } };
        verifyPhase = "announced"; announcedAtTurn = scammerTurns;
        return { id: c.id, name: c.name, response: { status: "announced", guidance: verifyItem.announceInstruction } };
      }
      return { id: c.id, name: c.name ?? "unknown", response: { status: "unsupported" } };
    });
    await sleep(300);
    try { session.sendToolResponse({ functionResponses: responses }); } catch {}
  }
  const waitTurn = (ms) => new Promise((resolve) => {
    const timer = setTimeout(() => { waiters = waiters.filter((w) => w !== fn); resolve("timeout"); }, ms);
    const fn = (ev) => { clearTimeout(timer); waiters = waiters.filter((w) => w !== fn); resolve(ev.type); };
    waiters.push(fn);
  });
  const sendText = (text, turnComplete, kind) => {
    if (turnComplete) sentAt = now();
    if (kind === "user") turns.push({ role: "user", n: userTurns, text, chars: text.replace(/\s/g, "").length });
    session.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete });
  };
  sendText(LIVE_OPENING_TRIGGER, true, "opening");
  await waitTurn(45000);
  for (let i = 0; i < MAX_USER_TURNS; i += 1) {
    if (closed) break;
    const lastScammer = [...turns].reverse().find((t) => t.role === "scammer")?.text ?? "";
    if (verifyPhase === "announced" && scammerTurns > announcedAtTurn) {
      verifyPhase = "placed";
      sendText(verifyItem.reconnectInstruction, true, "verify_reconnect");
      await waitTurn(45000);
    }
    await sleep(700);
    const u = respond(lastScammer, i);
    userTurns += 1;
    sendText(u, true, "user");
    await waitTurn(45000);
    if (declared.length > 0) {
      const p = planSmsBackstop({ declared, delivered, userTurns });
      if (p.action === "deliver") {
        const g = resolveSmsGate({ purpose: p.item.purpose, declared, delivered, userTurns });
        if (g.status === "allowed") {
          const item = findInCallSmsItem(scenarioId, g.item.smsId);
          delivered.push({ smsId: item.smsId, userTurnsAtArrival: userTurns, by: "backstop" });
          if (item.kind === "account" && item.fakeLandingId) probeState.siteDelivered = true;
          sendText(buildInCallSmsResponse(item, { placed: verifyPhase === "placed" }).announceInstruction ?? item.announceInstruction, false, "sms_ctx");
        }
      } else if (p.action === "nudge") {
        sendText(buildSmsNudgeInstruction(p.item.purpose), false, "sms_ctx");
      }
    }
  }
  await sleep(800);
  try { session.close(); } catch {}
  await sleep(400);
  return { model: GEMINI_LIVE_MODEL, variantId, declaredSms: declared.map((d) => d.purpose ?? d.smsId), delivered, verifyPhase, turns, events, wallMs: now() };
}

// 요약 지표 — 참가자 말하기 시간은 추정(글자 수 ÷ 4음절/초 + 반응 1.5초). 사기범 쪽은 실측 오디오 + 첫 소리 지연.
function summarize(r) {
  const sc = r.turns.filter((t) => t.role === "scammer");
  const us = r.turns.filter((t) => t.role === "user");
  const userSecAt = (n) => us.filter((u) => u.n <= n).reduce((a, u) => a + u.chars / 4 + 1.5, 0);
  const scSecAt = (n) => sc.filter((t) => t.n <= n).reduce((a, t) => a + t.audioSec + (t.firstSoundMs ?? 1100) / 1000, 0);
  const firstDemand = sc.find((t) => t.n > 1 && DEMAND.test(t.text));
  const allSms = r.declaredSms.length;
  // 완주 = 참가자가 돈을 넘겼다고 처음 답한 직후의 사기범 턴(그 답이 n번째 사용자 턴이면 사기범 n+1번째 턴).
  const paid = us.find((u) => PAID.test(u.text));
  const arcEnd = paid ? sc.find((t) => t.n === paid.n + 1) : undefined;
  const at = (t) => (t ? { scammerTurn: t.n, minutes: Number(((scSecAt(t.n) + userSecAt(t.n - 1)) / 60).toFixed(1)) } : null);
  return {
    scammerTurns: sc.length,
    scammerAudioMin: Number((sc.reduce((a, t) => a + t.audioSec, 0) / 60).toFixed(2)),
    avgTurnAudioSec: Number((sc.reduce((a, t) => a + t.audioSec, 0) / Math.max(1, sc.length)).toFixed(1)),
    totalEstMin: Number(((scSecAt(Infinity) + userSecAt(Infinity)) / 60).toFixed(1)),
    firstDemand: at(firstDemand),
    completed: at(arcEnd),
    smsDelivered: `${r.delivered.length}/${allSms}`,
    paidAtUserTurn: paid?.n ?? null,
    wallMin: Number((r.wallMs / 60000).toFixed(1)),
  };
}

mkdirSync(outDir, { recursive: true });
const summaryRows = [];
const streamTag = argVal("--tag", "s");
// 병렬 흐름 공용 정지 파일 — 어느 흐름에서든 429가 나면 만들고, 모든 흐름이 다음 세션 전에 확인해 멈춘다.
const stopFile = path.join(outDir, "STOP-429");
for (const { id, level } of plan) {
  if (existsSync(stopFile)) { console.log("정지 파일 감지 — 중단"); break; }
  const startedIso = new Date().toISOString();
  let result, error = null;
  try { result = await runOne(id, level); } catch (e) { error = String(e?.stack ?? e).replace(/key=[^&\s]+/gi, "key=***"); result = { turns: [], events: [], delivered: [], declaredSms: [] }; }
  // ⚠️ 이벤트 JSON 전체를 보면 시각 값(예: t:174291)의 "429"를 잡는다(2026-10-21 오탐 1회) — 오류 문구 · 종료 사유만 본다.
  const errText = [error ?? "", ...(result.events ?? []).filter((e) => e.ev === "error" || e.ev === "close").map((e) => `${e.code ?? ""} ${e.msg ?? ""} ${e.reason ?? ""}`)].join(" ");
  const is429 = /(^|\D)429(\D|$)|RESOURCE_EXHAUSTED|quota/i.test(errText);
  const summary = error ? null : summarize(result);
  writeFileSync(path.join(outDir, `${id}-${level}-${startedIso.replace(/[:.]/g, "-")}.json`), JSON.stringify({ scenarioId: id, level, startedIso, error, summary, ...result }, null, 2), "utf8");
  summaryRows.push({ id, level, variantId: result.variantId, error: error ? error.slice(0, 160) : null, is429, ...(summary ?? {}) });
  console.log(JSON.stringify(summaryRows.at(-1)));
  if (is429) { writeFileSync(stopFile, `${id}:${level}`); console.log("429 감지 — 중단"); break; }
  await sleep(5000);
}
writeFileSync(path.join(outDir, `summary-${streamTag}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify(summaryRows, null, 2), "utf8");
