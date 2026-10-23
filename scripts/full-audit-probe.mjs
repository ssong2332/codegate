#!/usr/bin/env node
// 전 시나리오 대화 흐름 전수 검수 프로브(2026-10-22 · full-scenario-live-audit) — duration-probe.mjs(Live) · stall-probe.mjs(텍스트)를 합친 측정 도구.
// ⛔ 앱 코드가 아니다. 빌드된 functions/lib에서 앱과 같은 함수로 같은 프롬프트·도구를 조립한다(앱 코드 변경 0).
// ⛔ 키는 --secret <파일>의 `<--key-var>=` 줄에서 메모리로만 읽는다(출력 · 파일 기록 0). 대체 키로 몰래 넘어가지 않는다.
// ⛔ 429(또는 RESOURCE_EXHAUSTED · quota)가 1회라도 나면 STOP-429 파일을 만들고 모든 흐름이 멈춘다.
//
// 경로
//   voice     — Gemini Live(실시간 경로와 같은 시스템 프롬프트 · 도구). 사용자 발화는 텍스트 턴.
//               앱 신호 흉내: send_prepared_sms 도구 결과 · 문자 백스톱 · 확인 창구 도구/재연결 · end_call 도구(판정 함수 그대로)
//               · 필수 계좌·링크 문자 도착 뒤 확인 결과 조건형 1줄(confirmResultInstruction — 앱 PR-A2와 같은 맥락 주입).
//   messenger — 텍스트 모델(sendMessage와 같은 조립 · 오프닝 지시 · 문자/링크/에스컬레이션 마커 제거 · 폴백 끊기 판정).
// 참가자 유형: comply(순순히 따름 · 가짜 값) · suspicious(정체를 캐묻다가 머뭇거리며 따름) · refuse(처음부터 거절)
//
// node scripts/full-audit-probe.mjs --secret <path> --plan <json> --out <dir> [--key-var GEMINI_API_KEY2] [--tag s1]
//   plan json = [{ "ch": "voice"|"messenger", "id": "...", "level": "beginner|intermediate|advanced", "persona": "comply|suspicious|refuse" }, ...]
//   §115 — 선택 키: "variant"(흐름 변형 고정 · 부재면 첫 변형) · "maxTurns"(참가자 발화 상한 덮어쓰기)
//   --fn-root <functions 폴더> — 다른 체크아웃(수정 전 기준)의 빌드된 lib로 돌린다(부재 = 이 저장소 functions)
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const fnRoot = (() => { const i = process.argv.indexOf("--fn-root"); return i >= 0 ? path.resolve(process.argv[i + 1]) : path.join(repoRoot, "functions"); })();
const require = createRequire(path.join(fnRoot, "package.json"));
const args = process.argv.slice(2);
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const libDir = path.join(fnRoot, "lib");
const L = (p) => require(path.join(libDir, p));

const { GoogleGenAI, Modality, EndSensitivity, StartSensitivity } = require("@google/genai");
const { buildSystemPrompt, toLlmHistory, wrapUserInputAsData } = L("roleplay/promptAssembly.js");
const { resolveSessionScenarioPrompt, listFlowVariants } = L("scenarios/flowVariants.js");
const { sessionDeclaresInCallSms, sessionDeclaredSmsPurposes, sessionTransferSmsOpensLanding, resolveDeclaredSms, planSmsBackstop, resolveSmsGate, buildSmsNudgeInstruction, buildSmsMarkerOfferInstruction } = L("inCallSms/smsGate.js");
const { findInCallSmsItem, SMS_DECLINE_TOO_EARLY, SMS_DECLINE_ALREADY } = L("scenarios/inCallSms.js");
const { buildInCallSmsResponse, buildConfirmResultField } = L("inCallSms/buildDoc.js");
const { planConfirmResult } = L("inCallSms/confirmResult.js");
const { hasVerifyIntercept, findVerifyInterceptItem, VERIFY_DECLINE_TOO_EARLY } = L("scenarios/verifyIntercept.js");
const { isL3Procedural } = L("roleplay/l3Depth.js");
const { asksIdentityCheck } = L("roleplay/personaAuthority.js");
const { speakerGenderFor } = L("realtime/scenarioVoice.js");
const { GEMINI_LIVE_MODEL, pickGeminiVoiceName } = L("realtime/geminiProvider.js");
const liveTools = L("realtime/liveTools.js");
const { buildLiveToolDeclarations, declaresOfferVerificationDesk, declaresEndCall, LIVE_TOOL_SEND_PREPARED_SMS, LIVE_TOOL_OFFER_VERIFICATION_DESK, LIVE_TOOL_END_CALL } = liveTools;
const { GEMINI_TEXT_MODEL, GEMINI_FALLBACK_TEXT_MODEL, OPENING_TRIGGER_TURN: TEXT_OPENING_TRIGGER } = L("llm/geminiClient.js");
const { OPENING_TURN_INSTRUCTION } = L("roleplay/openingLine.js");
const { pickFallbackTurnInstruction } = L("verifyIntercept/fallbackTurn.js");
const { extractSmsMarker } = L("roleplay/smsMarker.js");
const { extractLinkMarker } = L("roleplay/linkMarker.js");
const { extractEscalationSignal } = L("roleplay/escalationSignal.js");
const { resolveSessionAccountNumber, resolveFictionalBankName, applyFictionalBank } = L("shared/fictionalBank.js");
const { decideFallbackHangup, fallbackHangupMode, resolveFallbackHangupEffect } = L("scammerHangup/fallback.js");
const { decideScammerHangup } = L("scammerHangup/decide.js");
const { scammerHangupGuidance } = L("scammerHangup/guidance.js");
const { isSmsAwaitingUser } = L("scammerHangup/smsWait.js");
// §104(2026-10-22) — 새 서버 판정(반복 차단 · 신호↔대사). 옛 lib(수정 전 기준 측정)에는 없으므로 없으면 종전 동작(null).
const optionalLib = (p) => { try { return L(p); } catch { return null; } };
const repeatBreakLib = optionalLib("roleplay/repeatBreak.js");
const signalConsistencyLib = optionalLib("roleplay/signalConsistency.js");
// §108 · §115 — 끊기 4행 입력(할 일 완료). 옛 lib에는 없을 수 있다(없으면 false — 종전 프로브 동작).
const goalActionLib = optionalLib("scammerHangup/goalAction.js");
const guidanceLib = optionalLib("scammerHangup/guidance.js");

