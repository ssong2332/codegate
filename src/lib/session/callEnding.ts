// T192 C5 — 통화 종료 순서의 순수 상태(Architecture.md §79.9 E1~E7 · §79.11 · §79.18 (2) C5 고정 API · G509 · G510 · G528).
//
// ⛔ 순수 모듈 — React · Firebase · 브라우저 API import 0(루트 테스트 러너에서 그대로 돈다).
// ⛔ 래치(승인 · 종료)는 **이 상태 하나**가 소유한다(G528 ⓑ — 세션 컴포넌트에 지역 `hangupPending`을 두지 않는다).
//    부모(`play/page.tsx`)가 `callEndingRef`로 들고, 세션 컴포넌트는 `isHangupLatched()` getter로만 읽는다(leg 재마운트에도
//    살아남게 — §79.18 (0) 4).
// ⛔ 이름 · 시그니처는 §79.18 (2) 동결 대상이다(S7이 이 위에 맞춘다 — 바꾸려면 architect 재소집).

/** §79.9 E6 `callEndedBy`. `remote` = 서버 close(오늘 동작: 탭으로 이동). */
export type CallEndedBy = "scammer" | "user" | "limit" | "remote";

/** 종료 화면이 `endSession`에 보낼 사유(서버 허용목록 3값과 같다 — G557). */
export type CallEndReason = "user_ended" | "limit_reached" | "scammer_ended";

export type CallEndingState =
  | { phase: "idle" }
  /** §79.8 R2 — 실시간 끊기 승인 응답 ~ E1 전(마지막 대사 대기 중). */
  | { phase: "hangup_accepted" }
  /** E1 이후 — 먼저 래치된 사유가 남는다. */
  | { phase: "ending"; endedBy: CallEndedBy; reason: CallEndReason };

export const INITIAL_CALL_ENDING_STATE: CallEndingState = { phase: "idle" };

/** 트리거 → 사유. `remote`는 사유를 주장하지 않는다(종료 화면 기본값 `user_ended` — 오늘 동작). */
export function reasonForEndedBy(by: CallEndedBy): CallEndReason {
  if (by === "scammer") return "scammer_ended";
  if (by === "limit") return "limit_reached";
  return "user_ended";
}

/** R2 — idle → hangup_accepted · 그 밖은 그대로(멱등 · 이미 종료 중이면 아무것도 바꾸지 않는다). */
export function latchHangupAccepted(s: CallEndingState): CallEndingState {
  return s.phase === "idle" ? { phase: "hangup_accepted" } : s;
}

export type BeginCallEndingResult = {
  next: CallEndingState;
  /** 이 호출이 종료 순서(E2~E7)를 시작해야 하는가. 두 번째 이후 트리거는 `false`(이중 이동 0 — AC-007 · D-114). */
  started: boolean;
  /**
   * 남은 대기(E3 마지막 대사 · E7 끊김 표시)를 건너뛰는가. ⭐ 참가자 탭은 항상 대기를 건너뛴다(AC-006 즉시성 — D-114).
   * `started === false`인데 `true`면 **이미 진행 중인 종료**의 대기를 끊으라는 뜻이다.
   */
  skipWait: boolean;
};

/**
 * E1 — 재진입 가드 + 사유 래치(§79.9 · §79.11 · G509). 판정표(⛔ 표에 없는 경우는 행 추가를 묻는다):
 *
 * | 현재 | 트리거 | next | started | skipWait |
 * |---|---|---|---|---|
 * | idle | scammer(폴백 신호) | ending(scammer) | ✓ | ✗ — 마지막 대사를 기다린다(E3) |
 * | idle | user · limit · remote | ending(그 트리거) | ✓ | ✓(대기 0 — 오늘 동작) |
 * | hangup_accepted | scammer(R5 완료) | ending(scammer) | ✓ | ✓(R4~R5가 이미 기다렸다) |
 * | hangup_accepted | user | ending(**scammer** · 사유 유지) | ✓ | ✓(즉시 — §79.11 1행) |
 * | hangup_accepted | limit · remote | 그대로 | ✗ | ✗(이미 진행 중 — §79.11 2 · 3행: 끊기 쪽이 마저 끝낸다) |
 * | ending | user | 그대로 | ✗ | ✓(남은 대기만 끊는다 — 사유 유지) |
 * | ending | scammer · limit · remote | 그대로 | ✗ | ✗ |
 */
