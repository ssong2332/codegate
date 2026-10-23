// §82.4 (T1) · §82.3.4 (N1) — 연속 발화 제거의 클라 순수 규칙(docs/Architecture.md §82 · AC-098 · S3).
//
// ⭐ 왜 필요한가(S1 실측, docs/research/s1-live-turn-measurement-2026-10.md): 문자 도착 안내를
// `turnComplete:true` 텍스트 턴으로 넣으면 모델이 **사용자 차례를 건너뛰고 한 턴을 더 말한다** —
// 연속 발화 14회 전부가 그 직후였다(§3.1). 같은 안내를 `turnComplete:false`(맥락 주입)로 넣으면
// 10초 내 응답 유발 0/2 · 다음 응답에 반영 2/2였다(§3.2) ⇒ 문자 · 확인 권유 안내는 맥락 주입으로만 보낸다.
//
// 순수 함수만 둔다(React · DOM · 타이머 없음) — 호출부(`GeminiVoiceSession` · `session/play/page.tsx`)가
// 이벤트를 넣고 결과대로 전송 · 기록한다. 브라우저 이벤트에 건 판정은 게이트를 전건 통과해도 틀린 것을
// 못 잡으므로(이 저장소의 반복 교훈) 판정은 전부 여기서 단위 테스트로 고정한다.

// ── 지시 종류별 전달 방식(§82.4.2 표) ─────────────────────────────────────────────

/**
 * 실시간 세션에 넣는 오케스트레이션 지시의 전달 방식.
 *
 * | 값 | 지시 | 전송 |
 * |---|---|---|
 * | `smsAnnounce` | 문자 도착 안내(`announceInstruction`) | 맥락 주입(`turnComplete:false`) + 침묵 넛지 대상 |
 * | `verifyAnnounce` | 확인 창구 권유(`verify` announce) | 맥락 주입(`turnComplete:false`) |
 * | `speakerSwitch` | 확인 창구 재연결 지시(`reconnectInstruction`) | 화자 전환 첫 발화 — `relayGreeting` 텍스트 턴(`turnComplete:true`, §71.5 큐 경유) |
 * | `smsNudge` | 문자 백스톱 넛지(서버 `nudgeInstruction` — T191 문자 도달 조건 설계 "백스톱" 표가 정한 행) | 맥락 주입(`turnComplete:false`) · **침묵 넛지 대상 아님**(문자가 아직 안 갔다 — "방금 보낸 문자" 문면이 거짓이 된다) |
 *
 * | `confirmResult` | PR-A2 — 확인 결과 신호(서버 `confirmResultInstruction`, 조건형 1줄 · 필수 계좌·링크 문자 도착 뒤 세션당 1회) | 맥락 주입(`turnComplete:false`) · **G31 큐 밖**(`stallRecovery.ts` `planConfirmResultInjection`) · 침묵 넛지 대상 아님 |
 * | `verifyReconnectFailed` | PR-A2 — 자동 호 전환이 재시도까지 실패(`stallRecovery.ts` `VERIFY_RECONNECT_FAILED_TEXT`) | 맥락 주입(`turnComplete:false`) · **G31 큐 밖** · 침묵 넛지 대상 아님 |
 * | `repeatBreak` | §104 — 직전 두 사기범 턴이 대기 말 · 같은 인적사항 요구 · 거의 같은 말(`stallRecovery.ts` `decideLiveRepeatBreak`) | 맥락 주입(`turnComplete:false`) · **G31 큐 밖** · 침묵 넛지 대상 아님 |
 *
 * ⛔ 표에 없는 지시가 생기면 행을 추가할지 먼저 묻는다(§82.4.2 머리말). ⚠️ 위 두 행(`confirmResult` ·
 * `verifyReconnectFailed`)은 PR-A2 지시(오케스트레이터 2026-10-20)로 추가했다 — 설계 표(§82.4.2) 반영은 architect 몫으로 남는다.
 * `repeatBreak` 행은 §104(메인 세션 지시 — 전수 검수 2차 결함 수정)로 추가했다.
 * | `chatDuringCall` | §121.7 — 통화 중 대화방 카톡 1쌍(참가자 · 사기범 답장) 메모(`chatDuringCall.ts`) | 맥락 주입(`turnComplete:false`) · **G31 큐 밖** · 침묵 넛지 대상 아님 |
 * `chatDuringCall` 행은 §121.7(메인 결정 "두 채널 맥락" — 통화 · 메신저 동시 사용 PR-3)으로 추가했다.
 */
