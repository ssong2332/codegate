// 2인 소셜 챌린지 — 사용자2(동의·체험·신고·결과공유) 측 콜러블 (T37, Architecture.md §14.7,
// ADR-0006, Database.md §challenges/§sessions, AC-040/042/043/048/049).
//
// ⚠️ 스코프: T36(challenge/index.ts)이 만든 사용자1(발신) 측 primitive(hashToken/
// resolveChallengeByTokenHash/markChallengeConsumed)를 반드시 재사용한다 — 새 토큰 해시·조회
// 로직을 여기서 다시 만들지 않는다(T36 헤더 주석의 명시적 지시). index.ts가 아니라 별도 파일로
// 나눈 이유: T36/T37이 같은 챌린지 문서를 다루지만 관심사(발신자의 생성·폐기 vs 수신자의 동의·
// 체험·신고)가 뚜렷이 갈려 index.ts가 계속 불어나는 걸 막기 위함(module boundary는 challenge/
// 폴더 전체로 유지, 태스크 지시 "your call" 판단).
//
// **A1 핵심 불변식 — 이 파일 전체가 지켜야 할 단 하나의 규칙(ADR-0006)**: 사용자2 체험 세션
// (sessions/{sid})에는 챌린지 clone `voiceId`를 절대 저장하지 않는다. voiceId가 필요한 유일한
// 지점(consentChallenge의 오프닝 합성)에서도 challenges/{challengeId}에서 in-memory로만 읽어
// VoiceProvider.synthesize에 바로 넘기고, 그 값을 SessionDoc 어디에도 assign하지 않는다.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { maskPII } from "../guardrails";
import { generateOpeningLine, isUsingMockLlm } from "../roleplay";
import { SCENARIO_PROMPTS } from "../scenarios";
import { MAX_SESSION_MS, MAX_USER_TURNS } from "../shared/constants";
import { getVoiceProvider } from "../voice/provider";
import { hashToken } from "./token";
import { markChallengeConsumed, resolveChallengeByTokenHash } from "./index";
import { decideConsentGate } from "./consentGate";
import type { ChallengeDoc, ChallengeResultSummary, MessageDoc, ReportDoc, SessionDoc } from "../shared/types";
import type {
  ConsentChallengeRequest,
  ConsentChallengeResponse,
  GetChallengeLandingRequest,
  GetChallengeLandingResponse,
  ReportChallengeRequest,
  ReportChallengeResponse,
  SetChallengeResultSharingRequest,
  SetChallengeResultSharingResponse,
} from "./types";

ensureFirebaseAdminApp();

const REPORT_REASONS = new Set(["unwanted", "harassment", "impersonation_concern", "other"]);

/** challengeId로 사용자2 체험 세션 1건을 찾는다(Database.md `sessions.challengeId` 인덱스,
 * §14.1 "챌린지 1:N 사용자2 체험 세션" — 실제로는 항상 최대 1건). 아직 동의 전이면 null. */
async function findExperienceSession(
  db: FirebaseFirestore.Firestore,
  challengeId: string,
): Promise<SessionDoc | null> {
  const snap = await db.collection("sessions").where("challengeId", "==", challengeId).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data() as SessionDoc;
}

// getChallengeLanding — 사용자2 진입(무로그인·토큰) (T37 · UX-021 · AC-040/048)
export const getChallengeLanding = onCall<
  GetChallengeLandingRequest,
  Promise<GetChallengeLandingResponse>
>(async (request) => {
  const { token } = request.data ?? {};
  if (!token) {
    throw new HttpsError("invalid-argument", "token이 필요합니다.");
  }
  const resolved = await resolveChallengeByTokenHash(hashToken(token));
  if (!resolved) {
    throw new HttpsError("not-found", "유효하지 않은 링크입니다.");
  }
  // 소모하지 않는다 — 랜딩 열람은 §14.4 "크롤러 선fetch 방지" 원칙상 비파괴적이어야 한다.
  return { displayName: resolved.displayName, status: resolved.status, expired: resolved.expired };
});