// §104 — Live 클라 반복 · 대기 정체 주입(`src/lib/realtime/stallRecovery.ts` §4)의 미러. 클라 모듈은 TS라 여기서 못 불러 판정표를 옮겼다 —
// 5 · 6행(인적사항 · 유사도)은 서버 lib `decideRepeatBreak`(클라와 같은 정규식 — 루트 `[§104 짝]` 테스트)를 쓰고, 4행(대기 말)만 옮긴다.
// ⚠️ 문면 · 정규식이 클라와 다르면 루트 테스트 `[§104 프로브 미러]`가 실패한다. 서버 lib에 `repeatBreak`가 없으면(수정 전 lib) 주입 0.
const PROBE_STALL_VOCABULARY =
  /확인\s*(?:하는\s*)?중|확인하고\s*있|확인\s*절차|처리\s*(?:하는\s*)?중|처리하고\s*있|조회\s*중|확인되는\s*대로|처리되는\s*대로|확인되면|기다려|기다리|대기\s*중|지연|잠시만/;
const PROBE_WAIT_REQUEST_LINE = /대기(?:해|하여|하고)\s*(?:주|계|있어|있으)|대기\s*부탁/;
const PROBE_LIVE_STALL_TEXT =
  "(너는 직전 대답과 그 앞 대답에서 대기하라거나 확인 중이라는 말을 했다. 이번 대답에서는 대기하라거나 확인 중이라는 말을 하지 말고, 지금까지 받은 것을 근거로 새 요구를 꺼내라 — 남은 돈이나 다른 계좌의 돈, 추가 정보, 주변 사람이나 은행에 알리지 말라는 구체적인 지시 중 하나로 상황을 앞으로 움직여라. 더 요구할 것이 정말 남지 않았으면 [진행 강제]의 통화 끝내기 항목이 정한 대로 하라.)";
function probeIsStallLine(text) {
  const t = text.trim();
  if (!t || t.endsWith("?")) return false;
  const sentences = (t.match(/[^.?!\n]+[.?!]?/g) ?? []).map((x) => x.trim()).filter(Boolean);
  let last = sentences[sentences.length - 1] ?? "";
  for (let i = sentences.length - 1; i >= 0; i -= 1) if (/\s/.test(sentences[i])) { last = sentences[i]; break; }
  if (last.endsWith("?")) return false;
  for (const m of last.matchAll(/(\S+?)\s*주(?:세요|십시오|시면|시겠어요|시겠습니까|실래요)/g)) if (!/^(?:기다려|기다리|대기해|대기하)/.test(m[1])) return false;
  const result = /(?:승인|완료|처리|확인|등록|접수)(?:\s*[이가])?\s*(?:(?:안|못)\s*)?(?:됐|되었|되셨|되지)/.test(last);
  const negated = /(?:승인|완료|처리|확인|등록|접수)(?:\s*[이가])?\s*(?:안|못)\s*(?:됐|되었|되셨)|(?:승인|완료|처리|확인|등록|접수)되지\s*(?:않|못)/.test(last);
  if (result && !negated) return false;
  return PROBE_STALL_VOCABULARY.test(t);
}
// §104 — 클라 `scammerClaimsSmsSent`(`src/lib/realtime/toolWindow.ts` SMS_SENT_CLAIM)의 미러.
const PROBE_SMS_SENT_CLAIM =
  /문자(?:로)?\s*(?:를\s*)?(?:보내\s*드렸|보내드렸|보냈|보내\s*드린|보내드린|보낸|발송(?:해\s*드렸|했|됐|한|된))|(?:보내\s*드린|보내드린|보낸|발송한|발송된)\s*(?:문자|링크|안내|주소)/;