export type InstructionDelivery =
  | "smsAnnounce"
  | "verifyAnnounce"
  | "speakerSwitch"
  | "smsNudge"
  | "confirmResult"
  | "verifyReconnectFailed"
  | "repeatBreak"
  | "chatDuringCall";

/** G31 큐(`@/lib/verifyintercept` `PendingInstruction`) 항목 → 전달 방식. */
export function deliveryForInstruction(item: {
  priority: "sms" | "verify";
  speakerSwitch?: boolean;
  smsNudge?: boolean;
}): InstructionDelivery {
  if (item.speakerSwitch) return "speakerSwitch";
  if (item.smsNudge) return "smsNudge";
  return item.priority === "sms" ? "smsAnnounce" : "verifyAnnounce";
}

/**
 * 이 지시를 맥락 주입(`turnComplete:false`)으로 보내는가. ⛔ X5 — 문자 · 확인 권유 안내는 **절대**
 * `turnComplete:true`로 보내지 않는다. 전달 방식이 없으면(구 호출부) 안전한 쪽(맥락 주입)으로 본다.
 */
export function sendsAsContextInjection(delivery: InstructionDelivery | undefined): boolean {
  return delivery !== "speakerSwitch";
}

// ── 침묵 넛지(§82.4.2 "침묵 넛지(신규)" 행 · G543) ─────────────────────────────────

/**
 * 맥락 주입 뒤 이 시간 동안 사용자 발화가 없고 모델이 유휴면 넛지 1회. **판단값**(§82.4.2 —
 * `SMS_MENTION_SILENCE_SEC`=8초, OQ-A133). 값을 바꾸려면 설계 표를 먼저 고친다.
 */
export const SMS_MENTION_SILENCE_SEC = 8;

/** 기한이 지났는데 모델이 말하는 중이면 이 간격으로 다시 본다(유휴가 되는 순간을 놓치지 않게). */
export const SILENCE_NUDGE_RECHECK_MS = 1000;

/**
 * 침묵 넛지 문면 — §82.4.2 표 원문 그대로. 오프닝 트리거(`OPENING_TRIGGER_TURN`)와 같은 **오케스트레이션
 * 신호**라 클라가 쥔다(모델이 응답할 입력일 뿐 낭독 대상이 아니다).
 */
export const SILENCE_NUDGE_TEXT = "(상대가 말이 없다. 방금 보낸 문자를 한 문장으로 언급하고 기다려라.)";

/** 침묵 넛지 로그 접두어 — production에서도 남긴다(지연 로그 `LIVE_LATENCY_LOG_PREFIX`와 같은 관례). */
export const LIVE_TURN_LOG_PREFIX = "[live-turn]";

export type SilenceNudgeState = {
  /** 넛지를 기다리는 맥락 주입의 시각(ms). `null` = 대기 중인 주입 없음(취소됐거나 이미 넛지함). */
  armedAt: number | null;
};

export const INITIAL_SILENCE_NUDGE_STATE: SilenceNudgeState = { armedAt: null };

