// T192 C3 — 텍스트 폴백(`sendMessage`)의 끊기 판정 배선(Architecture.md §79.7 · §79.19 (5) 10 · 11 · G507 · G554).
//
// `sendMessage`는 onCall이라 에뮬레이터 없이 실행할 수 없다(관측 불가 지점) ⇒ 판정 입력 조립 · 변형 선택 · 효과 판정을
// 이 순수 모듈로 내려 단위 테스트로 고정하고, 핸들러는 이 함수들을 정해진 자리에서 부르기만 한다(소스 스캔이 자리를 본다).
// ⛔ 판정 자체는 `decideScammerHangup` 하나(실시간 콜러블과 같은 함수 — AC-103 (f) · G501) · 문자 대기는 `isSmsAwaitingUser`
//    하나(G554). 이 파일은 표를 다시 쓰지 않는다.
// ⛔ Firestore · LLM import 0(이 모듈은 `roleplay/index.ts`가 import한다 — 시크릿 폐포를 넓히지 않는다).
import { sessionDeclaresInCallSms, type DeliveredSmsRecord } from "../inCallSms/smsGate";
import type { MessengerChannel, ScammerHangupKind, SessionStatus } from "../shared/types";
import { decideScammerHangup, type HangupRelayContext, type ScammerHangupDecision } from "./decide";
import { isSmsAwaitingUser } from "./smsWait";

/** 폴백 한 턴에서 LLM 호출 **전에** 아는 사실(사전 · 사후 판정이 같은 값을 쓴다). */
export type FallbackHangupFacts = {
  status: SessionStatus;
  channel: MessengerChannel | undefined;
  /** `roleplay/index.ts`의 `verifyEnabled`(확인 무력화 고급 세션). */
  verifyEnabled: boolean;
  /** `verifyState?.placed === true` — 조회 실패(`undefined`)는 전환 전으로 본다(4행 fail-closed). */
  transferPlaced: boolean;
  /** T192 C6-R — `isVerifyTransferReachable({ path: "fallback", … })`(서버 값만 · 읽기 실패 = `unknown` → true = 막는 쪽). */
  transferReachable: boolean;
  /** `userTurnsNow`(S5b 문자 게이트와 같은 변수 — G552 ⓒ). */
  userTurns: number;
  /** 턴 확보 트랜잭션 값으로 LLM 전에 계산한 한도(§79.19 (5) 10 — 옛 79.7 1의 `limitReached:false` 정정). */
  limitReached: boolean;
  /** `Boolean(session.scammerHangup)`. */
  alreadyAccepted: boolean;
  /** `resolveHangupRelay(session)`(오늘 항상 `undefined`). */
  relay: HangupRelayContext | undefined;
  /** 이 세션이 통화 중 문자를 가질 수 있는가(`fallbackSmsDeclaredFor` — 도착 기록 read와 **같은 값**). */
  smsDeclared: boolean;
  /** 도착 기록을 읽었는가(`smsDeliveredLoaded`). */
  smsDeliveredLoaded: boolean;
};

/**
 * T192 PR A 리뷰 Minor-1(G554 취지) — 폴백이 도착 기록을 읽을지 · 문자 대기를 볼지 정하는 **단일 조건**. 실시간 콜러블
 * (`scammerHangup/index.ts`)과 같은 술어 `sessionDeclaresInCallSms`다. ⚠️ 옛 조건(`resolveDeclaredSms(...).declared.length > 0`)은
 * 변형 ID가 없는 세션(무소급 · 2인 챌린지)에서 거짓이라, 실시간 중 문자가 도착한 뒤 폴백으로 강등되면 기록을 읽지 않고
 * "문자 대기 없음"으로 끊기를 허용했다(콜러블은 같은 세션에서 막는다 — AC-103 (f) 위반).
 */
export function fallbackSmsDeclaredFor(scenarioId: string, flowVariantId: string | undefined): boolean {
  return sessionDeclaresInCallSms(scenarioId, flowVariantId);
}

/**
 * 폴백 6행 서버 항. 문자를 선언한 세션에서 도착 기록을 못 읽었으면 **대기 중으로 본다**(fail-closed — 그 턴만 끊기 0 ·
 * §79.19 (4)). 선언 0 세션은 문자가 올 수 없으므로 대기 아님.
 */
export function fallbackSmsAwaitingUser(
  facts: Pick<FallbackHangupFacts, "smsDeclared" | "smsDeliveredLoaded" | "userTurns">,
  delivered: readonly DeliveredSmsRecord[],
): boolean {
  if (!facts.smsDeclared) return false;
  if (!facts.smsDeliveredLoaded) return true;
  return isSmsAwaitingUser(delivered, facts.userTurns);
}

/**
 * 폴백 판정 — 사전(`isMockTurn:false` · LLM 전)과 사후(`completion.isMock` · 문자 마커 도착을 더한 목록)가 같은 함수를 쓴다.
 * 폴백의 `pendingInstruction`은 항상 `false`(클라 큐가 없다 — 문자 대기는 서버 항이 대신한다, §79.19 (4)).
 */
export function decideFallbackHangup(
  facts: FallbackHangupFacts,
  delivered: readonly DeliveredSmsRecord[],
  isMockTurn: boolean,
): ScammerHangupDecision {
  return decideScammerHangup({
    status: facts.status,
    channel: facts.channel,
    isMockTurn,
    verifyEnabled: facts.verifyEnabled,
    transferPlaced: facts.transferPlaced,
    transferReachable: facts.transferReachable,
    userTurns: facts.userTurns,
    pendingInstruction: false,
    smsAwaitingUser: fallbackSmsAwaitingUser(facts, delivered),
    limitReached: facts.limitReached,
    alreadyAccepted: facts.alreadyAccepted,
    relay: facts.relay,
  });
}

export type FallbackHangupMode = "none" | "signal";

/** 프롬프트 변형(§79.6 ②) — 사전 판정이 `accepted`인 턴에만 SIGNAL(그 밖 = NONE — `already_accepted` 포함). */
export function fallbackHangupMode(pre: ScammerHangupDecision): FallbackHangupMode {
  return pre.status === "accepted" ? "signal" : "none";
}

export type FallbackHangupEffect =
  | { end: true; kind: ScammerHangupKind }
  | { end: false; ignored?: { row: string; status: ScammerHangupDecision["status"] } };

/**
 * 효과 판정(§79.19 (5) 10) — `endCall && hangupMode === "signal" && 사후.status === "accepted"`일 때만 끝낸다. 그 밖에
 * 신호가 있으면 무시하고(텍스트에서는 이미 지워졌다) 로그용 근거를 돌려준다: SIGNAL이 아니었으면 사전 판정의 행 ·
 * SIGNAL이었으면 사후 판정의 행(한 응답에 문자 마커 + 신호 = 사후 6행 → 문자가 이긴다 · OQ-A140).
 */
export function resolveFallbackHangupEffect(input: {
  endCall: "goal" | "give_up" | undefined;
  hangupMode: FallbackHangupMode;
  pre: ScammerHangupDecision;
  post: ScammerHangupDecision;
}): FallbackHangupEffect {
  if (input.endCall === undefined) return { end: false };
  if (input.hangupMode === "signal" && input.post.status === "accepted") {
    return { end: true, kind: input.endCall };
  }
  const basis = input.hangupMode === "signal" ? input.post : input.pre;
  return { end: false, ignored: { row: basis.row, status: basis.status } };
}
