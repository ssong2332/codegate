// 확인 시도 무력화(모의 확인 전화) 콜러블 2종 (T83). API.md `deliverVerifyOffer`·
// `deliverVerifyReconnect` 1:1. UX-031/UF-011 · ADR-0007 재적용 · ADR-0009 · Architecture.md §16 ·
// AC-071/AC-019/AC-033/AC-005.
//
// ⚠️ 이 모듈이 **하지 않는 것**(리뷰 체크포인트):
//   - 실제 발신·리다이렉트·통신 설정 변경 (**그런 API 의존이 이 파일에 없다** — 하는 일은
//     Firestore write 1건 + 문자열 반환뿐이다. 함수명의 "reconnect"는 **인앱 재현**을 뜻한다, AC-019)
//   - 참가자가 입력한 번호 수신        (요청 스키마에 번호 필드가 없다 — 화면에도 입력 필드가 없다)
//   - `messages` 컬렉션 write          (§15.6 G3/G25 — scammer↔user 짝짓기가 깨져 리포트가 손상된다)
//   - 모델 지시를 Firestore·리포트에 기록 (AC-024/ADR-0004 — 프롬프트 재료는 응답으로만 나간다)
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { findVerifyInterceptItem } from "../scenarios/verifyIntercept";
import { normalizeDifficultyLevel } from "../shared/difficulty";
import type { SessionDoc } from "../shared/types";
import { getRealtimeProvider } from "../realtime/provider";
// 에스컬레이션 세션의 "유효 voiceMode" 유추는 createRealtimeCall이 쓰는 것과 **같은 함수**를
// 재사용한다(복제하면 게이트 판정이 두 곳에서 갈라진다 — §15.6 G7과 같은 판단).
import { resolveEffectiveVoiceMode } from "../realtime";
import {
  buildVerifyInterceptDoc,
  buildVerifyOfferResponse,
  fallbackVerifyAnchor,
  realtimeVerifyAnchor,
  resolveVerifyOfferPlan,
} from "./buildDoc";
import type {
  DeliverVerifyOfferRequest,
  DeliverVerifyOfferResponse,
  DeliverVerifyReconnectRequest,
  DeliverVerifyReconnectResponse,
  VerifyCallMode,
  VerifyOfferStage,
} from "./types";

ensureFirebaseAdminApp();

export {
  buildVerifyInterceptDoc,
  buildVerifyOfferResponse,
  fallbackVerifyAnchor,
  realtimeVerifyAnchor,
  resolveVerifyOfferPlan,
} from "./buildDoc";

/** 세션 소유권 검증 — 익명 uid(2인 챌린지 사용자2)도 자기 세션이면 그대로 성립한다(§14.7). */
async function loadOwnedActiveSession(sessionId: string, uid: string): Promise<SessionDoc> {
  const db = getFirestore();
  const snap = await db.collection("sessions").doc(sessionId).get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
  }
  const session = snap.data() as SessionDoc;
  if (session.uid !== uid) {
    throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
  }
  if (session.status !== "active") {
    throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
  }
  return session;
}

/**
 * ⚠️ **재검증 5종(§16.1.5 / §16.6 G24)** — 하나라도 빠지면 위조 호출로 **일어나지 않은 "확인
 * 권유"가 리포트 타임라인에 남는다**(기록 무결성). 클라의 게이트(자격증명에 `verifyOffer`가 붙었는지)는
 * 1차 프레젠테이션 방어일 뿐이고, 서버가 여기서 전부 다시 본다.
 *   ① 세션 소유 ② `status:"active"`  ← loadOwnedActiveSession
 *   ③ 카탈로그 소속 ④ 난이도 advanced ⑤ 해석된 프로바이더가 elevenlabs가 아님(주입 지점 부재, G23)
 */
function assertVerifyEligible(session: SessionDoc, offerId?: string) {
  const item = findVerifyInterceptItem(session.scenarioId, offerId);
  if (!item) {
    throw new HttpsError("invalid-argument", "이 시나리오의 확인 안내가 아닙니다.");
  }
  if (normalizeDifficultyLevel(session.difficultyLevel) !== "advanced") {
    throw new HttpsError("failed-precondition", "고급 난이도에서만 성립하는 흐름입니다.");
  }
  const provider = getRealtimeProvider(
    session.scenarioId,
    resolveEffectiveVoiceMode(session.voiceSelectionSource),
  );
  if (provider.providerName === "elevenlabs") {
    // G23 — 이 경로에는 지시 주입 지점 자체가 없다. 컨트롤만 뜨고 사기범이 아무 말도 하지 않는
    // 반대 방향 불일치를 막기 위해 서버에서도 차단한다(createRealtimeCall이 게이트를 붙이지
    // 않는 것이 1차 방어).
    throw new HttpsError("failed-precondition", "이 통화 경로에서는 성립하지 않는 흐름입니다.");
  }
  return item;
}

/**
 * 앵커 계산(§16.3.2) — `callMode`가 **명시 판별자**다. `scammerTurns` 부재를 판별자로 오버로드하지
 * 않는다(§14.9.1). 실시간=`scammerTurns + 1`, 폴백=서버가 센 scammer 문서 수.
 */
