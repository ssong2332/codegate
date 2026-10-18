#!/usr/bin/env node
// T191-S1 — 실시간 통화(Gemini Live)·텍스트 폴백의 "사기범 연속 발화"·"반복 발화" 측정 도구.
// 배경: docs/ScenarioDifficultyRedesign.md §1.3(P1~P7) · §1.4(R1~R8) · §2.3(T1~T5).
//
// ⛔ 이 파일은 앱 코드가 아니다(측정 전용). 앱 코드(functions/src/**, src/**)를 바꾸지 않고, 빌드된
//    functions/lib 에서 앱과 **같은 함수**(buildSystemPrompt · SCENARIO_PROMPTS · IN_CALL_SMS ·
//    buildLiveToolDeclarations · toLlmHistory · wrapUserInputAsData …)를 불러 같은 프롬프트를 조립한다.
// ⛔ API 키를 하드코딩하지 않는다. functions/.secret.local 의 `GEMINI_API_KEY=` 줄을 읽어 메모리에서만 쓴다.
//    키 값은 어떤 출력·파일에도 쓰지 않는다.
//
// 사용법(저장소 루트에서):
//   npm --prefix functions run build                     # functions/lib 최신화(필수)
//   node scripts/live-turn-probe.mjs <variant> [--level beginner|intermediate|advanced] [--out <dir>]
//
//   variant:
//     baseline   — A. 현행 재현: afterScammerTurns 에 도달한 사기범 turnComplete 직후 announce 를
//                  turnComplete:true 텍스트 턴으로 즉시 보낸다(P1). 지시로 생긴 모델 턴도 사기범 턴으로 센다(P2).
//                  send_prepared_sms 도구는 선언하고, 모델이 부르면 앱과 같은 게이트로 결과를 돌려준다.
//     backstop2  — A'. 위와 같되 앱 실제 백스톱 규칙(toolWindow.ts: 하한 도달 뒤 경계 2개 · 도구 성공 시 생략)을 따른다.
//     t1         — B. announce 를 turnComplete:false 로 주입(응답 유발 여부 + 다음 사용자 턴 반영 여부).
//     interrupt  — C. 모델 첫 오디오 수신 0.5~1초 뒤 사용자 텍스트 턴(turnComplete:true)을 끼워 넣는다(R6).
//     fallback   — D. 텍스트 폴백(gemini-3.1-flash-lite) — 매 턴 시스템 프롬프트 + 이력(앱 sendMessage 방식).
//
//   출력: <out>/<variant>-<level>-<timestamp>.json (원시 이벤트·턴·지표). 기본 out = ./s1-raw
//
// 한계(보고서에 기재): 사용자 발화는 오디오가 아니라 텍스트 턴(sendClientContent turnComplete:true)이다.
// 앱의 타이핑 입력 경로와 같고, 음성 입력(VAD·inputTranscription) 경로와는 다르다.

import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const fnRoot = path.join(repoRoot, "functions");
const require = createRequire(path.join(fnRoot, "package.json"));

const { GoogleGenAI, Modality, EndSensitivity, StartSensitivity } = require("@google/genai");
const { buildSystemPrompt, toLlmHistory, wrapUserInputAsData } = require(path.join(fnRoot, "lib/roleplay/promptAssembly.js"));
const { SCENARIO_PROMPTS } = require(path.join(fnRoot, "lib/scenarios/index.js"));
const { IN_CALL_SMS, hasInCallSms, findDueInCallSms, SMS_DECLINE_TOO_EARLY, SMS_DECLINE_ALREADY } = require(path.join(fnRoot, "lib/scenarios/inCallSms.js"));
const { hasVerifyIntercept, VERIFY_DECLINE_TOO_EARLY } = require(path.join(fnRoot, "lib/scenarios/verifyIntercept.js"));
const { isL3Procedural } = require(path.join(fnRoot, "lib/roleplay/l3Depth.js"));
const { asksIdentityCheck } = require(path.join(fnRoot, "lib/roleplay/personaAuthority.js"));
const { speakerGenderFor } = require(path.join(fnRoot, "lib/realtime/scenarioVoice.js"));
const { GEMINI_LIVE_MODEL, pickGeminiVoiceName } = require(path.join(fnRoot, "lib/realtime/geminiProvider.js"));
const { buildLiveToolDeclarations, declaresOfferVerificationDesk, LIVE_TOOL_SEND_PREPARED_SMS, LIVE_TOOL_OFFER_VERIFICATION_DESK } = require(path.join(fnRoot, "lib/realtime/liveTools.js"));
const { GEMINI_TEXT_MODEL, OPENING_TRIGGER_TURN: TEXT_OPENING_TRIGGER } = require(path.join(fnRoot, "lib/llm/geminiClient.js"));
const { OPENING_TURN_INSTRUCTION } = require(path.join(fnRoot, "lib/roleplay/openingLine.js"));
const { pickFallbackTurnInstruction } = require(path.join(fnRoot, "lib/verifyIntercept/fallbackTurn.js"));
// main d2cfb37(§77) 이후: 실시간 announce 문면은 buildInCallSmsResponse가 조립한다(OTP면 번호 대조 지시가 붙는다).
const { buildInCallSmsResponse } = require(path.join(fnRoot, "lib/inCallSms/buildDoc.js"));
// 폴백은 인증번호 도착 이후 매 턴 대조 지시를 붙인다(roleplay/otpCheck.ts).
const { resolveOtpCheckInstruction } = require(path.join(fnRoot, "lib/roleplay/otpCheck.js"));
// 앱 deliverInCallSms 응답의 announceInstruction(확인 오퍼 미전환 = placed:false).
const announceTextOf = (item) => buildInCallSmsResponse(item, { placed: false }).announceInstruction ?? item.announceInstruction;

