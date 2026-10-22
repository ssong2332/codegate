// PR-A2(2026-10-20 · audit-A "확인 중이니 기다려라" 공회전) — 실시간(Gemini Live) 클라 배선의 순수 규칙.
//
// audit-A 재현: 참가자가 요구에 응한 뒤 사기범이 "확인 중 · 잠시만 기다려 주세요"만 4~5턴 반복했고(Live 3/3),
// 참가자가 침묵하면 Live 모델은 아무 말도 하지 않았다(R6 — 15초 무발화 3/3). PR-A1이 서버 쪽(NO_STALL_RULE ·
// 폴백 `planConfirmResult` · `deliverInCallSms` 응답 `confirmResultInstruction`)을 했고, 이 파일은 그 위의 Live 클라 쪽이다.
//
// | 갈래 | 원인(audit-A) | 이 파일의 규칙 | 호출부 |
// |---|---|---|---|
// | 확인 결과 주입 | R1 | `planConfirmResultInjection` · `releaseConfirmResultOnDispatch` | `session/play/page.tsx` |
// | 대기 뒤 침묵 넛지 | R6(F6) | `isStallLine` · `stepStallNudge` · `STALL_NUDGE_TEXT` | `GeminiVoiceSession.tsx` |
// | 자동 호 전환 실패 | R8(F8) | `planVerifyReconnectFailure` · `VERIFY_RECONNECT_FAILED_TEXT` | `session/play/page.tsx` |
//
// ⛔ 잎 모듈 — import 0(루트 러너가 확장자 없는 상대 import를 못 푼다). React · DOM · 타이머 0.
// ⛔ 끊기(`end_call`) 경로에 기대지 않는다 — 입력 어디에도 끊기 도구 · `END_CALL_LIVE_AVAILABLE`이 없다(그 상수가 false여도
//    넛지 · 결과 주입만으로 공회전이 풀려야 한다). 래치(`isEndLatched`) 뒤에는 넛지 · 재시도 · 주입 0(Architecture §79.20 (6) · G510).
// ⛔ 문면에 숫자 · 횟수 표현 · 번호/인증번호 · 따옴표 대사 · 끊기 어휘 0(F11/G130 · §79.20 (6) "넛지 문면에 끊기 어휘 0").

// ── 1. 확인 결과 주입(서버 `confirmResultInstruction` → Live 맥락 주입) ──────────────────────────────

/**
 * 세션 단위 상태 — 화면(부모)이 ref로 쥔다(leg 재마운트에도 살아남게).
 * - `claimed` = 이 세션에서 결과 신호 주입을 이미 정했다(세션당 1회).
 * - `pending` = 문자 도착 안내가 아직 G31 큐에 있어 그 안내가 큐를 떠날 때 뒤따라 넣을 결과 신호.
 */
export type ConfirmResultInjectionState = {
  claimed: boolean;
  pending: { afterText: string; text: string } | null;
};

export const INITIAL_CONFIRM_RESULT_INJECTION_STATE: ConfirmResultInjectionState = { claimed: false, pending: null };

export type ConfirmResultInjectionInput = {
  /** 서버 응답의 `confirmResultInstruction`(필수 계좌·링크 문자 도착 응답에만 실린다 — 서버 `buildConfirmResultField`). */
  instruction: string | undefined;
  /**
   * 같은 응답의 도착 안내를 G31 큐에 넣었으면 그 문자열(백스톱 경로). 모델 도구 경로는 도착 안내가 이미 도구 응답으로
   * 나갔으므로 `undefined`다.
   */
  announceQueuedText: string | undefined;
  /** 승인 · 종료 래치(`isEndLatched`). */
  latched: boolean;
};

export type ConfirmResultInjectionStep = { state: ConfirmResultInjectionState; injectNow: string | null };

/**
 * 판정표(⛔ 이 순서 그대로 — 위에서 첫 매치).
 *
 * | # | If | Then |
 * |---|---|---|
 * | 1 | 래치가 걸렸다 | 주입 0 · 상태 그대로 |
 * | 2 | 서버가 결과 신호를 싣지 않았다(빈 문자열 포함 — 선택 문자 · 인증번호 · 전환 뒤) | 주입 0 · 상태 그대로 |
 * | 3 | 이 세션에서 이미 정했다(`claimed`) | 주입 0 · 상태 그대로(세션당 1회) |
 * | 4 | 같은 응답의 도착 안내가 G31 큐에 있다 | 대기(`pending`) — 그 안내가 큐를 떠날 때 뒤따라 넣는다(안내보다 먼저 가지 않게) |
 * | 5 | 그 외(모델 도구 경로 — 도착 안내가 이미 도구 응답으로 나갔다) | **즉시 주입** |
 */