export type SilenceNudgeEvent =
  /** 맥락 주입을 보냈다. 문자 안내(`smsAnnounce`)만 넛지 대상이다(문면이 "방금 보낸 문자"다). */
  | { type: "injected"; delivery: InstructionDelivery; nowMs: number }
  /** 참가자가 말했다(음성 전사 조각 수신 · 타이핑 전송). 대기 중인 넛지를 취소한다. */
  | { type: "userSpeech"; nowMs: number }
  /**
   * 점검. `modelIdle` = 모델 턴 진행 중 아님 · 응답 대기 아님 · 도구 대기 아님.
   * `userSpeakingLocally` = 로컬 마이크 입력 레벨이 지금 임계를 넘는 중(반이중 게이트 · 사용자 파형과 같은 신호
   * `userSpeechLevel.ts` `nextUserSpeechDebounceState(...).speaking`). 전사는 발화 **뒤**에 오므로 이 신호로 보류한다.
   */
  | { type: "tick"; nowMs: number; modelIdle: boolean; userSpeakingLocally: boolean };

export type SilenceNudgeStep = { state: SilenceNudgeState; fire: boolean };

/**
 * 침묵 넛지 전이(결정론적).
 *
 * | 이벤트 | 조건 | 결과 |
 * |---|---|---|
 * | `injected` | `smsAnnounce` | 이 시각으로 대기 시작(새 주입이 이전 대기를 대신한다 — 주입 1건당 1회) |
 * | `injected` | 그 외 | 변화 없음 |
 * | `userSpeech` | — | 대기 취소 |
 * | `tick` | 대기 중 · 로컬 입력 레벨이 임계 초과(참가자가 말하는 중) | 변화 없음(보류 — 전사가 오면 `userSpeech`로 취소된다) |
 * | `tick` | 대기 중 · `nowMs − armedAt ≥ 8초` · 모델 유휴 · 로컬 발화 없음 | **넛지 1회** + 대기 해제(같은 주입으로 두 번 나가지 않는다) |
 * | `tick` | 그 외 | 변화 없음 |
 */
export function stepSilenceNudge(state: SilenceNudgeState, event: SilenceNudgeEvent): SilenceNudgeStep {
  switch (event.type) {
    case "injected":
      if (event.delivery !== "smsAnnounce") return { state, fire: false };
      return { state: { armedAt: event.nowMs }, fire: false };
    case "userSpeech":
      if (state.armedAt === null) return { state, fire: false };
      return { state: { armedAt: null }, fire: false };
    case "tick":
      if (state.armedAt === null) return { state, fire: false };
      if (event.nowMs - state.armedAt < SMS_MENTION_SILENCE_SEC * 1000) return { state, fire: false };
      if (!event.modelIdle) return { state, fire: false };
      if (event.userSpeakingLocally) return { state, fire: false };
      return { state: { armedAt: null }, fire: true };
  }
}

/**
 * 로컬 입력 레벨이 꺼짐 → 켜짐으로 바뀌었는가(발화 시작). 호출부는 이 순간을 **사용자 발화**(`userSpeech`)로 넣는다 —
 * 전사가 늦게 와도 말을 시작한 참가자 위로 넛지가 나가지 않게(리뷰 M3). AI 발화 중에는 레벨 자체가 억제돼 있어
 * (`suppressed: agentSpeaking`) 에코가 넛지를 취소하지 않는다.
 */
export function localSpeechStarted(prevSpeaking: boolean, nextSpeaking: boolean): boolean {
  return !prevSpeaking && nextSpeaking;
}

/** 넛지 발동 로그 1줄 — 원인 범주 `cause:"silence"`(AC-098 (c) 별도 집계 · OQ-A133). 전사 · 식별자 0. */
export function formatSilenceNudgeLog(input: { sinceInjectionMs: number }): string {
  return `cause:"silence" sinceInjectionMs=${Math.round(input.sinceInjectionMs)}`;
}

// ── 계수 규칙(§82.3.4 · N1 · G539 계수 부분) ─────────────────────────────────────