// consentChallenge — 사용자2 동의(무동의 차단 게이트) (T37 · UX-021 · AC-040/048)
export const consentChallenge = onCall<ConsentChallengeRequest, Promise<ConsentChallengeResponse>>(
  async (request) => {
    // §14.7/ADR-0006 A1 — 로그인 UI는 없지만 클라가 동의 탭 시점에 signInAnonymously로 이미
    // 익명 uid를 확보한 뒤 호출한다. 그 uid가 곧 생성될 체험 세션의 소유자가 된다.
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "동의 처리에는 임시 인증(익명 로그인)이 필요합니다.");
    }
    const { token } = request.data ?? {};
    if (!token) {
      throw new HttpsError("invalid-argument", "token이 필요합니다.");
    }

    const db = getFirestore();
    const resolved = await resolveChallengeByTokenHash(hashToken(token));
    if (!resolved) {
      throw new HttpsError("not-found", "유효하지 않은 링크입니다.");
    }

    const scenarioId = resolved.scenarioId;
    if (!SCENARIO_PROMPTS[scenarioId]) {
      throw new HttpsError("failed-precondition", "존재하지 않는 시나리오입니다.");
    }

    const callerUid = request.auth.uid;
    // reviewer 리뷰 Major(2026-07-24): 동시에 같은 아직-pending 링크를 두 명의 익명 uid가 호출하면
    // (읽기→판정→쓰기가 트랜잭션 밖이었을 때) 둘 다 "create"로 판정돼 서로 다른 두 체험 세션이
    // 만들어질 수 있었다 — "누가 이 딥보이스 체험을 받는가"라는 이 기능의 핵심 안전 게이트라 T36의
    // 활성-챌린지-cap 레이스(자원 한도, 자기교정적)와 달리 신원 접근 게이트라서 넘어갈 수 없다.
    // 느린 외부 호출(오프닝 대사 생성)은 트랜잭션 밖에서 먼저 끝내고, "소모+세션 생성"만 하나의
    // Firestore 트랜잭션으로 원자화한다 — challenges/{challengeId} 문서를 같이 읽는 두 트랜잭션은
    // Firestore의 낙관적 동시성 제어로 하나만 커밋되고 나머지는 재시도되어, 재시도 시 이미
    // status="consented"로 바뀐 것을 보고 decideConsentGate가 (다른 uid이므로) reject를 반환한다.
    const openingMessage = await generateOpeningLine(scenarioId);
    const isMock = isUsingMockLlm();

    const challengeRef = db.collection("challenges").doc(resolved.challengeId);
    const sessionsQuery = db.collection("sessions").where("challengeId", "==", resolved.challengeId).limit(1);

    const claim = await db.runTransaction(async (tx) => {
      const [challengeSnap, sessionsSnap] = await Promise.all([tx.get(challengeRef), tx.get(sessionsQuery)]);
      const challenge = challengeSnap.data() as ChallengeDoc | undefined;
      if (!challenge) {
        throw new HttpsError("not-found", "챌린지를 찾을 수 없습니다.");
      }
      const existingSession = sessionsSnap.empty ? null : (sessionsSnap.docs[0].data() as SessionDoc);
      const nowMs = Date.now();
      const decision = decideConsentGate({
        // T38 Major 수정 — 최초 진입(linkExpiresAt, 3일)과 재개(retentionDeleteAt, 30일)를
        // 분리(consentGate.ts 헤더 주석 참고). 둘 다 여기서 미리 계산해 순수 함수에 넘긴다.
        linkExpired: challenge.linkExpiresAt.toMillis() <= nowMs,
        retentionExpired: challenge.retentionDeleteAt.toMillis() <= nowMs,
        status: challenge.status,
        existingSessionUid: existingSession?.uid ?? null,
        callerUid,
      });

      if (decision.action === "reject") {
        throw new HttpsError("failed-precondition", decision.message);
      }
      if (decision.action === "resume") {
        // §14.4 "중도 이탈 복귀" — existingSession은 decideConsentGate가 uid 일치를 확인했을
        // 때만 "resume"을 반환하므로 non-null이 보장된다. 재동의 기록은 다시 쓰지 않는다(멱등).
        return { action: "resume" as const, sessionId: (existingSession as SessionDoc).sessionId };
      }

      // --- action === "create": 소모(§14.4)+세션 생성을 원자적으로 커밋 ---
      const sessionRef = db.collection("sessions").doc();
      const now = Timestamp.now();
      const sessionDoc: SessionDoc = {
        sessionId: sessionRef.id,
        uid: callerUid,
        scenarioId,
        status: "active",
        // voiceId 의도적 미설정(A1) — challenges/{challengeId}.voiceId만이 유일한 진실 원천이다.
        cloneStatus: "ready",
        identitySelfConfirmed: true,
        turnCount: 0,
        maxUserTurns: MAX_USER_TURNS,
        maxSessionMs: MAX_SESSION_MS,
        createdAt: now,
        entryChannel: "voice",
        challengeId: resolved.challengeId,
        challengeCreatorDisplayName: resolved.displayName,
        ...(isMock ? { llmProvider: "mock" as const } : {}),
      };
      // T36 primitive 재사용(파일 상단 지시) — tx를 넘기면 즉시 write하지 않고 이 트랜잭션에
      // 큐잉만 한다(functions/src/challenge/index.ts 참고). QA 지적(2026-07-24): await 없이
      // fire-and-forget하면 tx.update()의 동기 throw가 unhandled rejection이 되어 트랜잭션이
      // 조용히 안 걸릴 수 있다 — await로 트랜잭션 콜백 안에서 실제로 완료·전파되게 한다.
      await markChallengeConsumed(resolved.challengeId, tx);
      tx.set(sessionRef, sessionDoc);
      tx.set(sessionRef.collection("messages").doc(), {
        role: "scammer",
        textMasked: openingMessage.text,
        turnIndex: 0,
        createdAt: now,
      } satisfies MessageDoc);
      return { action: "create" as const, sessionId: sessionRef.id };
    });

    if (claim.action === "resume") {
      return { sessionId: claim.sessionId };
    }

    // 오프닝 합성 — createSession과 동일한 비차단 패턴(functions/src/session/index.ts 참고).
    // voiceId는 트랜잭션 커밋 후(=이 호출자가 유일한 승자로 확정된 뒤) challenge 문서에서 다시
    // in-memory로만 읽는다 — 세션 문서 어디에도 assign하지 않는다(A1, 파일 상단 불변식).
    let openingAudioUrl: string | undefined;
    try {
      const challengeSnap = await challengeRef.get();
      const challenge = challengeSnap.data() as ChallengeDoc;
      const synthesis = await getVoiceProvider().synthesize({
        sessionId: claim.sessionId,
        voiceId: challenge.voiceId,
        text: openingMessage.text,
      });
      openingAudioUrl = synthesis.audioUrl;
    } catch {
      // 합성 실패는 무시(P-4 비차단) — 클라는 openingAudioUrl 없으면 텍스트만 표시.
    }

    await challengeRef.update({ status: "in_progress" });

    return { sessionId: claim.sessionId, ...(openingAudioUrl ? { openingAudioUrl } : {}) };
  },
);

