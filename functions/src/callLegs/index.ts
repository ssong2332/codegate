// §142(카드사 고급 재구성 · PR-3) — `startCallLeg` 콜러블: 다통화 변형의 다음 통화(레그)를 연다(Architecture.md §142.3 · §142.4).
//
// 화면이 부르는 때(PR-2):
// | 행동 | 언제 |
// |---|---|
// | `dial` | 참가자가 전화 앱에서 번호를 눌러 걸었다(R2 첫 통화 · 레그 끝 뒤 나가는 방식 `dial`) |
// | `callback` | 레그 끝 뒤 N초가 지나 상대가 다시 걸어 왔다(D4 — `dial` 자리에서만) |
// | `transfer` | 레그 끝이 호 전환(`transfer`)이었다 — 연결음 뒤 바로 다음 인물 |
// | `hangup` | 2026-11-07 — 참가자가 통화를 먼저 끊었다(전사 제출 뒤). 레그 끝 · 세션 계속(`planLegHangup`). 뒤이은 callback · 그 상대 번호 dial = 같은 레그 재연결 |
//
// 전제(PR-2 화면 계약): 앞 레그 전사는 이 호출 **전에** `submitRealtimeTranscript`로 제출돼 있다 — 레그 시작 발화 수(문자 하한 · 끊기 5행 기준)를
// 서버 `messages`의 사용자 줄 수로 센다(클라 주장값 0).
//
// ⛔ 이 모듈이 하지 않는 것: 세션 종료(진짜 기관 안내 = 화면이 안내를 보여 준 뒤 `endSession`) · LLM 호출 · 문자 발송.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { assertAnonymousChallengeScope } from "../shared/anonymousGate";
import { findFlowVariant } from "../scenarios/flowVariants";
import type { SessionDoc } from "../shared/types";
import { planLegHangup, planLegStart } from "./legPlan";
import { deliverLoanDisbursedSmsIfDue } from "./loanReviewOrder";
import type { LegStartAction } from "./legPlan";
import { installLandingIds, nextLegLandingIds, readStartCallLegRequest, type StartCallLegRequest, type StartCallLegResponse } from "./request";

ensureFirebaseAdminApp();

export const startCallLeg = onCall<StartCallLegRequest, Promise<StartCallLegResponse>>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId, action, dialed } = readStartCallLegRequest(request.data);
  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const first = await sessionRef.get();
  if (!first.exists) throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
  const firstSession = first.data() as SessionDoc;
  if (firstSession.uid !== request.auth.uid) throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
  assertAnonymousChallengeScope(request.auth, firstSession);

  const variant = findFlowVariant(firstSession.flowVariantId);
  if (!variant || !variant.multiCall || variant.scenarioId !== firstSession.scenarioId) {
    return { status: "not_ready", reason: "not_multi_call" };
  }
  if (action === "hangup") {
    // 2026-11-07(메인 승인 계약) — 참가자 끊기. 외부 읽기 0 · 판정은 트랜잭션의 relay로만.
    const hung = await db.runTransaction(async (tx) => {
      const snap = await tx.get(sessionRef);
      const session = snap.data() as SessionDoc | undefined;
      if (!session || session.status !== "active") {
        throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
      }
      const result = planLegHangup(variant, session.relay);
      if (result.status === "ended" && result.relay) tx.update(sessionRef, { relay: result.relay });
      return result;
    });
    logger.info("레그 참가자 끊기", { sessionId, status: hung.status, legIndex: hung.status === "ended" ? hung.legIndex : undefined });
    // ⭐ 2026-11-12 판정표 LD3 — 참가자가 대출 확인 전화를 끊어도 실행 기록이 있으면 그 뒤에 입금 안내 문자.
    if (hung.status === "ended") await deliverLoanDisbursedSmsIfDue(sessionRef, sessionId);
    return hung.status === "ended" ? { status: "ended", legIndex: hung.legIndex } : { status: "not_ready", reason: hung.reason };
  }
  // 트랜잭션 밖 읽기(설치 응낙 · 사용자 발화 수) — 같은 세션의 다른 쓰기와 경합해도 판정은 아래 트랜잭션의 relay로만 확정한다.
  let installConsented = false;
  for (const landingId of installLandingIds(variant)) {
    const screen = await sessionRef.collection("mockScreens").doc(landingId).get();
    if (screen.exists && (screen.data() as { consentedAt?: unknown }).consentedAt) installConsented = true;
  }
  // ⭐ PR-B — 다음 통화 조건 화면(대출 신청) 제출 여부 = 그 화면을 연 통화 중 문자 문서의 `landingSubmittedAt`(`recordInCallSmsEvent` — 값 0 · 단계 표식만).
  const submittedLandings: string[] = [];
  for (const { landingId, smsIds } of nextLegLandingIds(variant)) {
    for (const smsId of smsIds) {
      const sms = await sessionRef.collection("inCallSms").doc(smsId).get();
      if (sms.exists && sms.get("landingSubmittedAt")) submittedLandings.push(landingId);
    }
  }
  const userTurns = (await sessionRef.collection("messages").where("role", "==", "user").count().get()).data().count;

  const plan = await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    const session = snap.data() as SessionDoc | undefined;
    if (!session || session.status !== "active") {
      throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
    }
    const result = planLegStart({ variant, relay: session.relay, action: action as LegStartAction, dialed, installConsented, userTurns, submittedLandings });
    if (result.status === "connected") {
      tx.update(sessionRef, { relay: result.relay });
    } else if (result.status === "genuine") {
      // D3 — 진짜 기관 안내(방어 종료). 리포트 · 확인 실측이 읽는 서버 기록(세션 종료는 화면이 안내 뒤 `endSession`).
      tx.update(sessionRef, {
        relay: {
          legIndex: session.relay?.legIndex ?? 0,
          legStartUserTurns: session.relay?.legStartUserTurns ?? [0],
          ...(session.relay ?? {}),
          connected: false,
          genuineNumberId: result.entry.numberId,
        },
      });
    }
    return result;
  });

  // ⭐ 2026-11-12 판정표 LD4 — 다음 통화가 연결됐는데 실행 기록 뒤 입금 안내 문자가 아직 없으면(안전망) 지금.
  if (plan.status === "connected") await deliverLoanDisbursedSmsIfDue(sessionRef, sessionId);
  // G170 — 번호 · 단계 · 상태만(대사 0).
  logger.info("레그 시작 판정", { sessionId, action, status: plan.status, rejoin: plan.status === "connected" ? plan.rejoin : undefined });
  switch (plan.status) {
    case "connected":
      return {
        status: "connected",
        legIndex: plan.legIndex,
        callerLabel: plan.leg.callerLabel,
        entry: plan.entry,
        ...(plan.rejoin ? { rejoin: plan.rejoin } : {}),
      };
    case "genuine":
      return {
        status: "genuine",
        number: plan.entry.number,
        ...(plan.entry.contactLabel ? { contactLabel: plan.entry.contactLabel } : {}),
        notice: plan.entry.genuineNotice ?? [],
      };
    case "unknown_number":
      return { status: "unknown_number" };
    default:
      return { status: "not_ready", reason: plan.reason };
  }
});