export function planConfirmResultInjection(
  state: ConfirmResultInjectionState,
  input: ConfirmResultInjectionInput,
): ConfirmResultInjectionStep {
  if (input.latched) return { state, injectNow: null };
  const text = input.instruction?.trim() ? input.instruction : null;
  if (text === null) return { state, injectNow: null };
  if (state.claimed) return { state, injectNow: null };
  const afterText = input.announceQueuedText?.trim() ? input.announceQueuedText : null;
  if (afterText !== null) return { state: { claimed: true, pending: { afterText, text } }, injectNow: null };
  return { state: { claimed: true, pending: null }, injectNow: text };
}

/**
 * G31 큐에서 지시 하나가 떠났다(`drainInstructionQueue`). 그것이 대기 중인 결과 신호의 도착 안내면 결과 신호를 뒤따라 낸다.
 * 다른 지시면 그대로 기다린다. (래치 뒤에는 드레인 자체가 멈추므로 여기까지 오지 않는다.)
 */
export function releaseConfirmResultOnDispatch(
  state: ConfirmResultInjectionState,
  dispatchedText: string,
): ConfirmResultInjectionStep {
  if (!state.pending || state.pending.afterText !== dispatchedText) return { state, injectNow: null };
  return { state: { ...state, pending: null }, injectNow: state.pending.text };
}

// ── 2. 대기 · 확인 중 뒤 침묵 넛지(R6 · F6) ────────────────────────────────────────────────────

/**
 * 사기범 턴이 "대기 · 확인 중"으로 끝났는가 — 판정표(⛔ 이 순서 그대로 — 위에서 첫 매치 · 새 형태가 나오면 임의로 넓히지 말고 행을 추가할 것).
 *
 * 용어: **마지막 실질 문장** = 두 어절 이상인 마지막 문장("…기다려 주세요. 고객님."의 호칭 · "네." 같은 한 어절 꼬리는 건너뛴다 —
 * 모든 문장이 한 어절이면 맨 끝 문장). **맨 끝 문장** = 꼬리를 건너뛰지 않은 진짜 마지막 문장.
 *
 * | # | If(그 턴의 사기범 전사) | Then |
 * |---|---|---|
 * | 1 | 비었다 | 아님 |
 * | 2 | 맨 끝 문장 또는 마지막 실질 문장이 `?`로 끝난다(참가자에게 물었다 — 그 뒤 침묵은 참가자 차례다 · "…확인 중입니다. 맞죠?" 포함) | 아님 |
 * | 3 | 마지막 실질 문장이 참가자에게 **기다림이 아닌 행동**을 청한다 — `~해 주세요/주십시오/주시면/주시겠어요` 앞말이 기다려·기다리·대기해·대기하가 아니다(A-2 리뷰 Major 2) | 아님("입금 확인되면 말씀해 주세요" · "지금 바로 이체해 주세요") |
 * | 4 | 마지막 실질 문장이 **결과 진술**이다 — 승인·완료·처리·확인·등록·접수 + 됐/되었/되셨(A-2 C안 ③). 단 **부정형**(안·못 + 됐 · 되지 않/못)은 결과가 아니다(C안 ④ — "아직 입금이 확인되지 않았습니다"는 대기 쪽이다) | 아님(대기 말 뒤에 결과를 냈다) |
 * | 5 | 턴 **전체**에 대기 · 확인 중 어휘가 있다 — 확인 중 · 확인하고 있 · 확인 절차 · 처리 중 · 처리하고 있 · 조회 중 · 확인되는 대로 · 처리되는 대로 · 확인되면 · 기다려/기다리 · 대기 중 · 지연 · 잠시만(C안 ① — 대기 문장 뒤에 설명이 붙은 턴도 잡는다) | **대기** |
 * | 6 | 그 외 | 아님 |
 *
 * 표본(audit-A 원문): "잠시만 기다려 주세요" · "확인되는 대로 바로 안내해 드릴게요" · "전산 처리 과정에서 조금 지연되고 있는데" ·
 * "아직 입금이 확인되지 않아서 대기 중입니다, 고객님. 지금 전산상에 … 들어와야…". ⚠️ "대기" 단독은 넣지 않았다("대기자"가 걸린다).
 */