// src/lib/realtime/GeminiVoiceSession.tsx:187 의 OPENING_TRIGGER_TURN 과 같은 문자열(클라 파일이라 import 불가 — 원문 복사).
const LIVE_OPENING_TRIGGER =
  "(전화가 방금 연결됐다. 지금 막 전화를 받은 상대에게 캐릭터로서 자연스럽게 첫 마디를 건네라. 다짜고짜 요구나 압박부터 하지 말고, 먼저 신분(사칭 기관·관계)과 전화를 건 이유를 1~2문장으로 밝히며 상황을 설명한 뒤에 이어가라.)";

const SCENARIO_ID = "institutional-impersonation";
// 고정 사용자 대본(8턴). 개인정보 없음.
const USER_SCRIPT = [
  "네 누구세요?",
  "제가 왜요?",
  "잘 모르겠는데요",
  "인증번호요? 왜 필요하죠?",
  "그냥 끊을게요",
  "알겠어요 뭐 하면 돼요?",
  "계좌요? 어디로요?",
  "가족한테 먼저 물어볼게요",
];

// ── 인자 ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const variant = args[0];
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const level = argVal("--level", "intermediate");
const outDir = path.resolve(argVal("--out", path.join(repoRoot, "s1-raw")));
const VARIANTS = ["baseline", "backstop2", "t1", "interrupt", "fallback", "reanalyze"];
if (!VARIANTS.includes(variant)) {
  console.error(`variant 는 ${VARIANTS.join("|")} 중 하나여야 합니다.`);
  process.exit(2);
}

// ── 키(메모리에서만) ──────────────────────────────────────────────────
function readApiKey() {
  const file = path.join(fnRoot, ".secret.local");
  const text = readFileSync(file, "utf8");
  const line = text.split(/\r?\n/).find((l) => l.startsWith("GEMINI_API_KEY="));
  if (!line) throw new Error("functions/.secret.local 에 GEMINI_API_KEY 줄이 없습니다.");
  let v = line.slice("GEMINI_API_KEY=".length).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  // 쉼표로 여러 키가 있으면 첫 번째만 쓴다.
  return v.split(",")[0].trim();
}
const API_KEY = variant === "reanalyze" ? "" : readApiKey();

