// 인앱 모의 화면 상호작용 기록 콜러블 (T84). API.md 부록 A `recordMockScreenEvent` 1:1.
// UX-023 kind=`app-install` / UF-012 · Architecture.md §15.9.6 · DECISIONS #42 · AC-072/AC-073.
//
// ⚠️ 이 모듈이 **하지 않는 것**(리뷰 체크포인트):
//   - `messages` 컬렉션 write            (§15.6 G3 — 리포트의 scammer↔user 짝짓기가 깨진다)
//   - 채널 전이 트리거                    (§15.9.7 G54 — 응낙은 전이 신호가 아니다. 전이는 기존
//                                          `[[SIGNAL:ESCALATE_VOICE]]`·max-turn·명시 버튼으로만)
//   - 참가자 입력값 수신·저장             (AC-045 — 목업의 입력은 컴포넌트 로컬 state를 벗어나지 않는다)
//   - `url`/스토어 URL/앱명/권한 목록 생성 (AC-072 구조적 금지 — 스키마에 필드 자체가 없다)
//   - 새 세션·새 리포트 생성              (§15.9.7 G51 — 세션은 **언제나 하나**다, AC-007)
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { findMockScreenItem } from "../scenarios/mockScreens";
import type { MockScreenDoc, SessionDoc } from "../shared/types";
import type { RecordMockScreenEventRequest, RecordMockScreenEventResponse } from "./types";

ensureFirebaseAdminApp();

/** 세션 소유권 검증 — 익명 uid(2인 챌린지 사용자2)도 자기 세션이면 그대로 성립한다(§14.7).
 * `inCallSms/index.ts`의 동명 헬퍼와 같은 규칙이다(두 모듈이 서로를 import하면 콜러블 배포
 * 그래프가 얽히므로 각자 지역 헬퍼로 둔다 — 기존 관례). */
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
 * 서버 검증 **순서 고정**(§15.9.6 표):
 *   ① 인증 + 세션 소유권 → `permission-denied`
 *   ② `session.status === "active"` → `failed-precondition`(§15.6 **G20**이 `recordInCallSmsEvent`
 *      에서 지적한 결함을 **신규 콜러블에서는 처음부터** 막는다 — 리포트는 멱등 early-return이라
 *      생성 이후의 write는 스냅샷에 영영 반영되지 않는다)
 *   ③ `MOCK_SCREENS[session.scenarioId]`에 그 `landingId`가 **소속**되는지 → `failed-precondition`
 *      (§15.6 G12 동형 — 클라가 임의 landingId를 넣어 가짜 "속은 순간"을 만들 수 없다)
 *   ④ `event==="consented"`는 `kind==="app-install"`일 때만 → `invalid-argument`
 */
export const recordMockScreenEvent = onCall<
  RecordMockScreenEventRequest,
  Promise<RecordMockScreenEventResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId, landingId, event } = request.data ?? {};
  if (
    !sessionId ||
    !landingId ||
    (event !== "shown" && event !== "consented" && event !== "submitted")
  ) {
    throw new HttpsError("invalid-argument", "sessionId·landingId·event가 필요합니다.");
  }

  const session = await loadOwnedSession(sessionId, request.auth.uid);
  if (session.status !== "active") {
    logger.warn("종료된 세션의 모의 화면 이벤트 기록 거부(§15.6 G20 — 리포트 스냅샷 이후 write 방지)", {
      sessionId,
      landingId,
      event,
      status: session.status,
    });
    throw new HttpsError("failed-precondition", "이미 종료된 세션입니다.");
  }

  const item = findMockScreenItem(session.scenarioId, landingId);
  if (!item) {
    throw new HttpsError("failed-precondition", "이 시나리오의 모의 화면이 아닙니다.");
  }
  if (event === "consented" && item.kind !== "app-install") {
    throw new HttpsError("invalid-argument", "이 화면에는 권한 허용 단계가 없습니다.");
  }
  // T123/AC-080 — 위 가드의 **정확한 거울**이다. `app-install` 목업에는 입력 필드가 0개이므로
  // (AC-072) 제출이라는 행위 자체가 없다. 두 이벤트가 kind로 상호배타라 같은 문서에서 승격이
  // 두 번 일어나지 않는다.
  if (event === "submitted" && item.kind === "app-install") {
    throw new HttpsError("invalid-argument", "이 화면에는 입력 제출 단계가 없습니다.");
  }

  const db = getFirestore();
  const ref = db.collection("sessions").doc(sessionId).collection("mockScreens").doc(landingId);
  const snap = await ref.get();
  const now = Timestamp.now();

  if (!snap.exists) {
    // 문서 id가 landingId라 멱등이다. `consented`가 먼저 도착하는 경로는 정상 흐름에 없지만
    // (화면이 떠야 버튼을 누른다) 도착해도 조용히 잃지 않고 `shownAt`을 함께 채운다.
    const doc: MockScreenDoc = {
      landingId,
      kind: item.kind,
      shownAt: now,
      ...(event === "consented" ? { consentedAt: now } : {}),
      ...(event === "submitted" ? { submittedAt: now } : {}),
    };
    await ref.create(doc);
    return { ok: true };
  }

  // 최초 1회만 세팅한다(§15.9.6) — 다시 열어봐도 "처음 열어본 시각"·"처음 응낙한 시각"이 밀리지
  // 않는다(`recordInCallSmsEvent`의 기존 관례와 동일).
  const field =
    event === "shown" ? "shownAt" : event === "consented" ? "consentedAt" : "submittedAt";
  if (!snap.get(field)) {
    await ref.update({ [field]: now });
  }
  return { ok: true };
});