const STALL_VOCABULARY =
  /확인\s*(?:하는\s*)?중|확인하고\s*있|확인\s*절차|처리\s*(?:하는\s*)?중|처리하고\s*있|조회\s*중|확인되는\s*대로|처리되는\s*대로|확인되면|기다려|기다리|대기\s*중|지연|잠시만/;

/** 3행 — 참가자에게 청하는 형태와 그 앞말. 앞말이 아래 `WAIT_REQUEST_HEAD`면 대기를 청한 것이다. */
const REQUEST_FORM = /(\S+?)\s*주(?:세요|십시오|시면|시겠어요|시겠습니까|실래요)/g;
const WAIT_REQUEST_HEAD = /^(?:기다려|기다리|대기해|대기하)/;
/** 4행 — 결과 진술의 어간(긍정 · 부정 둘 다 잡는다). 부정 여부는 `NEGATED_RESULT`가 가른다. */
const RESULT_STATEMENT = /(?:승인|완료|처리|확인|등록|접수)(?:\s*[이가])?\s*(?:(?:안|못)\s*)?(?:됐|되었|되셨|되지)/;
/** 4행 단서 — 부정형 결과(안·못 + 됐 · 되지 않/못). */
const NEGATED_RESULT =
  /(?:승인|완료|처리|확인|등록|접수)(?:\s*[이가])?\s*(?:안|못)\s*(?:됐|되었|되셨)|(?:승인|완료|처리|확인|등록|접수)되지\s*(?:않|못)/;

/** 두 어절 이상인 마지막 문장(한 어절 꼬리 — 호칭 · "네." — 는 건너뛴다). 전부 한 어절이면 맨 끝 문장. */
function lastSubstantiveSentence(text: string): string {
  const sentences = (text.match(/[^.?!\n]+[.?!]?/g) ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
  for (let i = sentences.length - 1; i >= 0; i -= 1) {
    if (/\s/.test(sentences[i])) return sentences[i];
  }
  return sentences[sentences.length - 1] ?? "";
}

/**
 * 판정표의 4행(결과 진술 · 부정 단서)을 켜고 끌 수 있는 판정 본체. ⛔ 제품 호출부는 `isStallLine`(전부 켬)만 쓴다 —
 * 끄는 옵션은 역검증(그 행을 뺀 사본에서 표본이 뒤집히는지) 전용이다.
 */
export function judgeStallLine(text: string, rows: { resultStatement: boolean; negatedResult: boolean }): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false; // 1행
  if (trimmed.endsWith("?")) return false; // 2행(맨 끝 문장)
  const last = lastSubstantiveSentence(trimmed);
  if (last.endsWith("?")) return false; // 2행(마지막 실질 문장)
  for (const m of last.matchAll(REQUEST_FORM)) {
    if (!WAIT_REQUEST_HEAD.test(m[1])) return false; // 3행
  }
  if (rows.resultStatement && RESULT_STATEMENT.test(last)) {
    const negated = rows.negatedResult && NEGATED_RESULT.test(last);
    if (!negated) return false; // 4행
  }
  return STALL_VOCABULARY.test(trimmed); // 5행(턴 전체) · 6행
}

export function isStallLine(text: string): boolean {
  return judgeStallLine(text, { resultStatement: true, negatedResult: true });
}

/**
 * 대기 뒤 침묵이 이 시간 지속되고 모델이 유휴면 넛지. **판단값** — 문자 안내 침묵 넛지(`SMS_MENTION_SILENCE_SEC`,
 * §82.4.2 · OQ-A133)와 같은 8초로 둔다(설계 표에 이 행이 아직 없다 — architect 반영 대상).
 */
export const STALL_SILENCE_SEC = 8;

/**
 * 넛지 문면 — `SILENCE_NUDGE_TEXT`와 같은 **오케스트레이션 신호**라 클라가 쥔다(모델이 응답할 입력이지 낭독 대상이 아니다).
 * ⛔ 숫자 · 횟수 · 번호 · 따옴표 · 끊기 어휘 0(`stallRecovery.test.ts`가 고정).
 */
export const STALL_NUDGE_TEXT =
  "(상대가 말이 없다. 확인하거나 처리하던 일의 결과를 그럴듯하게 정해 지금 알려 주고, 곧바로 다음 요구로 넘어가라. 아직 확인 중이라거나 기다려 달라는 말은 하지 마라.)";