// ── 앱과 같은 시스템 프롬프트 조립 ─────────────────────────────────────
function liveSystemPrompt(lv) {
  const sp = SCENARIO_PROMPTS[SCENARIO_ID];
  // functions/src/realtime/geminiProvider.ts:112-128 과 같은 옵션.
  return buildSystemPrompt(sp, {
    difficultyLevel: lv,
    inCallSmsEnabled: hasInCallSms(SCENARIO_ID),
    verifyInterceptEnabled: hasVerifyIntercept(SCENARIO_ID) && lv === "advanced",
    l3Procedural: isL3Procedural(SCENARIO_ID),
    identityCheckAllowed: asksIdentityCheck(SCENARIO_ID),
    speakerGender: speakerGenderFor(SCENARIO_ID),
    toolDrivenTiming: true,
    offerToolDeclared: declaresOfferVerificationDesk(SCENARIO_ID, lv),
  });
}
function fallbackSystemPrompt(lv, turnInstruction) {
  const sp = SCENARIO_PROMPTS[SCENARIO_ID];
  // functions/src/roleplay/index.ts sendMessage 와 같은 옵션(toolDrivenTiming·offerToolDeclared 없음).
  return buildSystemPrompt(sp, {
    difficultyLevel: lv,
    inCallSmsEnabled: hasInCallSms(SCENARIO_ID),
    verifyInterceptEnabled: hasVerifyIntercept(SCENARIO_ID) && lv === "advanced",
    l3Procedural: isL3Procedural(SCENARIO_ID),
    identityCheckAllowed: asksIdentityCheck(SCENARIO_ID),
    speakerGender: speakerGenderFor(SCENARIO_ID),
    ...(turnInstruction ? { turnInstruction } : {}),
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const now = () => Date.now() - t0;

// ── Live 세션 ──────────────────────────────────────────────────────────
async function runLive() {
  const sessionId = `s1-probe-${variant}-${level}`;
  const systemPrompt = liveSystemPrompt(level);
  const tools = buildLiveToolDeclarations(SCENARIO_ID, level);
  const triggers = (IN_CALL_SMS[SCENARIO_ID] ?? []).map((i) => ({ ...i }));
  const ai = new GoogleGenAI({ apiKey: API_KEY, httpOptions: { apiVersion: "v1alpha" } });

  const events = []; // 원시 이벤트(시각 포함)
  const turns = []; // {role, kind, text, ...}
  let scammerBuf = "";
  let scammerTurns = 0; // turnComplete 마다 +1 (P2 — 지시 턴 포함)
  let firstAudioAt = null;
  let turnStartAt = null;
  let turnHadAudio = false;
  let currentCause = "opening"; // 이 모델 턴을 유발한 입력
  const delivered = new Set();
  const requested = new Set(); // 앱의 requestedSmsRef
  let lastBoundaryAt = 0;
  let waiters = [];
  let closed = false;
  let closeInfo = null;
  const notify = (ev) => {
    for (const w of waiters) w(ev);
  };

  const session = await ai.live.connect({
    model: GEMINI_LIVE_MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: systemPrompt,
      speechConfig: {
        languageCode: "ko-KR",
        voiceConfig: { prebuiltVoiceConfig: { voiceName: pickGeminiVoiceName(SCENARIO_ID, sessionId) } },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
          prefixPaddingMs: 300,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
          silenceDurationMs: 400,
        },
      },
      tools,
    },
    callbacks: {
      onopen: () => events.push({ t: now(), ev: "open" }),
      onmessage: (m) => {
        if (m.toolCall) {
          const calls = m.toolCall.functionCalls ?? [];
          events.push({ t: now(), ev: "toolCall", names: calls.map((c) => c.name), scammerTurns });
          void handleToolCalls(calls);
          return;
        }
        if (m.toolCallCancellation) {
          events.push({ t: now(), ev: "toolCallCancellation" });
          return;
        }
        const sc = m.serverContent;
        if (!sc) return;
        const parts = sc.modelTurn?.parts ?? [];
        const hasAudio = parts.some((p) => p.inlineData?.data);
        if (hasAudio) {
          if (!turnHadAudio) {
            turnHadAudio = true;
            firstAudioAt = now();
            events.push({ t: now(), ev: "firstAudio", cause: currentCause });
            notify({ type: "firstAudio" });
          }
        }
        if (sc.outputTranscription?.text) {
          if (turnStartAt === null) turnStartAt = now();
          scammerBuf += sc.outputTranscription.text;
        }
        if (sc.inputTranscription?.text) events.push({ t: now(), ev: "inputTranscription", text: sc.inputTranscription.text });
        if (sc.interrupted) {
          events.push({ t: now(), ev: "interrupted", partial: scammerBuf });
          turns.push({ role: "scammer", kind: "interrupted_partial", cause: currentCause, text: scammerBuf, t: now() });
          scammerBuf = "";
          turnHadAudio = false;
          notify({ type: "interrupted" });
        }
        if (sc.generationComplete) events.push({ t: now(), ev: "generationComplete" });
        if (sc.turnComplete) {
          scammerTurns += 1;
          lastBoundaryAt = now();
          events.push({ t: now(), ev: "turnComplete", n: scammerTurns, chars: scammerBuf.length, audio: turnHadAudio });
          turns.push({ role: "scammer", kind: "turn", n: scammerTurns, cause: currentCause, text: scammerBuf, audio: turnHadAudio, t: now() });
          scammerBuf = "";
          turnHadAudio = false;
          turnStartAt = null;
          notify({ type: "turnComplete", n: scammerTurns });
        }
      },
      onerror: (e) => {
        events.push({ t: now(), ev: "error", msg: String(e?.message ?? e) });
      },
      onclose: (e) => {
        closed = true;
        closeInfo = { code: e?.code, reason: e?.reason };
        events.push({ t: now(), ev: "close", ...closeInfo });
        notify({ type: "close" });
      },
    },
  });

  // 앱 dispatchToolCall(GeminiVoiceSession.tsx) + deliverInCallSms(model_tool) 게이트를 메모리로 재현.
  async function handleToolCalls(calls) {
    const responses = calls.map((c) => {
      if (c.name === LIVE_TOOL_SEND_PREPARED_SMS) {
        // pickModelToolSmsId — 아직 안 보낸 것 중 afterScammerTurns 최소(없으면 첫 항목).
        const sorted = [...triggers].sort((a, b) => a.afterScammerTurns - b.afterScammerTurns);
        const item = sorted.find((t) => !delivered.has(t.smsId)) ?? sorted[0];
        const already = delivered.has(item.smsId) || requested.has(item.smsId);
        let status, guidance;
        if (already) {
          status = "already_delivered";
          guidance = SMS_DECLINE_ALREADY;
        } else if (scammerTurns < item.afterScammerTurns) {
          status = "too_early";
          guidance = SMS_DECLINE_TOO_EARLY;
        } else {
          status = "delivered";
          guidance = announceTextOf(item);
          delivered.add(item.smsId);
          requested.add(item.smsId);
        }
        events.push({ t: now(), ev: "toolResult", name: c.name, smsId: item.smsId, status, scammerTurns });
        return { id: c.id, name: c.name, response: { status, guidance } };
      }
      if (c.name === LIVE_TOOL_OFFER_VERIFICATION_DESK) {
        // 단순화: 확인 데스크 오퍼는 항상 too_early 로 돌려준다(측정 범위 밖).
        events.push({ t: now(), ev: "toolResult", name: c.name, status: "too_early(simplified)" });
        return { id: c.id, name: c.name, response: { status: "too_early", guidance: VERIFY_DECLINE_TOO_EARLY } };
      }
      return { id: c.id, name: c.name ?? "unknown", response: { status: "unsupported" } };
    });
    await sleep(300); // 콜러블 왕복 흉내
    try {
      session.sendToolResponse({ functionResponses: responses });
    } catch (e) {
      events.push({ t: now(), ev: "toolResponseError", msg: String(e?.message ?? e) });
    }
  }

  function waitFor(pred, timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiters = waiters.filter((w) => w !== fn);
        resolve({ type: "timeout" });
      }, timeoutMs);
      const fn = (ev) => {
        if (pred(ev) || ev.type === "close") {
          clearTimeout(timer);
          waiters = waiters.filter((w) => w !== fn);
          resolve(ev);
        }
      };
      waiters.push(fn);
    });
  }
  const waitTurn = (ms = 45000) => waitFor((e) => e.type === "turnComplete", ms);

  function sendText(text, turnComplete, kind) {
    events.push({ t: now(), ev: "clientSend", kind, turnComplete, text: text.slice(0, 200) });
    if (kind === "user") turns.push({ role: "user", kind: "user", text, t: now() });
    if (kind === "announce" || kind === "announce_ctx") turns.push({ role: "system", kind, text, t: now(), turnComplete });
    session.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete });
  }

  // 앱 page.tsx 백스톱: pickDueInCallSms + shouldFireBackstop(toolWindow.ts).
  function dueSms() {
    const due = triggers
      .filter((t) => !requested.has(t.smsId) && t.afterScammerTurns <= scammerTurns)
      .sort((a, b) => a.afterScammerTurns - b.afterScammerTurns);
    return due[0];
  }
  function shouldFire(item) {
    if (variant === "baseline" || variant === "t1" || variant === "interrupt") return true; // 지시대로 즉시(P1)
    // backstop2: toolAvailable=true → 경계 2개 또는 90초
    const boundariesSinceDue = Math.max(0, scammerTurns - item.afterScammerTurns);
    if (boundariesSinceDue >= 2) return true;
    if ((now() - lastBoundaryAt) / 1000 >= 90) return true;
    return false;
  }

  // ── 진행 ──
  const announceLog = [];
  sendText(LIVE_OPENING_TRIGGER, true, "opening");
  currentCause = "opening";
  let r = await waitTurn();
  events.push({ t: now(), ev: "wait", result: r.type });

  let userIdx = 0;
  const maxUser = variant === "interrupt" ? 6 : 8;
  const interruptPlan = new Set([1, 3, 5]); // C: 이 사용자 턴 인덱스 뒤 모델 턴을 끊는다
  let safety = 0;
  while (userIdx < maxUser && !closed && safety++ < 30) {
    // 사기범 턴 경계 직후: 문자 due 판정(앱은 turnComplete 직후 큐에서 announce 를 먼저 보낸다)
    const item = dueSms();
    if (item && shouldFire(item)) {
      requested.add(item.smsId);
      delivered.add(item.smsId);
      announceLog.push({ smsId: item.smsId, atScammerTurns: scammerTurns, mode: variant === "t1" ? "turnComplete:false" : "turnComplete:true" });
      if (variant === "t1") {
        sendText(announceTextOf(item), false, "announce_ctx");
        currentCause = "announce_ctx(no-turnComplete)";
        // 응답 유발 여부 확인: 10초 대기
        const rr = await waitFor((e) => e.type === "firstAudio" || e.type === "turnComplete", 10000);
        events.push({ t: now(), ev: "t1_probe_wait", result: rr.type });
        announceLog[announceLog.length - 1].responseWithin10s = rr.type !== "timeout";
        if (rr.type === "firstAudio") await waitTurn();
      } else {
        sendText(announceTextOf(item), true, "announce");
        currentCause = "announce";
        r = await waitTurn();
        events.push({ t: now(), ev: "wait", result: r.type });
      }
      continue; // 경계가 새로 생겼을 수 있으니 다시 판정
    }

    const text = USER_SCRIPT[userIdx];
    const idx = userIdx;
    userIdx += 1;
    await sleep(800);
    sendText(text, true, "user");
    currentCause = `user#${idx + 1}`;

    if (variant === "interrupt" && interruptPlan.has(idx)) {
      const fa = await waitFor((e) => e.type === "firstAudio" || e.type === "turnComplete", 20000);
      if (fa.type === "firstAudio") {
        const delay = 500 + Math.floor(Math.random() * 500);
        await sleep(delay);
        const barge = USER_SCRIPT[userIdx] ?? "여보세요?";
        userIdx += 1;
        events.push({ t: now(), ev: "bargeIn", delayMs: delay });
        sendText(barge, true, "user");
        currentCause = `user#${userIdx}(barge-in)`;
      }
      r = await waitTurn();
    } else {
      r = await waitTurn();
    }
    events.push({ t: now(), ev: "wait", result: r.type });
  }
  // 마지막 경계 뒤 due 문자 처리(대본 끝)
  await sleep(1500);
  try {
    session.close();
  } catch {}
  await sleep(500);
  return { model: GEMINI_LIVE_MODEL, tools: tools.map((t) => (t.functionDeclarations ?? []).map((d) => d.name)).flat(), events, turns, announceLog, closeInfo, systemPromptChars: systemPrompt.length };
}

