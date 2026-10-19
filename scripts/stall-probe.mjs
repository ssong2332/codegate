#!/usr/bin/env node
// A-1 재현 검증 프로브 — audit/scripts/stall-probe.mjs(c33c8da 시점)를 복사해 b7fde97 앱 동작에 맞게 고친 것.
// 바뀐 점: (1) `--lib`로 함수 lib 디렉터리를 고른다(수정 전 base lib · 수정 후 lib 같은 프로브로 비교)
//         (2) T192 끊기 미러링 — 폴백 SIGNAL(사전 판정 accepted 턴만 · 사후 판정으로 종료) · Live `end_call` 도구(판정 함수 그대로)
//         (3) `--seed <audit json>` — 폴백은 audit 원시 기록의 앞부분(오프닝 ~ "보냈어요" 직전)을 그대로 이력으로 깔고
//             "보냈어요"부터만 호출한다(호출 예산 — 수정 전·후가 같은 이력에서 출발한다)
//         (4) 호출 간격 ≥ 6.5초(분당 10회 이하) · 최근 8회 중 429가 3회면 정지
//         (5) lib에 A-1 기능이 있으면 앱과 같은 자리에서 쓴다(`sessionDeclaredSmsPurposes` · `planConfirmResult`) — base lib에는 없다
// 키는 functions/.secret.local 에서 메모리로만 읽는다(출력 0).
//
// node scripts/stall-probe.mjs <fallback|live> <scenarioId> <level> --lib <dir> --out <dir> [--seed <json>] [--max-calls N] [--tag T]
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
const libDir = path.resolve(argVal("--lib", path.join(fnRoot, "lib")));
const L = (p) => require(path.join(libDir, p));
const Lopt = (p) => (existsSync(path.join(libDir, p)) ? require(path.join(libDir, p)) : {});

const { GoogleGenAI, Modality, EndSensitivity, StartSensitivity } = require("@google/genai");
const { buildSystemPrompt, toLlmHistory, wrapUserInputAsData } = L("roleplay/promptAssembly.js");
const { resolveSessionScenarioPrompt, listFlowVariants } = L("scenarios/flowVariants.js");
const smsGate = L("inCallSms/smsGate.js");
const { sessionDeclaresInCallSms, resolveDeclaredSms, planSmsBackstop, resolveSmsGate, buildSmsNudgeInstruction, buildSmsMarkerOfferInstruction } = smsGate;
const { findInCallSmsItem, SMS_DECLINE_TOO_EARLY, SMS_DECLINE_ALREADY } = L("scenarios/inCallSms.js");
const { buildInCallSmsResponse } = L("inCallSms/buildDoc.js");
const { hasVerifyIntercept, findVerifyInterceptItem, VERIFY_DECLINE_TOO_EARLY } = L("scenarios/verifyIntercept.js");
const { isL3Procedural } = L("roleplay/l3Depth.js");
const { asksIdentityCheck } = L("roleplay/personaAuthority.js");
const { speakerGenderFor } = L("realtime/scenarioVoice.js");
const { GEMINI_LIVE_MODEL, pickGeminiVoiceName } = L("realtime/geminiProvider.js");
const liveTools = L("realtime/liveTools.js");
const { buildLiveToolDeclarations, declaresOfferVerificationDesk, declaresEndCall, LIVE_TOOL_SEND_PREPARED_SMS, LIVE_TOOL_OFFER_VERIFICATION_DESK, LIVE_TOOL_END_CALL } = liveTools;
const { GEMINI_TEXT_MODEL, OPENING_TRIGGER_TURN: TEXT_OPENING_TRIGGER } = L("llm/geminiClient.js");
const { OPENING_TURN_INSTRUCTION } = L("roleplay/openingLine.js");
const { pickFallbackTurnInstruction } = L("verifyIntercept/fallbackTurn.js");
const { extractSmsMarker } = L("roleplay/smsMarker.js");
const { extractEscalationSignal } = L("roleplay/escalationSignal.js");
const { resolveSessionAccountNumber } = L("shared/fictionalBank.js");
const { decideFallbackHangup, fallbackHangupMode, resolveFallbackHangupEffect } = L("scammerHangup/fallback.js");
const { decideScammerHangup } = L("scammerHangup/decide.js");
const { scammerHangupGuidance } = L("scammerHangup/guidance.js");
const { isSmsAwaitingUser } = L("scammerHangup/smsWait.js");
// A-1(있을 때만 — base lib에는 없다)
const sessionDeclaredSmsPurposes = smsGate.sessionDeclaredSmsPurposes;
const { planConfirmResult } = Lopt("inCallSms/confirmResult.js");

