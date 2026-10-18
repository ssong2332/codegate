// 릴레이 교대 시점 판정 — T191 릴레이 설계(Architecture T191 절 "클라 — 교대 순서" 1 · 2행 · "startRelayLeg" 검증 행).
// **순수 함수**(Firestore · 네트워크 0). 실시간(`startRelayLeg`의 check · 실행) · 텍스트 폴백(`sendMessage`)이
// **같은 함수**로 판정한다 — 경로마다 판정을 따로 두면 교대 시점이 경로별로 어긋난다(AC-101 (e) · (j) ⓒ).
//
// 규칙(설계 그대로 · 판단값은 변형 데이터 leg의 min/maxUserTurns):
// | If (지금 leg의 참가자 발화 수 n) | Then |
// |---|---|
// | 다음 leg 없음 · 릴레이 변형 아님 | 교대 없음 |
// | 확인 창구 오퍼가 announce됐고 아직 연결 전 | 교대 거부(호 전환과 겹치지 않게) |
// | 확인 창구로 이미 연결됨(placed) | 교대 거부 — 창구 담당자가 마지막 화자다(implementer 판단 · 보고 대상) |
// | n < minUserTurns | 교대 거부(넘기지 않는다는 안내) |
// | minUserTurns ≤ n < maxUserTurns | 모델이 정하면 교대(실시간 도구 · 폴백 신호) |
// | maxUserTurns ≤ n < maxUserTurns + 2 | 넘기라는 넛지 1회(실시간 맥락 주입 · 폴백 턴 지시) |
// | n ≥ maxUserTurns + 2 | 다음 사기범 턴 끝에서 **강제 교대**(문자와 달리 건너뛰지 않는다 — AC-101 (a)) |
import { isRelayVariant, type FlowVariant } from "../scenarios/flowVariants";

/** 폴백 신호 — 기존 `[[SIGNAL:*]]` 계열이라 참가자 입력의 흉내는 `escapeSentinelLookalikes`가 이미 무력화한다. */
export const RELAY_TRANSFER_SIGNAL = "[[SIGNAL:TRANSFER_CALL]]";
const RELAY_TRANSFER_SIGNAL_PATTERN = /\[\[SIGNAL:TRANSFER_CALL\]\]/;

/** 넛지 뒤 강제 교대까지 기다리는 참가자 발화 수(설계값). */
export const RELAY_FORCE_AFTER_EXTRA_USER_TURNS = 2;

// ── 서버 소유 문면(모델용 — 클라가 저작하지 않는다 · 인용 예시 문장 0) ─────────────────────

/** 실시간 `transfer_call` 허락 결과. */
export const RELAY_TOOL_ACCEPTED_GUIDANCE =
  "(연결이 준비됐다. 지금 다른 담당자에게 연결해 주겠다는 한 문장만 말하고, 그 한 문장 뒤에는 더 말하지 않는다. 새 요구는 하지 않는다.)";
/** 실시간 `transfer_call` 거절 결과. */
export const RELAY_TOOL_NOT_YET_GUIDANCE =
  "(아직 넘길 때가 아니다. 넘긴다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)";
/** 실시간 천장 넛지(맥락 주입 — 응답을 유발하지 않는다). */
export const RELAY_LIVE_NUDGE_INSTRUCTION =
  "(이제 네가 맡은 단계를 마무리할 때다. 참가자의 다음 말에 답한 뒤 transfer_call 도구를 불러 다음 담당자에게 넘겨라.)";
/** 폴백 — 넘겨도 되는 턴. */
export const RELAY_FALLBACK_WINDOW_INSTRUCTION = `(이번 턴에는 다음 담당자에게 통화를 넘겨도 된다. 네가 맡은 단계를 마쳤다고 판단되면 이 응답을 다른 담당자에게 연결해 주겠다는 한 문장으로 끝내고 맨 끝에 ${RELAY_TRANSFER_SIGNAL} 를 붙여라. 아직이라면 표식 없이 하던 이야기를 이어가라.)`;
/** 폴백 — 천장 넛지. */
export const RELAY_FALLBACK_NUDGE_INSTRUCTION = `(이번 응답에서 다음 담당자에게 통화를 넘겨라. 참가자의 말에 짧게 답한 뒤 다른 담당자에게 연결해 주겠다는 한 문장으로 끝내고 맨 끝에 ${RELAY_TRANSFER_SIGNAL} 를 붙여라. 새 요구는 하지 않는다.)`;

export type RelayVerifyState = { announced: boolean; placed: boolean };

export type RelayAdvanceRejectReason =
  | "not-relay"
  | "leg-mismatch"
  | "no-next-leg"
  | "below-min"
  | "verify-pending"
  | "verify-placed";

export type RelayAdvanceCheck = { ok: true } | { ok: false; reason: RelayAdvanceRejectReason };