const probeIsWaitTurn = (t) => probeIsStallLine(t) || PROBE_WAIT_REQUEST_LINE.test(t);
function probeLiveRepeatBreak(prev, cur, participantHasSpoken, lastParticipantText) {
  if (!repeatBreakLib || !participantHasSpoken) return null;
  if (lastParticipantText !== undefined && repeatBreakLib.EXHAUSTED_DECLARATION?.test(lastParticipantText)) return { kind: "exhausted", text: repeatBreakLib.REPEAT_BREAK_EXHAUSTED_INSTRUCTION };
  if (!prev || !prev.trim()) return null;
  if (probeIsWaitTurn(prev) && probeIsWaitTurn(cur)) return { kind: "stall", text: PROBE_LIVE_STALL_TEXT };
  const kind = repeatBreakLib.decideRepeatBreak([prev, cur]);
  return kind ? { kind, text: repeatBreakLib.repeatBreakInstruction(kind) } : null;
}

const LIVE_OPENING_TRIGGER =
  "(전화가 방금 연결됐다. 지금 막 전화를 받은 상대에게 캐릭터로서 자연스럽게 첫 마디를 건네라. 다짜고짜 요구나 압박부터 하지 말고, 먼저 신분(사칭 기관·관계)과 전화를 건 이유를 1~2문장으로 밝히며 상황을 설명한 뒤에 이어가라.)";

// ── 참가자 응답기 ─────────────────────────────────────────────────────────────────────────────
// 판정표(위에서 첫 매치) — duration-probe.mjs RESPONDER와 같은 행 + 이미 보냈는데 또 요구받을 때의 행(사용자 신고 재현).
const PAID_LINE = "네, 보냈어요.";
const RESPONDER = [
  [/인증\s?번호|인증 코드|숫자 여섯|여섯 자리/, "382914요."],
  [/주민(등록)?\s?번호/, "육일공삼공이에 일 이 삼 사 오 육 칠이요."],
  [/카드\s?번호/, "1234 5678 9012 3456이요."],
  [/(유효\s?기간|뒷면|CVC|보안\s?코드)/i, "뒷면 번호는 382요."],
  [/비밀\s?번호/, "1234요."],
  [/생년월일|생일|몇 년생/, "61년 3월 2일이요."],
  [/성함|이름/, "김민수예요."],
  [/주소|사시는 곳|어디 사/, "대전에 살아요."],
  [/(코인|가상\s?자산|거래소)/, "네, 코인 사서 보냈어요."],
  [/(현금|인출|찾아\s?(오|두|놓|서))/, "네, 현금 찾아 놨어요."],
  // §115 — 대출 실행 유도(이체 행보다 먼저 — "대출 받아 그 돈도 옮기라"가 이체 행에 먹히지 않게).
  [/대출/, "네… 대출 받아 볼게요. 은행 가면 생활비라고 하면 되죠?"],
  [/(이체|송금|입금|보내\s?(주|셔|시|세|라|요)|넣어|옮기|옮겨|이관)/, PAID_LINE],
  [/(설치|앱|링크|눌러|접속)/, "네, 눌러서 설치했어요."],
  [/(얼마|잔액|자산|예금|금액)/, "한 삼천만 원 정도 있어요."],
  [/(은행|거래하시)/, "은행 하나 쓰고 있어요."],
  [/(혼자|숙소|모텔|방에)/, "네, 지금 혼자 있어요."],
  [/(자녀|아이|아드님|따님|아들|딸)/, "우리 애요? 무사한 거죠? 시키는 대로 할게요."],
];
const FILLER = ["네? 무슨 일이죠?", "어머, 그래요? 어떻게 해야 돼요?", "네, 알겠어요.", "네, 말씀하세요.", "그 다음엔 어떻게 해요?"];
const ALREADY_PAID = /((이체|송금|입금)\s?(해|하)|보내\s?(주|세|셔|라)|넣어\s?(주|요|라|세)|옮겨\s?(주|요|라|세))/;
const SUSPICIOUS_OPEN = [
  "잠깐만요, 어디시라고요? 소속이랑 성함 다시 말씀해 주세요.",
  "제 번호는 어떻게 아셨어요?",
  "진짜 맞아요? 제가 공식 번호로 다시 전화해서 확인해 볼게요.",
  "좀 이상한데요. 그쪽이 누군지 어떻게 믿어요?",
];
const REFUSE_LINES = [
  "그런 거 안 할래요.",
  "개인정보는 못 알려 드려요. 제가 직접 확인해 볼게요.",
  "보이스피싱 같은데요. 경찰에 물어볼게요.",
  "안 한다고요. 이제 끊을게요.",
  "싫어요. 안 해요.",
];