const LIVE_OPENING_TRIGGER =
  "(전화가 방금 연결됐다. 지금 막 전화를 받은 상대에게 캐릭터로서 자연스럽게 첫 마디를 건네라. 다짜고짜 요구나 압박부터 하지 말고, 먼저 신분(사칭 기관·관계)과 전화를 건 이유를 1~2문장으로 밝히며 상황을 설명한 뒤에 이어가라.)";

// 대본 A(audit-A와 동일).
const SCRIPT_A = [
  "네 누구세요?", "네", "김민수요", "네", "잠깐만요, 제가 직접 확인해 볼게요", "그래도 직접 확인해 보고 싶어요", "네",
  "알겠어요, 보냈어요", "확인됐어요?", "아직이에요?", "네", "(침묵)", "네",
];
const CLAIM_LINE = "알겠어요, 보냈어요";

const mode = args[0];
const scenarioId = args[1];
const level = args[2];
const MAX_CALLS = Number(argVal("--max-calls", "7"));
const outDir = path.resolve(argVal("--out", path.join(repoRoot, "stall-out")));
const tag = argVal("--tag", "");
const seedFile = argVal("--seed", "");
if (!["fallback", "live"].includes(mode) || !scenarioId || !level) {
  console.error("usage: stall-probe.mjs <fallback|live> <scenarioId> <level> --lib <dir> --out <dir> [--seed json]");
  process.exit(2);
}

function readApiKey() {
  const text = readFileSync(path.join(fnRoot, ".secret.local"), "utf8");
  const line = text.split(/\r?\n/).find((l) => l.startsWith("GEMINI_API_KEY="));
  if (!line) throw new Error("GEMINI_API_KEY 줄 없음");
  let v = line.slice("GEMINI_API_KEY=".length).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v.split(",")[0].trim();
}
const API_KEY = readApiKey();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
// 예외로 끝나도 그때까지의 기록을 남긴다(audit 프로브는 오류 시 부분 결과를 버려 429 여부를 확인할 수 없었다).
let partial = null;
const now = () => Date.now() - t0;

const variant = listFlowVariants(scenarioId, level)[0];
const variantId = variant?.variantId;
const scenarioPrompt = resolveSessionScenarioPrompt(scenarioId, variantId);
const { declared } = resolveDeclaredSms(scenarioId, variantId);
const verifyEnabled = hasVerifyIntercept(scenarioId) && level === "advanced";
const baseOpts = {
  difficultyLevel: level,
  inCallSmsEnabled: sessionDeclaresInCallSms(scenarioId, variantId),
  ...(sessionDeclaredSmsPurposes ? { inCallSmsPurposes: sessionDeclaredSmsPurposes(scenarioId, variantId) } : {}),
  verifyInterceptEnabled: verifyEnabled,
  l3Procedural: isL3Procedural(scenarioId),
  identityCheckAllowed: asksIdentityCheck(scenarioId),
  speakerGender: speakerGenderFor(scenarioId),
  sessionAccountNumber: resolveSessionAccountNumber(scenarioId),
};

