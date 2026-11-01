// T192 C1 — 실시간 끊기 판정 + 승인 표식 기록(트랜잭션 본문). Architecture.md §79.5 `requestScammerHangup` 행.
//
// onCall 핸들러는 에뮬레이터 없이 실행할 수 없으므로(관측 불가 지점), **트랜잭션 안에서 하는 일 전부**를
// 이 함수로 내려 가짜 트랜잭션으로 고정한다. 핸들러(`index.ts`)는 인증 · 인자 판독 · 소유권 · 익명 범위만 한다.
//
// ⛔ 세션을 끝내지 않는다 — `status` · `endReason` · `endedAt` write 0. 끝내는 것은 전사 제출 뒤 `endSession`(§79.9).
// ⛔ 표식은 이미 있으면 그대로 둔다(멱등 — 첫 승인의 `acceptedAt` · `kind` 유지).
import { sessionUsesVerifyIntercept } from "../scenarios/flowVariants";
import { normalizeDifficultyLevel } from "../shared/difficulty";
import type { DeliveredSmsRecord } from "../inCallSms/smsGate";
import type { ScammerHangupKind, ScammerHangupMarker, SessionDoc } from "../shared/types";
import { decideScammerHangup, type ScammerHangupDecision } from "./decide";
import { resolveHangupRelay } from "./relayContext";
import { isSmsAwaitingUser } from "./smsWait";
import { isVerifyTransferReachable, type VerifyOfferDocState } from "./transferReach";

/** 이 모듈이 쓰는 Firestore 트랜잭션의 최소 면(가짜 구현으로 테스트할 수 있게). */
export type HangupDocSnapshot = { exists: boolean; data(): unknown };
export type HangupTransaction<Ref> = {
  get(ref: Ref): Promise<HangupDocSnapshot>;
  update(ref: Ref, data: { scammerHangup: ScammerHangupMarker } | { relay: NonNullable<SessionDoc["relay"]> }): unknown;
};

/**
 * §142 — 다통화 변형의 마지막이 아닌 레그(`callLegs/legPlan.ts` `legHangupAdjustments`). 승인되면 세션 끝 표식(`scammerHangup`) 대신
 * `relay.legEnded`를 쓴다(세션은 이어진다 — 다음 레그는 `startCallLeg`). 8행(이미 승인)은 그 레그의 끝 기록으로 본다 · 5행 하한은 레그 시작 뒤 발화 수.
 */
export type HangupLegScope = { nonLastLeg: true; legIndex: number; turnsSinceLegStart: number };

/** 클라 주장값(OQ-A120 — S5b와 같은 등급). T192 C3: 하한 입력이 사기범 턴에서 사용자 발화로 바뀌었다(§79.19 (2) 8). */
export type RealtimeHangupClaims = {
  userTurns: number;
  pendingInstruction: boolean;
  kind: ScammerHangupKind;
};

export type RealtimeHangupRefs<Ref> = {
  session: Ref;
  /** 시나리오의 확인 무력화 오퍼 문서 ref를 만든다(`hasVerifyIntercept`일 때만 부른다). */
  verifyOffer: (scenarioId: string) => Ref | undefined;
  /** §142 — 서버가 세션 문서 · 카탈로그로 계산한 레그 범위(마지막이 아닌 레그만 · 클라 값 0). 부재 = 종전. */
  legScope?: HangupLegScope;
};

/** 확인 무력화 세션 정의 — `roleplay/index.ts`의 `verifyEnabled`와 같은 식(§79.2 #4). */
export function isVerifyInterceptSession(session: Pick<SessionDoc, "scenarioId" | "difficultyLevel" | "flowVariantId">): boolean {
  // §142 · R7 — 다통화 변형은 창구 오퍼가 없다(`sessionUsesVerifyIntercept`).
  return sessionUsesVerifyIntercept(session.scenarioId, normalizeDifficultyLevel(session.difficultyLevel) === "advanced", session.flowVariantId);
}

