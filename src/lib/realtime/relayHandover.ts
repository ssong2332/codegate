// 릴레이 "돌려 주기" 연출의 클라 판정 — T191 S7 / UX UF-013 · D-105 · P-38 · 계약 C-6 · C-7 · C-10 /
// Architecture T191 릴레이 설계("클라 — 교대 순서" · OQ-U70 판정). **순수 모듈**(잎 — import 0, 브라우저 API 0).
//
// 순서(P-38 (1) · 3경로 동일): 넘김 대사 **재생 완료** → 끊김음(약 0.3초) → 연결음(최소 2초 · 최대 15초) →
// 새 화자 첫 오디오(폴백은 첫 텍스트)와 **동시에** 재개. 대기 중 음성은 아무에게도 가지 않고(새 소켓 마이크 음소거),
// 타이핑은 보류했다가 재개 뒤 보낸다. 대기 시간도 통화 경과에 포함된다(세션 한도 계산 무변경).
//
// 판정표(이 표대로만 — 표에 없는 경우가 생기면 행 추가를 묻는다):
// | If | Then |
// |---|---|
// | 대기 경과 < 2초 | 새 화자가 준비돼도 기다린다(바뀐 것을 알아챌 시간) |
// | 대기 경과 ≥ 2초 · 새 화자 준비됨(첫 오디오/첫 텍스트) | 재개(연결음 정지) |
// | 대기 경과 ≥ 15초 · 새 화자 미준비 | 실패(C-7) — 실시간 1회 재시도 → 텍스트 강등 → 불가면 종료 |
// | 넘김 대사 재생이 8초 넘게 안 끝남 | 재생 종료를 기다리지 않고 끊김음으로 간다(무한 대기 0) |

/** 끊김음 길이(UX 설계 추정값). */
export const RELAY_CUT_MS = 300;
/** 연결음 최소(UX C-6 · P-38 (1)). */
export const RELAY_HOLD_MIN_MS = 2000;
/** 연결음 최대(architect OQ-U70 판정 — 15초). */
export const RELAY_HOLD_MAX_MS = 15000;
/** 넘김 대사 재생 종료 대기 상한(implementer 판단값 — 반이중 게이트가 안 풀려도 연출이 갇히지 않게). */
export const RELAY_PLAYBACK_WAIT_CAP_MS = 8000;
/** 비음성 자막(P-38 (3)) — 앱 안내가 아니라 들리는 소리의 글. */
export const RELAY_CONNECT_TONE_CAPTION = "[연결음]";

/** 자체 합성음(실제 통신사 · OS 음원 0 — D-96 (5)). 형식은 실기 대조 전 추정값(P-38 (4)). */
export const RELAY_CUT_TONE = { freqHz: 620, ms: RELAY_CUT_MS } as const;
export const RELAY_RINGBACK_TONE = { freqHz: [440, 480] as const, onMs: 1000, offMs: 2000 } as const;

export type RelayResumeDecision = "wait" | "resume" | "timeout";

export function decideRelayResume(input: {
  holdStartedAtMs: number;
  nowMs: number;
  newSpeakerReady: boolean;
}): RelayResumeDecision {
  const elapsed = input.nowMs - input.holdStartedAtMs;
  if (input.newSpeakerReady && elapsed >= RELAY_HOLD_MIN_MS) return "resume";
  if (!input.newSpeakerReady && elapsed >= RELAY_HOLD_MAX_MS) return "timeout";
  return "wait";
}

/** 새 Live 연결의 첫마디 트리거를 언제 보낼지 — 최소 대기(2초) 전에 새 목소리가 나오지 않게(남은 ms, 0 이상). */
export function relayGreetingDelayMs(holdStartedAtMs: number, nowMs: number): number {
  return Math.max(0, holdStartedAtMs + RELAY_HOLD_MIN_MS - nowMs);
}

/** 넘김 대사 재생이 끝났는가(또는 더 기다리지 않는가) — 끊김음 시작 판정. */
export function shouldStartRelayCut(input: { agentSpeaking: boolean; armedAtMs: number; nowMs: number }): boolean {
  return !input.agentSpeaking || input.nowMs - input.armedAtMs >= RELAY_PLAYBACK_WAIT_CAP_MS;
}

export type RelayCeiling = { nudgeAfterUserTurns: number; forceAfterUserTurns: number };

/**
 * 실시간 천장(설계 "교대 순서" 2행) — leg의 참가자 발화 수가 천장이면 넛지 1회, 천장 + 2면 다음 사기범 턴 끝에서 강제 교대.
 * ⚠️ 프레젠테이션 층 — 실제 허락은 서버 `startRelayLeg`가 다시 판정한다.
 */
export function decideLiveRelayCeiling(input: {
  userTurnsInLeg: number;
  ceiling: RelayCeiling | undefined;
  nudged: boolean;
}): "none" | "nudge" | "force" {
  if (!input.ceiling) return "none";
  if (input.userTurnsInLeg >= input.ceiling.forceAfterUserTurns) return "force";
  if (input.userTurnsInLeg >= input.ceiling.nudgeAfterUserTurns && !input.nudged) return "nudge";
  return "none";
}

/** 자막 · 폴백 말풍선 접두(C-8 — 교대 뒤 줄만, 교대 전 줄은 표기 없음). */
export function captionWithSpeaker(speakerLabel: string | undefined, text: string): string {
  return speakerLabel ? `${speakerLabel}: ${text}` : text;
}

/** 폴백 연결음 동안 새 leg 줄을 보류한다(재개 전에는 화면에 그리지 않는다). */
export function isHeldForRelay(turnIndex: number, holdFromTurnIndex: number | null): boolean {
  return holdFromTurnIndex !== null && turnIndex >= holdFromTurnIndex;
}

/** 이전 소켓이 연출 중에 닫히는 것은 통화 종료가 아니다(설계 "교대 순서" 8행 — 연출 중에만 무시). */
export function shouldIgnoreLiveEnded(relayTransitionActive: boolean): boolean {
  return relayTransitionActive;
}

/**
 * 실패 처리(C-7 · AC-101 (i)) — 같은 목소리로 조용히 잇기 · 침묵 종료 0.
 * | 실시간 실패 횟수 | 텍스트 강등 실패 | 행동 |
 * |---|---|---|
 * | 0 | — | 실시간 1회 재시도 |
 * | ≥ 1 | 아님 | 텍스트 폴백으로 강등(새 화자 표기로 계속 · AC-084 고지) |
 * | ≥ 1 | 실패 | 오류 안내 + 통화 종료(UX-007) |
 */
export function relayFailureAction(input: { liveFailures: number; textFailed: boolean }): "retry-live" | "degrade-text" | "end" {
  if (input.liveFailures < 1) return "retry-live";
  return input.textFailed ? "end" : "degrade-text";
}

export type RelayEventName = "relay_handover_started" | "relay_handover_completed" | "relay_handover_failed";

/** 계약 C-10 구조화 로그 — 숫자 · 종류만(대사 · 라벨 본문 0, G432 형식). */
export function formatRelayEvent(
  event: RelayEventName,
  fields: { legIndex: number; path: "live" | "text"; latencyMs?: number; reason?: string },
): string {
  return JSON.stringify({
    event,
    legIndex: fields.legIndex,
    path: fields.path,
    ...(typeof fields.latencyMs === "number" ? { latencyMs: Math.round(fields.latencyMs) } : {}),
    ...(fields.reason ? { reason: fields.reason } : {}),
  });
}