// ── 폴백(앱 sendMessage 재현 — b7fde97 roleplay/index.ts) ─────────────────────
async function runFallback() {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const stored = [];
  const turns = [];
  const events = [];
  const delivered = [];
  const statuses = []; // 최근 호출 상태(200/429/err)
  let calls = 0;
  let lastCallAt = 0;
  let ended = null;
  partial = { model: GEMINI_TEXT_MODEL, statuses, events, turns, delivered, get calls() { return calls; } };
  async function complete(systemPrompt, messages) {
    const contents = messages.length > 0
      ? messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
      : [{ role: "user", parts: [{ text: TEXT_OPENING_TRIGGER }] }];
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (calls >= MAX_CALLS) throw new Error("호출 상한 도달");
      const wait = 6500 - (Date.now() - lastCallAt);
      if (wait > 0) await sleep(wait);
      if (statuses.slice(-8).filter((s) => s === 429).length >= 3) throw new Error("최근 8회 중 429 3회 — 정지");
      calls++;
      lastCallAt = Date.now();
      try {
        const res = await ai.models.generateContent({ model: GEMINI_TEXT_MODEL, contents, config: { systemInstruction: systemPrompt } });
        statuses.push(200);
        events.push({ t: now(), ev: "llmCall", status: 200 });
        return res.text ?? "";
      } catch (e) {
        const msg = String(e?.message ?? e).slice(0, 200);
        const is429 = /429/.test(msg);
        statuses.push(is429 ? 429 : "err");
        events.push({ t: now(), ev: "llmError", attempt, status: is429 ? 429 : "err", msg: msg.replace(/key=[^&\s]+/gi, "key=***") });
        if (statuses.slice(-8).filter((s) => s === 429).length >= 3) throw new Error("최근 8회 중 429 3회 — 정지");
        await sleep(is429 ? 20000 * attempt : 2000);
      }
    }
    return "";
  }
  let script = SCRIPT_A.filter((u) => u !== "(침묵)");
  if (seedFile) {
    const seed = JSON.parse(readFileSync(seedFile, "utf8"));
    if (seed.variantId !== variantId) throw new Error(`seed 변형(${seed.variantId}) ≠ 현재 변형(${variantId})`);
    const claimIdx = seed.turns.findIndex((t) => t.role === "user" && t.text === CLAIM_LINE);
    for (const t of seed.turns.slice(0, claimIdx)) {
      if (t.role === "user") stored.push({ role: "user", textMasked: t.text });
      else stored.push({ role: "scammer", textMasked: t.text });
      turns.push({ role: t.role, n: t.n, seeded: true, text: t.text });
    }
    const seededUserTurns = stored.filter((m) => m.role === "user").length;
    for (const d of seed.delivered ?? []) if (d.userTurnsAtArrival <= seededUserTurns) delivered.push({ ...d });
    events.push({ ev: "seeded", from: path.basename(seedFile), userTurns: seededUserTurns, delivered: [...delivered] });
    script = script.slice(script.indexOf(CLAIM_LINE));
  } else {
    const opening = await complete(buildSystemPrompt(scenarioPrompt, { ...baseOpts, turnInstruction: OPENING_TURN_INSTRUCTION }), []);
    stored.push({ role: "scammer", textMasked: opening });
    turns.push({ role: "scammer", n: 1, text: opening });
  }
  for (const u of script) {
    if (ended) break;
    const history = toLlmHistory(stored);
    history.push({ role: "user", content: wrapUserInputAsData(u) });
    const storedHistory = [...stored];
    const serverUserTurns = stored.filter((m) => m.role === "user").length + 1;
    const userTurnsNow = Math.max(serverUserTurns, ...delivered.map((d) => d.userTurnsAtArrival), 0);
    stored.push({ role: "user", textMasked: u });
    turns.push({ role: "user", text: u });
    const scammerTurnNumber = stored.filter((m) => m.role === "scammer").length + 1;
    let deliveredSmsId, dueItem, nudge;
    if (declared.length > 0) {
      const plan = planSmsBackstop({ declared, delivered, userTurns: userTurnsNow });
      if (plan.action === "deliver") {
        const g = resolveSmsGate({ purpose: plan.item.purpose, declared, delivered, userTurns: userTurnsNow });
        if (g.status === "allowed") {
          dueItem = findInCallSmsItem(scenarioId, g.item.smsId);
          deliveredSmsId = g.item.smsId;
          delivered.push({ smsId: g.item.smsId, userTurnsAtArrival: userTurnsNow });
          events.push({ ev: "sms", by: "backstop", smsId: deliveredSmsId, userTurns: userTurnsNow });
        }
      } else if (plan.action === "nudge") {
        nudge = buildSmsNudgeInstruction(plan.item.purpose);
      }
    }
    // T192 사전 판정(계열 B 고급은 오퍼 문서가 없어 transferPlaced=false — 앱과 같다).
    const hangupFacts = {
      status: "active", channel: "voice", verifyEnabled, transferPlaced: false, userTurns: userTurnsNow,
      limitReached: false, alreadyAccepted: false, relay: undefined, smsDeclared: declared.length > 0, smsDeliveredLoaded: true,
    };
    const pre = decideFallbackHangup(hangupFacts, delivered, false);
    const hangupMode = fallbackHangupMode(pre);
    const choice = pickFallbackTurnInstruction({ smsDue: Boolean(deliveredSmsId), scammerDocCount: scammerTurnNumber - 1, installConsentDue: false });
    const ti = choice === "sms_announce" ? dueItem?.announceInstruction : undefined;
    // A-1 ⑦ — 앱과 같은 조건(turnChoice none · 인증번호 대조 없음(loan) · 전환 전).
    const confirmPlan = planConfirmResult && choice === "none"
      ? planConfirmResult({ declared, delivered, userTurns: userTurnsNow, currentUserText: u, priorUserTexts: storedHistory.filter((m) => m.role === "user").map((m) => m.textMasked) })
      : undefined;
    const confirm = confirmPlan?.instruction;
    if (confirmPlan) events.push({ ev: "confirmPlan", reason: confirmPlan.reason, userTurns: userTurnsNow });
    const offer = declared.length > 0
      ? buildSmsMarkerOfferInstruction(declared.filter((it) => resolveSmsGate({ purpose: it.purpose, declared, delivered, userTurns: userTurnsNow }).status === "allowed").map((it) => it.purpose))
      : undefined;
    const tiAll = [ti, confirm, nudge, offer].filter(Boolean).join("\n") || undefined;
    let text = await complete(
      buildSystemPrompt(scenarioPrompt, { ...baseOpts, ...(tiAll ? { turnInstruction: tiAll } : {}), hangupMode }),
      history,
    );
    const mk = extractSmsMarker(text);
    text = mk.text;
    if (mk.markerCount > 0) {
      const g = resolveSmsGate({ purpose: mk.purpose, declared, delivered, userTurns: userTurnsNow });
      events.push({ ev: "smsMarker", purpose: mk.purpose, status: g.status, userTurns: userTurnsNow });
      if (g.status === "allowed") delivered.push({ smsId: g.item.smsId, userTurnsAtArrival: userTurnsNow });
    }
    const sig = extractEscalationSignal(text);
    text = sig.text;
    const post = decideFallbackHangup(hangupFacts, delivered, false);
    const effect = resolveFallbackHangupEffect({ endCall: sig.endCall, hangupMode, pre, post });
    events.push({ ev: "hangup", mode: hangupMode, preRow: pre.row, endCall: sig.endCall ?? null, end: effect.end, userTurns: userTurnsNow });
    if (effect.end) ended = { kind: effect.kind, userTurns: userTurnsNow };
    stored.push({ role: "scammer", textMasked: text });
    turns.push({ role: "scammer", n: scammerTurnNumber, cause: [ti && "sms_announce", confirm && "confirm_result", nudge && "nudge", offer && "markerOffer", hangupMode === "signal" && "signalTurn", effect.end && `ENDED:${effect.kind}`].filter(Boolean).join("+") || "user", text });
  }
  return { model: GEMINI_TEXT_MODEL, calls, statuses, events, turns, delivered, ended };
}