export function beginCallEnding(s: CallEndingState, by: CallEndedBy): BeginCallEndingResult {
  if (s.phase === "idle") {
    return {
      next: { phase: "ending", endedBy: by, reason: reasonForEndedBy(by) },
      started: true,
      skipWait: by !== "scammer",
    };
  }
  if (s.phase === "hangup_accepted") {
    if (by === "scammer" || by === "user") {
      return { next: { phase: "ending", endedBy: "scammer", reason: "scammer_ended" }, started: true, skipWait: true };
    }
    return { next: s, started: false, skipWait: false };
  }
  return { next: s, started: false, skipWait: by === "user" };
}

/** 승인 또는 종료 래치가 걸렸는가(마이크 · 클라 텍스트 턴 · 침묵 넛지 · 지시 큐 차단의 판정 — G510). */
export function isEndLatched(s: CallEndingState): boolean {
  return s.phase !== "idle";
}

/** S7 교대 허용 — 래치 idle만 `true`(§79.18 (3) ④ · G528 ⓒ). 호출과 토큰 폐기는 S7 몫. */
export function shouldAcceptRelaySwitch(s: CallEndingState): boolean {
  return !isEndLatched(s);
}

// ── §79.8 R4 · R5 — 승인 뒤 마지막 대사 대기(판단값 — 정본 숫자) ─────────────────────────────────

/** R4 — 승인 응답 전송 뒤 첫 `turnComplete`를 기다리는 상한(= `AWAIT_RESPONSE_TIMEOUT_MS`와 같은 값 · 판단값). */
export const HANGUP_FINAL_TURN_CAP_MS = 8000;
/** R5 — 잔여 재생 뒤 출력 버퍼 꼬리(판단값 · §50.8.1 창③과 같은 이유). */
export const HANGUP_TAIL_MS = 300;
/** R5 — 승인부터 준비 신호까지 전체 상한(판단값). */
export const HANGUP_DRAIN_CAP_MS = 15000;

/** R5 — 마지막 응답 뒤 준비 신호까지의 지연 = 잔여 재생 + 꼬리 · 0 이상 · 전체 상한 이하. 비유한 입력은 0으로 본다. */
export function hangupDrainDelayMs(remainingPlaybackMs: number): number {
  const remaining = Number.isFinite(remainingPlaybackMs) ? Math.max(0, remainingPlaybackMs) : 0;
  return Math.min(remaining + HANGUP_TAIL_MS, HANGUP_DRAIN_CAP_MS);
}

// ── E3 · E7 — 화면 쪽 대기(UX-014 v1.35 D-111 · D-112) ─────────────────────────────────────────

/** E7 — 끊김 표시가 처음 그려진 뒤 자동 이동까지(UX 정본 값 · D-111). 실제 이동 = max(이 값, 기록 완료). */
export const HANGUP_NOTICE_MS = 2500;
/** E3 — 폴백 마지막 대사의 오디오가 없거나 재생이 거부됐을 때 읽을 틈(UX 설계 추정값 · D-112). */
export const HANGUP_NO_AUDIO_READ_MS = 1500;

/**
 * UX-014 v1.35 (1) 정본 문구(⛔ 그대로 복사 · 의역 금지 · 마침표 없음) — `remote-hangup` 상태의 번호 아래 줄 ③.
 * 사유(목적 달성 · 포기)로 갈리지 않는다(D-110).
 */
export const REMOTE_HANGUP_STATUS_LINE = "상대방이 통화를 종료했습니다";
