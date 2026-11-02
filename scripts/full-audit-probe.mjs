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
// 참가자 유형: comply(순순히 따름 · 가짜 값 · 링크 이체 화면을 제출한다) · suspicious(정체를 캐묻다가 머뭇거리며 따름) · refuse(처음부터 거절)
//   · verbal(P2 실측 2026-11-01 — comply와 같되 이체 요구에 "링크는 안 눌렀고 제 은행 앱으로 따로 보냈어요"라고 말하고 화면을 제출하지 않는다)
//   · verbalInstall(U2 실측 2026-11-01 — comply와 같되 통화 중 문자 설치 화면의 권한 허용을 누르지 않고 "설치했어요"라고 말로만 답한다 · 이체 화면은 comply처럼 제출)
//   · verbalTransfer(#463 확인 실측 2026-11-01 — comply와 같되 설치 화면은 허용하고, 이체 화면은 제출하지 않은 채 "네, 보냈어요"라고 말로만 답한다)
//
// node scripts/full-audit-probe.mjs --secret <path> --plan <json> --out <dir> [--key-var GEMINI_API_KEY2] [--tag s1]
//   plan json = [{ "ch": "voice"|"messenger", "id": "...", "level": "beginner|intermediate|advanced", "persona": "comply|suspicious|refuse" }, ...]
//   #476(2026-11-01) — 메신저 항목에 "voiceSelectionSource": "recorded"|"reused"|"fallback_male"|"fallback_female"(세션 목소리 결정 미러 · 부재 = 선택 없음)
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
const flowVariantsLib = L("scenarios/flowVariants.js");
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
// U3(#460) — 앱처럼 예금주가 보이는 계좌는 그 묶음의 고정 은행(`pickSessionBankName`과 같은 판정 · 옛 lib = 종전 해시).
const fixedRouteBank = (scenarioId, variantId) =>
  L("shared/fictionalBank.js").fixedBankForHolder?.(L("inCallSms/smsGate.js").resolveRouteAccountHolder?.(scenarioId, variantId));
// U2(#460) — 통화 중 설치 화면의 권한 허용(앱 `recordMockScreenEvent` 첫 응낙 → `installConsented` 맥락 주입)의 미러.
const mockScreensLib = (() => { try { return L("scenarios/mockScreens.js"); } catch { return null; } })();
const isInCallInstallLanding = (scenarioId, landingId) => {
  const item = mockScreensLib?.findMockScreenItem?.(scenarioId, landingId);
  return item?.entrySurface === "in-call-sms" && item?.kind === "app-install";
};
// §132.5 — 앱과 같이 루트가 선언한 문자로 계좌번호를 정한다(옛 lib = 시나리오 단위).
const routeAccountNumber = (scenarioId, variantId) =>
  L("inCallSms/smsGate.js").resolveRouteAccountNumber?.(scenarioId, variantId) ?? resolveSessionAccountNumber(scenarioId);
const { decideFallbackHangup, fallbackHangupMode, resolveFallbackHangupEffect } = L("scammerHangup/fallback.js");
const { decideScammerHangup } = L("scammerHangup/decide.js");
const { scammerHangupGuidance } = L("scammerHangup/guidance.js");
const { isSmsAwaitingUser } = L("scammerHangup/smsWait.js");
// §104(2026-10-22) — 새 서버 판정(반복 차단 · 신호↔대사). 옛 lib(수정 전 기준 측정)에는 없으므로 없으면 종전 동작(null).
const optionalLib = (p) => { try { return L(p); } catch { return null; } };
// 화면 행동만 인정 — 공통 규칙 술어(옛 lib에는 없다 = 종전 조립).
const screenActionLib = optionalLib("roleplay/screenAction.js");
const repeatBreakLib = optionalLib("roleplay/repeatBreak.js");
const signalConsistencyLib = optionalLib("roleplay/signalConsistency.js");
// §108 · §115 — 끊기 4행 입력(할 일 완료). 옛 lib에는 없을 수 있다(없으면 false — 종전 프로브 동작).
const goalActionLib = optionalLib("scammerHangup/goalAction.js");
const guidanceLib = optionalLib("scammerHangup/guidance.js");
// §117 — 모델 도구 응답 되풀이 금지 꼬리(앱 `deliverInCallSms`의 model_tool 경로와 같은 함수). 옛 lib에는 없다(없으면 종전 문면).
const toolGuidanceLib = optionalLib("inCallSms/toolGuidance.js");
// 2026-10-24 회귀 프로브 — 루트 · 세션 인증번호 · 리포트 판정 · 메신저 앱 체인(Claude Haiku → Gemini 2차) · 앱 후처리 · 통화 전환 leg.
const { findFlowVariant } = L("scenarios/flowVariants.js");
const { listOtpItems } = L("scenarios/inCallSms.js");
const sessionOtpLib = optionalLib("scenarios/sessionOtp.js");
const { analyzeConversation } = L("report/analyzeConversation.js");
const priorChatLib = optionalLib("realtime/priorChatContext.js");
// #476 미러(2026-11-01) — 실제 전환 판정(`resolveTransitionNow` — 목소리 복제 · 1회) · 서버 자동 전환(max-turn) · 메타(옛 lib = 종전 — 신호 전환만).
const escalationLib = optionalLib("scenarios/escalation.js");
const publicMetaLib = optionalLib("scenarios/publicMeta.js");
const constantsLib = optionalLib("shared/constants.js");
const escalatedCallLib = optionalLib("roleplay/escalatedCall.js");
const replyMarkupLib = optionalLib("roleplay/replyMarkup.js");
// R13 미러(2026-11-01) — 앱 판정표 W(메신저 단계 통화 말 · "이만 끊을게" 교정). 옛 lib = 종전(미적용).
const personaGuardLib = optionalLib("roleplay/personaGuard.js");
const replyLengthLib = optionalLib("roleplay/replyLength.js");
const realNamesLib = optionalLib("guardrails/realFinancialNames.js");
const otpCheckLib = optionalLib("roleplay/otpCheck.js");
const messengerReentryLib = optionalLib("roleplay/messengerReentry.js");
// 클라 `src/lib/realtime/escalatedOpening.ts` ESCALATED_CALL_OPENING_TURN의 미러(TS라 못 불러 문면을 옮겼다 — 사기범이 건 통화).
const ESCALATED_CALL_OPENING_TURN =
  "(방금 네가 건 전화가 연결됐다. 이 통화는 시스템 지시에 적힌 메시지 대화에 이어서 거는 전화다. 처음부터 다시 소개하거나 같은 사정을 다시 설명하지 말고, 메시지로 하던 이야기 때문에 전화했다는 짧은 첫 마디(5초 안팎)로 시작한 뒤 멈춰서 상대의 대답을 기다려라.)";
const withOtp = (item, sid) => (sessionOtpLib && item ? sessionOtpLib.withSessionOtp(item, sid) : item);
const sessionIdFor = (tag, scenarioId, level, persona) => `full-audit-${tag}-${scenarioId}-${level}-${persona}`;

// §104 — Live 클라 반복 · 대기 정체 주입(`src/lib/realtime/stallRecovery.ts` §4)의 미러. 클라 모듈은 TS라 여기서 못 불러 판정표를 옮겼다 —
// 5 · 6행(인적사항 · 유사도)은 서버 lib `decideRepeatBreak`(클라와 같은 정규식 — 루트 `[§104 짝]` 테스트)를 쓰고, 4행(대기 말)만 옮긴다.
// ⚠️ 문면 · 정규식이 클라와 다르면 루트 테스트 `[§104 프로브 미러]`가 실패한다. 서버 lib에 `repeatBreak`가 없으면(수정 전 lib) 주입 0.
const PROBE_STALL_VOCABULARY =
  /확인\s*(?:하는\s*)?중|확인하고\s*있|확인\s*절차|처리\s*(?:하는\s*)?중|처리하고\s*있|조회\s*중|확인되는\s*대로|처리되는\s*대로|확인되면|기다려|기다리|대기\s*중|지연|잠시만/;
const PROBE_WAIT_REQUEST_LINE = /대기(?:해|하여|하고)\s*(?:주|계|있어|있으)|대기\s*부탁/;
const PROBE_LIVE_STALL_TEXT =
  "(너는 직전 대답과 그 앞 대답에서 대기하라거나 확인 중이라는 말을 했다. 이번 대답에서는 대기하라거나 확인 중이라는 말을 하지 말고, 지금까지 받은 것을 근거로 새 요구를 꺼내라 — 흐름에 남은 다음 요구, 추가 정보, 주변 사람이나 은행에 알리지 말라는 다짐 중 하나로 상황을 앞으로 움직여라. 더 요구할 것이 정말 남지 않았으면 [진행 강제]의 통화 끝내기 항목이 정한 대로 하라.)";
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
  /문자(?:로)?\s*(?:를\s*)?(?:보내\s*드렸|보내드렸|보냈|보내\s*드린|보내드린|보낸|발송(?:해\s*드렸|해\s*드린|했|됐|한|된))|(?:보내\s*드린|보내드린|보낸|발송한|발송된|발송해\s*드린)\s*(?:문자|링크|안내|주소|인증\s*번호)/;
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
// P2 실측 — verbal 참가자의 송금 답(서비스 밖 뱅킹 앱으로 보냈다고 말함 · 화면 제출 0). 사기범이 링크 화면으로 되돌리는지 · 4-c가 끊기를 막는지를 본다.
const VERBAL_PAID_LINE = "링크는 안 눌렀고, 제 은행 앱으로 따로 보냈어요.";
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