// ── 텍스트 폴백 ────────────────────────────────────────────────────────
async function runFallback() {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const stored = []; // {role, textMasked}
  const turns = [];
  const events = [];
  const announceLog = [];
  const fbDelivered = new Set();
  async function complete(systemPrompt, messages) {
    const contents = messages.length > 0
      ? messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
      : [{ role: "user", parts: [{ text: TEXT_OPENING_TRIGGER }] }];
    const st = Date.now();
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await ai.models.generateContent({ model: GEMINI_TEXT_MODEL, contents, config: { systemInstruction: systemPrompt } });
        events.push({ t: now(), ev: "llm", ms: Date.now() - st, attempt });
        return res.text ?? "";
      } catch (e) {
        events.push({ t: now(), ev: "llmError", attempt, msg: String(e?.message ?? e).slice(0, 200) });
        await sleep(2000 * attempt);
      }
    }
    return "";
  }
  // 오프닝(openingLine.ts 방식)
  const opening = await complete(fallbackSystemPrompt(level, OPENING_TURN_INSTRUCTION), []);
  stored.push({ role: "scammer", textMasked: opening });
  turns.push({ role: "scammer", kind: "turn", n: 1, cause: "opening", text: opening });
  for (let i = 0; i < USER_SCRIPT.length; i++) {
    const u = USER_SCRIPT[i];
    const history = toLlmHistory(stored);
    history.push({ role: "user", content: wrapUserInputAsData(u) });
    stored.push({ role: "user", textMasked: u });
    turns.push({ role: "user", kind: "user", text: u });
    const scammerTurnNumber = stored.filter((m) => m.role === "scammer").length + 1;
    const due = findDueInCallSms(SCENARIO_ID, scammerTurnNumber);
    const choice = pickFallbackTurnInstruction({ smsDue: Boolean(due), scammerDocCount: scammerTurnNumber - 1 });
    const ti = choice === "sms_announce" ? due.announceInstruction : undefined;
    if (ti) {
      announceLog.push({ smsId: due.smsId, atScammerTurnNumber: scammerTurnNumber, mode: "same-response(turnInstruction)" });
      fbDelivered.add(due.smsId);
    }
    const otpCheck = await resolveOtpCheckInstruction({
      scenarioId: SCENARIO_ID,
      scammerTurnNumber,
      ...(ti ? { deliveredThisTurn: due.smsId } : {}),
      isDelivered: async (id) => fbDelivered.has(id),
      callTransferred: false,
    });
    const promptTi = [ti, otpCheck].filter(Boolean).join("\n") || undefined;
    const text = await complete(fallbackSystemPrompt(level, promptTi), history);
    stored.push({ role: "scammer", textMasked: text });
    turns.push({ role: "scammer", kind: "turn", n: scammerTurnNumber, cause: ti ? `user#${i + 1}+announce` : `user#${i + 1}`, text });
  }
  return { model: GEMINI_TEXT_MODEL, events, turns, announceLog };
}

