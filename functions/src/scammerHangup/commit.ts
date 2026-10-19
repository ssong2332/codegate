// T192 C1 — 실시간 끊기 판정 + 승인 표식 기록(트랜잭션 본문). Architecture.md §79.5 `requestScammerHangup` 행.
//
// onCall 핸들러는 에뮬레이터 없이 실행할 수 없으므로(관측 불가 지점), **트랜잭션 안에서 하는 일 전부**를
// 이 함수로 내려 가짜 트랜잭션으로 고정한다. 핸들러(`index.ts`)는 인증 · 인자 판독 · 소유권 · 익명 범위만 한다.
//
// ⛔ 세션을 끝내지 않는다 — `status` · `endReason` · `endedAt` write 0. 끝내는 것은 전사 제출 뒤 `endSession`(§79.9).
// ⛔ 표식은 이미 있으면 그대로 둔다(멱등 — 첫 승인의 `acceptedAt` · `kind` 유지).
import { hasVerifyIntercept } from "../scenarios/verifyIntercept";
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
  update(ref: Ref, data: { scammerHangup: ScammerHangupMarker }): unknown;
};

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
};

/** 확인 무력화 세션 정의 — `roleplay/index.ts`의 `verifyEnabled`와 같은 식(§79.2 #4). */
export function isVerifyInterceptSession(session: Pick<SessionDoc, "scenarioId" | "difficultyLevel">): boolean {
  return hasVerifyIntercept(session.scenarioId) && normalizeDifficultyLevel(session.difficultyLevel) === "advanced";
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
): Promise<ScammerHangupDecision> {
  const smsAwaitingUser = isSmsAwaitingUser(delivered, claims.userTurns);
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
    userTurns: claims.userTurns,
    pendingInstruction: claims.pendingInstruction,
    smsAwaitingUser,
    limitReached: false,
    alreadyAccepted: Boolean(session.scammerHangup),
    // §79.18 (1) — 서버 값만(세션 문서 · 카탈로그). 클라 요청에는 이 값이 없다. S7 전에는 항상 undefined.
    relay: resolveHangupRelay(session),
  });
  if (decision.status === "accepted") {
    tx.update(refs.session, {
      scammerHangup: { acceptedAt, kind: claims.kind, path: "realtime" },
    });
  }
  return decision;
}
