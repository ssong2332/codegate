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
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { findInCallSmsItem } from "../scenarios/inCallSms";
import type { SessionDoc } from "../shared/types";
import { buildInCallSmsDoc, realtimeAnchorScammerTurn } from "./buildDoc";
import type {
  DeliverInCallSmsRequest,
  DeliverInCallSmsResponse,
  RecordInCallSmsEventRequest,
  RecordInCallSmsEventResponse,
} from "./types";

ensureFirebaseAdminApp();

export {
  buildInCallSmsDoc,
  realtimeAnchorScammerTurn,
  fallbackAnchorScammerTurn,
} from "./buildDoc";

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

export const deliverInCallSms = onCall<
  DeliverInCallSmsRequest,
  Promise<DeliverInCallSmsResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId, smsId } = request.data ?? {};
  if (!sessionId || !smsId) {
    throw new HttpsError("invalid-argument", "sessionId와 smsId가 필요합니다.");
  }

  const session = await loadOwnedSession(sessionId, request.auth.uid);
  if (session.status !== "active") {
    throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
  }

  // ⚠️ G12 — smsId가 **이 세션 시나리오의 카탈로그 소속**인지 재검증한다. 이게 없으면 클라가 다른
  // 시나리오(혹은 존재하지 않는) 문자를 임의로 주입하는 경로가 된다(§15.6 G12).
  const item = findInCallSmsItem(session.scenarioId, smsId);
  if (!item) {
    throw new HttpsError("invalid-argument", "이 시나리오의 문자가 아닙니다.");
  }

  // 멱등 — 이미 도착한 문자는 다시 쓰지 않는다(클라의 중복 호출·재연결로 arrivedAt이 밀리거나
  // openedAt이 지워지면 안 된다).
  const db = getFirestore();
  const smsRef = db.collection("sessions").doc(sessionId).collection("inCallSms").doc(smsId);
  const existing = await smsRef.get();
  if (!existing.exists) {
    // 앵커(§15.1.5 (4)) — 실시간 경로 보정은 realtimeAnchorScammerTurn이 소유한다(근거는 그 함수
    // doc 주석). 여기서 손으로 ±1 하지 않는다 — 두 경로의 보정이 갈라지지 않게 하기 위해서다.
    await smsRef.create(buildInCallSmsDoc(item, Timestamp.now(), realtimeAnchorScammerTurn(item)));
  }

  return { smsId: item.smsId, announceInstruction: item.announceInstruction };
});

export const recordInCallSmsEvent = onCall<
  RecordInCallSmsEventRequest,
  Promise<RecordInCallSmsEventResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId, smsId, event } = request.data ?? {};
  if (!sessionId || !smsId || (event !== "opened" && event !== "link_tapped")) {
    throw new HttpsError("invalid-argument", "sessionId·smsId·event가 필요합니다.");
  }

  const session = await loadOwnedSession(sessionId, request.auth.uid);
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
  const field = event === "opened" ? "openedAt" : "linkTappedAt";
  // 최초 1회만 세팅한다(§API.md) — 다시 열어봐도 "처음 열어본 시각"이 밀리지 않는다.
  if (!snap.get(field)) {
    await smsRef.update({ [field]: Timestamp.now() });
  }
  return { recorded: true };
});
