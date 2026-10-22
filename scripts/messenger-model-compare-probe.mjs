#!/usr/bin/env node
// 메신저 사기범 대사 모델 비교 프로브(2026-10-22 · messenger-model-eval) — full-audit-probe.mjs의 messenger 경로를 모델만 바꿔 돌린다.
// ⛔ 앱 코드가 아니다. 빌드된 functions/lib에서 앱과 같은 함수로 같은 프롬프트를 조립한다(앱 코드 변경 0).
// ⛔ 키는 --secret <파일>의 `<변수>=` 줄에서 메모리로만 읽는다(출력 · 파일 기록 0).
// ⛔ 429(또는 RESOURCE_EXHAUSTED · rate_limit)가 1회라도 나면 STOP-429 파일을 만들고 같은 --out의 모든 흐름이 멈춘다.
// ⛔ 비용 상한 — 흐름(모델)마다 --budget-usd를 넘기면 그 흐름을 멈춘다(실제 usage 토큰 × 공식 단가로 누적).
//
// 공급자 호출은 앱 경로를 그대로 흉내 낸다:
//   gemini — generateContentStream · systemInstruction만(geminiClient.ts와 같다). 503은 0.5초 → 1.5초 재시도(overloadRetry와 같다).
//   groq   — groqClient.ts와 같은 본문(reasoning_effort low · include_reasoning false · max 1024) + 훈련 맥락 머리말 + 이름 가명처리.
//   claude — 연동 코드가 없어 같은 원칙으로 만든 fetch 어댑터. Groq와 같은 머리말 · 가명처리. 추론은 끈다
//            (Haiku 5.5: thinking disabled · Sonnet 5.5: between_tools).
//
// 참가자: trickster(사용자 신고 재현 고정 대본) · suspicious(full-audit-probe와 같은 대본)
//
// node scripts/messenger-model-compare-probe.mjs --secret <path> --model <A..F> --out <dir> [--reps 2] [--budget-usd 1] [--skip-done] [--dry]
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
const L = (p) => require(path.join(fnRoot, "lib", p));

const { GoogleGenAI } = require("@google/genai");
const { buildSystemPrompt, toLlmHistory, wrapUserInputAsData } = L("roleplay/promptAssembly.js");
const { resolveSessionScenarioPrompt, listFlowVariants } = L("scenarios/flowVariants.js");
const { sessionDeclaresInCallSms, sessionDeclaredSmsPurposes, sessionTransferSmsOpensLanding, resolveDeclaredSms, planSmsBackstop, resolveSmsGate, buildSmsNudgeInstruction, buildSmsMarkerOfferInstruction } = L("inCallSms/smsGate.js");
const { findInCallSmsItem } = L("scenarios/inCallSms.js");
const { planConfirmResult } = L("inCallSms/confirmResult.js");
const { hasVerifyIntercept } = L("scenarios/verifyIntercept.js");
const { isL3Procedural } = L("roleplay/l3Depth.js");
const { asksIdentityCheck } = L("roleplay/personaAuthority.js");
const { speakerGenderFor } = L("realtime/scenarioVoice.js");
const { OPENING_TRIGGER_TURN } = L("llm/geminiClient.js");
const { groqSystemPrompt, GROQ_CHAT_COMPLETIONS_URL, GROQ_MAX_COMPLETION_TOKENS } = L("llm/groqClient.js");
const { pseudonymizeForGroq } = L("llm/piiPseudonymizer.js");
const { judgeScammerReplyUsability } = L("llm/replyUsability.js");
const { OPENING_TURN_INSTRUCTION } = L("roleplay/openingLine.js");
const { pickFallbackTurnInstruction } = L("verifyIntercept/fallbackTurn.js");
const { extractSmsMarker } = L("roleplay/smsMarker.js");
const { extractLinkMarker } = L("roleplay/linkMarker.js");
const { extractEscalationSignal } = L("roleplay/escalationSignal.js");
const { resolveSessionAccountNumber, resolveFictionalBankName } = L("shared/fictionalBank.js");
const { decideFallbackHangup, fallbackHangupMode, resolveFallbackHangupEffect } = L("scammerHangup/fallback.js");