export type StallNudgeState = {
  /** 넛지를 기다리는 대기 턴의 끝 시각(ms). `null` = 대기 없음. */
  armedAt: number | null;
  /** 마지막 참가자 발화 이후 이미 넛지했는가 — 참가자가 침묵하는 동안 넛지가 다시 나가지 않게(자기 구동 루프 0 · G99 취지). */
  firedSinceUserSpeech: boolean;
};

export const INITIAL_STALL_NUDGE_STATE: StallNudgeState = { armedAt: null, firedSinceUserSpeech: false };

export type StallNudgeEvent =
  /** 비어 있지 않은 사기범 턴이 끝났다(`turnComplete` — 빈 마감 제외). */
  | { type: "scammerTurn"; nowMs: number; stallLike: boolean; participantHasSpoken: boolean }
  /** 참가자가 말했다(음성 전사 조각 · 타이핑 전송 · 로컬 발화 시작). */
  | { type: "userSpeech"; nowMs: number }
  /**
   * 점검. `modelIdle` · `userSpeakingLocally`는 문자 안내 침묵 넛지와 같은 신호다. `otherNudgeArmed` = 문자 안내 침묵 넛지가
   * 대기 중(그쪽이 먼저다 — 같은 침묵에 넛지 둘이 겹치지 않게).
   */
  | { type: "tick"; nowMs: number; modelIdle: boolean; userSpeakingLocally: boolean; otherNudgeArmed: boolean };

export type StallNudgeStep = { state: StallNudgeState; fire: boolean };

/**
 * 대기 뒤 침묵 넛지 전이(결정론적).
 *
 * | 이벤트 | 조건 | 결과 |
 * |---|---|---|
 * | `scammerTurn` | 참가자가 아직 한 번도 말하지 않았다(오프닝 구간) | 대기 해제 |
 * | `scammerTurn` | 마지막 참가자 발화 이후 이미 넛지했다 | 대기 해제(넛지 뒤 계속 침묵해도 다시 나가지 않는다) |
 * | `scammerTurn` | 대기 · 확인 중으로 끝났다 | 이 시각으로 대기 시작 |
 * | `scammerTurn` | 그 외 | 대기 해제(마지막 턴이 대기가 아니다) |
 * | `userSpeech` | — | 대기 해제 · 넛지 이력 초기화 |
 * | `tick` | 대기 없음 · 기한 전 · 모델 발화 중 · 참가자 발화 중 · 문자 안내 넛지 대기 중 | 변화 없음(보류) |
 * | `tick` | 그 외(기한 지남 · 모델 유휴 · 로컬 발화 없음) | **넛지 1회** · 대기 해제 · 넛지 이력 표시 |
 */
export function stepStallNudge(state: StallNudgeState, event: StallNudgeEvent): StallNudgeStep {
  switch (event.type) {
    case "scammerTurn":
      if (!event.participantHasSpoken || state.firedSinceUserSpeech || !event.stallLike) {
        return { state: { ...state, armedAt: null }, fire: false };
      }
      return { state: { ...state, armedAt: event.nowMs }, fire: false };
    case "userSpeech":
      return { state: INITIAL_STALL_NUDGE_STATE, fire: false };
    case "tick":
      if (state.armedAt === null) return { state, fire: false };
      if (event.nowMs - state.armedAt < STALL_SILENCE_SEC * 1000) return { state, fire: false };
      if (!event.modelIdle || event.userSpeakingLocally || event.otherNudgeArmed) return { state, fire: false };
      return { state: { armedAt: null, firedSinceUserSpeech: true }, fire: true };
  }
}

/** 넛지 발동 로그 1줄 — 원인 범주는 문자 안내 넛지와 같은 `cause:"silence"`(AC-098 (c) 집계) · 갈래 `trigger:"stall"`. 숫자만. */
export function formatStallNudgeLog(input: { sinceScammerTurnMs: number }): string {
  return `cause:"silence" trigger:"stall" sinceScammerTurnMs=${Math.round(input.sinceScammerTurnMs)}`;
}

// ── 3. 자동 호 전환 실패(R8 · F8) ─────────────────────────────────────────────────────────────