// ── 지표 ──────────────────────────────────────────────────────────────
const norm = (s) => (s ?? "").replace(/[\s.,!?~…·"'“”‘’()\[\]{}:;\-—]/g, "");
function bigrams(s) {
  const n = norm(s);
  const set = new Set();
  for (let i = 0; i < n.length - 1; i++) set.add(n.slice(i, i + 2));
  return set;
}
function jaccard(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
function sentences(s) {
  return (s ?? "")
    .split(/(?<=[.?!。])\s+|\n+/)
    .map((x) => x.trim())
    .filter((x) => norm(x).length >= 4);
}
const SIM_TH = 0.6;
const SIM_TH_LOOSE = 0.4; // 보조 기준(같은 취지 재요구를 넓게 잡는다)
function computeMetrics(result) {
  const seq = result.turns.filter((t) => t.role === "user" || (t.role === "scammer" && t.kind === "turn"));
  const scam = seq.filter((t) => t.role === "scammer");
  // 연속 발화(사용자 발화 없이 이어진 사기범 turn)
  const runs = [];
  let run = 0;
  for (const t of seq) {
    if (t.role === "scammer") run++;
    else {
      if (run > 0) runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);
  const maxRun = Math.max(0, ...runs);
  const runsGe2 = runs.filter((r) => r >= 2).length;
  // 유사 문장 비율(직전 3개 사기범 발화의 문장과 jaccard ≥ 0.6)
  let sentTotal = 0, sentRep = 0, sentRepLoose = 0;
  const perTurn = [];
  scam.forEach((t, i) => {
    const prev = scam.slice(Math.max(0, i - 3), i);
    const prevSents = prev.flatMap((p) => sentences(p.text));
    const ss = sentences(t.text);
    let rep = 0, repLoose = 0;
    for (const s of ss) {
      const best = Math.max(0, ...prevSents.map((p) => jaccard(s, p)));
      if (best >= SIM_TH) rep++;
      if (best >= SIM_TH_LOOSE) repLoose++;
    }
    sentTotal += ss.length;
    sentRep += rep;
    sentRepLoose += repLoose;
    const prevUtter = scam[i - 1];
    perTurn.push({ n: t.n, cause: t.cause, sentences: ss.length, repeatedSentences: rep, jaccardVsPrevUtterance: prevUtter ? +jaccard(t.text, prevUtter.text).toFixed(3) : null });
  });
  // R5: announce 로 생긴 턴 vs 직전 사기범 발화
  const r5 = perTurn
    .filter((p) => /announce/.test(p.cause ?? ""))
    .map((p) => ({ n: p.n, cause: p.cause, jaccardVsPrev: p.jaccardVsPrevUtterance, repeatedSentences: p.repeatedSentences, sentences: p.sentences }));
  // R6: interrupted partial → 다음 사기범 turn 문두
  const r6 = [];
  const all = result.turns;
  all.forEach((t, i) => {
    if (t.kind !== "interrupted_partial") return;
    const next = all.slice(i + 1).find((x) => x.role === "scammer" && x.kind === "turn");
    const pFirst = sentences(t.text)[0] ?? t.text;
    const nFirst = next ? (sentences(next.text)[0] ?? next.text) : "";
    const prefixSame = norm(t.text).slice(0, 8) !== "" && norm(t.text).slice(0, 8) === norm(next?.text).slice(0, 8);
    const j = next ? jaccard(pFirst, nFirst) : null;
    r6.push({ partialChars: norm(t.text).length, nextN: next?.n ?? null, prefix8Same: prefixSame, firstSentenceJaccard: j === null ? null : +j.toFixed(3), restart: prefixSame || (j !== null && j >= SIM_TH) });
  });
  const emptyTurns = scam.filter((t) => norm(t.text).length === 0).length;
  return {
    scammerTurns: scam.length,
    emptyScammerTurns: emptyTurns,
    userTurns: seq.filter((t) => t.role === "user").length,
    consecutive: { runs, maxRun, runsGe2 },
    similarity: { threshold: SIM_TH, sentTotal, sentRepeated: sentRep, ratio: sentTotal ? +(sentRep / sentTotal).toFixed(3) : 0, looseThreshold: SIM_TH_LOOSE, sentRepeatedLoose: sentRepLoose, ratioLoose: sentTotal ? +(sentRepLoose / sentTotal).toFixed(3) : 0, perTurn },
    r5,
    r6: { interruptions: r6.length, restarts: r6.filter((x) => x.restart).length, detail: r6 },
  };
}

// ── main ──────────────────────────────────────────────────────────────
if (variant === "reanalyze") {
  const { readdirSync } = await import("node:fs");
  const rows = [];
  for (const f of readdirSync(outDir).filter((x) => x.endsWith(".json") && !x.startsWith("summary"))) {
    const d = JSON.parse(readFileSync(path.join(outDir, f), "utf8"));
    d.metrics = computeMetrics(d);
    writeFileSync(path.join(outDir, f), JSON.stringify(d, null, 2), "utf8");
    rows.push({ file: f, variant: d.variant, level: d.level, commit: d.commit ?? null, ...d.metrics, similarity: { ...d.metrics.similarity, perTurn: undefined } });
  }
  writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(rows, null, 2), "utf8");
  console.log(JSON.stringify(rows.map((r) => ({ f: r.file, c: r.commit, n: r.scammerTurns, maxRun: r.consecutive.maxRun, runsGe2: r.consecutive.runsGe2, rep06: `${r.similarity.sentRepeated}/${r.similarity.sentTotal}`, rep04: `${r.similarity.sentRepeatedLoose}/${r.similarity.sentTotal}`, r5: r.r5.map((x) => x.jaccardVsPrev), r6: `${r.r6.restarts}/${r.r6.interruptions}` })), null, 1));
  process.exit(0);
}
let commit = null;
try {
  const { execSync } = await import("node:child_process");
  commit = execSync("git rev-parse --short HEAD", { cwd: repoRoot }).toString().trim();
} catch {}
const startedIso = new Date().toISOString();
let result, error = null;
try {
  result = variant === "fallback" ? await runFallback() : await runLive();
} catch (e) {
  error = String(e?.stack ?? e);
  result = { events: [], turns: [] };
}
const metrics = computeMetrics(result);
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${variant}-${level}-${startedIso.replace(/[:.]/g, "-")}.json`);
writeFileSync(outFile, JSON.stringify({ variant, level, scenarioId: SCENARIO_ID, startedIso, commit, error, ...result, metrics }, null, 2), "utf8");
console.log(JSON.stringify({ outFile, variant, level, model: result.model, error: error ? error.slice(0, 300) : null, announceLog: result.announceLog, metrics: { ...metrics, similarity: { ...metrics.similarity, perTurn: undefined } } }, null, 2));
process.exit(error ? 1 : 0);
