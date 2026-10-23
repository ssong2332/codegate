// 통화 중 문자(in-call SMS) 콜러블 2종 (T68). API.md `deliverInCallSms`·`recordInCallSmsEvent` 1:1.
// UX-027/UF-008 · ADR-0007 · Architecture.md §15.1.2 · AC-059/060/061.
//
// ⚠️ 이 모듈이 **하지 않는 것**(리뷰 체크포인트):
//   - `messages` 컬렉션 write            (§15.6 G3 — 리포트의 scammer↔user 짝짓기가 깨진다)
//   - 문자 본문·인증번호를 클라 입력에서 받기 (본문은 100% 서버 카탈로그가 원천 — AC-060)
//   - 답장·전달·전송 경로 제공             (읽기 전용 화면 — AC-060)
//   - `url`/실 URL 필드 생성               (구조적 금지 — AC-032/045)
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { assertAnonymousChallengeScope } from "../shared/anonymousGate";
import { SMS_DECLINE_ALREADY, SMS_DECLINE_TOO_EARLY } from "../scenarios/inCallSms";
import { findVerifyInterceptItem, hasVerifyIntercept } from "../scenarios/verifyIntercept";
import type { SessionDoc } from "../shared/types";
import { buildConfirmResultField, buildInCallSmsResponse, realtimeAnchorScammerTurn } from "./buildDoc";
import {
  MAX_CLAIMED_TURNS,
  SMS_DECLINE_NOT_ALLOWED,
  alreadyNudged,
  buildSmsNudgeInstruction,
  correctModelSmsPurpose,
  planSmsBackstop,
  resolveDeclaredSms,
} from "./smsGate";
import type { SmsGateStatus } from "./smsGate";
import { deliverSmsThroughGate, firestoreSmsStore, readDeliveredSms } from "./smsDelivery";
import { goalFollowUpFor, planGoalWrapUp } from "../scammerHangup/goalAction";
import { GOAL_WRAP_UP_INSTRUCTION } from "../scammerHangup/guidance";
import type {
  DeliverInCallSmsRequest,
  DeliverInCallSmsResponse,
  DeliverInCallSmsTrigger,
  InCallSmsEvent,
  RecordInCallSmsEventRequest,
  RecordInCallSmsEventResponse,
} from "./types";

ensureFirebaseAdminApp();

export {
  buildInCallSmsDoc,
  buildInCallSmsResponse,
  realtimeAnchorScammerTurn,
  textPathAnchorScammerTurn,
  resolveInCallSmsPlan,
} from "./buildDoc";
import { resolveFictionalBankName } from "../shared/fictionalBank";

/**
 * §53.6 (3)/§53.8 2 — 이 세션의 확인 시도 무력화 오퍼가 이미 **전환 완료**(`placedAt` 존재)
 * 상태인지 읽는다. `hasVerifyIntercept`가 있는 시나리오에서만 read한다(`roleplay/index.ts`의
 * `verifyEnabled` 게이팅과 동형).
 * ⚠️ **read는 1종이 아니라 6종에서 발생한다**(institutional·card·loan-refinance·tax-refund·
 * courier-customs·bank — `scenarios/verifyIntercept.ts:195-200` 카탈로그 전수 확인, reviewer
 * 지적으로 정정). ⭐ **§61(OQ-A73) 이후 계열 B(bank 제외 5종)에서도 모델 도구 경로로 `placedAt`이
 * 생길 수 있다** — 계열 B는 앱 주도 오퍼(`verifyIntentExpressed`)는 여전히 영구 `false`지만
 * (§61.2 · G393), 모델이 `offer_verification_desk` 도구를 불러 announce→commit이 이어지면
 * 전환이 완료된다. ⇒ **이 read의 출력은 6종 전부에서 유효하다** — 전환이 끝난 오퍼가 연 문자에는
 * `announceInstruction`을 싣지 않는 §53.6 (3) 규칙이 계열 B에서도 발동할 수 있다(§61.8, 회귀
 * 아님 — 설계대로다). read 비용 자체가 무시 가능한지는 실측하지 않았다.
 *
 * ⛔ **throw하지 않는다(P-4 핵심 루프 비차단)** — 조회 실패는 `catch`로 흡수하고 `false`(=
 * 종전대로 지시를 싣는다)로 떨어진다.
 */