// reportChallenge — 사용자2 신고 (T37 · UX-021 · AC-049)
export const reportChallenge = onCall<ReportChallengeRequest, Promise<ReportChallengeResponse>>(
  async (request) => {
    // 무인증(토큰) — getChallengeLanding과 동일 패턴. 동의 전에도, 소진 후에도 신고할 수 있어야
    // 한다(§14.5 "1명뿐인 taker" — 별도 신고 컬렉션 불요, 챌린지 문서에 직접 임베드).
    const { token, reason, note } = request.data ?? {};
    if (!token || !reason || !REPORT_REASONS.has(reason)) {
      throw new HttpsError("invalid-argument", "token과 유효한 reason이 필요합니다.");
    }

    const resolved = await resolveChallengeByTokenHash(hashToken(token));
    if (!resolved) {
      throw new HttpsError("not-found", "유효하지 않은 링크입니다.");
    }
    if (resolved.expired) {
      throw new HttpsError("failed-precondition", "만료된 링크입니다.");
    }

    const db = getFirestore();
    const update: Partial<ChallengeDoc> = {
      reportedAt: Timestamp.now(),
      reportReason: reason,
      status: "reported", // 재생/재진입 즉시 차단(§14.5 MVP 정책).
    };
    if (note && note.trim()) {
      update.reportNote = maskPII(note.trim());
    }
    await db.collection("challenges").doc(resolved.challengeId).update(update);

    return { status: "reported" };
  },
);