/**
 * 실시간 경로 클라 카운터.
 * - `userTurns` = **비어 있지 않은** 사용자 전사 flush 수(음성 · 타이핑 공통).
 * - `scammerTranscriptTurns` = 비어 있지 않은 사기범 전사 flush 수(끼어들기로 끊긴 조각 flush 포함) —
 *   `messages`의 scammer 문서와 1:1이다(오프닝 문서 1개는 제외 — 앵커 쪽 +1은 S5b).
 * ⛔ 폐기: "모든 `turnComplete` +1"(지시 턴 · 빈 턴까지 셌다 — S1 P2 · N1).
 */
export type TurnCounters = { userTurns: number; scammerTranscriptTurns: number };

export const INITIAL_TURN_COUNTERS: TurnCounters = { userTurns: 0, scammerTranscriptTurns: 0 };

/** 전사 flush 1건을 센다. 공백뿐인 텍스트는 어느 카운터도 올리지 않는다. */
export function countTranscriptFlush(
  counters: TurnCounters,
  role: "user" | "scammer",
  text: string,
): TurnCounters {
  if (!text.trim()) return counters;
  return role === "user"
    ? { ...counters, userTurns: counters.userTurns + 1 }
    : { ...counters, scammerTranscriptTurns: counters.scammerTranscriptTurns + 1 };
}

/**
 * N1 — 이 `turnComplete`가 **빈 마감**인가(직전 경계 이후 모델 오디오 0 · 사기범 전사 0).
 * 빈 마감은 사기범 턴 경계가 아니다 — 경계 콜백(`onScammerTurnComplete`)을 부르지 않고 어느 카운터도 올리지 않는다.
 * ⚠️ S1 §3.5의 모양은 *"`interrupted` 뒤 76~229ms에 오디오 · 전사 없는 `turnComplete` 1개"*(3/3)다. 그 `turnComplete`는
 * **끊긴 턴의 마감**이다 — 끊기기 전에 오디오가 나갔다면 "직전 경계 이후"에 내용이 있으므로 빈 마감이 **아니다**
 * (끊긴 턴의 내용이 그 마감에 귀속되고, 끊긴 조각 전사는 `interrupted` 때 이미 1건 세어졌다). 빈 마감이 되는 것은
 * 직전 경계 이후 모델이 아무 소리도 내지 않은 채 끊기거나 마감한 경우뿐이다(예: 응답 첫 오디오 전에 끼어들기).
 */
export function isEmptyTurnComplete(input: {
  audioSinceBoundary: boolean;
  scammerTextSinceBoundary: boolean;
}): boolean {
  return !input.audioSinceBoundary && !input.scammerTextSinceBoundary;
}

// ── AC-098 (b)(g) 검사 — 지시 유발 연속 발화 ─────────────────────────────────────

/** 대화 기록 1턴. `cause`는 사기범 턴을 만든 원인(사용자 발화에 대한 응답이면 `"reply"`). */
export type ObservedTurn =
  | { role: "user" }
  | { role: "scammer"; cause: "opening" | "reply" | "instruction" | "silence" };

/**
 * 연속 발화(두 사기범 턴 사이에 사용자 발화가 없음 — AC-098 (a))를 원인별로 센다. 오프닝은 제외한다.
 * 원인은 **뒤쪽** 턴의 `cause`로 분류한다(그 턴이 사용자 차례를 건너뛰었다).
 */
export function countConsecutiveScammerTurns(turns: readonly ObservedTurn[]): {
  instruction: number;
  silence: number;
  other: number;
} {
  const out = { instruction: 0, silence: 0, other: 0 };
  let previousWasScammer = false;
  for (const turn of turns) {
    if (turn.role === "user") {
      previousWasScammer = false;
      continue;
    }
    if (previousWasScammer && turn.cause !== "opening") {
      if (turn.cause === "instruction") out.instruction += 1;
      else if (turn.cause === "silence") out.silence += 1;
      else out.other += 1;
    }
    previousWasScammer = true;
  }
  return out;
}
