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
import { resolveDeclaredSms, sessionDeclaresInCallSms } from "../inCallSms/smsGate";
import { readDeliveredSms } from "../inCallSms/smsDelivery";
import type { SessionDoc } from "../shared/types";
import { decideAndMarkRealtimeHangup, isVerifyInterceptSession } from "./commit";
import { goalFollowUpFor, hasCompletedGoalAction, readMockScreenCompletion } from "./goalAction";
import { scammerHangupGuidance } from "./guidance";
import { readScammerHangupRequest } from "./readRequest";
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

export const requestScammerHangup = onCall<
  RequestScammerHangupRequest,
  Promise<RequestScammerHangupResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  // T192 C3(§79.19 (6) ② ③ · G558) — 판독은 순수 함수 하나 · 세션 read **앞**(무효 요청이 read 비용을 태우지 않는다).
  const { sessionId, userTurns, pendingInstruction, kind } = readScammerHangupRequest(request.data);

  const session = await loadOwnedSession(sessionId, request.auth.uid);
  assertAnonymousChallengeScope(request.auth, session);

  // T192 C3(§79.19 (4)) — 6행 서버 항(문자 대기)의 입력. 문자를 선언한 세션에서만 트랜잭션 **밖**에서 읽는다
  // (밖 읽기의 경합은 같은 배치의 문자 호출뿐이고 클라 배치 항이 막는다 — §79.19 (3)). 읽기 실패는 throw →
  // 클라 `endCallFailureInstruction`(끊기 0 · fail-closed).
  const delivered = sessionDeclaresInCallSms(session.scenarioId, session.flowVariantId)
    ? await readDeliveredSms(getFirestore().collection("sessions").doc(sessionId))
    : [];

  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  // §108 — 4행 입력(목표 화면 행동 완료). 확인 무력화 세션에서만 읽는다(그 밖은 4행이 애초에 꺼져 있다) · 실패 = 미완료(fail-closed).
  let goalActionDone = false;
  if (isVerifyInterceptSession(session)) {
    try {
      const { declared, reason } = resolveDeclaredSms(session.scenarioId, session.flowVariantId);
      goalActionDone = hasCompletedGoalAction({
        delivered,
        mockScreens: await readMockScreenCompletion(sessionRef),
        declared,
        declaredKnown: reason === undefined,
        userTurns,
        followUpUserTurns: goalFollowUpFor(session.scenarioId, session.flowVariantId), // §115 C-5
      });
    } catch {
      goalActionDone = false;
    }
  }
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
      { userTurns, pendingInstruction, kind },
      delivered,
      Timestamp.now(),
      goalActionDone,
    ),
  );

  // 관측(G170 — 단계명 · 숫자만). 라이브 관측(AC-103 (h))에서 승인/거절 행을 가르는 유일한 기록이다.
  logger.info("사기범 끊기 판정", {
    sessionId,
    path: "realtime",
    status: decision.status,
    row: decision.row,
    kind,
    userTurns,
    goalActionDone,
  });

  return { status: decision.status, guidance: scammerHangupGuidance(decision.status) };
});
