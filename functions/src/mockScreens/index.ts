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
import { assertAnonymousChallengeScope } from "../shared/anonymousGate";
import { findMockScreenItem, isMockScreenReachable } from "../scenarios/mockScreens";
import { sessionReachableLandingIds } from "../scenarios/reachability";
import { anchorFromInCallSmsDoc, findDeclaredSmsIdForLanding, readMockScreenCallMode } from "./inCallAnchor";
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
 * ⑥ T194-c-1(§84.15.3) — 통화 중 설치 화면의 도착 검증 + 명시 앵커(판정은 `./inCallAnchor.ts` 순수 함수 — 이 함수는 get 1회만 한다).
 * `callMode`는 c-1에서 관측 로그로만 쓴다(실시간 응낙 지시 동봉은 T194-c-2).
 */
async function readInCallLandingAnchor(
  sessionId: string,
  session: SessionDoc,
  landingId: string,
  rawCallMode: unknown,
): Promise<number | undefined> {
  const callMode = readMockScreenCallMode(rawCallMode);
  const smsId = findDeclaredSmsIdForLanding(session.scenarioId, session.flowVariantId, landingId);
  if (!smsId) {
    throw new HttpsError("failed-precondition", "이 세션에서는 열 수 없는 화면입니다.");
  }
  const smsSnap = await getFirestore().collection("sessions").doc(sessionId).collection("inCallSms").doc(smsId).get();
  const anchor = anchorFromInCallSmsDoc({ exists: smsSnap.exists, anchorScammerTurn: smsSnap.get("anchorScammerTurn") });
  // G170 — ID · 경로 · 숫자만(대사 0).
  logger.info("[T194-c-1] 통화 중 설치 화면 기록", { sessionId, landingId, smsId, callMode, anchorResolved: anchor !== undefined });
  return anchor;
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
 *   ⑤-a G588(§84.13.2) — `landingId ∈ sessionReachableLandingIds(scenarioId, flowVariantId)`(전 kind) → `failed-precondition`
 *   ⑤ T194-a(§84.4.4 · G582) — 그 항목이 **이 세션에서 도달 가능**한지(`isMockScreenReachable`) → `failed-precondition`.
 *      ⚠️ 실행 위치는 ③ **바로 뒤**(④보다 앞)다 — 도달 불가 항목은 어떤 이벤트도 기록하지 않는다(번호는 추가 순서).
 *   ⑥ T194-c-1(§84.5.3 · §84.15.3 · G584 · G606) — **통화 중 문자 표면 항목(Q2)만**: `callMode` 필수(부재 · 값 밖 → `invalid-argument`) →
 *      그 랜딩을 연 **선언 문자의 도착 문서**(`inCallSms/{smsId}`) get 1회(부재 → `failed-precondition`) → 새 문서의 `anchorScammerTurn` =
 *      그 문자 문서의 값 복사(응낙 시점의 클라 계수 0 — Q-X5). 메신저 표면 항목은 이 단계를 타지 않는다(무변경).
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
  assertAnonymousChallengeScope(request.auth, session);
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
  // ⑤-a G588(docs/Architecture.md §84.13.2) — 그 세션(시나리오 × 변형)의 **도달 가능 랜딩 집합 밖**이면 kind와 무관하게 거부한다.
  // 세션의 `mockScreens` 문서 ⊆ 도달 가능 집합 — G159(단위 = 시나리오 × 변형, G589)가 세는 조건이 런타임에서도 참이 되게 하는 짝이다.
  if (!sessionReachableLandingIds(session.scenarioId, session.flowVariantId).includes(landingId)) {
    throw new HttpsError("failed-precondition", "이 세션에서는 열 수 없는 화면입니다.");
  }
  // ⑤ T194-a(docs/Architecture.md §84.4.4 · G582 · AC-106 (h) ⓐ) — 카탈로그 소속(③)은 시나리오 단위다. 같은 시나리오 안에서
  // 난이도로 갈리는 항목(parcel 고급의 `parcel-install`)은 **이 세션에서 도달 가능할 때만** 기록한다 — 초급 · 중급 · 챌린지
  // 세션이 그 항목의 응낙을 만들면 AC-105 발동 조건(응낙 세션)이 거짓으로 성립한다.
  if (!isMockScreenReachable(session, item)) {
    throw new HttpsError("failed-precondition", "이 세션에서는 열 수 없는 화면입니다.");
  }
  // ⑥ T194-c-1 — 통화 중 문자 표면(Q2)의 도착 검증 + 명시 앵커(§84.15.3). 메신저 표면은 `undefined`(앵커는 첨부 기반 리졸버 — 무변경).
  const inCallAnchor =
    item.entrySurface === "in-call-sms"
      ? await readInCallLandingAnchor(sessionId, session, landingId, request.data?.callMode)
      : undefined;
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
      // T194-c-1(§84.15.3 · G606) — 통화 중 설치 문서만. 부재 = 메신저 경로(종전 문서와 같은 모양).
      ...(inCallAnchor !== undefined ? { anchorScammerTurn: inCallAnchor } : {}),
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