// ── 후보(1단계 승인 A~F) · 공식 단가(USD/1M, 2026-10-22 조회) ──────────────────────────────────────
const MODELS = {
  A: { provider: "gemini", model: "gemini-3.1-flash-lite", keyVar: "GEMINI_API_KEY2", inUsd: 0.25, outUsd: 1.5, gapMs: 6500 },
  B: { provider: "gemini", model: "gemini-3.5-flash-lite", keyVar: "GEMINI_API_KEY2", inUsd: 0.3, outUsd: 2.5, gapMs: 6500 },
  C: { provider: "gemini", model: "gemini-3.8-flash", keyVar: "GEMINI_API_KEY2", inUsd: 0.75, outUsd: 3.75, gapMs: 6500 },
  // Groq 한도는 조직 토큰/분 단위(10-21 운영 429 "tokens") — 호출 간격을 넉넉히 둔다.
  D: { provider: "groq", model: "openai/gpt-oss-120b", keyVar: "GROQ_API_KEY", inUsd: 0.15, outUsd: 0.6, gapMs: 30000 },
  E: { provider: "claude", model: "claude-haiku-5-5", keyVar: "CLAUDE_API_KEY", inUsd: 0.1, outUsd: 0.5, gapMs: 3000, thinking: { type: "disabled" } },
  F: { provider: "claude", model: "claude-sonnet-5-5", keyVar: "CLAUDE_API_KEY", inUsd: 2, outUsd: 10, gapMs: 3000, thinking: { type: "between_tools" } },
};
const CALL_TIMEOUT_MS = 30_000; // 앱 예산(7초)을 넘긴 호출도 끝까지 재서 분포를 본다 — 판정은 분석 단계에서.

const SCENARIOS = ["messenger-friend-loan-kakao", "messenger-child-impersonation-kakao", "messenger-subsidy-smishing-sms"];
const LEVEL = "intermediate";
const USER_TURNS = 10;

// ── 참가자 ────────────────────────────────────────────────────────────────────────────────────
// trickster — 2026-10-22 실기 신고 재현: 되받아치기(2) · 다른 사람인 척 장난(3) · 사칭 인물 확인(4) · 앞 맥락 확인(5).
// 등장 이름 "김성섭"은 고정 가상 인물이다.
const TRICKSTER = [
  "누구세요?",
  "나도 요즘 돈 없어ㅋㅋ 오히려 나 30만원만 빌려줘",
  "ㅋㅋ 사실 나 거의 김성섭이야",
  "근데 너 이름 뭐였지? 다시 말해 봐",
  "아까 내가 돈 빌려 달라고 한 건 어떻게 할 거야?",
  "지금 밥 먹는 중이라 이따 하면 안 돼?",
  "왜 이렇게 급해? 무슨 일인데",
  "그래서 정확히 얼마가 필요한 건데?",
  "음 알았어 계좌 다시 보내 봐",
  "생각 좀 해 볼게",
];
const SUSPICIOUS = [
  "잠깐만요, 어디시라고요? 소속이랑 성함 다시 말씀해 주세요.",
  "제 번호는 어떻게 아셨어요?",
  "진짜 맞아요? 제가 공식 번호로 다시 전화해서 확인해 볼게요.",
  "좀 이상한데요. 그쪽이 누군지 어떻게 믿어요?",
  "음… 알겠어요. 그 다음엔 어떻게 해요?",
  "음… 알겠어요. 얼마를 어디로 보내면 돼요?",
  "음… 알겠어요. 네, 보냈어요.",
  "음… 알겠어요. 인증번호는 382914요.",
  "근데 이거 정말 괜찮은 거죠?",
  "음… 알겠어요. 또 뭐 하면 돼요?",
];
const SCRIPT = { trickster: TRICKSTER, suspicious: SUSPICIOUS };