/** T9 리포트에서 챌린지 결과 요약을 파생한다(순수 함수 — Firestore 없이 테스트 가능).
 * suspicionTimeLabel/suspicionTurnIndex는 의도적으로 채우지 않는다 — "의심(저항) 시점" 판정은
 * DECISIONS #26의 별도 후속(resistedMoments, 아직 미구현)이 필요하고 이 태스크 범위 밖이다
 * (T9의 deceivedMoments는 "속은 시점"이지 "의심한 시점"이 아니라 대체 근거로 쓸 수 없다). */
export function deriveChallengeResultSummary(report: Pick<ReportDoc, "sessionId">): ChallengeResultSummary {
  void report; // 현재는 존재 자체(=완료)만 반영한다. 추후 resistedMoments 도입 시 이 함수를 확장.
  return { completed: true };
}

// setChallengeResultSharing — 사용자2 결과 공유 동의(AC-043 게이트) (T37 · UX-018)
export const setChallengeResultSharing = onCall<
  SetChallengeResultSharingRequest,
  Promise<SetChallengeResultSharingResponse>
>(async (request) => {
  // API.md "Auth: 익명(세션 소유 확인 권장)" — "권장"을 느슨하게 두지 않고 실제로 강제한다(이
  // 태스크의 배경이 된 두 차례 유출/데이터손실 사고를 고려해 보수적으로 판단, 근거는 아래 소유권
  // 검증). 인증 없이는 "세션 소유 확인"이라는 게이트 자체가 성립하지 않는다.
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "결과 공유 동의에는 인증이 필요합니다.");
  }
  const { token, share } = request.data ?? {};
  if (!token || typeof share !== "boolean") {
    throw new HttpsError("invalid-argument", "token과 share가 필요합니다.");
  }

  const resolved = await resolveChallengeByTokenHash(hashToken(token));
  if (!resolved) {
    throw new HttpsError("not-found", "유효하지 않은 링크입니다.");
  }

  const db = getFirestore();
  const session = await findExperienceSession(db, resolved.challengeId);
  if (!session) {
    throw new HttpsError("failed-precondition", "아직 동의·체험이 시작되지 않은 챌린지입니다.");
  }
  // 소유권 확인 — 이 토큰의 체험 세션을 실제로 만든 익명 uid만 결과 공유를 결정할 수 있다.
  if (session.uid !== request.auth.uid) {
    throw new HttpsError("permission-denied", "본인이 체험한 챌린지가 아닙니다.");
  }

  const challengeRef = db.collection("challenges").doc(resolved.challengeId);

  if (!share) {
    // 명시 거부 — 부재(§14.1 "기본 부재=미동의")와 구분되는 "명시적으로 아니오"를 남긴다(감사 목적).
    await challengeRef.update({ resultSharingConsented: false });
    return { shared: false };
  }

  // share=true — T9 리포트를 서버측(admin)으로만 read해 resultSummary를 파생한다(§14.7.3, AC-043
  // "대화 전문 없음"). 리포트가 아직 없다면(세션이 아직 종료되지 않음) 진행할 수 없다.
  const reportSnap = await db.collection("reports").doc(session.sessionId).get();
  if (!reportSnap.exists) {
    throw new HttpsError("failed-precondition", "아직 결과가 준비되지 않았습니다.");
  }
  const report = reportSnap.data() as ReportDoc;
  const resultSummary = deriveChallengeResultSummary(report);

  await challengeRef.update({
    resultSharingConsented: true,
    resultSummary,
  } satisfies Partial<ChallengeDoc>);

  return { shared: true };
});
