// ⭐ §105.2.6(메인 승인 2026-10-22 — 실기 "말해도 묵묵부답" · 실 키 실측 "네" · "어" 한 음절은 서버가 발화로 감지하지 못함 §105.2.4~5)
// 화면 쪽 보완: 이 기기의 마이크 레벨로는 참가자가 말했는데, 말이 끝나고 `UNHEARD_WAIT_MS` 안에 서버 입력 인식(`inputTranscription`)이
// 0이고 모델도 대답을 시작하지 않으면 → 모델에 "잘 안 들렸다" 한 줄을 넣는다(전사에 기록되지 않는 `silence` 종류 클라 턴).
// 서버의 발화 감지 설정(§50.8 START_SENSITIVITY_LOW · prefixPaddingMs 300)은 건드리지 않는다 — 자기 끊김 회귀 위험 0.
//
// 판정표(위에서부터 먼저 맞는 행):
// | # | 조건 | 결과 |
// |---|---|---|
// | 1 | 막힘(사기범이 말하는 중 = 반이중 게이트 닫힘 · 모델 응답 대기/진행 · 음소거 · 끊기 래치 · 화면 가려짐) | 후보 버림 · 발동 0 |
// | 2 | 이번 프레임 레벨 > `UNHEARD_LEVEL_THRESHOLD` | 후보 시작(없으면) · 소리 길이 누적 · 최대 레벨 갱신 |
// | 3 | 후보가 있고 마지막 큰 소리 뒤 `UNHEARD_WAIT_MS`가 아직 안 됨 | 기다림 |
// | 4 | 그 사이 서버 입력 인식이 1조각이라도 옴 | 후보 버림(서버가 들었다) |
// | 5 | 소리 길이 < `UNHEARD_MIN_VOICED_MS` 또는 최대 레벨 < `UNHEARD_MIN_PEAK_LEVEL` | 후보 버림(기침 · 탁 소리 같은 짧은 피크 · 작은 소음) |
// | 6 | 직전 발동 뒤 `UNHEARD_COOLDOWN_MS` 안 | 후보 버림(연속 발동 0) |
// | 7 | 이 통화 발동이 `UNHEARD_MAX_PER_CALL`회에 도달 | 후보 버림 |
// | 8 | 그 밖 | **발동 1회** · 후보 버림 |
//
// 순수 함수만 둔다(타이머 · DOM 0) — 호출부(GeminiVoiceSession)가 레벨 표본 프레임(rAF)마다 넣는다. `unheardReply.test.ts`.

/** 레벨 문턱 — 화면의 "말하는 중" 표시(`USER_SPEECH_AMPLITUDE_THRESHOLD`)와 같은 값(바이트 시간영역 RMS · 128 기준 편차). */
export const UNHEARD_LEVEL_THRESHOLD = 10;
/** 짧은 피크 거름 — 문턱을 넘은 시간 합의 하한(판단값). 사람의 "네"(약 0.2~0.4초)는 넘고 탁 소리(수십 ms)는 거른다. */
export const UNHEARD_MIN_VOICED_MS = 120;
/** 작은 소음 거름 — 후보 안 최대 레벨 하한(판단값 · 문턱보다 조금 위). */
export const UNHEARD_MIN_PEAK_LEVEL = 14;
/** 말이 끝난 뒤 서버 인식을 기다리는 시간(메인 지시 1.5초). */
export const UNHEARD_WAIT_MS = 1500;
/** 발동 뒤 다시 발동하지 않는 시간(판단값). */
export const UNHEARD_COOLDOWN_MS = 20_000;
/** 한 통화 상한(판단값). */
export const UNHEARD_MAX_PER_CALL = 5;
/** 프레임 간격 상한 — 탭이 잠깐 멈췄다 돌아와도 소리 길이를 부풀리지 않는다. */
const MAX_FRAME_DT_MS = 100;

/**
 * 모델에 넣는 한 줄 — 맞장구 · 긍정만 가정하지 않는다(참가자가 "어?"처럼 되물었을 수도 있다 · 메인 지시).
 * 괄호 지문 = 다른 오케스트레이션 신호(`SILENCE_NUDGE_TEXT`)와 같은 형식. 전사에 기록하지 않는다(`silence` 종류).
 */