// getOtp — 도착한 문자 속 인증번호(있으면 순응 참가자는 그 번호를 부른다 · 2026-10-24). 없으면 종전 고정값.
function makeResponder(persona, getOtp = () => undefined) {
  let paid = false, lastReply = "";
  return function respond(lastScammerText, i) {
    if (i === 0) return "여보세요, 네 누구세요?";
    if (persona !== "refuse" && /인증\s?번호|인증 코드|숫자 여섯|여섯 자리/.test(lastScammerText) && getOtp()) {
      const r = `${persona === "suspicious" ? "음… 알겠어요. " : ""}${getOtp()}요.`;
      if (r !== lastReply) return (lastReply = r);
    }
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
        return (lastReply = prefix + (persona === "verbal" && reply === PAID_LINE ? VERBAL_PAID_LINE : reply));
      }
    }
    return (lastReply = FILLER[i % FILLER.length]);
  };
}
const MAX_USER_TURNS = { comply: 16, suspicious: 16, refuse: 9, verbal: 16, verbalInstall: 16, verbalTransfer: 16 };

// ── 키 · 공통 ─────────────────────────────────────────────────────────────────────────────────
function readApiKey(keyVar = argVal("--key-var", "GEMINI_API_KEY2")) {
  const secret = argVal("--secret", "");
  if (!secret) throw new Error("--secret <파일> 필요");
  const line = readFileSync(secret, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${keyVar}=`));
  if (!line) throw new Error(`${keyVar} 줄 없음 — 다른 키로 대체하지 않고 멈춘다`);
  let v = line.slice(keyVar.length + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v.split(",")[0].trim();
}
const API_KEY = readApiKey();
// 2026-10-24 — `--claude-key-var CLAUDE_API_KEY`가 있으면 메신저 대사를 앱과 같은 체인(`getLlmClient` → Claude Haiku 1차 · Gemini 2차)으로
// 만든다. 키는 이 프로세스의 환경변수로만 넘긴다(앱 `readSecret`이 읽는 자리 — 출력 · 파일 기록 0). Groq 3차는 넣지 않는다(키 미설정).
const CLAUDE_KEY_VAR = argVal("--claude-key-var", "");
let appLlm = null;
if (CLAUDE_KEY_VAR) {
  process.env.CLAUDE_API_KEY = readApiKey(CLAUDE_KEY_VAR);
  process.env[argVal("--key-var", "GEMINI_API_KEY2")] = API_KEY;
  appLlm = L("llm/index.js");
  if (!appLlm.getClaudeApiKey()) throw new Error("앱 체인이 Claude 키를 읽지 못함 — 멈춘다");
  // 2026-11-01(#482 확인) — `--force-scammer-fallback`: 1차 Claude 호출이 일부러 틀린 키로 실패하게 해 앱 2차(gemini-fallback)가 매 턴 답하게 한다.
  // 체인 · 후처리는 앱 그대로(`withGeminiAfterClaude`는 어떤 실패든 2차로 넘긴다) · 진짜 키는 이 분기에서 쓰지 않는다 · 과금 0(인증 실패).
  if (process.argv.includes("--force-scammer-fallback")) process.env.CLAUDE_API_KEY = "forced-fallback-invalid-key";
}
// 메신저 → 통화 전환 뒤 Live leg 수 상한(실 키 세션 예산에 포함). 0이면 전환 뒤에도 텍스트 폴백으로 잇는다.
let liveLegBudget = Number(argVal("--live-leg-budget", "0"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scrub = (s) => String(s ?? "").replace(/key=[^&\s]+/gi, "key=***");

function sessionSetup(scenarioId, level, tag, pinnedVariant) {
  const variantId = pinnedVariant ?? listFlowVariants(scenarioId, level)[0]?.variantId;
  const scenarioPrompt = resolveSessionScenarioPrompt(scenarioId, variantId);
  const { declared } = resolveDeclaredSms(scenarioId, variantId);
  const verifyEnabled = hasVerifyIntercept(scenarioId) && level === "advanced";
  const fictionalBankName = fixedRouteBank(scenarioId, variantId) ?? resolveFictionalBankName({ sessionId: `full-audit-${tag}-${scenarioId}-${level}` });
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
    sessionAccountNumber: routeAccountNumber(scenarioId, variantId),
    // 화면 행동만 인정 — 앱 호출부 6곳과 같은 술어(옛 lib = 키 없음 · 종전 조립).
    ...(screenActionLib?.sessionScreenActionOnly ? { screenActionOnly: screenActionLib.sessionScreenActionOnly(scenarioId, variantId) } : {}),
  };
  return { variantId, scenarioPrompt, declared, verifyEnabled, fictionalBankName, baseOpts };
}

// ── voice(Live) ───────────────────────────────────────────────────────────────────────────────
async function runVoice(scenarioId, level, persona, tag, job = {}) {
  const t0 = Date.now();
  const now = () => Date.now() - t0;
  let { variantId, scenarioPrompt, declared, verifyEnabled, fictionalBankName, baseOpts } = sessionSetup(scenarioId, level, tag, job.variant);
  // §142 확인 실측(2026-11-02) — 다통화 레그(`runMultiCall`이 넘긴다): 앱 토큰(`geminiProvider.ts`)처럼 현재 레그 프롬프트 · 레그 문자 선언 ·
  // 레그 화자 성별 · 창구 오퍼 없음(R7). 부재 = 종전 동작 그대로.
  const leg = job.leg;
  if (leg) {
    scenarioPrompt = resolveSessionScenarioPrompt(scenarioId, variantId, leg.legIndex);
    declared = resolveDeclaredSms(scenarioId, variantId, { relay: leg.relay }).declared;
    verifyEnabled = flowVariantsLib.sessionUsesVerifyIntercept(scenarioId, level === "advanced", variantId);
    baseOpts = { ...baseOpts, speakerGender: leg.gender, verifyInterceptEnabled: verifyEnabled };
  }
  const endCallScope = { channel: "voice", relay: undefined, liveAvailable: liveTools.END_CALL_LIVE_AVAILABLE };
  const declaresEnd = declaresEndCall(scenarioId, "voice", undefined, endCallScope.liveAvailable);
  const systemPrompt = buildSystemPrompt(scenarioPrompt, {
    ...baseOpts,
    toolDrivenTiming: true,
    offerToolDeclared: leg ? declaresOfferVerificationDesk(scenarioId, level, variantId) : declaresOfferVerificationDesk(scenarioId, level),
    hangupMode: declaresEnd ? "tool" : "none",
    liveSpeechStyle: true,
    // 2026-10-24 — 메신저에서 넘어온 통화 leg면 앱(`geminiProvider.ts` §110.3)처럼 앞선 대화 블록을 턴 지시 자리에.
    ...(job.priorChatContext ? { turnInstruction: job.priorChatContext } : {}),
  });
  const sid = job.sessionId ?? sessionIdFor(tag, scenarioId, level, persona);
  const otpOf = () => { for (const e of [...events].reverse()) { const m = e.ev === "sms" && /(?<!\d)(\d{6})(?!\d)/.exec(e.body ?? ""); if (m) return m[1]; } return undefined; };
  const tools = buildLiveToolDeclarations(scenarioId, level, variantId, endCallScope);
  const verifyItem = verifyEnabled ? findVerifyInterceptItem(scenarioId) : undefined;
  const ai = new GoogleGenAI({ apiKey: API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  const turns = [], events = [], delivered = job.delivered ?? [];
  let buf = "", scammerTurns = 0, userTurns = job.userTurnsBase ?? 0, closed = false, verifyPhase = "idle", announcedAtTurn = null, ended = null;
  let pendingConfirm = null, confirmInjected = false, wrapUpSent = false;
  let waiters = [];
  const notify = (ev) => { for (const w of [...waiters]) w(ev); };
  const session = await ai.live.connect({
    model: GEMINI_LIVE_MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: systemPrompt,
      speechConfig: { languageCode: "ko-KR", voiceConfig: { prebuiltVoiceConfig: { voiceName: leg?.voiceName ?? pickGeminiVoiceName(scenarioId, `full-audit-${tag}`) } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW, prefixPaddingMs: 300, endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH, silenceDurationMs: 400 } },
      tools,
    },
    callbacks: {
      onmessage: (m) => {
        if (m.toolCall) {
          const calls = m.toolCall.functionCalls ?? [];
          events.push({ t: now(), ev: "toolCall", calls: calls.map((c) => ({ name: c.name, args: c.args })), scammerTurns, userTurns, preToolText: buf });
          // §117 — 같은 턴 안 도구 앞 발화가 있으면 전사에 경계 표시(앱은 줄바꿈 — 분석용으로 눈에 띄는 표식).
          if (buf.trim()) buf = `${buf.trimEnd()} ⟂ `;
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
    // 앱 `smsDelivery.ts`처럼 세션 번호로 바꾼 항목으로 응답(대조 1줄 · 본문)을 만든다 — 1차 실행은 본문만 세션 번호여서 Live가 맞는 번호를 "다르다"고 했다(프로브 결함).
    const r = buildInCallSmsResponse(withOtp(item, sid), { placed, fictionalBankName });
    const declaredItem = declared.find((d) => d.smsId === item.smsId);
    const c = buildConfirmResultField({ placed, scenarioId }, declaredItem);
    if (c.confirmResultInstruction && !confirmInjected) pendingConfirm = c.confirmResultInstruction;
    return { ...r, body: applyFictionalBank(withOtp(item, sid).body, fictionalBankName) };
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
          events.push({ t: now(), ev: "sms", by: "model", smsId: item.smsId, body: r.body, scammerTurns, userTurns }); // U2 채점 — 도착 시점 계수
        } else if (leg && g.status === "not_allowed") {
          // §142 D1 미러 — 앱 `inCallSms/index.ts`처럼 뒤 레그 문자면 넘김 거절 문면 · 그 밖 not_allowed는 앱 문면.
          guidance = legHandoffLib?.isLaterLegSmsPurpose(findFlowVariant(variantId), leg.relay, c.args?.purpose)
            ? legHandoffLib.LEG_LATER_SMS_DECLINE
            : L("inCallSms/smsGate.js").SMS_DECLINE_NOT_ALLOWED;
        } else guidance = g.status === "already_delivered" ? SMS_DECLINE_ALREADY : SMS_DECLINE_TOO_EARLY;
        if (toolGuidanceLib) guidance = toolGuidanceLib.withModelToolNoRepeat(guidance, "model_tool");
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
        // P2 실측(2026-11-01) — P1 M1 이후 앱 콜러블은 선언을 해석할 수 있는 **모든** 세션에서 4행 입력을 계산하고, 4-c행 입력(결정 화면 대기)과
        // 모델 끊기 사유를 함께 넘긴다(`scammerHangup/index.ts` · `commit.ts`). 새 lib에 그 함수가 있으면 같은 식으로 흉내 낸다(옛 lib = 종전).
        const p1Lib = goalActionLib?.isDecisionScreenPending ? goalActionLib : null;
        if (goalActionLib && (verifyEnabled || p1Lib)) {
          goalActionDone = goalActionLib.hasCompletedGoalAction({ delivered, mockScreens: [], declared, declaredKnown: Boolean(variantId), userTurns: userTurns + 1, followUpUserTurns });
        }
        const decisionScreenPending = p1Lib
          ? p1Lib.isDecisionScreenPending({ scenarioId, flowVariantId: variantId, delivered, mockScreens: [], declared, declaredKnown: Boolean(variantId), verifyEnabled, followUpUserTurns })
          : false;
        // §142 — 마지막이 아닌 레그는 앱 `commit.ts`처럼 4-b · 4-c 입력 거짓 · 하한 = 레그 시작 뒤 발화 수.
        const legScope = leg?.nonLast ? { turnsSinceCallEntry: userTurns + 1 - leg.legStart } : null;
        const d = decideScammerHangup({
          goalActionDone,
          followUpPending: legScope ? false : followUpUserTurns !== undefined && !goalActionDone,
          decisionScreenPending: legScope ? false : decisionScreenPending,
          ...(legScope ?? {}),
          hangupKind: c.args?.reason ?? c.args?.kind,
          status: "active", channel: "voice", isMockTurn: false, verifyEnabled, transferPlaced: verifyPhase === "placed", transferReachable: true,
          userTurns: userTurns + 1, pendingInstruction: false, smsAwaitingUser: isSmsAwaitingUser(delivered, userTurns + 1),
          limitReached: false, alreadyAccepted: Boolean(ended), relay: undefined,
          // #476 미러 — 목소리 복제 짧은 통화의 포기 끊기 5행 예외(앱 `commit.ts`).
          ...(job.shortCloneCall ? { shortCloneCall: true } : {}),
        });
        events.push({ t: now(), ev: "toolResult", name: c.name, status: d.status, row: d.row, kind: c.args?.reason ?? c.args?.kind, userTurns, goalActionDone, decisionScreenPending });
        if (d.hangup && !ended) ended = { kind: c.args?.reason ?? c.args?.kind ?? "unspecified", userTurns, scammerTurns, ...(leg?.nonLast ? { legEnd: leg.exit } : {}) };
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
  const respond = job.respond ?? makeResponder(persona, otpOf);
  if (job.setOtpSource) job.setOtpSource(otpOf);
  sendText(job.openingTrigger ?? LIVE_OPENING_TRIGGER, true, "opening");
  await waitTurn(45000);
  for (let i = job.startIndex ?? 0; i < (job.startIndex ?? 0) + (job.maxTurns ?? MAX_USER_TURNS[persona]); i += 1) {
    if (closed) break;
    // §115 — 순응 참가자는 링크 이체 화면을 연 문자가 도착한 다음 발화에서 제출한다(앱의 landingSubmittedAt 흉내 · C-1 입력).
    if (persona === "comply" || persona === "verbalInstall" || persona === "verbalTransfer") {
      for (const d of delivered) {
        const landingId = findInCallSmsItem(scenarioId, d.smsId)?.fakeLandingId;
        if (!d.landingSubmitted && d.userTurnsAtArrival < userTurns && landingId) {
          // U2(#460) — 설치 화면은 제출이 아니라 권한 허용이다: comply = 앱처럼 실시간 응낙 지시를 맥락 주입 · verbalInstall = 누르지 않는다(말로만).
          if (isInCallInstallLanding(scenarioId, landingId)) {
            if (persona === "verbalInstall") continue;
            d.landingSubmitted = true;
            const consentText = mockScreensLib?.installConsentInstructionFor?.({ entrySurface: "in-call-sms", escalatedCall: false, path: "realtime", transferPlaced: verifyPhase === "placed" });
            events.push({ t: now(), ev: "installConsented", smsId: d.smsId, userTurns, injected: Boolean(consentText) });
            if (consentText) sendText(consentText, false, "install_consent_ctx");
            continue;
          }
          // #463 확인 — verbalTransfer는 이체 · 입력 화면을 제출하지 않는다(말로만 "보냈어요").
          if (persona === "verbalTransfer") continue;
          d.landingSubmitted = true;
          events.push({ t: now(), ev: "landingSubmitted", smsId: d.smsId, userTurns });
          // §132.7 — 앱처럼 제출 사실을 맥락 주입(새 lib에만 상수가 있다 — 옛 lib = 주입 0).
          const landingText = optionalLib("inCallSms/confirmResult.js")?.LANDING_SUBMITTED_INSTRUCTION;
          if (landingText) sendText(landingText, false, "landing_ctx");
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
    const u = leg?.firstLine && i === (job.startIndex ?? 0) ? leg.firstLine : respond(lastScammer, i);
    userTurns += 1;
    sendText(u, true, "user");
    await waitTurn(45000);
    // §142 — 다통화 레그는 문자 선언 없는 레그도 앱처럼 백스톱을 묻는다(클라 `inCallSmsBackstop`은 변형 단위).
    if ((declared.length > 0 || leg) && !closed) {
      // §104 — 앱 화면처럼 마지막 문자 도착 뒤 사기범이 "문자 보냈다"고 말했으면 백스톱에 주장을 싣는다(새 lib에서만 효과 — 옛 lib는 인자를 무시).
      const lastSmsIdx = turns.map((t) => t.kind).lastIndexOf("sms_ctx");
      const claimed = turns.slice(lastSmsIdx + 1).some((t) => t.role === "scammer" && PROBE_SMS_SENT_CLAIM.test(t.text ?? ""));
      // #463 판정표 SB 미러 — 앱 `inCallSms/index.ts`처럼 권한 허용 기록 없는 설치 문자가 있으면 다음 필수 문자를 보류(옛 lib = 종전).
      const installPending = screenActionLib?.installPendingSince && screenActionLib.screenActionApplies(variantId)
        ? screenActionLib.installPendingSince(
            true,
            scenarioId,
            delivered.map((d) => ({ ...d, fakeLandingId: findInCallSmsItem(scenarioId, d.smsId)?.fakeLandingId })),
            delivered
              .filter((d) => d.landingSubmitted && isInCallInstallLanding(scenarioId, findInCallSmsItem(scenarioId, d.smsId)?.fakeLandingId))
              .map((d) => ({ landingId: findInCallSmsItem(scenarioId, d.smsId).fakeLandingId, consented: true, submitted: false })),
          )
        : undefined;
      const p = planSmsBackstop({ declared, delivered, userTurns, claimed, ...(installPending !== undefined ? { installPendingSince: installPending } : {}) });
      if (installPending !== undefined) events.push({ t: now(), ev: "installHold", since: installPending, userTurns, action: p.action });
      // R1 미러(2026-11-01) — 앱 `deliverInCallSms` 백스톱 응답 `screenStatusInstruction`처럼 발송 아닌 응답이면 화면 기록 · 재촉 단계 1줄을 맥락 주입(옛 lib = 0).
      if (p.action !== "deliver" && verifyPhase !== "placed" && screenActionLib?.buildLiveScreenStatusInstruction && screenActionLib.screenActionApplies(variantId)) {
        const withLanding = delivered.map((d) => ({ ...d, fakeLandingId: findInCallSmsItem(scenarioId, d.smsId)?.fakeLandingId }));
        const records = withLanding
          .filter((d) => d.landingSubmitted && isInCallInstallLanding(scenarioId, d.fakeLandingId))
          .map((d) => ({ landingId: d.fakeLandingId, consented: true, submitted: false }));
        const status = screenActionLib.buildLiveScreenStatusInstruction(
          true,
          screenActionLib.inCallScreenFacts(scenarioId, withLanding, records),
          userTurns,
          screenActionLib.notYetSentSmsLabels(scenarioId, declared, delivered),
        );
        if (status) { sendText(status, false, "screen_status_ctx"); events.push({ t: now(), ev: "screenStatus", userTurns, text: status }); }
      }
      if (claimed) events.push({ t: now(), ev: "smsClaim", userTurns, action: p.action });
      if (p.action === "deliver") {
        const g = resolveSmsGate({ purpose: p.item.purpose, declared, delivered, userTurns });
        if (g.status === "allowed") {
          const item = findInCallSmsItem(scenarioId, g.item.smsId);
          delivered.push({ smsId: item.smsId, userTurnsAtArrival: userTurns, by: "backstop" });
          const r = smsResponse(item);
          events.push({ t: now(), ev: "sms", by: "backstop", smsId: item.smsId, body: r.body, scammerTurns, userTurns }); // U2 채점 — 도착 시점 계수
          sendText(r.announceInstruction ?? item.announceInstruction, false, "sms_ctx");
          if (pendingConfirm && !confirmInjected) { confirmInjected = true; sendText(pendingConfirm, false, "confirm_ctx"); pendingConfirm = null; }
        }
      } else if (p.action === "nudge") {
        sendText(buildSmsNudgeInstruction(p.item.purpose), false, "sms_nudge_ctx");
      } else if (p.action === "none_pending" && leg && legHandoffLib && legHandoffLib.planLegHandoff(findFlowVariant(variantId), leg.relay, userTurns) !== undefined) {
        // §142 D1 미러 — 앱 백스톱처럼 transfer 레그 넘김 판정(wait = 다음 발화에 다시 · handoff = 넘김 지시 레그당 1회).
        if (!wrapUpSent && legHandoffLib.planLegHandoff(findFlowVariant(variantId), leg.relay, userTurns) === "handoff") {
          wrapUpSent = true;
          sendText(legHandoffLib.LEG_TRANSFER_HANDOFF_INSTRUCTION, false, "leg_handoff_ctx");
          events.push({ t: now(), ev: "legHandoff", userTurns });
        }
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
  return { model: GEMINI_LIVE_MODEL, sessionId: sid, variantId, fictionalBankName, userTurns, closed, tools: tools.flatMap((t) => (t.functionDeclarations ?? []).map((d) => d.name)), declaredSms: declared.map((d) => d.smsId), delivered, verifyPhase, ended, turns, events, wallMs: now() };
}

// ── multicall(§142 카드사 고급 재구성 확인 실측 · 2026-11-02) ─────────────────────────────────────────
// 다통화 변형 한 세션 = 레그마다 Live 새 연결(앱 `startLeg` → 새 토큰과 같다). 레그 사이는 앱 콜러블 `startCallLeg`의 판정
// (`planLegStart` · 같은 함수)을 프로브 메모리의 `relay`로 흉내 낸다(Firestore 0). 끊기 승인 = 레그 끝(`commit.ts`처럼 relay.legEnded).
// 흉내 내는 것: 레그 프롬프트 · 레그 문자 선언(게이트 하한 = 레그 시작 뒤 발화) · 레그 목소리 자리 · 앞 통화 인계 블록 ·
// 클라 레그 첫 연결 신호(`GeminiVoiceSession.tsx` OPENING_TRIGGER_TURN — 레그 연결은 `resumeTurn` null) · 설치 권한 허용(comply).
// 흉내 내지 않는 것: 화면 대기 시간(재발신 30초 · 연결음) · 오디오 · 리포트 LLM 문장.
const CLIENT_OPENING_TRIGGER =
  "(전화가 방금 연결됐다. 지금 막 전화를 받은 상대에게 캐릭터로서 자연스럽게 첫 마디를 건네라. 첫 마디는 짧게 — 신분(사칭 기관·관계)과 전화를 건 이유를 짧은 한두 문장(5초 안팎)으로만 밝히고, 멈춰서 상대의 대답을 기다려라. 다짜고짜 요구나 압박부터 하지 말고, 자세한 설명은 상대가 반응한 뒤 다음 턴에 이어가라.)";
const legPlanLib = optionalLib("callLegs/legPlan.js");
const legHandoffLib = optionalLib("callLegs/legHandoff.js");
// D2 미러 — 클라 `src/lib/callLegs/legTransition.ts` LEG_DIALED_OPENING_TURN(참가자가 건 통화의 첫 신호 · 루트 `[§142 D2 프로브 미러]`가 같은 문면을 고정).
const LEG_DIALED_OPENING_TURN =
  "(상대가 너에게 건 전화를 너는 방금 받았다 — 네가 전화한 것이 아니다. '연락드렸습니다'처럼 건 쪽의 말을 하지 말고, 전화를 받는 쪽의 짧은 인사 한마디(5초 안팎)만 한 뒤 멈춰서 상대가 왜 전화했는지 말하기를 기다려라. 용건 설명은 상대의 말을 들은 뒤에 한다.)";
const dialLib = optionalLib("scenarios/dialDirectory.js");
const { pickLegVoiceName } = L("realtime/geminiProvider.js");
// 참가자가 직접 건 레그의 첫마디(번호 id별 — 사기범 첫 응대 뒤 참가자가 하는 말).
const DIAL_FIRST_LINE = {
  "card-fake-callback": "문자 보고 전화드렸어요. 저는 카드 신청한 적이 없는데요.",
  "supervisor-official": "카드사에서 신고하라고 해서 전화드렸어요.",
};
// refuseInstall — comply와 같되 앱 설치 요구는 거절하고 권한 허용을 누르지 않는다(R7 — 창구 오퍼 없이 포기하는가).
function makeRefuseInstallResponder(otpOf) {
  const base = makeResponder("comply", otpOf);
  let n = 0;
  return (last, i) => {
    if (/(설치|원격|앱|권한)/.test(last)) return ["그런 앱은 설치 안 할래요. 좀 찜찜해요.", "설치는 못 하겠어요. 다른 방법 없어요?", "앱은 안 깔 거예요."][n++ % 3];
    return base(last, i);
  };
}
async function runMultiCall(job, tag) {
  if (!legPlanLib || !dialLib) throw new Error("이 lib에는 §142 레그 런타임이 없다");
  const t0 = Date.now();
  const scenarioId = job.id, level = job.level;
  const variant = findFlowVariant(job.variant);
  if (!variant?.multiCall) throw new Error(`다통화 변형이 아님: ${job.variant}`);
  const sid = sessionIdFor(tag, scenarioId, level, job.persona);
  const delivered = [], turns = [], events = [], legs = [], dials = [];
  // R2 — 시작 문자(앱 `deliverOpenerSms` — userTurnsAtArrival 0 · 게이트 밖).
  if (variant.openerSmsId) delivered.push({ smsId: variant.openerSmsId, userTurnsAtArrival: 0, by: "opener" });
  let relay, userTurns = 0, outcome = null, idx = 0;
  let otpSource = () => undefined;
  const respond = job.persona === "refuseInstall" ? makeRefuseInstallResponder(() => otpSource()) : makeResponder("comply", () => otpSource());
  const installConsented = () => delivered.some((d) => d.landingSubmitted && isInCallInstallLanding(scenarioId, findInCallSmsItem(scenarioId, d.smsId)?.fakeLandingId));
  const numberOf = (numberId) => dialLib.findDialEntry(scenarioId, numberId)?.number ?? "";
  // 다음 레그를 열 행동(계획 항목 `dials` — 키 = "start" 또는 끝난 레그 번호 · 부재 = transfer 레그는 transfer, 그 밖은 계획 끝).
  const actionFor = (key, exit) => {
    const d = job.dials?.[key];
    if (d) return d;
    return exit === "transfer" ? { action: "transfer" } : null;
  };
  let key = variant.legs[0].entry === "incoming" ? null : "start";
  for (let guard = 0; guard < variant.legs.length + 1; guard += 1) {
    let legIndex, entry;
    if (key === null) {
      legIndex = 0; entry = "incoming";
    } else {
      const exit = key === "start" ? undefined : variant.legs[key].exit;
      const a = actionFor(key, exit);
      if (!a) { outcome = { kind: "stopped_by_plan", after: key }; break; }
      const dialed = a.numberId ? numberOf(a.numberId) : undefined;
      const plan = legPlanLib.planLegStart({ variant, relay, action: a.action, dialed, installConsented: installConsented(), userTurns });
      dials.push({ after: key, action: a.action, numberId: a.numberId, dialed, status: plan.status, ...(plan.status === "not_ready" ? { reason: plan.reason } : {}), installConsented: installConsented(), userTurns });
      if (plan.status === "genuine") { outcome = { kind: "genuine", numberId: plan.entry.numberId, notice: plan.entry.genuineNotice }; break; }
      if (plan.status !== "connected") { outcome = { kind: plan.status, after: key }; break; }
      relay = plan.relay; legIndex = plan.legIndex; entry = plan.entry;
    }
    const legDef = variant.legs[legIndex];
    const slot = legPlanLib.legVoiceSlot(variant, legIndex);
    const legStart = legPlanLib.legStartUserTurns(relay, legIndex);
    const prior = legIndex > 0 ? legPlanLib.buildPriorLegContext(turns.filter((t) => t.role === "user" || (t.role === "scammer" && t.n)).map((t) => ({ role: t.role, text: t.text }))) : undefined;
    const nonLast = legIndex < variant.legs.length - 1;
    const voiceName = pickLegVoiceName(slot.gender, slot.slot);
    const startIndex = entry === "incoming" && legIndex === 0 ? 0 : Math.max(1, idx);
    const legJob = {
      variant: variant.variantId, sessionId: sid, delivered, userTurnsBase: userTurns, startIndex,
      maxTurns: (legDef.maxUserTurns ?? 6) + 3, respond, setOtpSource: (f) => { otpSource = f; },
      // D2 — 앱처럼 참가자가 건 통화(서버 relay.entry = dial)는 받는 쪽 첫 신호(옛 lib = relay.entry 없음 → 기본 트리거).
      openingTrigger: relay?.entry === "dial" ? LEG_DIALED_OPENING_TURN : CLIENT_OPENING_TRIGGER,
      ...(prior ? { priorChatContext: prior } : {}),
      leg: { legIndex, relay, legStart, gender: slot.gender, voiceName, nonLast, exit: legDef.exit,
        firstLine: entry === "dial" ? DIAL_FIRST_LINE[legDef.dialTarget] : undefined },
    };
    if (existsSync(stopFile)) throw new Error("정지 파일 감지(429)");
    const r = await runVoice(scenarioId, level, job.persona === "refuseInstall" ? "refuseInstall" : "comply", tag, legJob);
    turns.push(...r.turns.map((t) => ({ ...t, leg: legIndex })));
    events.push(...r.events.map((e) => ({ ...e, leg: legIndex })));
    idx = startIndex + (r.userTurns - userTurns);
    legs.push({ legIndex, entry, callerLabel: legDef.callerLabel, voiceName, voiceSlot: slot.slot, gender: slot.gender, userTurnsStart: userTurns, userTurnsEnd: r.userTurns, ended: r.ended, priorContextLines: prior ? prior.split("\n").length - 2 : 0, declaredSms: r.declaredSms, wallMs: r.wallMs });
    userTurns = r.userTurns;
    const closeErr = r.events.find((e) => e.ev === "close" && /(^|\D)429(\D|$)|RESOURCE_EXHAUSTED|quota/i.test(`${e.code ?? ""} ${e.reason ?? ""}`));
    if (closeErr) throw new Error(`429 감지(Live close): ${closeErr.code} ${closeErr.reason}`);
    if (!r.ended) { outcome = { kind: "leg_not_ended", legIndex }; break; }
    if (!nonLast) { outcome = { kind: "finished", legIndex }; break; }
    relay = { ...(relay ?? {}), legIndex, legStartUserTurns: relay?.legStartUserTurns ?? [0], connected: false, legEnded: legIndex };
    if (job.stopAfterLeg === legIndex) { outcome = { kind: "stopped_by_plan", after: legIndex }; break; }
    key = legIndex;
    await sleep(3000);
  }
  return { model: GEMINI_LIVE_MODEL, sessionId: sid, variantId: variant.variantId, legs, dials, outcome, delivered, relay, turns, events, wallMs: Date.now() - t0 };
}

// ── messenger(텍스트 · sendMessage 재현) ─────────────────────────────────────────────────────────
async function runMessenger(scenarioId, level, persona, tag, job = {}) {
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
  // P0 실측(2026-10-31) — 계획 항목 maxTurns를 메신저에도 적용(부재 = 종전 상한).
  for (let i = 1; i < (job.maxTurns ?? MAX_USER_TURNS[persona]) + 1; i += 1) {
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
// ── messenger(앱 체인 · 2026-10-24) — `--claude-key-var`가 있을 때. sendMessage(`roleplay/index.ts`)의 턴 지시 조립 · 후처리 순서를 그대로 따른다.
// 재현하지 않는 것: Firestore 상태(모의 화면 응낙 · 확인 무력화 — 메신저 4종에는 없다) · 사진 턴 · 링크 칩 중복 제거(표시 전용).
// 429 감지: 앱 체인은 실패를 삼키고 다음 단계로 넘어가므로(`completeWithFallback`) 앱 로거 출력에서 429 문자열을 잡는다.
let seen429 = null;
for (const k of ["log", "warn", "error", "info"]) {
  const orig = console[k].bind(console);
  console[k] = (...a) => {
    const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
    // 앱 로거의 경고 · 오류 줄만 본다(프로브 자신의 결과 줄 — 파일명 · 타임스탬프 — 을 읽어 오탐한 1차 실행 교훈).
    if (!seen429 && /"severity":"(WARNING|ERROR)"/.test(s) && /(^|\D)429(\D|$)|RESOURCE_EXHAUSTED|rate_limit_error/i.test(s)) seen429 = scrub(s).slice(0, 200);
    orig(...a);
  };
}
// 2026-11-01(#482 확인 실측 — 2차 Gemini 429가 났는데 멈추지 않았다) — firebase-functions 로거는 불러올 때 잡아 둔 원본 console(`UNPATCHED_CONSOLE`)로
// 쓰므로 위 console 가로채기를 지나가지 않는다. 그 원본이 쓰는 stdout · stderr 쓰기에서 같은 판정을 한다.
for (const stream of [process.stdout, process.stderr]) {
  const origWrite = stream.write.bind(stream);
  stream.write = (chunk, ...rest) => {
    const s = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : "";
    if (!seen429 && /"severity":"(WARNING|ERROR)"/.test(s) && /(^|\D)429(\D|$)|RESOURCE_EXHAUSTED|rate_limit_error/i.test(s)) seen429 = scrub(s).slice(0, 200);
    return origWrite(chunk, ...rest);
  };
}
async function runMessengerApp(scenarioId, level, persona, tag, job = {}) {
  const t0 = Date.now();
  const now = () => Date.now() - t0;
  // P2 실측 — 계획 항목 variant를 앱 체인 경로에도 적용(부재 = 첫 변형 · 종전).
  const { variantId, scenarioPrompt, declared, verifyEnabled, fictionalBankName, baseOpts } = sessionSetup(scenarioId, level, tag, job.variant);
  const sid = sessionIdFor(tag, scenarioId, level, persona);
  const stored = [], turns = [], events = [], delivered = [];
  let lastCallAt = 0, ended = null, escalated = null, liveLeg = null;
  async function complete(systemPrompt, messages, firstTurn) {
    const wait = 3000 - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    const client = firstTurn ? appLlm.getLlmClient(appLlm.LLM_FIRST_TURN_TIMEOUT_MS) : appLlm.getLlmClient();
    const started = Date.now();
    const res = await appLlm.completeWithFallback(client, { systemPrompt, messages, mockTacticHints: scenarioPrompt.weakenedTactics, purpose: "scammer-reply" });
    events.push({ t: now(), ev: "llmCall", servedBy: res.servedBy ?? (res.isMock ? "mock" : "unknown"), ms: Date.now() - started });
    if (seen429) throw new Error(`429 감지(앱 체인 로그): ${seen429}`);
    return res;
  }
  // sendMessage 후처리(③ 순서) — 링크 → 문자 마커 → 신호 → 대사 대조 → 표기 정리 → 실존명 → 가상 은행 → 문장 상한.
  function postProcess(rawText, turnChoice, userTurnsNow, isOpening) {
    const link = cleanMessengerOutput(rawText, scenarioId, variantId, level);
    const mk = extractSmsMarker(link.text);
    const sig = extractEscalationSignal(mk.text);
    let escalate = sig.escalate, endCall = sig.endCall, dropped;
    if (!isOpening && signalConsistencyLib) {
      if (escalate) {
        const since = messengerReentryLib ? messengerReentryLib.turnsSinceMessengerEntry(userTurnsNow, undefined) : userTurnsNow;
        const chk = signalConsistencyLib.judgeEscalationSignalAt ? signalConsistencyLib.judgeEscalationSignalAt(since, sig.text) : signalConsistencyLib.judgeEscalationSignal(sig.text);
        if (!chk.accept) { dropped = { escalate: chk.reason }; escalate = false; }
      }
      const endc = signalConsistencyLib.judgeEndCallSignal(endCall, sig.text);
      if (endc.dropped) dropped = { ...(dropped ?? {}), endCall: endc.dropped };
      endCall = endc.endCall;
    }
    let text = sig.text;
    if (replyMarkupLib) text = replyMarkupLib.tidyScammerReplyMarkup(text).text;
    if (realNamesLib) text = realNamesLib.replaceRealFinancialNames(text).text;
    text = applyFictionalBank(text, fictionalBankName);
    if (replyLengthLib && !isOpening && replyLengthLib.shouldLimitReplySentences(turnChoice)) text = replyLengthLib.limitReplySentences(text).text;
    return { text, attachments: link.attachments, smsMarker: mk.markerCount > 0 ? mk.purpose : undefined, escalate, endCall, dropped };
  }
  const opening = await complete(buildSystemPrompt(scenarioPrompt, { ...baseOpts, turnInstruction: OPENING_TURN_INSTRUCTION }), [], false);
  const op = postProcess(opening.text, "none", 0, true);
  stored.push({ role: "scammer", textMasked: op.text, channel: "messenger" });
  turns.push({ role: "scammer", n: 1, servedBy: opening.servedBy, raw: opening.text, text: op.text, attachments: op.attachments });
  const otpOf = () => { for (const e of [...events].reverse()) { const m = e.ev === "sms" && /(?<!\d)(\d{6})(?!\d)/.exec(e.body ?? ""); if (m) return m[1]; } return undefined; };
  const respond = makeResponder(persona, otpOf);
  // #463 확인 실측 — 앱 `roleplay/index.ts`의 칩 정리 · 화면 행동(SA) · 송금 보고(§131 R1) · 사후 손질(A1)을 같은 lib 함수로 따른다(옛 lib = 종전).
  // ⚠️ 이 프로브의 메신저 참가자는 칩 화면을 제출하지 않는다(mockScreens 기록 0) — comply 메신저 측정에 쓰면 모든 칩이 "미완료"로 잡힌다.
  const linkLib = optionalLib("roleplay/linkMarker.js");
  const chipRepeatLib = optionalLib("roleplay/linkChipRepeat.js");
  const ackLib = optionalLib("roleplay/actionAcknowledgement.js");
  const reachLib = optionalLib("scenarios/reachability.js");
  const routeVariant = findFlowVariant(variantId);
  const routeAccount = routeAccountNumber(scenarioId, variantId);
  const shapeChips = (attachments, text, history) => {
    let a = attachments;
    if (chipRepeatLib?.dropRepeatedLinkChips) a = chipRepeatLib.dropRepeatedLinkChips(a, text, history);
    if (linkLib?.dropPrematureBankTransferChip) a = linkLib.dropPrematureBankTransferChip(a, text, routeAccount, history);
    if (linkLib?.ensureBankTransferChip && reachLib) a = linkLib.ensureBankTransferChip(a, text, routeAccount, reachLib.sessionReachableLandingIds(scenarioId, variantId), scenarioId, history);
    if (linkLib?.withBankTransferPrefill) a = linkLib.withBankTransferPrefill(a, fictionalBankName, routeAccount, routeVariant?.scenarioId === scenarioId ? routeVariant.accountHolder : undefined, linkLib.demandAmountFrom?.(text, history));
    return a;
  };
  if (op.attachments) stored[stored.length - 1].attachments = op.attachments;
  // P2 실측(2026-11-01) — 앱 체인 메신저 경로에도 계획 항목 maxTurns를 적용(부재 = 종전 상한 · P0이 텍스트 경로에 한 것과 같다).
  for (let i = 1; i < (job.maxTurns ?? MAX_USER_TURNS[persona]) + 1; i += 1) {
    if (ended) break;
    const lastScammer = stored.at(-1)?.textMasked ?? "";
    const u = respond(lastScammer, i);
    const history = toLlmHistory(stored);
    history.push({ role: "user", content: wrapUserInputAsData(u) });
    const storedHistory = [...stored];
    const userTurnsNow = Math.max(stored.filter((m) => m.role === "user").length + 1, ...delivered.map((d) => d.userTurnsAtArrival), 0);
    stored.push({ role: "user", textMasked: u, channel: escalated ? "voice" : "messenger" });
    turns.push({ role: "user", n: userTurnsNow, text: u });
    const scammerTurnNumber = stored.filter((m) => m.role === "scammer").length + 1;
    let deliveredSmsId, dueItem, nudge;
    if (declared.length > 0) {
      const plan = planSmsBackstop({ declared, delivered, userTurns: userTurnsNow });
      if (plan.action === "deliver") {
        const g = resolveSmsGate({ purpose: plan.item.purpose, declared, delivered, userTurns: userTurnsNow });
        if (g.status === "allowed") {
          dueItem = withOtp(findInCallSmsItem(scenarioId, g.item.smsId), sid);
          deliveredSmsId = g.item.smsId;
          delivered.push({ smsId: g.item.smsId, userTurnsAtArrival: userTurnsNow, by: "backstop" });
          events.push({ ev: "sms", by: "backstop", smsId: deliveredSmsId, userTurns: userTurnsNow, body: applyFictionalBank(dueItem.body, fictionalBankName) });
        }
      } else if (plan.action === "nudge") nudge = buildSmsNudgeInstruction(plan.item.purpose);
    }
    const hangupFacts = {
      status: "active", channel: escalated ? "voice" : "messenger", verifyEnabled, transferPlaced: false, transferReachable: true, userTurns: userTurnsNow,
      limitReached: false, alreadyAccepted: false, relay: undefined, smsDeclared: declared.length > 0, smsDeliveredLoaded: true, goalActionDone: false,
    };
    const pre = decideFallbackHangup(hangupFacts, delivered, false);
    const hangupMode = fallbackHangupMode(pre);
    const choice = pickFallbackTurnInstruction({ smsDue: Boolean(deliveredSmsId), scammerDocCount: scammerTurnNumber - 1, installConsentDue: false });
    const ti = choice === "sms_announce" ? dueItem?.announceInstruction : undefined;
    // ②-f 인증번호 대조(앱과 같은 함수 · 도착 기록은 메모리).
    let otpInstr;
    if (otpCheckLib) {
      const oi = otpCheckLib.otpCheckInputsFromHistory(storedHistory);
      const oc = await otpCheckLib.evaluateOtpCheck({
        scenarioId, userText: u, sessionId: sid, ...(oi.lastScammerText !== undefined ? { lastScammerText: oi.lastScammerText } : {}),
        scammerTurnNumber, ...(deliveredSmsId ? { deliveredThisTurn: deliveredSmsId } : {}),
        isDelivered: async (smsId) => delivered.some((d) => d.smsId === smsId), callTransferred: false, deliveredRecords: delivered,
      });
      otpInstr = oc.instruction;
      if (oc.reason !== "no-digits" && oc.reason !== "no-otp-scenario") events.push({ ev: "otpCheck", outcome: oc.outcome, reason: oc.reason, userTurns: userTurnsNow });
    }
    const offer = declared.length > 0
      ? buildSmsMarkerOfferInstruction(declared.filter((it) => resolveSmsGate({ purpose: it.purpose, declared, delivered, userTurns: userTurnsNow }).status === "allowed").map((it) => it.purpose))
      : undefined;
    // #463 SA 미러 — 메신저 칩(이력 첨부) · mockScreens 기록 0(이 프로브는 칩 화면을 제출하지 않는다).
    const screenApplies = screenActionLib?.screenActionApplies ? screenActionLib.screenActionApplies(variantId) : false;
    const screenFacts = screenApplies ? screenActionLib.messengerScreenFacts(scenarioId, storedHistory, []) : [];
    // R8 미러(2026-11-01 · #479 확인 실측에서 빠진 것을 발견) — 앱 `roleplay/index.ts`처럼 메신저 이체 칩을 보냈는데 마치지 않았으면 결정 화면 대기(4-c행이 goal 끊기를 막는다).
    // 이 응답 전 이력 기준 · 화면 행동 적용 여부와 무관(앱과 같음) · 이 프로브는 칩 화면을 제출하지 않는다(기록 0).
    const r8TransferChips = screenActionLib?.messengerScreenFacts ? screenActionLib.messengerScreenFacts(scenarioId, storedHistory, []).filter((f) => f.kind === "transfer") : [];
    const r8DecisionScreenPending = r8TransferChips.length > 0 && !r8TransferChips.some((f) => f.done);
    const screenPlan = screenApplies ? screenActionLib.planScreenAction({ applies: true, facts: screenFacts, currentUserText: u }) : undefined;
    // R1 · R4 · R6 미러(2026-11-01) — 앱처럼 재촉 단계 맥락을 넘긴다(옛 lib는 셋째 인자를 무시 = 종전).
    const screenStatus = screenApplies ? screenActionLib.buildScreenStatusLine(true, screenFacts, { userTurns: userTurnsNow, notYetSent: [], messenger: !escalated }) : undefined;
    if (screenPlan) events.push({ ev: "screenNotDone", kind: screenPlan.kind, userTurns: userTurnsNow });
    const transferScreenPending = screenFacts.some((f) => f.kind === "transfer") && !screenFacts.some((f) => f.kind === "transfer" && f.done);
    const transferReported = ackLib ? ackLib.userReportedTransfer(storedHistory, u) && !transferScreenPending : false;
    const confirmPlan = !screenPlan && choice === "none" && !otpInstr && !offer && !nudge
      ? planConfirmResult({ scenarioId, declared, delivered, userTurns: userTurnsNow, currentUserText: u, priorUserTexts: storedHistory.filter((m) => m.role === "user").map((m) => m.textMasked) })
      : undefined;
    const escalatedInstr = escalated && choice === "none" && escalatedCallLib ? escalatedCallLib.ESCALATED_CALL_CONTEXT_INSTRUCTION : undefined;
    const rbKind = repeatBreakLib && choice === "none" && !otpInstr && !confirmPlan?.instruction
      ? repeatBreakLib.decideRepeatBreak(storedHistory.filter((m) => m.role === "scammer").map((m) => m.textMasked), u)
      : null;
    if (rbKind) events.push({ ev: "repeatBreak", kind: rbKind, userTurns: userTurnsNow });
    const tiAll = [ti, otpInstr, screenStatus, screenPlan?.instruction, confirmPlan?.instruction, transferReported ? ackLib.TRANSFER_REPORTED_INSTRUCTION : undefined, escalatedInstr, rbKind ? repeatBreakLib.repeatBreakInstruction(rbKind) : undefined, nudge, offer].filter(Boolean).join("\n") || undefined;
    const firstUserTurn = storedHistory.filter((m) => m.role === "user").length === 0;
    const res = await complete(buildSystemPrompt(scenarioPrompt, { ...baseOpts, ...(tiAll ? { turnInstruction: tiAll } : {}), hangupMode }), history, firstUserTurn);
    const pp = postProcess(res.text, choice, userTurnsNow, false);
    // #463 — 앱 후처리 순서 미러: 칩 정리(S2 · D-g · P2-c) · 하지 않은 일 인정 문장 삭제(A1 — 이체 화면 미완료면 "입금 확인" 문장 삭제).
    pp.attachments = shapeChips(pp.attachments, pp.text, storedHistory);
    // R17 미러(2026-11-01) — 앱 판정표 A: 메신저 단계 · 마치지 않은 화면 재촉 단계 · 다음 단계 요구 → 새 칩 떼기 · goal 무시 · 대사는 아래에서 재촉 1줄(옛 lib = 함수 없음 = 종전).
    const advanceGate = screenActionLib?.decideStageAdvanceGate
      ? screenActionLib.decideStageAdvanceGate({ messengerStage: !escalated && screenApplies, facts: screenFacts, userTurns: userTurnsNow, replyText: pp.text, chipLandingIds: (pp.attachments ?? []).flatMap((a) => (a.fakeLandingId ? [a.fakeLandingId] : [])) })
      : { blocked: false };
    if (advanceGate.blocked) {
      pp.attachments = (pp.attachments ?? []).filter((a) => screenFacts.some((f) => f.landingId === a.fakeLandingId));
      if (pp.attachments.length === 0) pp.attachments = undefined;
      if (pp.endCall === "goal") pp.endCall = undefined;
    }
    // R3 미러(2026-11-01) — 이체 화면 미완료인데 송금 확인 단정이면 대사 전체를 미확인 되돌림 1줄로 · 그 응답의 목표 끊기 신호 무시(옛 lib = 종전 A1만).
    const unconfirmed = ackLib?.guardUnconfirmedTransfer ? ackLib.guardUnconfirmedTransfer(pp.text, transferScreenPending) : { replaced: false };
    if (unconfirmed.replaced) {
      events.push({ ev: "unconfirmedTransferReplaced", userTurns: userTurnsNow, original: pp.text });
      pp.text = unconfirmed.text;
      if (pp.endCall === "goal") pp.endCall = undefined;
    } else if (ackLib?.stripUnperformedAcknowledgement) pp.text = ackLib.stripUnperformedAcknowledgement(pp.text, { transferReported, photoSent: false });
    // R15 미러(2026-11-01) — 앱 순서: 설치 완료 단정 교체(판정표 I) → 신분증 요구 소유 낱말(P4) → 통화 말(W). 옛 lib = 함수 없음 = 종전.
    const installPending = !escalated && screenFacts.some((f) => f.kind === "install") && !screenFacts.some((f) => f.kind === "install" && f.done);
    if (ackLib?.guardUnconfirmedInstall) {
      const ig = ackLib.guardUnconfirmedInstall(pp.text, installPending);
      if (ig.replaced) { events.push({ ev: "unconfirmedInstallReplaced", userTurns: userTurnsNow, original: pp.text }); pp.text = ig.text; }
    }
    if (personaGuardLib?.fixPersonaIdRequest) {
      const pf = personaGuardLib.fixPersonaIdRequest(scenarioId, pp.text);
      if (pf.fixed) { events.push({ ev: "personaIdFixed", userTurns: userTurnsNow, original: pp.text }); pp.text = pf.text; }
    }
    if (!escalated && personaGuardLib?.fixMessengerCallWording) pp.text = personaGuardLib.fixMessengerCallWording(pp.text);
    // R16 미러(2026-11-01) — 메신저 이체 칩 미완료 · 포기 아님 · 작별 대사 → 이체 미확인 재촉 1줄(판정표 F).
    if (ackLib?.guardFarewellWhileTransferPending) {
      const fg = ackLib.guardFarewellWhileTransferPending(pp.text, { messengerStage: !escalated, transferChipPending: r8DecisionScreenPending, givingUp: pp.endCall === "give_up" });
      if (fg.replaced) { events.push({ ev: "farewellReplaced", userTurns: userTurnsNow, original: pp.text }); pp.text = fg.text; }
    }
    if (advanceGate.blocked) {
      events.push({ ev: "stageAdvanceBlocked", kind: advanceGate.kind, giveUpStage: advanceGate.giveUpStage === true, userTurns: userTurnsNow, original: pp.text });
      // R19 미러(2026-11-02) — 포기 단계(A2g)인데 모델이 give_up을 보냈으면 재촉 대신 포기 1줄.
      pp.text = advanceGate.giveUpStage === true && pp.endCall === "give_up"
        ? screenActionLib.screenGiveUpReply(pp.text)
        : screenActionLib.stageHoldReply(advanceGate.kind, pp.text, userTurnsNow);
    }
    if (pp.smsMarker !== undefined) {
      const g = resolveSmsGate({ purpose: pp.smsMarker, declared, delivered, userTurns: userTurnsNow });
      events.push({ ev: "smsMarker", purpose: pp.smsMarker, status: g.status, userTurns: userTurnsNow });
      if (g.status === "allowed") {
        const item = withOtp(findInCallSmsItem(scenarioId, g.item.smsId), sid);
        delivered.push({ smsId: g.item.smsId, userTurnsAtArrival: userTurnsNow, by: "marker" });
        events.push({ ev: "sms", by: "marker", smsId: g.item.smsId, userTurns: userTurnsNow, body: applyFictionalBank(item.body, fictionalBankName) });
      }
    }
    if (pp.dropped) events.push({ ev: "signalDropped", ...pp.dropped, userTurns: userTurnsNow });
    // R14 · R18 미러(2026-11-01) — 앱 판정표 G: 넘어온 통화 · 메신저 단계에서 포기 단계가 두 턴째인데 끊기 신호가 없으면 포기 1줄 + give_up(옛 lib = 함수 없음 = 종전).
    if (screenActionLib?.decideForcedScreenGiveUp?.({ escalatedCall: Boolean(escalated), messengerStage: !escalated, endCall: pp.endCall, hangupSignalAllowed: hangupMode === "signal", facts: screenFacts, userTurns: userTurnsNow, advanceDemand: advanceGate.blocked && advanceGate.giveUpStage === true })) {
      events.push({ ev: "forcedScreenGiveUp", userTurns: userTurnsNow, original: pp.text });
      pp.text = screenActionLib.screenGiveUpReply(pp.text);
      pp.endCall = "give_up";
    }
    // R8 · P1 M1 미러 — 사후 판정은 응답의 끊기 사유로 4-c행을 본다(앱 `decideFallbackHangup(..., endCallSignal)`).
    const post = decideFallbackHangup({ ...hangupFacts, decisionScreenPending: r8DecisionScreenPending }, delivered, false, pp.endCall);
    const effect = resolveFallbackHangupEffect({ endCall: pp.endCall, hangupMode, pre, post });
    events.push({ ev: "hangup", mode: hangupMode, preRow: pre.row, postRow: post.row, endCall: pp.endCall ?? null, end: effect.end, userTurns: userTurnsNow, decisionScreenPending: r8DecisionScreenPending });
    if (effect.end) ended = { kind: effect.kind, userTurns: userTurnsNow, row: post.row };
    stored.push({ role: "scammer", textMasked: pp.text, channel: escalated ? "voice" : "messenger", ...(pp.attachments ? { attachments: pp.attachments } : {}) });
    turns.push({ role: "scammer", n: scammerTurnNumber, servedBy: res.servedBy ?? (res.isMock ? "mock" : "unknown"), cause: [ti && "sms_announce", otpInstr && "otp_check", confirmPlan?.instruction && "confirm_result", rbKind && `repeat:${rbKind}`, nudge && "nudge", pp.escalate && "ESCALATE", effect.end && `ENDED:${effect.kind}`].filter(Boolean).join("+") || "user", raw: res.text, text: pp.text, attachments: pp.attachments });
    // #476 미러 — 앱 `roleplay/index.ts` ④-b: 실제 전환 판정을 지날 때만 신호 · max-turn 자동 전환(계획 항목 `voiceSelectionSource` = 세션 목소리 결정).
    const transitionOk = escalationLib?.resolveTransitionNow && publicMetaLib
      ? escalationLib.resolveTransitionNow({ scenarioId, difficultyLevel: level, voiceSelectionSource: job.voiceSelectionSource }, publicMetaLib.PUBLIC_SCENARIOS) !== undefined
      : true;
    const autoEscalate = Boolean(escalationLib?.resolveTransitionNow) && transitionOk && !pp.escalate
      && constantsLib?.MESSENGER_ESCALATION_FALLBACK_TURNS !== undefined && userTurnsNow >= constantsLib.MESSENGER_ESCALATION_FALLBACK_TURNS;
    if (pp.escalate && !transitionOk) events.push({ ev: "escalateBlocked", userTurns: userTurnsNow, reason: "transition_gate" });
    if (((pp.escalate && transitionOk) || autoEscalate) && !escalated && !ended) {
      escalated = { userTurns: userTurnsNow };
      events.push({ ev: "escalate", userTurns: userTurnsNow, trigger: autoEscalate ? "maxturn_fallback" : "structured_signal" });
      // 통화 leg — 앱처럼 앞선 대화 블록을 실은 Live 세션(예산 안에서만). 예산이 없으면 텍스트 폴백(에스컬레이션 맥락 1줄)으로 잇는다.
      if (liveLegBudget > 0 && priorChatLib) {
        liveLegBudget -= 1;
        // #476 미러 — 앱 `realtime/index.ts`처럼 목소리 복제 짧은 통화 시나리오면 짧은 통화 규칙을 붙이고, 끊기 5행 예외(`shortCloneCall`)를 켠다.
        const cloneShort = publicMetaLib?.PUBLIC_SCENARIOS?.[scenarioId]?.escalationCloneOnly === true && Boolean(priorChatLib.CLONE_SHORT_CALL_RULE);
        const basePrior = priorChatLib.buildPriorChatContext(stored, [], "scammer");
        const priorChatContext = cloneShort && basePrior ? `${basePrior}\n${priorChatLib.CLONE_SHORT_CALL_RULE}` : basePrior;
        if (cloneShort) events.push({ ev: "cloneShortCall", userTurns: userTurnsNow });
        const remaining = MAX_USER_TURNS[persona] - i;
        if (remaining > 0) {
          liveLeg = await runVoice(scenarioId, level, persona, tag, { variant: variantId, priorChatContext, openingTrigger: ESCALATED_CALL_OPENING_TURN, respond: (t, k) => respond(t, k), startIndex: i + 1, maxTurns: remaining, sessionId: sid, shortCloneCall: cloneShort });
          for (const t of liveLeg.turns) turns.push({ ...t, leg: "live" });
          for (const e of liveLeg.events) events.push({ ...e, leg: "live" });
          for (const d of liveLeg.delivered) delivered.push({ ...d, leg: "live" });
          if (liveLeg.ended) ended = { ...liveLeg.ended, leg: "live" };
        }
        break;
      }
    }
  }
  return { model: "app-chain(claude-haiku-5-5→gemini-fallback)", sessionId: sid, variantId, fictionalBankName, declaredSms: declared.map((d) => d.smsId), delivered, ended, escalated, liveLeg: liveLeg ? { model: liveLeg.model, ended: liveLeg.ended, tools: liveLeg.tools } : null, turns, events, wallMs: now() };
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
    result = job.ch === "multicall" ? await runMultiCall(job, tag) : job.ch === "voice" ? await runVoice(job.id, job.level, job.persona, tag, job) : appLlm ? await runMessengerApp(job.id, job.level, job.persona, tag, job) : await runMessenger(job.id, job.level, job.persona, tag, job);
  } catch (e) { error = scrub(e?.stack ?? e); result = { turns: [], events: [] }; }
  // 2026-10-24 — 루트 · 리포트 판정(앱 `analyzeConversation`과 같은 함수 · 인증번호 정답 = 이 세션 번호).
  try {
    const fv = findFlowVariant(result.variantId);
    result.route = fv ? { flowVariantId: fv.variantId, routeKey: fv.routeKey, routeLabel: fv.routeLabel } : null;
    const sid = result.sessionId ?? sessionIdFor(tag, job.id, job.level, job.persona);
    const msgs = (result.turns ?? [])
      .filter((t) => (t.role === "scammer" && t.kind !== "interrupted" && (t.n || t.leg)) || t.role === "user")
      .filter((t) => (t.text ?? "").trim())
      .map((t, k) => ({ role: t.role, textMasked: t.text, turnIndex: k, createdAtMs: k * 1000, channel: job.ch === "messenger" && !t.leg ? "messenger" : "voice" }));
    const otpCodes = sessionOtpLib ? listOtpItems(job.id).map((it) => sessionOtpLib.withSessionOtp(it, sid).otpCode).filter(Boolean) : [];
    // §142 — 다통화 변형은 앱 리포트(`generateReportCore.ts`)처럼 변형 전체 수법으로 해석한다.
    const tacticsFor = fv?.multiCall ? [...fv.tactics] : resolveSessionScenarioPrompt(job.id, result.variantId)?.weakenedTactics ?? [];
    const a = analyzeConversation(msgs, 0, tacticsFor, otpCodes);
    result.verdict = { wasDeceived: a.wasDeceived, deceivedMoments: a.deceivedMoments.map((m) => ({ turnIndex: m.turnIndex, tactic: m.tactic ?? m.tacticLabel })), riskSignals: (a.riskSignals ?? []).length };
  } catch (e) { result.verdictError = scrub(e?.message ?? e); }
  const errText = [error ?? "", ...(result.events ?? []).filter((e) => e.ev === "error" || e.ev === "close").map((e) => `${e.code ?? ""} ${e.msg ?? ""} ${e.reason ?? ""}`)].join(" ");
  const is429 = /(^|\D)429(\D|$)|RESOURCE_EXHAUSTED|quota/i.test(errText);
  const file = `${job.ch}-${job.id}-${job.level}-${job.persona}-${startedIso.replace(/[:.]/g, "-")}.json`;
  writeFileSync(path.join(outDir, file), JSON.stringify({ ...job, startedIso, error, is429, ...result }, null, 2), "utf8");
  console.log(JSON.stringify({ ...job, file, error: error ? error.slice(0, 160) : null, is429, turns: result.turns?.length ?? 0, ended: result.ended ?? null, route: result.route?.routeKey, deceived: result.verdict?.wasDeceived, escalated: result.escalated ?? null }));
  if (is429) { writeFileSync(stopFile, `${job.id}:${job.level}:${job.persona}`); console.log("429 감지 — 중단"); break; }
  await sleep(4000);
}