/** 자동 호 전환 시도 상한 — 첫 시도 + 재시도 1회. (서버 `deliverVerifyReconnect`는 `placedAt`이 있으면 다시 쓰지 않는다 — 멱등.) */
export const VERIFY_RECONNECT_MAX_ATTEMPTS = 2;

/**
 * 재시도까지 실패했을 때 Live에 넣는 맥락 1줄. 모델은 이미 "연결해 드리겠다, 잠시만"이라고 말한 상태다(audit-A R8) —
 * 실패를 고백하거나 같은 약속을 반복하지 말고 하던 이야기로 돌아가게 한다. ⛔ 창구명 · 번호 · 기전 서술 0(`VERIFY_DECLINE_*`와 같은 기준).
 */
export const VERIFY_RECONNECT_FAILED_TEXT =
  "(확인 부서 연결은 지금 이뤄지지 않았다. 연결이 안 됐다고 말하지 말고, 연결해 주겠다는 말도 더 하지 말고, 지금 하던 이야기를 그대로 이어가라.)";

export type VerifyReconnectFailurePlan =
  | { action: "retry" }
  | { action: "inject"; text: string }
  | { action: "none" };

/**
 * `deliverVerifyReconnect` 실패 1건 뒤 할 일 — 판정표(⛔ 이 순서 그대로).
 *
 * | # | If | Then |
 * |---|---|---|
 * | 1 | 래치가 걸렸다 | `none`(재시도 · 주입 0 — G510) |
 * | 2 | 시도한 횟수 < 상한(첫 시도만 실패) | `retry` |
 * | 3 | 폴백 경로다(클라가 Live에 넣을 곳이 없다 — 폴백은 서버가 매 턴 프롬프트를 조립한다) | `none` |
 * | 4 | 그 외(실시간 · 재시도까지 실패) | `inject` |
 */
export function planVerifyReconnectFailure(input: {
  attemptsMade: number;
  latched: boolean;
  callMode: "realtime" | "fallback";
}): VerifyReconnectFailurePlan {
  if (input.latched) return { action: "none" };
  if (input.attemptsMade < VERIFY_RECONNECT_MAX_ATTEMPTS) return { action: "retry" };
  if (input.callMode !== "realtime") return { action: "none" };
  return { action: "inject", text: VERIFY_RECONNECT_FAILED_TEXT };
}

// ── 4. 반복 · 대기 정체 차단(§104 — 전수 검수 2차 F4 · F11 · DECISIONS #219) ────────────────────────────
// 재현(실 키 Live): ① 기관 사칭 중급 거절형 — 성함·생년월일 요구 3턴 연속(공통 [진행 강제] 1문장으로는 개선 없음) ② 요구를 다 쓴 뒤
// "대기해 주십시오 · 잠시만요"가 참가자 발화 사이사이 6턴(끊기 도구는 사용자 결정으로 꺼져 있다 — DECISIONS #200 · `END_CALL_LIVE_AVAILABLE`).
// 위 2절 넛지는 참가자가 **침묵할 때만** 나가므로 ②를 못 푼다. 이 절은 직전 두 사기범 턴을 보고, 반복이 **이미 일어난 뒤에만** 맥락 1줄을
// 넣는다(`turnComplete:false` — 응답 유발 0 · 참가자의 다음 발화에 대한 응답에 실린다). ⛔ 끊기 경로에 기대지 않는다(이 절 입력에 끊기 0).
// 텍스트 폴백의 짝은 서버 `functions/src/roleplay/repeatBreak.ts`(2 · 3행과 같은 정규식 · 임계값 — `stallRecovery.test.ts` [§104 짝]이 대조).

/** 6행 임계값 — 서버 `REPEAT_SIMILARITY_THRESHOLD`와 같은 값. */
export const REPEAT_SIMILARITY_THRESHOLD = 0.6;
/** 6행 — 서버 `REPEAT_MIN_CHARS`와 같은 값. */
export const REPEAT_MIN_CHARS = 8;
/** 5행 — 서버 `IDENTITY_ITEM_PATTERNS`와 같은 정규식. */
export const IDENTITY_ITEM_PATTERNS: Readonly<Record<string, RegExp>> = {
  name: /성함|이름/,
  birth: /생년월일|생일/,
  rrn: /주민\s*(?:등록\s*)?번호|뒤\s*(?:7|일곱)\s*자리/,
  address: /주소/,
};
/** 5행 — 서버 `IDENTITY_REQUEST_FORM`과 같은 정규식. */
export const IDENTITY_REQUEST_FORM = /(?:불러|말씀해|말씀|말해|알려|읊어)\s*(?:주|줘|달)|부탁\s*(?:드|합)/;
/**
 * 4행 보강 — 2절 판정표 밖의 "대기해 주십시오"(2절 어휘는 "대기 중"만 본다 — "대기자" 오탐 회피). 이 절에서만 대기 말로 친다
 * (⛔ 2절 넛지 판정 `isStallLine`은 바꾸지 않는다).
 */
