// T192 C1 — `requestScammerHangup` 콜러블(Architecture.md §79.5 · AC-103 · DECISIONS #138 · ADR-0021).
//
// 실시간(Gemini Live) 경로에서 모델이 `end_call`(BLOCKING — 배선은 C3 · C5)을 부르면 클라가 이 콜러블로
// 서버 판정을 받는다. 승인되면 트랜잭션으로 `sessions/{sid}.scammerHangup` 표식을 쓴다.
//
// ⛔ 이 모듈이 **하지 않는 것**(리뷰 체크포인트):
//   - 세션 종료(`status` · `endReason` · `endedAt` write) — 끝내는 것은 전사 제출 뒤 `endSession`(§79.9)
//   - LLM 경로 import(`../roleplay` · `../llm`) — 시크릿 선언 0을 유지한다(G212 파일 폐포). 판정 함수는
//     잎 모듈 `decide.ts`다.
//   - 리포트 트리거 — 리포트는 `endSession`이 개시한다(§79.5 · G511 — 리포트는 사유를 읽지 않는다).
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { assertAnonymousChallengeScope } from "../shared/anonymousGate";
import { findVerifyInterceptItem } from "../scenarios/verifyIntercept";
import type { SessionDoc } from "../shared/types";
import { decideAndMarkRealtimeHangup } from "./commit";
import { normalizeScammerHangupKind } from "./decide";
import { scammerHangupGuidance } from "./guidance";
import type { RequestScammerHangupRequest, RequestScammerHangupResponse } from "./types";

ensureFirebaseAdminApp();

/** 세션 소유권 검증 — `inCallSms/index.ts`의 같은 이름 함수와 같은 규칙(익명 uid도 자기 세션이면 성립). */
async function loadOwnedSession(sessionId: string, uid: string): Promise<SessionDoc> {
  const snap = await getFirestore().collection("sessions").doc(sessionId).get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
  }
  const session = snap.data() as SessionDoc;
  if (session.uid !== uid) {
    throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
  }
  return session;
}

/** 클라 주장 턴 수 — 유한한 0 이상 숫자만(`deliverInCallSms`의 `scammerTurns` 판독과 같은 판단). */
function readScammerTurns(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new HttpsError("invalid-argument", "scammerTurns는 0 이상의 숫자여야 합니다.");
  }
  return value;
}

/** 클라 주장 문자 대기 — boolean만. 다른 값을 조용히 `false`로 떨어뜨리면 6행 차단이 무력화된다. */
function readPendingInstruction(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new HttpsError("invalid-argument", "pendingInstruction은 true 또는 false여야 합니다.");
  }
  return value;
}

export const requestScammerHangup = onCall<
  RequestScammerHangupRequest,
  Promise<RequestScammerHangupResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId } = request.data ?? {};
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "sessionId가 필요합니다.");
  }
  const scammerTurns = readScammerTurns(request.data?.scammerTurns);
  const pendingInstruction = readPendingInstruction(request.data?.pendingInstruction);
  const kind = normalizeScammerHangupKind(request.data?.kind);

  const session = await loadOwnedSession(sessionId, request.auth.uid);
  assertAnonymousChallengeScope(request.auth, session);

  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const decision = await db.runTransaction((tx) =>
    decideAndMarkRealtimeHangup<FirebaseFirestore.DocumentReference>(
      tx,
      {
        session: sessionRef,
        verifyOffer: (scenarioId) => {
          const item = findVerifyInterceptItem(scenarioId);
          return item ? sessionRef.collection("verifyIntercept").doc(item.offerId) : undefined;
        },
      },
      { scammerTurns, pendingInstruction, kind },
      Timestamp.now(),
    ),
  );

  // 관측(G170 — 단계명 · 숫자만). 라이브 관측(AC-103 (h))에서 승인/거절 행을 가르는 유일한 기록이다.
  logger.info("사기범 끊기 판정", {
    sessionId,
    path: "realtime",
    status: decision.status,
    row: decision.row,
    kind,
    scammerTurns,
  });

  return { status: decision.status, guidance: scammerHangupGuidance(decision.status) };
});