// ── 키 · 공통 ─────────────────────────────────────────────────────────────────────────────────
const letter = argVal("--model", "");
const M = MODELS[letter];
if (!M) throw new Error("--model A..F 필요");
function readKey(keyVar) {
  const secret = argVal("--secret", "");
  if (!secret) throw new Error("--secret <파일> 필요");
  const line = readFileSync(secret, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${keyVar}=`));
  if (!line) throw new Error(`${keyVar} 줄 없음 — 다른 키로 대체하지 않고 멈춘다`);
  let v = line.slice(keyVar.length + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v.split(",")[0].trim();
}
const API_KEY = readKey(M.keyVar);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scrub = (s) => String(s ?? "").replace(/key=[^&\s]+/gi, "key=***").replace(API_KEY, "***");

class RateLimitError extends Error {}
class OverloadError extends Error {}

// ── 공급자 어댑터 — { text, inTok, outTok } ───────────────────────────────────────────────────
const gemini = M.provider === "gemini" ? new GoogleGenAI({ apiKey: API_KEY }) : null;

async function callGemini(systemPrompt, messages, signal) {
  const contents = messages.length > 0
    ? messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
    : [{ role: "user", parts: [{ text: OPENING_TRIGGER_TURN }] }];
  try {
    const stream = await gemini.models.generateContentStream({ model: M.model, contents, config: { systemInstruction: systemPrompt, abortSignal: signal } });
    let text = "", usage;
    for await (const chunk of stream) { text += chunk.text ?? ""; if (chunk.usageMetadata) usage = chunk.usageMetadata; }
    return { text, inTok: usage?.promptTokenCount ?? 0, outTok: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0) };
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/(^|\D)429(\D|$)|RESOURCE_EXHAUSTED/i.test(msg)) throw new RateLimitError("gemini 429");
    if (/"code":\s?503|UNAVAILABLE|high demand/.test(msg)) throw new OverloadError("gemini 503");
    throw e;
  }
}

async function callGroq(systemPrompt, messages, signal) {
  const pseudo = pseudonymizeForGroq(messages);
  const msgs = pseudo.messages.length > 0 ? pseudo.messages : [{ role: "user", content: OPENING_TRIGGER_TURN }];
  const res = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: M.model,
      messages: [{ role: "system", content: groqSystemPrompt({ purpose: "scammer-reply", systemPrompt }) }, ...msgs],
      reasoning_effort: "low", include_reasoning: false, max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 429) throw new RateLimitError(`groq 429 ${body?.error?.type ?? ""}`);
  if (res.status >= 500) throw new OverloadError(`groq ${res.status}`);
  if (!res.ok) throw new Error(`groq HTTP ${res.status} ${body?.error?.type ?? ""}/${body?.error?.code ?? ""}`);
  const raw = body.choices?.[0]?.message?.content;
  return { text: typeof raw === "string" ? pseudo.restore(raw).trim() : "", inTok: body.usage?.prompt_tokens ?? 0, outTok: body.usage?.completion_tokens ?? 0 };
}

async function callClaude(systemPrompt, messages, signal) {
  const pseudo = pseudonymizeForGroq(messages);
  const msgs = pseudo.messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  // Messages API는 user로 시작해야 한다 — 오프닝 트리거(화면 비노출 오케스트레이션 신호)를 앞에 둔다(Gemini 오프닝과 같은 문장).
  if (msgs.length === 0 || msgs[0].role !== "user") msgs.unshift({ role: "user", content: OPENING_TRIGGER_TURN });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal,
    headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: M.model, max_tokens: 1024, thinking: M.thinking,
      system: groqSystemPrompt({ purpose: "scammer-reply", systemPrompt }),
      messages: msgs,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 429) throw new RateLimitError(`claude 429 ${body?.error?.type ?? ""}`);
  if (res.status === 529 || res.status >= 500) throw new OverloadError(`claude ${res.status}`);
  if (!res.ok) throw new Error(`claude HTTP ${res.status} ${body?.error?.type ?? ""}: ${String(body?.error?.message ?? "").slice(0, 200)}`);
  const text = (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return { text: pseudo.restore(text), inTok: body.usage?.input_tokens ?? 0, outTok: body.usage?.output_tokens ?? 0, stopReason: body.stop_reason };
}

const CALL = { gemini: callGemini, groq: callGroq, claude: callClaude };

// ── 비용 · 정지 ───────────────────────────────────────────────────────────────────────────────
const outDir = path.resolve(argVal("--out", path.join(repoRoot, "model-compare-out")));
mkdirSync(outDir, { recursive: true });
const stopFile = path.join(outDir, "STOP-429");
const budgetUsd = Number(argVal("--budget-usd", "1"));
let spentUsd = 0;
let lastCallAt = 0;

async function complete(systemPrompt, messages, events, t0) {
  const wait = M.gapMs - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);
  const retries = [500, 1500];
  for (let attempt = 0; ; attempt += 1) {
    if (existsSync(stopFile)) throw new RateLimitError("다른 흐름의 STOP-429");
    if (spentUsd >= budgetUsd) throw new Error(`비용 상한 도달 $${spentUsd.toFixed(4)}`);
    lastCallAt = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), CALL_TIMEOUT_MS);
    const started = Date.now();
    try {
      const r = await CALL[M.provider](systemPrompt, messages, ac.signal);
      const ms = Date.now() - started;
      const usd = (r.inTok * M.inUsd + r.outTok * M.outUsd) / 1e6;
      spentUsd += usd;
      events.push({ t: Date.now() - t0, ev: "llmCall", ms, attempt, inTok: r.inTok, outTok: r.outTok, usd, stopReason: r.stopReason });
      return { ...r, ms };
    } catch (e) {
      const ms = Date.now() - started;
      if (e instanceof RateLimitError) { writeFileSync(stopFile, `${letter} ${e.message}`); throw e; }
      if (e instanceof OverloadError && attempt < retries.length) { events.push({ ev: "overload", ms, attempt }); await sleep(retries[attempt]); continue; }
      events.push({ ev: "callError", ms, attempt, msg: scrub(e?.name === "AbortError" ? `timeout ${CALL_TIMEOUT_MS}ms` : e?.message ?? e).slice(0, 200) });
      throw e;
    } finally { clearTimeout(timer); }
  }
}

function cleanMessengerOutput(text, scenarioId, variantId, level) {
  try {
    const r = extractLinkMarker(text, scenarioId, { scenarioId, difficultyLevel: level, ...(variantId ? { flowVariantId: variantId } : {}) });
    return { text: r.text, attachments: r.attachments };
  } catch { return { text }; }
}

// ── 세션(full-audit-probe runMessenger와 같은 흐름 · 모델만 교체 · 사용자 발화는 고정 대본) ─────────────
async function runSession(scenarioId, persona, rep) {
  const t0 = Date.now();
  const variantId = listFlowVariants(scenarioId, LEVEL)[0]?.variantId;
  const scenarioPrompt = resolveSessionScenarioPrompt(scenarioId, variantId);
  const { declared } = resolveDeclaredSms(scenarioId, variantId);
  const verifyEnabled = hasVerifyIntercept(scenarioId) && LEVEL === "advanced";
  // 가상 은행은 시나리오·회차로 고정 — 모델 간 같은 조건.
  const fictionalBankName = resolveFictionalBankName({ sessionId: `model-compare-${scenarioId}-${persona}-${rep}` });
  const baseOpts = {
    difficultyLevel: LEVEL,
    inCallSmsEnabled: sessionDeclaresInCallSms(scenarioId, variantId),
    inCallSmsPurposes: sessionDeclaredSmsPurposes(scenarioId, variantId),
    transferSmsLink: sessionTransferSmsOpensLanding(scenarioId, variantId),
    verifyInterceptEnabled: verifyEnabled,
    l3Procedural: isL3Procedural(scenarioId),
    identityCheckAllowed: asksIdentityCheck(scenarioId),
    speakerGender: speakerGenderFor(scenarioId),
    fictionalBankName,
    sessionAccountNumber: resolveSessionAccountNumber(scenarioId),
  };
  const stored = [], turns = [], events = [], delivered = [];
  let ended = null;
  try {
  const opening = await complete(buildSystemPrompt(scenarioPrompt, { ...baseOpts, turnInstruction: OPENING_TURN_INSTRUCTION }), [], events, t0);
  const op = cleanMessengerOutput(opening.text, scenarioId, variantId, LEVEL);
  stored.push({ role: "scammer", textMasked: op.text });
  turns.push({ role: "scammer", n: 1, ms: opening.ms, unusable: judgeScammerReplyUsability(opening.text) ?? null, text: op.text });
  const script = SCRIPT[persona];
  for (let i = 0; i < USER_TURNS; i += 1) {
    if (ended) break;
    const u = script[i];
    const history = toLlmHistory(stored);
    history.push({ role: "user", content: wrapUserInputAsData(u) });
    const storedHistory = [...stored];
    const userTurnsNow = Math.max(stored.filter((m) => m.role === "user").length + 1, ...delivered.map((d) => d.userTurnsAtArrival), 0);
    stored.push({ role: "user", textMasked: u });
    turns.push({ role: "user", n: userTurnsNow, text: u });
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
        }
      } else if (plan.action === "nudge") nudge = buildSmsNudgeInstruction(plan.item.purpose);
    }
    const hangupFacts = {
      status: "active", channel: "messenger", verifyEnabled, transferPlaced: false, transferReachable: true, userTurns: userTurnsNow,
      limitReached: false, alreadyAccepted: false, relay: undefined, smsDeclared: declared.length > 0, smsDeliveredLoaded: true,
    };
    const pre = decideFallbackHangup(hangupFacts, delivered, false);
    const hangupMode = fallbackHangupMode(pre);
    const choice = pickFallbackTurnInstruction({ smsDue: Boolean(deliveredSmsId), scammerDocCount: scammerTurnNumber - 1, installConsentDue: false });
    const ti = choice === "sms_announce" ? dueItem?.announceInstruction : undefined;
    const confirmPlan = choice === "none" && !nudge
      ? planConfirmResult({ scenarioId, declared, delivered, userTurns: userTurnsNow, currentUserText: u, priorUserTexts: storedHistory.filter((m) => m.role === "user").map((m) => m.textMasked) })
      : undefined;
    const offer = declared.length > 0
      ? buildSmsMarkerOfferInstruction(declared.filter((it) => resolveSmsGate({ purpose: it.purpose, declared, delivered, userTurns: userTurnsNow }).status === "allowed").map((it) => it.purpose))
      : undefined;
    const tiAll = [ti, confirmPlan?.instruction, nudge, offer].filter(Boolean).join("\n") || undefined;
    const r = await complete(buildSystemPrompt(scenarioPrompt, { ...baseOpts, ...(tiAll ? { turnInstruction: tiAll } : {}), hangupMode }), history, events, t0);
    const mk = extractSmsMarker(r.text);
    if (mk.markerCount > 0) {
      const g = resolveSmsGate({ purpose: mk.purpose, declared, delivered, userTurns: userTurnsNow });
      if (g.status === "allowed") delivered.push({ smsId: g.item.smsId, userTurnsAtArrival: userTurnsNow });
    }
    const sig = extractEscalationSignal(mk.text);
    const cleaned = cleanMessengerOutput(sig.text, scenarioId, variantId, LEVEL);
    const post = decideFallbackHangup(hangupFacts, delivered, false);
    const effect = resolveFallbackHangupEffect({ endCall: sig.endCall, hangupMode, pre, post });
    if (effect.end) ended = { kind: effect.kind, userTurns: userTurnsNow };
    stored.push({ role: "scammer", textMasked: cleaned.text });
    turns.push({ role: "scammer", n: scammerTurnNumber, ms: r.ms, unusable: judgeScammerReplyUsability(r.text) ?? null, stopReason: r.stopReason, ended: effect.end ? effect.kind : undefined, text: cleaned.text });
  }
  } catch (e) {
    // 중단된 세션도 그때까지의 대화·지연 기록을 남긴다(30초 초과 호출이 분포에서 빠지지 않게).
    e.partial = { variantId, ended, turns, events, wallMs: Date.now() - t0 };
    throw e;
  }
  return { variantId, ended, turns, events, wallMs: Date.now() - t0 };
}

// ── 실행 ───────────────────────────────────────────────────────────────────────────────────────
const reps = Number(argVal("--reps", "2"));
const jobs = [];
for (let rep = 1; rep <= reps; rep += 1) for (const id of SCENARIOS) for (const persona of ["trickster", "suspicious"]) jobs.push({ id, persona, rep });
if (args.includes("--dry")) {
  // 키 없이 조립만 확인(과금 0) — 시나리오 해석과 시스템 프롬프트 길이만 출력.
  for (const id of SCENARIOS) {
    const v = listFlowVariants(id, LEVEL)[0]?.variantId;
    console.log(id, v, buildSystemPrompt(resolveSessionScenarioPrompt(id, v), { difficultyLevel: LEVEL }).length);
  }
  process.exit(0);
}
for (const job of jobs) {
  if (existsSync(stopFile)) { console.log("정지 파일 감지 — 중단"); break; }
  const file = `${letter}-${job.id}-${job.persona}-r${job.rep}.json`;
  // --skip-done: 오류 없이 끝난 세션은 다시 돌리지 않는다(429 정지 뒤 재개용).
  if (args.includes("--skip-done") && existsSync(path.join(outDir, file)) && !JSON.parse(readFileSync(path.join(outDir, file), "utf8")).error) continue;
  const startedIso = new Date().toISOString();
  let result, error = null;
  try { result = await runSession(job.id, job.persona, job.rep); }
  catch (e) { error = scrub(e?.message ?? e); result = e?.partial ?? { turns: [], events: [] }; }
  writeFileSync(path.join(outDir, file), JSON.stringify({ letter, provider: M.provider, model: M.model, ...job, startedIso, error, spentUsdSoFar: spentUsd, ...result }, null, 2), "utf8");
  console.log(JSON.stringify({ letter, ...job, error: error ? error.slice(0, 160) : null, turns: result.turns?.length ?? 0, spentUsd: Number(spentUsd.toFixed(4)) }));
  if (existsSync(stopFile)) { console.log("429 — 중단"); break; }
  if (/비용 상한/.test(error ?? "")) { console.log("비용 상한 — 중단"); break; }
}
console.log(JSON.stringify({ letter, done: true, spentUsd: Number(spentUsd.toFixed(4)) }));