const WAIT_REQUEST_LINE = /대기(?:해|하여|하고)\s*(?:주|계|있어|있으)|대기\s*부탁/;

function requestedIdentityItems(text: string): Set<string> {
  // §104 실측(2026-10-22 대출 중급 따름형) — "생년월일 확인 감사합니다. … 몇 건인지 확인 부탁드립니다"가 생년월일 요구로 잡혔다 ⇒ 항목 낱말과 요구 형태가
  // **같은 문장**에 있을 때만 그 항목을 요구한 것으로 센다.
  const out = new Set<string>();
  for (const sentence of text.split(/(?<=[.?!])\s+|\n+/)) {
    if (!IDENTITY_REQUEST_FORM.test(sentence)) continue;
    for (const key of Object.keys(IDENTITY_ITEM_PATTERNS)) if (IDENTITY_ITEM_PATTERNS[key]!.test(sentence)) out.add(key);
  }
  return out;
}

function normalizeForSimilarity(text: string): string {
  return text.replace(/[\s.,!?~…·'"“”‘’()\-]/g, "");
}

function bigramSet(text: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < text.length - 1; i += 1) out.add(text.slice(i, i + 2));
  return out;
}

/** 글자 2-gram Dice 유사도(서버 `bigramSimilarity`와 같은 정의). */
export function bigramSimilarity(a: string, b: string): number {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (na.length < REPEAT_MIN_CHARS || nb.length < REPEAT_MIN_CHARS) return 0;
  const ga = bigramSet(na);
  const gb = bigramSet(nb);
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared += 1;
  return (2 * shared) / (ga.size + gb.size);
}

function isWaitTurn(text: string): boolean {
  return isStallLine(text) || WAIT_REQUEST_LINE.test(text);
}

export type LiveRepeatBreakKind = "exhausted" | "stall" | "identity" | "similar";

/**
 * 2-b행 — 참가자 자금 소진 선언(서버 `EXHAUSTED_DECLARATION`과 같은 정규식). 2026-10-22 사용자 실기 대본(검찰 고급): *"이제 탈탈 털렸어. 나도 이제 없어.
 * 돈 없어"* · *"했다고"* 뒤에도 "남은 적금과 대출 가능액도"가 끝없이 이어졌다. ⚠️ 표기를 본다(의미 아님) — 표본 밖 표현은 못 잡는다.
 */
export const EXHAUSTED_DECLARATION =
  /돈\s*(?:이|은|도)?\s*(?:더\s*|이제\s*)?없|(?:더|이제|남은)\s*(?:돈|게|건|것)?\s*(?:이|은)?\s*(?:하나도\s*)?없|다\s*털렸|탈탈|빈털터리|한\s*푼도|잔고\s*(?:가)?\s*없|전부\s*(?:다\s*)?보냈/;

/**
 * 사기범 턴이 끝날 때마다 1회 — 판정표(⛔ 이 순서 그대로 · 새 유형은 행을 추가할지 먼저 묻는다).
 *
 * | # | If(A = 직전 사기범 턴, B = 방금 끝난 사기범 턴) | Then |
 * |---|---|---|
 * | 1 | 래치가 걸렸다 | 없음(G510) |
 * | 2 | 참가자가 아직 한 번도 말하지 않았다(오프닝 구간) | 없음 |
 * | 2-b | 이 턴이 답한 참가자 발화가 자금 소진 선언이다("돈 없어" · "다 털렸어" · "전부 보냈어" — `EXHAUSTED_DECLARATION`) | `exhausted`(직전 턴 없어도) |
 * | 3 | A가 없다 | 없음 |
 * | 4 | A와 B가 모두 대기 말이다(2절 `isStallLine` 또는 "대기해 주십시오"류) | `stall` |
 * | 5 | A와 B가 같은 인적사항 항목(성함 · 생년월일 · 주민번호 · 주소)을 요구하는 형태로 꺼냈다 | `identity` |
 * | 6 | A와 B의 글자 2-gram 유사도 ≥ 0.6 | `similar` |
 * | 7 | 그 외 | 없음 |
 * - 5행이 "같은 항목"만 보는 이유: 순순히 따르는 참가자에게 성함 → 주민번호처럼 **다른** 항목을 잇는 것은 정상 진행이다.
 * - 상태 저장 0 — 모델이 주입을 따르면 다음 경계에서 조건이 풀린다. 따르지 않고 또 반복하면 다시 넣는다(반복 1건당 1줄).
 */
export function decideLiveRepeatBreak(input: {
  previousScammerTurn: string | undefined;
  scammerTurn: string;
  latched: boolean;
  participantHasSpoken: boolean;
  /** §104 — 이 사기범 턴이 답한 참가자 발화(부재 = 판정 안 함). */
  lastParticipantText?: string;
}): LiveRepeatBreakKind | null {
  if (input.latched) return null; // 1행
  if (!input.participantHasSpoken) return null; // 2행
  if (input.lastParticipantText !== undefined && EXHAUSTED_DECLARATION.test(input.lastParticipantText)) return "exhausted"; // 2-b행
  const a = input.previousScammerTurn;
  if (a === undefined || a.trim().length === 0) return null; // 3행
  const b = input.scammerTurn;
  if (isWaitTurn(a) && isWaitTurn(b)) return "stall"; // 4행
  const itemsA = requestedIdentityItems(a);
  for (const item of requestedIdentityItems(b)) {
    if (itemsA.has(item)) return "identity"; // 5행
  }
  if (bigramSimilarity(a, b) >= REPEAT_SIMILARITY_THRESHOLD) return "similar"; // 6행
  return null; // 7행
}

/**
 * 주입 문면 — 2절 `STALL_NUDGE_TEXT`와 같은 오케스트레이션 신호(클라 소유 · 낭독 대상 아님).
 * `identity` · `similar`는 서버 `REPEAT_BREAK_*_INSTRUCTION`과 글자 단위로 같다(짝 테스트). ⛔ 숫자 · 횟수 · 따옴표 · 끊기 어휘 0.
 */
export const LIVE_REPEAT_BREAK_TEXT: Readonly<Record<LiveRepeatBreakKind, string>> = {
  exhausted:
    "(상대가 더 보낼 돈이나 줄 정보가 없다고 분명히 말했다. 같은 요구를 다시 하지 마라. 대출처럼 아직 권하지 않은 다른 수단이 있으면 그것만 권하고, 이미 권했거나 상대가 그것도 거절하면 더 요구할 것이 남지 않은 것이니 [진행 강제]의 통화 끝내기 항목이 정한 대로 하라.)",
  stall:
    "(너는 직전 대답과 그 앞 대답에서 대기하라거나 확인 중이라는 말을 했다. 이번 대답에서는 대기하라거나 확인 중이라는 말을 하지 말고, 지금까지 받은 것을 근거로 새 요구를 꺼내라 — 남은 돈이나 다른 계좌의 돈, 추가 정보, 주변 사람이나 은행에 알리지 말라는 구체적인 지시 중 하나로 상황을 앞으로 움직여라. 더 요구할 것이 정말 남지 않았으면 [진행 강제]의 통화 끝내기 항목이 정한 대로 하라.)",
  identity:
    "(너는 직전 대답과 그 앞 대답에서 같은 인적사항을 달라고 했다. 상대가 그 정보를 아직 주지 않았으면 이번 대답에서는 그 정보를 다시 달라고 하지 말고, 다른 수법이나 다른 요구로 넘어가라 — 불이익 암시, 확인 절차 차단, 비밀 유지 요구처럼 아직 쓰지 않은 카드를 골라라.)",
  similar:
    "(너는 직전 대답과 그 앞 대답에서 거의 같은 말을 했다. 이번 대답에서는 그 말을 되풀이하지 말고, 다른 수법이나 다른 요구, 다른 이유를 꺼내 상황을 앞으로 움직여라. 더 요구할 것이 정말 남지 않았으면 [진행 강제]의 통화 끝내기 항목이 정한 대로 하라.)",
};

/** 주입 로그 1줄 — 종류만(대사 0 · G170). */
export function formatLiveRepeatBreakLog(kind: LiveRepeatBreakKind): string {
  return `cause:"repeat" kind:"${kind}"`;
}