async function isVerifyOfferPlaced(
  db: FirebaseFirestore.Firestore,
  sessionId: string,
  scenarioId: string,
): Promise<boolean> {
  if (!hasVerifyIntercept(scenarioId)) return false;
  const verifyItem = findVerifyInterceptItem(scenarioId);
  if (!verifyItem) return false;
  try {
    const verifySnap = await db
      .collection("sessions")
      .doc(sessionId)
      .collection("verifyIntercept")
      .doc(verifyItem.offerId)
      .get();
    return Boolean(verifySnap.get("placedAt"));
  } catch {
    return false;
  }
}

/** 세션 소유권 검증 — 익명 uid(2인 챌린지 사용자2)도 자기 세션이면 그대로 성립한다(§14.7). */
async function loadOwnedSession(sessionId: string, uid: string): Promise<SessionDoc> {
  const db = getFirestore();
  const snap = await db.collection("sessions").doc(sessionId).get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
  }
  const session = snap.data() as SessionDoc;
  if (session.uid !== uid) {
    throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
  }
  return session;
}

/**
 * §59.6/§59.10 커밋 B — `trigger` 판별자 읽기. **부재는 유효**하며 "종전 동작"을 뜻한다(오늘
 * 유일한 실호출). 알 수 없는 값을 조용히 부재로 떨어뜨리면 오타 하나가 §59.7 하한 재검증을
 * 통째로 무력화하므로 거절한다(`verifyIntercept/index.ts`의 `readOfferStage`와 같은 판단).
 */
function readTrigger(value: unknown): DeliverInCallSmsTrigger | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === "backstop" || value === "model_tool") return value;
  throw new HttpsError("invalid-argument", "trigger는 backstop 또는 model_tool이어야 합니다.");
}

/** T191 — 클라 주장 카운터의 범위 검사(설계 "서버는 범위만 검사"). 범위 밖은 오류(조용히 0으로 바꾸지 않는다). */
function readClaimedTurns(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_CLAIMED_TURNS) {
    throw new HttpsError("invalid-argument", `${name}는 0~${MAX_CLAIMED_TURNS} 정수여야 합니다.`);
  }
  return value;
}

/** 거부 4종 → 서버 소유 거부 문면(설계 "거부 응답 문면"). */
function declineInstructionFor(status: Exclude<SmsGateStatus, "allowed">): string {
  if (status === "not_allowed") return SMS_DECLINE_NOT_ALLOWED;
  if (status === "already_delivered") return SMS_DECLINE_ALREADY;
  return SMS_DECLINE_TOO_EARLY; // too_early · too_soon
}