function makeResponder(persona) {
  let paid = false, lastReply = "";
  return function respond(lastScammerText, i) {
    if (i === 0) return "여보세요, 네 누구세요?";
    if (persona === "refuse") return i === 1 ? "네? 무슨 소리예요?" : REFUSE_LINES[(i - 2) % REFUSE_LINES.length];
    if (persona === "suspicious" && i <= SUSPICIOUS_OPEN.length) return SUSPICIOUS_OPEN[i - 1];
    const prefix = persona === "suspicious" ? "음… 알겠어요. " : "";
    // 1차 측정 교훈 — 보낸 뒤에는 "입금 확인됐다" 같은 확인 문장에도 걸려 재요구로 오판했다. 보낸 뒤에는 송금 **명령형**에만 반응한다.
    if (paid) {
      if (ALREADY_PAID.test(lastScammerText) && !/인증\s?번호|코인|대출|확인(되|됐|완료|했)|들어왔/.test(lastScammerText)) return "방금 보냈다니까요. 확인해 보세요.";
      if (/(이체|송금|입금|보내|넣어)/.test(lastScammerText)) return FILLER[i % FILLER.length];
    }
    for (const [re, reply] of RESPONDER) {
      if (re.test(lastScammerText)) {
        // 1차 측정 교훈 — "인증번호 확인되었습니다"에도 같은 번호를 다시 불렀다. 직전과 같은 값 답은 되풀이하지 않는다.
        if (prefix + reply === lastReply) break;
        if (reply === PAID_LINE || /보냈어요|찾아 놨어요/.test(reply)) paid = true;
        return (lastReply = prefix + reply);
      }
    }
    return (lastReply = FILLER[i % FILLER.length]);
  };
}
const MAX_USER_TURNS = { comply: 16, suspicious: 16, refuse: 9 };

// ── 키 · 공통 ─────────────────────────────────────────────────────────────────────────────────
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
const scrub = (s) => String(s ?? "").replace(/key=[^&\s]+/gi, "key=***");