export async function decideAndMarkRealtimeHangup<Ref>(
  tx: HangupTransaction<Ref>,
  refs: RealtimeHangupRefs<Ref>,
  claims: RealtimeHangupClaims,
  /**
   * 서버 도착 기록(T192 C3 · §79.19 (4)) — 핸들러가 `sessionDeclaresInCallSms`일 때만 트랜잭션 **밖**에서 읽어 넘긴다
   * (선언 0 세션 = `[]`). 6행 서버 항은 이 값에서만 나온다(클라 주장값 아님).
   */
  delivered: readonly DeliveredSmsRecord[],
  acceptedAt: FirebaseFirestore.Timestamp,
  /** §108 — 4행 입력(`goalAction.ts` `hasCompletedGoalAction` · 핸들러가 트랜잭션 밖에서 읽어 넘긴다 · 읽기 실패 = false). */
  goalActionDone: boolean,
  /** §132.13 — 4-b행 입력(후속 단계 변형 ∧ C-5 미충족 · 핸들러가 계산). */
  followUpPending: boolean,
  /** P1 M1 — 4-c행 입력(`goalAction.ts` `isDecisionScreenPending` · 핸들러가 트랜잭션 밖에서 계산 · 읽기 실패 = 선언대로 대기). */
  decisionScreenPending: boolean,
): Promise<ScammerHangupDecision> {
  const smsAwaitingUser = isSmsAwaitingUser(delivered, claims.userTurns);
  const legScope = refs.legScope;
  const sessionSnap = await tx.get(refs.session);
  const session = (sessionSnap.exists ? sessionSnap.data() : undefined) as SessionDoc | undefined;
  if (session === undefined) {
    // 핸들러가 소유권 검사에서 이미 확인했다 — 그 사이 삭제됐으면 활성이 아닌 세션으로 판정한다(1행).
    return decideScammerHangup({
      status: "ended",
      channel: undefined,
      isMockTurn: false,
      verifyEnabled: false,
      transferPlaced: false,
      // 세션 부재 = 1행이 이긴다(값 무의미 · 막는 쪽).
      transferReachable: true,
      goalActionDone: false,
      followUpPending: false,
      decisionScreenPending: false,
      hangupKind: claims.kind,
      userTurns: claims.userTurns,
      pendingInstruction: claims.pendingInstruction,
      smsAwaitingUser,
      limitReached: false,
      alreadyAccepted: false,
      relay: undefined,
    });
  }
  const verifyEnabled = isVerifyInterceptSession(session);
  let transferPlaced = false;
  let offerDoc: VerifyOfferDocState = "unknown";
  if (verifyEnabled) {
    const verifyRef = refs.verifyOffer(session.scenarioId);
    if (verifyRef !== undefined) {
      const verifySnap = await tx.get(verifyRef);
      offerDoc = verifySnap.exists ? "present" : "absent";
      const verifyData = (verifySnap.exists ? verifySnap.data() : undefined) as { placedAt?: unknown } | undefined;
      transferPlaced = Boolean(verifyData?.placedAt);
    }
  }
  const decision = decideScammerHangup({
    status: session.status,
    channel: session.channel,
    isMockTurn: false,
    verifyEnabled,
    transferPlaced,
    // T192 C6-R — 실시간 경로는 진리표 1행(항상 true · 동작 변화 0). 같은 함수를 부른다(판정 지점 하나 — G596).
    transferReachable: isVerifyTransferReachable({ path: "realtime", scenarioId: session.scenarioId, offerDoc }),
    goalActionDone,
    // §142 — 마지막이 아닌 레그에는 후속 단계 · 결정 화면이 없다(4-b · 4-c 입력 거짓).
    followUpPending: legScope ? false : followUpPending,
    decisionScreenPending: legScope ? false : decisionScreenPending,
    // P1 M1 — 실시간은 모델의 `end_call` 사유가 판정 시점에 있다(4-c행만 읽는다).
    hangupKind: claims.kind,
    userTurns: claims.userTurns,
    pendingInstruction: claims.pendingInstruction,
    smsAwaitingUser,
    limitReached: false,
    alreadyAccepted: legScope ? session.relay?.legEnded === legScope.legIndex : Boolean(session.scammerHangup),
    // §79.18 (1) — 서버 값만(세션 문서 · 카탈로그). 클라 요청에는 이 값이 없다. S7 전에는 항상 undefined.
    relay: resolveHangupRelay(session),
    ...(legScope ? { turnsSinceCallEntry: legScope.turnsSinceLegStart } : {}),
  });
  if (decision.status === "accepted") {
    // §142 — 마지막이 아닌 레그의 승인 = 레그 끝 기록(세션 끝 표식 0 · 다음 레그는 `startCallLeg`). write 지점은 여전히 한 곳.
    tx.update(
      refs.session,
      legScope
        ? {
            relay: {
              ...(session.relay ?? {}),
              legIndex: legScope.legIndex,
              legStartUserTurns: session.relay?.legStartUserTurns ?? [0],
              connected: false,
              legEnded: legScope.legIndex,
            },
          }
        : { scammerHangup: { acceptedAt, kind: claims.kind, path: "realtime" } },
    );
  }
  return decision;
}