/** `currentLegIndex` → `toLegIndex` 교대를 지금 허락하는가(실시간 check · 실행 · 폴백 공통). */
export function checkRelayAdvance(input: {
  variant: FlowVariant | undefined;
  currentLegIndex: number;
  toLegIndex: number;
  userTurnsInLeg: number;
  verify?: RelayVerifyState;
}): RelayAdvanceCheck {
  const { variant, currentLegIndex, toLegIndex, userTurnsInLeg, verify } = input;
  if (!isRelayVariant(variant)) return { ok: false, reason: "not-relay" };
  if (toLegIndex !== currentLegIndex + 1) return { ok: false, reason: "leg-mismatch" };
  const current = variant.legs[currentLegIndex];
  if (!current || !variant.legs[toLegIndex]) return { ok: false, reason: "no-next-leg" };
  if (verify?.placed) return { ok: false, reason: "verify-placed" };
  if (verify?.announced) return { ok: false, reason: "verify-pending" };
  if (userTurnsInLeg < current.minUserTurns) return { ok: false, reason: "below-min" };
  return { ok: true };
}

/** 지금 leg의 참가자 발화 수 — 경계(`legStartTurnIndex`) 이후 참가자 문서 + 아직 저장 전 델타의 참가자 턴. */
export function countLegUserTurns(
  messages: readonly { role: "user" | "scammer"; turnIndex: number }[],
  legStartTurnIndex: number,
  pendingUserTurns = 0,
): number {
  return messages.filter((m) => m.role === "user" && m.turnIndex >= legStartTurnIndex).length + pendingUserTurns;
}

export type FallbackRelayTurn = {
  /** 이번 턴 프롬프트에 붙일 지시(없으면 부재). */
  instruction?: string;
  /** 이번 응답의 신호를 교대로 받아들이는가. */
  acceptSignal: boolean;
  /** 신호가 없어도 이번 응답 뒤 교대한다(천장 + 2). */
  force: boolean;
};

/**
 * 폴백 한 턴의 교대 판정. `userTurnsInLeg`는 **이번 사용자 발화를 포함**한 수다(폴백은 사용자 발화 → 응답 1쌍).
 * 하한 · 확인 창구 조건은 `checkRelayAdvance`와 같은 함수로 본다.
 */
export function decideFallbackRelayTurn(input: {
  variant: FlowVariant | undefined;
  legIndex: number;
  userTurnsInLeg: number;
  verify?: RelayVerifyState;
}): FallbackRelayTurn {
  const none: FallbackRelayTurn = { acceptSignal: false, force: false };
  const check = checkRelayAdvance({
    variant: input.variant,
    currentLegIndex: input.legIndex,
    toLegIndex: input.legIndex + 1,
    userTurnsInLeg: input.userTurnsInLeg,
    ...(input.verify ? { verify: input.verify } : {}),
  });
  if (!check.ok || !input.variant) return none;
  const leg = input.variant.legs[input.legIndex];
  const n = input.userTurnsInLeg;
  if (n >= leg.maxUserTurns + RELAY_FORCE_AFTER_EXTRA_USER_TURNS) {
    return { instruction: RELAY_FALLBACK_NUDGE_INSTRUCTION, acceptSignal: true, force: true };
  }
  if (n >= leg.maxUserTurns) return { instruction: RELAY_FALLBACK_NUDGE_INSTRUCTION, acceptSignal: true, force: false };
  return { instruction: RELAY_FALLBACK_WINDOW_INSTRUCTION, acceptSignal: true, force: false };
}

/** 폴백 응답에서 교대 신호를 찾아 지운다(참가자는 신호 원문을 보지 않는다). */
export function extractRelayTransferSignal(text: string): { text: string; transfer: boolean } {
  if (!RELAY_TRANSFER_SIGNAL_PATTERN.test(text)) return { text, transfer: false };
  const cleaned = text
    .replace(/\[\[SIGNAL:TRANSFER_CALL\]\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([.,!?])/g, "$1")
    .trim();
  return { text: cleaned, transfer: true };
}

/**
 * 실시간 천장(클라 넛지 · 강제 교대 입력) — leg의 참가자 발화 수 기준. 다음 leg가 없으면 undefined(필드 부재).
 * ⚠️ 클라 카운터는 프레젠테이션 층이다 — 실제 교대는 `startRelayLeg`가 하한 · 확인 창구 조건을 다시 본다.
 */
export function relayLiveCeiling(
  variant: FlowVariant | undefined,
  legIndex: number,
): { nudgeAfterUserTurns: number; forceAfterUserTurns: number; nudgeInstruction: string } | undefined {
  if (!isRelayVariant(variant)) return undefined;
  const leg = variant.legs[legIndex];
  if (!leg || !variant.legs[legIndex + 1]) return undefined;
  return {
    nudgeAfterUserTurns: leg.maxUserTurns,
    forceAfterUserTurns: leg.maxUserTurns + RELAY_FORCE_AFTER_EXTRA_USER_TURNS,
    nudgeInstruction: RELAY_LIVE_NUDGE_INSTRUCTION,
  };
}