export const UNHEARD_REPLY_TEXT =
  "(상대가 방금 짧게 무슨 말을 한 것 같은데 잘 들리지 않았다. 잘 안 들렸다고 자연스럽게 되묻거나, 하던 이야기를 이어가라.)";

export type UnheardReplyState = {
  burstStartAt: number | null;
  lastLoudAt: number | null;
  voicedMs: number;
  peakLevel: number;
  heardByServer: boolean;
  lastFrameAt: number | null;
  lastFiredAt: number | null;
  fired: number;
};

export const INITIAL_UNHEARD_REPLY_STATE: UnheardReplyState = {
  burstStartAt: null,
  lastLoudAt: null,
  voicedMs: 0,
  peakLevel: 0,
  heardByServer: false,
  lastFrameAt: null,
  lastFiredAt: null,
  fired: 0,
};

export type UnheardReplyEvent =
  /** 레벨 표본 1프레임. `blocked` = 판정표 1행 조건 중 하나라도 참. */
  | { type: "frame"; nowMs: number; level: number; blocked: boolean }
  /** 서버 입력 인식 조각(빈 글자 아님) 도착. */
  | { type: "asr" };

/** 버린 이유(로그 · 테스트용). `null` = 아직 판정 전이거나 발동. */
export type UnheardReplySkip = "blocked" | "heard" | "short" | "cooldown" | "cap" | null;

export type UnheardReplyStep = { state: UnheardReplyState; fire: boolean; skipped: UnheardReplySkip };

const dropBurst = (s: UnheardReplyState, nowMs: number | null): UnheardReplyState => ({
  ...s,
  burstStartAt: null,
  lastLoudAt: null,
  voicedMs: 0,
  peakLevel: 0,
  heardByServer: false,
  lastFrameAt: nowMs,
});

export function stepUnheardReply(state: UnheardReplyState, event: UnheardReplyEvent): UnheardReplyStep {
  if (event.type === "asr") {
    if (state.burstStartAt === null) return { state, fire: false, skipped: null };
    return { state: { ...state, heardByServer: true }, fire: false, skipped: null };
  }
  const { nowMs, level, blocked } = event;
  // 1행
  if (blocked) {
    const had = state.burstStartAt !== null;
    return { state: dropBurst(state, nowMs), fire: false, skipped: had ? "blocked" : null };
  }
  const dt = state.lastFrameAt === null ? 0 : Math.max(0, Math.min(nowMs - state.lastFrameAt, MAX_FRAME_DT_MS));
  // 2행
  if (level > UNHEARD_LEVEL_THRESHOLD) {
    const starting = state.burstStartAt === null;
    return {
      state: {
        ...state,
        burstStartAt: starting ? nowMs : state.burstStartAt,
        lastLoudAt: nowMs,
        voicedMs: (starting ? 0 : state.voicedMs) + (starting ? 0 : dt),
        peakLevel: Math.max(starting ? 0 : state.peakLevel, level),
        heardByServer: starting ? false : state.heardByServer,
        lastFrameAt: nowMs,
      },
      fire: false,
      skipped: null,
    };
  }
  if (state.burstStartAt === null || state.lastLoudAt === null) {
    return { state: { ...state, lastFrameAt: nowMs }, fire: false, skipped: null };
  }
  // 3행
  if (nowMs - state.lastLoudAt < UNHEARD_WAIT_MS) {
    return { state: { ...state, lastFrameAt: nowMs }, fire: false, skipped: null };
  }
  // 4 ~ 7행
  let skipped: UnheardReplySkip = null;
  if (state.heardByServer) skipped = "heard";
  else if (state.voicedMs < UNHEARD_MIN_VOICED_MS || state.peakLevel < UNHEARD_MIN_PEAK_LEVEL) skipped = "short";
  else if (state.lastFiredAt !== null && nowMs - state.lastFiredAt < UNHEARD_COOLDOWN_MS) skipped = "cooldown";
  else if (state.fired >= UNHEARD_MAX_PER_CALL) skipped = "cap";
  if (skipped) return { state: dropBurst(state, nowMs), fire: false, skipped };
  // 8행
  return {
    state: { ...dropBurst(state, nowMs), lastFiredAt: nowMs, fired: state.fired + 1 },
    fire: true,
    skipped: null,
  };
}