async function resolveAnchorScammerTurn(
  sessionId: string,
  callMode: VerifyCallMode,
  scammerTurns: number | undefined,
): Promise<number> {
  if (callMode === "realtime") {
    if (typeof scammerTurns !== "number" || !Number.isFinite(scammerTurns)) {
      throw new HttpsError("invalid-argument", "실시간 경로에는 scammerTurns가 필요합니다.");
    }
    return realtimeVerifyAnchor(scammerTurns);
  }
  const db = getFirestore();
  const snap = await db
    .collection("sessions")
    .doc(sessionId)
    .collection("messages")
    .where("role", "==", "scammer")
    .get();
  return fallbackVerifyAnchor(snap.size);
}

function readCallMode(value: unknown): VerifyCallMode {
  if (value === "realtime" || value === "fallback") return value;
  throw new HttpsError("invalid-argument", "callMode는 realtime 또는 fallback이어야 합니다.");
}

/**
 * ⭐ §38.4 E — `stage` 판별자 읽기. **부재는 유효**하며 "종전 동작"을 뜻한다(폴백 경로가 그대로
 * 쓴다). 알 수 없는 값을 조용히 부재로 떨어뜨리면 **오타 하나가 2단 게이트를 통째로 무력화**하므로
 * 거절한다(§16.1.5의 "조용한 통과 금지"와 같은 판단).
 */
function readOfferStage(value: unknown): VerifyOfferStage | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === "announce" || value === "commit") return value;
  throw new HttpsError("invalid-argument", "stage는 announce 또는 commit이어야 합니다.");
}

export const deliverVerifyOffer = onCall<
  DeliverVerifyOfferRequest,
  Promise<DeliverVerifyOfferResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId, scammerTurns } = request.data ?? {};
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "sessionId가 필요합니다.");
  }
  const callMode = readCallMode(request.data?.callMode);
  const stage = readOfferStage(request.data?.stage);

  const session = await loadOwnedActiveSession(sessionId, request.auth.uid);
  const item = assertVerifyEligible(session);

  const db = getFirestore();
  const offerRef = db
    .collection("sessions")
    .doc(sessionId)
    .collection("verifyIntercept")
    .doc(item.offerId);
  // 멱등 — 이미 도착한 오퍼는 다시 쓰지 않는다(클라의 중복 호출·재연결로 offeredAt이 밀리거나
  // placedAt이 지워지면 안 된다). `inCallSms`의 멱등 규칙과 동일.
  const existing = await offerRef.get();
  const placed = Boolean(existing.get("placedAt"));
  // ⭐⭐ §38.4 후보 E — **write 시점만 뒤로 옮긴다.** 재검증 5종(위 `loadOwnedActiveSession` +
  // `assertVerifyEligible`)은 **단계와 무관하게 전부** 통과해야 한다 — 1단계라고 검사를 건너뛰면
  // §16.1.5/G24가 막으려던 위조 호출 표면이 그대로 열린다.
  // T118/R-1(전환 후 재권유 금지)도 여기서 함께 곱해진다 — 판정은 순수 함수 한 곳이 소유한다.
  const plan = resolveVerifyOfferPlan({ placed, ...(stage ? { stage } : {}) });
  if (plan.persist && !existing.exists) {
    const anchor = await resolveAnchorScammerTurn(sessionId, callMode, scammerTurns);
    await offerRef.create(buildVerifyInterceptDoc(item, Timestamp.now(), anchor));
  }

  return buildVerifyOfferResponse(item, { placed, ...(stage ? { stage } : {}) });
});

export const deliverVerifyReconnect = onCall<
  DeliverVerifyReconnectRequest,
  Promise<DeliverVerifyReconnectResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId, offerId, scammerTurns } = request.data ?? {};
  if (!sessionId || !offerId) {
    throw new HttpsError("invalid-argument", "sessionId와 offerId가 필요합니다.");
  }
  const callMode = readCallMode(request.data?.callMode);

  const session = await loadOwnedActiveSession(sessionId, request.auth.uid);
  const item = assertVerifyEligible(session, offerId);

  const db = getFirestore();
  const offerRef = db
    .collection("sessions")
    .doc(sessionId)
    .collection("verifyIntercept")
    .doc(item.offerId);
  const snap = await offerRef.get();
  if (!snap.exists) {
    // 오퍼 없이 재연결이 성립하지 않는다(참가자는 "안내받은 번호"로만 걸 수 있다).
    throw new HttpsError("failed-precondition", "확인 안내가 도착하지 않았습니다.");
  }

  // 멱등 — `placedAt`이 이미 있으면 밀지 않는다(재연결 판정 앵커가 뒤로 밀리면 §16.3.3의 주석
  // 경계가 흔들린다). 지시문은 그대로 다시 돌려준다(재시도가 조용히 실패하지 않게).
  if (!snap.get("placedAt")) {
    const anchor = await resolveAnchorScammerTurn(sessionId, callMode, scammerTurns);
    await offerRef.update({
      placedAt: Timestamp.now(),
      reconnectAnchorScammerTurn: anchor,
      reconnectedCallerLabel: item.reconnectedCallerLabel,
    });
  }

  // T118/A5-3 — 전환 상태 단언 1줄을 함께 내려보낸다(클라가 이후 턴 경계마다 다시 넣는다, §25.3).
  return {
    reconnectInstruction: item.reconnectInstruction,
    transferStateLine: item.transferStateLine,
  };
});