export const deliverInCallSms = onCall<
  DeliverInCallSmsRequest,
  Promise<DeliverInCallSmsResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId } = request.data ?? {};
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "sessionId가 필요합니다.");
  }
  const trigger = readTrigger(request.data?.trigger);

  const session = await loadOwnedSession(sessionId, request.auth.uid);
  assertAnonymousChallengeScope(request.auth, session);
  if (session.status !== "active") {
    throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
  }

  // T191 — 이 계약 이전 클라(캐시된 화면 · `smsId`만 보낸다)는 문자를 보내지 않는다. 옛 화면은 `status`가
  // "delivered"가 아니면 아무것도 주입하지 않고 오류도 띄우지 않으므로, throw 대신 거부로 응답한다(배포 직후
  // HTML 캐시 1시간 동안의 관측 가능한 강등 — 로그 1줄).
  if (request.data?.userTurns === undefined) {
    logger.info("[T191] deliverInCallSms 구 계약 요청 — 발송 안 함", { sessionId, trigger: trigger ?? null });
    return { status: "not_allowed", declineInstruction: SMS_DECLINE_NOT_ALLOWED };
  }
  const userTurns = readClaimedTurns(request.data.userTurns, "userTurns");
  const scammerTranscriptTurns = readClaimedTurns(
    request.data.scammerTranscriptTurns,
    "scammerTranscriptTurns",
  );

  // ⭐ T191 — 판정 원천은 세션의 흐름 변형 선언이다(카탈로그 고정 턴 폐기). 선언 밖 목적은 보내지 않는다.
  const { declared, reason: declaredReason } = resolveDeclaredSms(session.scenarioId, session.flowVariantId);
  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);

  // 백스톱(목적 없음) — 필수 목적만 강제 · 선택 목적은 건너뛴다. 계획은 트랜잭션 밖 조회로 세우고, 발송은
  // 아래 단일 통로가 같은 게이트를 다시 통과시킨다.
  let purpose: unknown = request.data.purpose;
  if (trigger === "backstop") {
    // §104 — 사기범이 이미 "문자를 보냈다"고 말했다는 클라 주장(불리언 1개 · 부재 = 종전). 게이트 하한은 그대로라 앞당기는 것은 대기 단계뿐이다.
    const smsClaimed = request.data?.smsClaimed === true;
    const deliveredNow = await readDeliveredSms(sessionRef);
    const plan = planSmsBackstop({ declared, delivered: deliveredNow, userTurns, claimed: smsClaimed });
    if (plan.action === "wait") return { status: "waiting" };
    if (plan.action === "none_pending") {
      // §115 — 후속 단계 변형은 할 일을 마칠 때까지 계속 묻게 하고(`goal_pending`), 마친 첫 질의에 마무리 지시 1줄을 싣는다.
      const followUpUserTurns = goalFollowUpFor(session.scenarioId, session.flowVariantId);
      if (followUpUserTurns === undefined) return { status: "none_pending" };
      const wrap = planGoalWrapUp({
        delivered: deliveredNow,
        declared,
        declaredKnown: declaredReason === undefined,
        userTurns,
        followUpUserTurns,
        placed: await isVerifyOfferPlaced(db, sessionId, session.scenarioId),
      });
      if (wrap === "pending") return { status: "goal_pending" };
      if (wrap === "wrap_up") {
        logger.info("[§115] 할 일 완료 — 마무리 지시", { sessionId, userTurns });
        return { status: "none_pending", wrapUpInstruction: GOAL_WRAP_UP_INSTRUCTION };
      }
      return { status: "none_pending" };
    }
    if (plan.action === "nudge") {
      // 전환(호 전환) 뒤에는 원 사기범이 없다 — 넛지를 싣지 않는다(§53.6 (3)과 같은 판단). ⚠️ 리뷰 Minor ④ — 반면
      // **발송(deliver)은 전환 뒤에도 그대로 한다**: 문서(계좌 · 링크)는 도착하고 `buildInCallSmsResponse`가 announce만
      // 뺀다(의도 — 확인 데스크 화자가 "제가 보냈다"고 말하지 않게. 문자 자체는 참가자 화면 · 리포트에 남는다).
      const placed = await isVerifyOfferPlaced(db, sessionId, session.scenarioId);
      if (placed) return { status: "waiting" };
      // 리뷰 Minor ③ — 같은 개방 시점으로는 넛지 1회(화면 재마운트로 같은 발화 수를 다시 물어도). 쓰기는 넛지당 1회.
      if (alreadyNudged(session.smsNudgedOpenAt, plan.openAt)) return { status: "waiting" };
      await sessionRef.update({ smsNudgedOpenAt: FieldValue.arrayUnion(plan.openAt) });
      return { status: "nudge", nudgeInstruction: buildSmsNudgeInstruction(plan.item.purpose) };
    }
    purpose = plan.item.purpose;
  }
  // §108 — 모델 도구가 목적을 잘못 골랐는데 남은 필수 문자의 게이트가 열려 있으면 그 문자를 보낸다(판정표 `correctModelSmsPurpose`).
  // 계획은 트랜잭션 밖 조회로 세우고, 발송은 아래 단일 통로가 같은 게이트를 다시 통과시킨다(백스톱과 같은 형태).
  let purposeCorrectedFrom: string | undefined;
  if (trigger !== "backstop") {
    const corrected = correctModelSmsPurpose({ purpose, declared, delivered: await readDeliveredSms(sessionRef), userTurns });
    purpose = corrected.purpose;
    purposeCorrectedFrom = corrected.correctedFrom;
  }

  // §81 — 세션 가상 은행명(문자 본문·도착 지시·대사가 같은 이름). 부재(옛 세션)는 sessionId 해시.
  const fictionalBankName = resolveFictionalBankName({ sessionId, fictionalBankName: session.fictionalBankName });
  const result = await deliverSmsThroughGate(firestoreSmsStore(db, sessionRef), {
    scenarioId: session.scenarioId,
    declared,
    purpose,
    userTurns,
    anchorScammerTurn: realtimeAnchorScammerTurn(scammerTranscriptTurns),
    trigger: trigger ?? "model_tool",
    fictionalBankName,
    sessionId, // §114 — 세션별 인증번호(문서 본문 · Live 대조 1줄이 같은 값)
  });

  // 관측(§59.11 관례 · AC-099 (h)) — 도착 · 거부 모두 그 시점의 사용자 발화 수와 함께 1줄. 거부는 Firestore 델타 0.
  logger.info("[T191] deliverInCallSms 판정", {
    sessionId,
    trigger: trigger ?? null,
    // 모델 원값이라 길이를 자른다(로그 오염 방지 · 리뷰 Minor ①).
    purpose: typeof purpose === "string" ? purpose.slice(0, 32) : null,
    status: result.status,
    userTurns,
    scammerTranscriptTurns,
    ...(declaredReason ? { declaredReason } : {}),
    ...(purposeCorrectedFrom ? { purposeCorrectedFrom } : {}),
  });

  if (result.status !== "delivered") {
    return { status: result.status, declineInstruction: declineInstructionFor(result.status) };
  }
  const placed = await isVerifyOfferPlaced(db, sessionId, session.scenarioId);
  const item = result.item;
  // A-1 ⑦ — 선언 항목을 넘겨 결과 신호(`confirmResultInstruction`, 필수 계좌·링크 문자만)를 응답에 싣는다. 클라 주입은 A-2.
  const declaredItem = declared.find((d) => d.smsId === item.smsId);
  return {
    ...buildInCallSmsResponse(item, { placed, fictionalBankName }),
    ...buildConfirmResultField({ placed, scenarioId: session.scenarioId }, declaredItem),
    status: "delivered",
  };
});