function sessionSetup(scenarioId, level, tag, pinnedVariant) {
  const variantId = pinnedVariant ?? listFlowVariants(scenarioId, level)[0]?.variantId;
  const scenarioPrompt = resolveSessionScenarioPrompt(scenarioId, variantId);
  const { declared } = resolveDeclaredSms(scenarioId, variantId);
  const verifyEnabled = hasVerifyIntercept(scenarioId) && level === "advanced";
  const fictionalBankName = resolveFictionalBankName({ sessionId: `full-audit-${tag}-${scenarioId}-${level}` });
  const baseOpts = {
    difficultyLevel: level,
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
  return { variantId, scenarioPrompt, declared, verifyEnabled, fictionalBankName, baseOpts };
}

// ── voice(Live) ───────────────────────────────────────────────────────────────────────────────
async function runVoice(scenarioId, level, persona, tag, job = {}) {
  const t0 = Date.now();
  const now = () => Date.now() - t0;
  const { variantId, scenarioPrompt, declared, verifyEnabled, fictionalBankName, baseOpts } = sessionSetup(scenarioId, level, tag, job.variant);
  const endCallScope = { channel: "voice", relay: undefined, liveAvailable: liveTools.END_CALL_LIVE_AVAILABLE };
  const declaresEnd = declaresEndCall(scenarioId, "voice", undefined, endCallScope.liveAvailable);
  const systemPrompt = buildSystemPrompt(scenarioPrompt, {
    ...baseOpts,
    toolDrivenTiming: true,
    offerToolDeclared: declaresOfferVerificationDesk(scenarioId, level),
    hangupMode: declaresEnd ? "tool" : "none",
    liveSpeechStyle: true,
  });
  const tools = buildLiveToolDeclarations(scenarioId, level, variantId, endCallScope);
  const verifyItem = verifyEnabled ? findVerifyInterceptItem(scenarioId) : undefined;
  const ai = new GoogleGenAI({ apiKey: API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  const turns = [], events = [], delivered = [];
  let buf = "", scammerTurns = 0, userTurns = 0, closed = false, verifyPhase = "idle", announcedAtTurn = null, ended = null;
  let pendingConfirm = null, confirmInjected = false, wrapUpSent = false;
  let waiters = [];
  const notify = (ev) => { for (const w of [...waiters]) w(ev); };
  const session = await ai.live.connect({
    model: GEMINI_LIVE_MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: systemPrompt,
      speechConfig: { languageCode: "ko-KR", voiceConfig: { prebuiltVoiceConfig: { voiceName: pickGeminiVoiceName(scenarioId, `full-audit-${tag}`) } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW, prefixPaddingMs: 300, endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH, silenceDurationMs: 400 } },
      tools,
    },
    callbacks: {
      onmessage: (m) => {
        if (m.toolCall) {
          const calls = m.toolCall.functionCalls ?? [];
          events.push({ t: now(), ev: "toolCall", calls: calls.map((c) => ({ name: c.name, args: c.args })), scammerTurns, userTurns });
          void handleToolCalls(calls);
          return;
        }
        const sc = m.serverContent;
        if (!sc) return;
        if (sc.outputTranscription?.text) buf += sc.outputTranscription.text;
        if (sc.interrupted) { turns.push({ role: "scammer", kind: "interrupted", text: buf }); buf = ""; }
        if (sc.turnComplete) {
          scammerTurns += 1;
          turns.push({ role: "scammer", n: scammerTurns, text: buf });
          buf = "";
          notify({ type: "turnComplete" });
        }
      },
      onerror: (e) => events.push({ t: now(), ev: "error", msg: scrub(e?.message ?? e) }),
      onclose: (e) => { closed = true; events.push({ t: now(), ev: "close", code: e?.code, reason: scrub(e?.reason) }); notify({ type: "close" }); },
    },
  });
  function smsResponse(item) {
    const placed = verifyPhase === "placed";
    const r = buildInCallSmsResponse(item, { placed, fictionalBankName });
    const declaredItem = declared.find((d) => d.smsId === item.smsId);
    const c = buildConfirmResultField({ placed, scenarioId }, declaredItem);
    if (c.confirmResultInstruction && !confirmInjected) pendingConfirm = c.confirmResultInstruction;
    return { ...r, body: applyFictionalBank(item.body, fictionalBankName) };
  }
  async function handleToolCalls(calls) {
    const responses = calls.map((c) => {
      if (c.name === LIVE_TOOL_SEND_PREPARED_SMS) {
        const g = resolveSmsGate({ purpose: c.args?.purpose, declared, delivered, userTurns: userTurns + 1 });
        let status = g.status, guidance;
        if (g.status === "allowed") {
          const item = findInCallSmsItem(scenarioId, g.item.smsId);
          delivered.push({ smsId: item.smsId, userTurnsAtArrival: userTurns + 1, by: "model" });
          status = "delivered";
          const r = smsResponse(item);
          guidance = r.announceInstruction;
          events.push({ t: now(), ev: "sms", by: "model", smsId: item.smsId, body: r.body });
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
        // §115 — 앱 콜러블처럼 4행 입력을 서버 기록(도착 · 제출 흉내)으로 계산한다. 새 lib면 변형의 후속 단계 값(C-5)도 넣는다.
        let goalActionDone = false;
        const followUpUserTurns = goalActionLib?.goalFollowUpFor ? goalActionLib.goalFollowUpFor(scenarioId, variantId) : undefined;
        if (goalActionLib && verifyEnabled) {
          goalActionDone = goalActionLib.hasCompletedGoalAction({ delivered, mockScreens: [], declared, declaredKnown: Boolean(variantId), userTurns: userTurns + 1, followUpUserTurns });
        }
        const d = decideScammerHangup({
          goalActionDone,
          status: "active", channel: "voice", isMockTurn: false, verifyEnabled, transferPlaced: verifyPhase === "placed", transferReachable: true,
          userTurns: userTurns + 1, pendingInstruction: false, smsAwaitingUser: isSmsAwaitingUser(delivered, userTurns + 1),
          limitReached: false, alreadyAccepted: Boolean(ended), relay: undefined,
        });
        events.push({ t: now(), ev: "toolResult", name: c.name, status: d.status, row: d.row, kind: c.args?.kind, userTurns, goalActionDone });
        if (d.hangup && !ended) ended = { kind: c.args?.kind ?? "unspecified", userTurns, scammerTurns };
        // §115 — 앱 콜러블과 같이 후속 단계가 남아 막혔으면 되풀이 금지 문면(옛 lib는 두 번째 인자를 무시한다).
        const followUpPending = followUpUserTurns !== undefined && !goalActionDone;
        return { id: c.id, name: c.name, response: { status: d.status, guidance: scammerHangupGuidance(d.status, { followUpPending }) } };
      }
      return { id: c.id, name: c.name ?? "unknown", response: { status: "unsupported" } };
    });
    await sleep(300);
    try { session.sendToolResponse({ functionResponses: responses }); } catch (e) { events.push({ ev: "toolRespErr", msg: scrub(e) }); }
    // 앱 PR-A2 — 도구 응답 직후 확인 결과 조건형 1줄을 맥락 주입(세션당 1회).
    if (pendingConfirm && !confirmInjected) { confirmInjected = true; sendText(pendingConfirm, false, "confirm_ctx"); pendingConfirm = null; }
  }
  const waitTurn = (ms) => new Promise((resolve) => {
    const timer = setTimeout(() => { waiters = waiters.filter((w) => w !== fn); resolve("timeout"); }, ms);
    const fn = (ev) => { clearTimeout(timer); waiters = waiters.filter((w) => w !== fn); resolve(ev.type); };
    waiters.push(fn);
  });
  function sendText(text, turnComplete, kind) {
    turns.push({ role: kind === "user" ? "user" : "system", kind, n: kind === "user" ? userTurns : undefined, text });
    session.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete });
  }
  const respond = makeResponder(persona);
  sendText(LIVE_OPENING_TRIGGER, true, "opening");
  await waitTurn(45000);
  for (let i = 0; i < (job.maxTurns ?? MAX_USER_TURNS[persona]); i += 1) {
    if (closed) break;
    // §115 — 순응 참가자는 링크 이체 화면을 연 문자가 도착한 다음 발화에서 제출한다(앱의 landingSubmittedAt 흉내 · C-1 입력).
    if (persona === "comply") {
      for (const d of delivered) {
        if (!d.landingSubmitted && d.userTurnsAtArrival < userTurns && findInCallSmsItem(scenarioId, d.smsId)?.fakeLandingId) {
          d.landingSubmitted = true;
          events.push({ t: now(), ev: "landingSubmitted", smsId: d.smsId, userTurns });
        }
      }
    }
    if (ended) { events.push({ t: now(), ev: "ended_by_end_call", ...ended }); await waitTurn(8000); break; }
    if (verifyPhase === "announced" && scammerTurns > announcedAtTurn) {
      verifyPhase = "placed";
      sendText(verifyItem.reconnectInstruction, true, "verify_reconnect");
      events.push({ t: now(), ev: "verifyPlaced", scammerTurns });
      await waitTurn(45000);
    }
    await sleep(700);
    const lastScammer = [...turns].reverse().find((t) => t.role === "scammer")?.text ?? "";
    // §104 — 앱 클라처럼 직전 두 사기범 턴으로 반복 · 대기 정체를 판정해 맥락 주입(다음 응답에 실린다).
    const scammerTexts = turns.filter((t) => t.role === "scammer" && t.kind !== "interrupted").map((t) => t.text);
    const lastUserText = [...turns].reverse().find((t) => t.role === "user")?.text;
    const rb = probeLiveRepeatBreak(scammerTexts[scammerTexts.length - 2], scammerTexts[scammerTexts.length - 1] ?? "", userTurns > 0, lastUserText);
    if (rb) { sendText(rb.text, false, "repeat_ctx"); events.push({ t: now(), ev: "repeatBreak", kind: rb.kind, scammerTurns, userTurns }); }
    const u = respond(lastScammer, i);
    userTurns += 1;
    sendText(u, true, "user");
    await waitTurn(45000);
    if (declared.length > 0 && !closed) {
      // §104 — 앱 화면처럼 마지막 문자 도착 뒤 사기범이 "문자 보냈다"고 말했으면 백스톱에 주장을 싣는다(새 lib에서만 효과 — 옛 lib는 인자를 무시).
      const lastSmsIdx = turns.map((t) => t.kind).lastIndexOf("sms_ctx");
      const claimed = turns.slice(lastSmsIdx + 1).some((t) => t.role === "scammer" && PROBE_SMS_SENT_CLAIM.test(t.text ?? ""));
      const p = planSmsBackstop({ declared, delivered, userTurns, claimed });
      if (claimed) events.push({ t: now(), ev: "smsClaim", userTurns, action: p.action });
      if (p.action === "deliver") {
        const g = resolveSmsGate({ purpose: p.item.purpose, declared, delivered, userTurns });
        if (g.status === "allowed") {
          const item = findInCallSmsItem(scenarioId, g.item.smsId);
          delivered.push({ smsId: item.smsId, userTurnsAtArrival: userTurns, by: "backstop" });
          const r = smsResponse(item);
          events.push({ t: now(), ev: "sms", by: "backstop", smsId: item.smsId, body: r.body });
          sendText(r.announceInstruction ?? item.announceInstruction, false, "sms_ctx");
          if (pendingConfirm && !confirmInjected) { confirmInjected = true; sendText(pendingConfirm, false, "confirm_ctx"); pendingConfirm = null; }
        }
      } else if (p.action === "nudge") {
        sendText(buildSmsNudgeInstruction(p.item.purpose), false, "sms_nudge_ctx");
      } else if (p.action === "none_pending" && !wrapUpSent && goalActionLib?.planGoalWrapUp && guidanceLib?.GOAL_WRAP_UP_INSTRUCTION) {
        // §115 — 앱 백스톱 질의와 같은 판정(`planGoalWrapUp`)으로 할 일 완료 시 마무리 지시 1회 맥락 주입.
        const wrap = goalActionLib.planGoalWrapUp({
          delivered, declared, declaredKnown: Boolean(variantId), userTurns,
          followUpUserTurns: goalActionLib.goalFollowUpFor(scenarioId, variantId), placed: verifyPhase === "placed",
        });
        if (wrap === "wrap_up") {
          wrapUpSent = true;
          sendText(guidanceLib.GOAL_WRAP_UP_INSTRUCTION, false, "wrap_up_ctx");
          events.push({ t: now(), ev: "wrapUp", userTurns });
        }
      }
    }
  }
  await sleep(800);
  try { session.close(); } catch {}
  await sleep(400);
  return { model: GEMINI_LIVE_MODEL, variantId, fictionalBankName, tools: tools.flatMap((t) => (t.functionDeclarations ?? []).map((d) => d.name)), declaredSms: declared.map((d) => d.smsId), delivered, verifyPhase, ended, turns, events, wallMs: now() };
}

// ── messenger(텍스트 · sendMessage 재현) ─────────────────────────────────────────────────────────
async function runMessenger(scenarioId, level, persona, tag) {
  const t0 = Date.now();
  const now = () => Date.now() - t0;
  const { variantId, scenarioPrompt, declared, verifyEnabled, fictionalBankName, baseOpts } = sessionSetup(scenarioId, level, tag);
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const stored = [], turns = [], events = [], delivered = [];
  let lastCallAt = 0, ended = null, escalated = null;
  async function complete(systemPrompt, messages) {
    const contents = messages.length > 0
      ? messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
      : [{ role: "user", parts: [{ text: TEXT_OPENING_TRIGGER }] }];
    const wait = 6500 - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    // 503(일시 과부하)만 다르게 다룬다 — 앱(`llm/index.ts:180`)처럼 대체 모델(GEMINI_FALLBACK_TEXT_MODEL)에 1회 묻고, 그것도 503이면
    // 쉬었다가 처음부터 다시(최대 3바퀴). 429는 재시도 없이 그대로 던져 전체 정지(STOP-429)로 간다.
    const is503 = (e) => /"code":\s?503|UNAVAILABLE|high demand/.test(String(e?.message ?? e));
    for (let round = 1; ; round += 1) {
      for (const model of [GEMINI_TEXT_MODEL, GEMINI_FALLBACK_TEXT_MODEL]) {
        lastCallAt = Date.now();
        try {
          const res = await ai.models.generateContent({ model, contents, config: { systemInstruction: systemPrompt } });
          events.push({ t: now(), ev: "llmCall", status: 200, model, round });
          return res.text ?? "";
        } catch (e) {
          if (!is503(e)) throw e;
          events.push({ t: now(), ev: "llm503", model, round });
        }
      }
      if (round >= 3) throw new Error("503 지속(주 모델 · 대체 모델 3바퀴)");
      await sleep(20000 * round);
    }
  }
  const channel = escalated ? "voice" : "messenger";
  const opening = await complete(buildSystemPrompt(scenarioPrompt, { ...baseOpts, turnInstruction: OPENING_TURN_INSTRUCTION }), []);
  const op = cleanMessengerOutput(opening, scenarioId, variantId, level);
  stored.push({ role: "scammer", textMasked: op.text });
  turns.push({ role: "scammer", n: 1, raw: opening, text: op.text, attachments: op.attachments });
  const respond = makeResponder(persona);
  for (let i = 1; i < MAX_USER_TURNS[persona] + 1; i += 1) {
    if (ended) break;
    const lastScammer = stored.at(-1)?.textMasked ?? "";
    const u = respond(lastScammer, i);
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
          events.push({ ev: "sms", by: "backstop", smsId: deliveredSmsId, userTurns: userTurnsNow });
        }
      } else if (plan.action === "nudge") nudge = buildSmsNudgeInstruction(plan.item.purpose);
    }
    const hangupFacts = {
      status: "active", channel: escalated ? "voice" : "messenger", verifyEnabled, transferPlaced: false, transferReachable: true, userTurns: userTurnsNow,
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
    // §104 — 앱 `sendMessage`처럼 앱 진행 지시가 없는 턴에만 반복 차단 1줄(새 lib에만 있음).
    const rbKind = repeatBreakLib && choice === "none" && !confirmPlan?.instruction
      ? repeatBreakLib.decideRepeatBreak(stored.filter((m) => m.role === "scammer").map((m) => m.textMasked), u)
      : null;
    if (rbKind) events.push({ ev: "repeatBreak", kind: rbKind, userTurns: userTurnsNow });
    const rbLine = rbKind ? repeatBreakLib.repeatBreakInstruction(rbKind) : undefined;
    const tiAll = [ti, confirmPlan?.instruction, rbLine, nudge, offer].filter(Boolean).join("\n") || undefined;
    const raw = await complete(buildSystemPrompt(scenarioPrompt, { ...baseOpts, ...(tiAll ? { turnInstruction: tiAll } : {}), hangupMode }), history);
    const mk = extractSmsMarker(raw);
    if (mk.markerCount > 0) {
      const g = resolveSmsGate({ purpose: mk.purpose, declared, delivered, userTurns: userTurnsNow });
      events.push({ ev: "smsMarker", purpose: mk.purpose, status: g.status, userTurns: userTurnsNow });
      if (g.status === "allowed") delivered.push({ smsId: g.item.smsId, userTurnsAtArrival: userTurnsNow });
    }
    const sigRaw = extractEscalationSignal(mk.text);
    // §104 — 앱처럼 신호를 같은 응답의 대사와 대조한다(새 lib에만 있음).
    let sig = sigRaw;
    if (signalConsistencyLib) {
      const esc = sigRaw.escalate ? signalConsistencyLib.judgeEscalationSignal(sigRaw.text) : { accept: true };
      const endc = signalConsistencyLib.judgeEndCallSignal(sigRaw.endCall, sigRaw.text);
      if (!esc.accept || endc.dropped) events.push({ ev: "signalDropped", escalate: esc.accept ? undefined : esc.reason, endCall: endc.dropped, userTurns: userTurnsNow });
      sig = { ...sigRaw, escalate: sigRaw.escalate && esc.accept, endCall: endc.endCall };
    }
    if (sig.escalate && !escalated) { escalated = { userTurns: userTurnsNow }; events.push({ ev: "escalate", userTurns: userTurnsNow, signal: sig.escalate }); }
    const cleaned = cleanMessengerOutput(sig.text, scenarioId, variantId, level);
    const post = decideFallbackHangup(hangupFacts, delivered, false);
    const effect = resolveFallbackHangupEffect({ endCall: sig.endCall, hangupMode, pre, post });
    events.push({ ev: "hangup", mode: hangupMode, preRow: pre.row, endCall: sig.endCall ?? null, end: effect.end, userTurns: userTurnsNow });
    if (effect.end) ended = { kind: effect.kind, userTurns: userTurnsNow };
    stored.push({ role: "scammer", textMasked: cleaned.text });
    turns.push({ role: "scammer", n: scammerTurnNumber, cause: [ti && "sms_announce", confirmPlan?.instruction && "confirm_result", nudge && "nudge", effect.end && `ENDED:${effect.kind}`].filter(Boolean).join("+") || "user", raw, text: cleaned.text, attachments: cleaned.attachments });
  }
  void channel;
  return { model: GEMINI_TEXT_MODEL, variantId, fictionalBankName, declaredSms: declared.map((d) => d.smsId), delivered, ended, escalated, turns, events, wallMs: now() };
}
function cleanMessengerOutput(text, scenarioId, variantId, level) {
  try {
    const r = extractLinkMarker(text, scenarioId, { scenarioId, difficultyLevel: level, ...(variantId ? { flowVariantId: variantId } : {}) });
    return { text: r.text, attachments: r.attachments };
  } catch { return { text }; }
}