// ── Live(GeminiVoiceSession 재현, 텍스트 사용자 턴) ───────────────────────────
async function runLive() {
  const endCallScope = { channel: "voice", relay: undefined, liveAvailable: liveTools.END_CALL_LIVE_AVAILABLE };
  const declaresEnd = declaresEndCall(scenarioId, "voice", undefined, endCallScope.liveAvailable);
  const systemPrompt = buildSystemPrompt(scenarioPrompt, {
    ...baseOpts,
    toolDrivenTiming: true,
    offerToolDeclared: declaresOfferVerificationDesk(scenarioId, level),
    hangupMode: declaresEnd ? "tool" : "none",
  });
  const tools = buildLiveToolDeclarations(scenarioId, level, variantId, endCallScope);
  const verifyItem = verifyEnabled ? findVerifyInterceptItem(scenarioId) : undefined;
  const ai = new GoogleGenAI({ apiKey: API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  const events = [];
  const turns = [];
  let buf = "";
  let scammerTurns = 0;
  let userTurns = 0;
  let turnHadAudio = false;
  const delivered = [];
  let verifyPhase = "idle";
  let announcedAtTurn = null;
  let waiters = [];
  let closed = false;
  let ended = null;
  const notify = (ev) => { for (const w of [...waiters]) w(ev); };
  const session = await ai.live.connect({
    model: GEMINI_LIVE_MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: systemPrompt,
      speechConfig: { languageCode: "ko-KR", voiceConfig: { prebuiltVoiceConfig: { voiceName: pickGeminiVoiceName(scenarioId, "stall-probe") } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW, prefixPaddingMs: 300, endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH, silenceDurationMs: 400 } },
      tools,
    },
    callbacks: {
      onopen: () => events.push({ t: now(), ev: "open" }),
      onmessage: (m) => {
        if (m.toolCall) {
          const calls = m.toolCall.functionCalls ?? [];
          events.push({ t: now(), ev: "toolCall", calls: calls.map((c) => ({ name: c.name, args: c.args })), scammerTurns, userTurns });
          void handleToolCalls(calls);
          return;
        }
        const sc = m.serverContent;
        if (!sc) return;
        if ((sc.modelTurn?.parts ?? []).some((p) => p.inlineData?.data)) turnHadAudio = true;
        if (sc.outputTranscription?.text) buf += sc.outputTranscription.text;
        if (sc.interrupted) { turns.push({ role: "scammer", kind: "interrupted", text: buf, t: now() }); buf = ""; }
        if (sc.turnComplete) {
          scammerTurns += 1;
          turns.push({ role: "scammer", n: scammerTurns, text: buf, audio: turnHadAudio, t: now() });
          buf = ""; turnHadAudio = false;
          notify({ type: "turnComplete" });
        }
      },
      onerror: (e) => events.push({ t: now(), ev: "error", msg: String(e?.message ?? e) }),
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
          delivered.push({ smsId: item.smsId, userTurnsAtArrival: userTurns + 1 });
          status = "delivered";
          guidance = buildInCallSmsResponse(item, { placed: verifyPhase === "placed" }).announceInstruction;
        } else guidance = g.status === "already_delivered" ? SMS_DECLINE_ALREADY : SMS_DECLINE_TOO_EARLY;
        events.push({ t: now(), ev: "toolResult", name: c.name, purpose: c.args?.purpose, status, userTurns });
        return { id: c.id, name: c.name, response: { status, guidance } };
      }
      if (c.name === LIVE_TOOL_OFFER_VERIFICATION_DESK && verifyItem) {
        if (verifyPhase !== "idle") return { id: c.id, name: c.name, response: { status: "already_announced" } };
        if (scammerTurns < verifyItem.availableAfterScammerTurns) {
          events.push({ t: now(), ev: "toolResult", name: c.name, status: "too_early", scammerTurns });
          return { id: c.id, name: c.name, response: { status: "too_early", guidance: VERIFY_DECLINE_TOO_EARLY } };
        }
        verifyPhase = "announced"; announcedAtTurn = scammerTurns;
        events.push({ t: now(), ev: "toolResult", name: c.name, status: "announced", scammerTurns });
        return { id: c.id, name: c.name, response: { status: "announced", guidance: verifyItem.announceInstruction } };
      }
      if (c.name === LIVE_TOOL_END_CALL) {
        const d = decideScammerHangup({
          status: "active", channel: "voice", isMockTurn: false, verifyEnabled, transferPlaced: verifyPhase === "placed",
          userTurns: userTurns + 1, pendingInstruction: false, smsAwaitingUser: isSmsAwaitingUser(delivered, userTurns + 1),
          limitReached: false, alreadyAccepted: Boolean(ended), relay: undefined,
        });
        events.push({ t: now(), ev: "toolResult", name: c.name, status: d.status, row: d.row, userTurns });
        if (d.hangup && !ended) ended = { kind: c.args?.kind ?? "unspecified", userTurns };
        return { id: c.id, name: c.name, response: { status: d.status, guidance: scammerHangupGuidance(d.status) } };
      }
      return { id: c.id, name: c.name ?? "unknown", response: { status: "unsupported" } };
    });
    await sleep(300);
    try { session.sendToolResponse({ functionResponses: responses }); } catch (e) { events.push({ ev: "toolRespErr", msg: String(e) }); }
  }
  const waitTurn = (ms) => new Promise((resolve) => {
    const timer = setTimeout(() => { waiters = waiters.filter((w) => w !== fn); resolve("timeout"); }, ms);
    const fn = (ev) => { clearTimeout(timer); waiters = waiters.filter((w) => w !== fn); resolve(ev.type); };
    waiters.push(fn);
  });
  const sendText = (text, turnComplete, kind) => {
    events.push({ t: now(), ev: "send", kind, turnComplete, text: text.slice(0, 120) });
    turns.push({ role: kind === "user" ? "user" : "system", kind, text, t: now() });
    session.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete });
  };
  sendText(LIVE_OPENING_TRIGGER, true, "opening");
  await waitTurn(45000);
  for (const u of SCRIPT_A) {
    if (closed) break;
    if (ended) { events.push({ t: now(), ev: "ended_by_end_call", ...ended }); await waitTurn(8000); break; }
    if (verifyPhase === "announced" && scammerTurns > announcedAtTurn) {
      verifyPhase = "placed";
      sendText(verifyItem.reconnectInstruction, true, "verify_reconnect");
      events.push({ t: now(), ev: "verifyPlaced", scammerTurns });
      await waitTurn(45000);
    }
    if (u === "(침묵)") {
      events.push({ t: now(), ev: "silence_start" });
      const r = await waitTurn(15000);
      events.push({ t: now(), ev: "silence_end", modelSpoke: r === "turnComplete" });
      turns.push({ role: "user", kind: "silence", text: `(15초 무입력 — 모델 발화 ${r === "turnComplete" ? "있음" : "없음"})` });
      continue;
    }
    await sleep(700);
    userTurns += 1;
    sendText(u, true, "user");
    await waitTurn(45000);
    if (declared.length > 0) {
      const plan = planSmsBackstop({ declared, delivered, userTurns });
      events.push({ t: now(), ev: "backstopPlan", action: plan.action, userTurns });
      if (plan.action === "deliver") {
        const g = resolveSmsGate({ purpose: plan.item.purpose, declared, delivered, userTurns });
        if (g.status === "allowed") {
          const item = findInCallSmsItem(scenarioId, g.item.smsId);
          delivered.push({ smsId: item.smsId, userTurnsAtArrival: userTurns });
          // ⚠️ A-1 ⑦ Live 필드(confirmResultInstruction)는 클라 배선이 없으므로(A-2) 주입하지 않는다 — 앱과 같다.
          sendText(buildInCallSmsResponse(item, { placed: verifyPhase === "placed" }).announceInstruction ?? item.announceInstruction, false, "sms_announce_ctx");
          events.push({ t: now(), ev: "sms", by: "backstop", smsId: item.smsId });
        }
      } else if (plan.action === "nudge") {
        sendText(buildSmsNudgeInstruction(plan.item.purpose), false, "sms_nudge_ctx");
      }
    }
  }
  await sleep(1000);
  try { session.close(); } catch {}
  await sleep(500);
  return { model: GEMINI_LIVE_MODEL, tools: tools.flatMap((t) => (t.functionDeclarations ?? []).map((d) => d.name)), events, turns, delivered, verifyPhase, ended };
}

