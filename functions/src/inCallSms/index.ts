// 통화 중 문자(in-call SMS) 콜러블 2종 (T68). API.md `deliverInCallSms`·`recordInCallSmsEvent` 1:1.
// UX-027/UF-008 · ADR-0007 · Architecture.md §15.1.2 · AC-059/060/061.
//
// ⚠️ 이 모듈이 **하지 않는 것**(리뷰 체크포인트):
//   - `messages` 컬렉션 write            (§15.6 G3 — 리포트의 scammer↔user 짝짓기가 깨진다)
//   - 문자 본문·인증번호를 클라 입력에서 받기 (본문은 100% 서버 카탈로그가 원천 — AC-060)
//   - 답장·전달·전송 경로 제공             (읽기 전용 화면 — AC-060)
//   - `url`/실 URL 필드 생성               (구조적 금지 — AC-032/045)
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { findInCallSmsItem } from "../scenarios/inCallSms";
import type { SessionDoc } from "../shared/types";
import { buildInCallSmsDoc } from "./buildDoc";
import type {
  DeliverInCallSmsRequest,
  DeliverInCallSmsResponse,
  RecordInCallSmsEventRequest,
  RecordInCallSmsEventResponse,
} from "./types";

ensureFirebaseAdminApp();

export { buildInCallSmsDoc } from "./buildDoc";

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
    await smsRef.create(buildInCallSmsDoc(item, Timestamp.now()));
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

  await loadOwnedSession(sessionId, request.auth.uid);

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