/** 이벤트 → 문서 시각 필드(최초 1회). §101 — 사이트 단계 3종은 랜딩이 있는 문서에서만(아래 가드). */
const EVENT_FIELD: Record<InCallSmsEvent, string> = {
  opened: "openedAt",
  link_tapped: "linkTappedAt",
  landing_submitted: "landingSubmittedAt",
  landing_identity: "landingIdentityAt",
  landing_converted: "landingConvertedAt",
  landing_amount: "landingAmountAt",
};

/** 자기 키만 본다(`in`은 `"constructor"` 같은 상속 키도 통과시킨다). */
function isInCallSmsEvent(value: unknown): value is InCallSmsEvent {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(EVENT_FIELD, value);
}

export const recordInCallSmsEvent = onCall<
  RecordInCallSmsEventRequest,
  Promise<RecordInCallSmsEventResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId, smsId, event } = request.data ?? {};
  // ⛔ 고정 enum 값만 받는다 — 참가자 입력값을 담을 필드가 요청 타입에 **존재하지 않는다**(AC-045). §101 — 사이트 단계 3값 추가.
  if (!sessionId || !smsId || !isInCallSmsEvent(event)) {
    throw new HttpsError("invalid-argument", "sessionId·smsId·event가 필요합니다.");
  }

  const session = await loadOwnedSession(sessionId, request.auth.uid);
  assertAnonymousChallengeScope(request.auth, session);
  // §15.6 G20 — 종료된 세션의 기록은 애초에 받지 않는다. 리포트는 멱등 early-return이라
  // (`report/generateReportCore.ts`) 생성 **이후**에 성공한 write는 smsTimeline 스냅샷에 영영
  // 반영되지 않는다 — 조용히 성공을 돌려주면 "기록됐는데 어디에도 안 보이는" 상태가 남는다.
  // 오버레이는 통화 중에만 존재하므로 정상 경로 영향은 0이고, 종료 직전 탭과 endSession의 경합만
  // 걸린다. 클라는 API.md Errors대로 이 실패를 조용히 흡수하므로(훈련을 막지 않는다) 원인을
  // 추적할 수 있게 서버 로그만 남긴다.
  if (session.status !== "active") {
    logger.warn("종료된 세션의 문자 이벤트 기록 거부(§15.6 G20 — 리포트 스냅샷 이후 write 방지)", {
      sessionId,
      smsId,
      event,
      status: session.status,
    });
    throw new HttpsError("failed-precondition", "이미 종료된 세션입니다.");
  }

  const db = getFirestore();
  const smsRef = db.collection("sessions").doc(sessionId).collection("inCallSms").doc(smsId);
  const snap = await smsRef.get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "도착하지 않은 문자입니다.");
  }
  // T123/AC-080 — 제출은 **링크형 문자가 연 랜딩**에서만 일어난다. `fakeLandingId`가 없는 문서에
  // 제출을 기록하면 리포트가 카탈로그 항목을 찾지 못해 승격이 조용히 0건이 되고, 그때 남는 것은
  // "기록은 됐는데 어디에도 안 보이는" 상태다(§15.6 G20이 막은 것과 같은 형태). 여기서 거절한다.
  if (event !== "opened" && event !== "link_tapped" && !snap.get("fakeLandingId")) {
    throw new HttpsError("failed-precondition", "이 문자에는 가짜 랜딩이 없습니다.");
  }

  const field = EVENT_FIELD[event];
  // 최초 1회만 세팅한다(§API.md) — 다시 열어봐도 "처음 열어본 시각"이 밀리지 않는다.
  if (!snap.get(field)) {
    await smsRef.update({ [field]: Timestamp.now() });
  }
  return { recorded: true };
});