const startedIso = new Date().toISOString();
let result, error = null;
try { result = mode === "fallback" ? await runFallback() : await runLive(); } catch (e) { error = String(e?.stack ?? e).replace(/key=[^&\s]+/gi, "key=***"); result = partial ? { model: partial.model, calls: partial.calls, statuses: partial.statuses, events: partial.events, turns: partial.turns, delivered: partial.delivered } : { turns: [], events: [] }; }
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${tag ? tag + "-" : ""}${mode}-${scenarioId}-${level}-${startedIso.replace(/[:.]/g, "-")}.json`);
writeFileSync(outFile, JSON.stringify({ mode, scenarioId, level, variantId, lib: libDir, a1: Boolean(planConfirmResult), startedIso, error, ...result }, null, 2), "utf8");
console.log(`out=${path.basename(outFile)} model=${result.model} calls=${result.calls ?? "-"} statuses=${JSON.stringify(result.statuses ?? [])} a1=${Boolean(planConfirmResult)} ended=${JSON.stringify(result.ended ?? null)} error=${error ? error.slice(0, 200) : null}`);
for (const t of result.turns) {
  if (t.seeded) continue;
  console.log(`${t.role === "user" ? "U" : t.role === "system" ? "S" : "C"}${t.n ?? ""}${t.cause ? `[${t.cause}]` : ""}${t.kind && t.role === "system" ? `[${t.kind}]` : ""}: ${String(t.text).replace(/\s+/g, " ").slice(0, 200)}`);
}
for (const e of result.events.filter((e) => /sms|tool|verify|silence|error|close|confirm|hangup|seeded|ended/.test(e.ev))) console.log("  ev", JSON.stringify(e).slice(0, 220));