// ── 실행 ───────────────────────────────────────────────────────────────────────────────────────
const plan = JSON.parse(readFileSync(argVal("--plan", ""), "utf8"));
const outDir = path.resolve(argVal("--out", path.join(repoRoot, "full-audit-out")));
const tag = argVal("--tag", "s");
mkdirSync(outDir, { recursive: true });
const stopFile = path.join(outDir, "STOP-429");
for (const job of plan) {
  if (existsSync(stopFile)) { console.log("정지 파일 감지 — 중단"); break; }
  const startedIso = new Date().toISOString();
  let result, error = null;
  try {
    result = job.ch === "voice" ? await runVoice(job.id, job.level, job.persona, tag, job) : await runMessenger(job.id, job.level, job.persona, tag);
  } catch (e) { error = scrub(e?.stack ?? e); result = { turns: [], events: [] }; }
  const errText = [error ?? "", ...(result.events ?? []).filter((e) => e.ev === "error" || e.ev === "close").map((e) => `${e.code ?? ""} ${e.msg ?? ""} ${e.reason ?? ""}`)].join(" ");
  const is429 = /(^|\D)429(\D|$)|RESOURCE_EXHAUSTED|quota/i.test(errText);
  const file = `${job.ch}-${job.id}-${job.level}-${job.persona}-${startedIso.replace(/[:.]/g, "-")}.json`;
  writeFileSync(path.join(outDir, file), JSON.stringify({ ...job, startedIso, error, is429, ...result }, null, 2), "utf8");
  console.log(JSON.stringify({ ...job, file, error: error ? error.slice(0, 160) : null, is429, turns: result.turns?.length ?? 0, ended: result.ended ?? null }));
  if (is429) { writeFileSync(stopFile, `${job.id}:${job.level}:${job.persona}`); console.log("429 감지 — 중단"); break; }
  await sleep(4000);
}
