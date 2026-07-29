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
import { generateOpeningLine } from "../roleplay";
import { SCENARIO_PROMPTS } from "../scenarios";
import { PUBLIC_SCENARIOS } from "../scenarios/publicMeta";
import { GEMINI_KEY_SECRETS } from "../shared/config";
import { GENERIC_VOICE_ID, MAX_SESSION_MS, MAX_USER_TURNS } from "../shared/constants";
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
  // T47(#20, §14.8.2) — channel을 함께 반환해 클라가 동의 후 UX-014 vs UX-022 라우팅을 미리 안다.
  // T72(§15.3.2, UX-021/AC-040/064) — 발신자가 고른 난이도를 동의 **전에** 함께 노출한다. 이는
  // AC-040 사전 동의의 **정보량을 늘리는 방향**이며, 동의 게이트 로직·무동의 차단(P-15)은 전혀
  // 바뀌지 않는다(D-42/AC-065 — 난이도는 어떤 안전장치도 게이팅하지 않는다).
  return {
    displayName: resolved.displayName,
    status: resolved.status,
    expired: resolved.expired,
    channel: resolved.channel,
    difficultyLevel: resolved.difficultyLevel,
  };
});

// consentChallenge — 사용자2 동의(무동의 차단 게이트) (T37 · UX-021 · AC-040/048)
// GEMINI_API_KEY 선언(2026-07-24) — generateOpeningLine()이 getLlmClient()를 통해 실 Gemini로
// 격상될 수 있어(llm/index.ts 참고) Functions v2가 배포 환경에서 이 secret을 주입하도록 명시한다.
export const consentChallenge = onCall<ConsentChallengeRequest, Promise<ConsentChallengeResponse>>(
  { secrets: [...GEMINI_KEY_SECRETS] },
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
    // T47(#20, §14.8.2) — 채널은 챌린지 문서에 이미 역정규화돼 있다(생성 시점 확정, OQ-29라
    // scenarioId 재조회 불요). surface만 스킨 렌더용으로 PUBLIC_SCENARIOS에서 가볍게 조회한다
    // (정적 맵, Firestore 쿼리 아님 — 메신저 챌린지에서만 쓰인다).
    const scenarioChannel = resolved.channel;
    const scenarioSurface =
      scenarioChannel === "messenger" ? PUBLIC_SCENARIOS[scenarioId]?.surface : undefined;

    const callerUid = request.auth.uid;
    // reviewer 리뷰 Major(2026-07-24): 동시에 같은 아직-pending 링크를 두 명의 익명 uid가 호출하면
    // (읽기→판정→쓰기가 트랜잭션 밖이었을 때) 둘 다 "create"로 판정돼 서로 다른 두 체험 세션이
    // 만들어질 수 있었다 — "누가 이 딥보이스 체험을 받는가"라는 이 기능의 핵심 안전 게이트라 T36의
    // 활성-챌린지-cap 레이스(자원 한도, 자기교정적)와 달리 신원 접근 게이트라서 넘어갈 수 없다.
    // 느린 외부 호출(오프닝 대사 생성)은 트랜잭션 밖에서 먼저 끝내고, "소모+세션 생성"만 하나의
    // Firestore 트랜잭션으로 원자화한다 — challenges/{challengeId} 문서를 같이 읽는 두 트랜잭션은
    // Firestore의 낙관적 동시성 제어로 하나만 커밋되고 나머지는 재시도되어, 재시도 시 이미
    // status="consented"로 바뀐 것을 보고 decideConsentGate가 (다른 uid이므로) reject를 반환한다.
    // isMock은 generateOpeningLine이 실제로 관측한 값을 그대로 쓴다(별도 isUsingMockLlm() 사전
    // 확인과 분리 — completeWithFallback 도입 후 그 둘이 다른 사실이 될 수 있음, openingLine.ts
    // 주석 참고. 사용자 실측 신고로 발견된 정합성 버그 수정, 2026-07-24).
    // T72(§15.3.2/§15.6 G9) — 발신자가 챌린지에 실어 보낸 난이도를 오프닝 조립에 그대로 쓰고,
    // 아래에서 사용자2 체험 세션 문서에도 **복사**한다(프롬프트는 세션 단위로 조립되므로 복사하지
    // 않으면 이후 턴(sendMessage)·통화(createRealtimeCall)에서 발신자 선택이 소실된다).
    const { message: openingMessage, isMock } = await generateOpeningLine(
      scenarioId,
      resolved.difficultyLevel,
    );

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
        // 메신저 챌린지는 애초에 voiceId 자체가 없다(AC-051).
        cloneStatus: "ready",
        identitySelfConfirmed: true,
        turnCount: 0,
        maxUserTurns: MAX_USER_TURNS,
        maxSessionMs: MAX_SESSION_MS,
        createdAt: now,
        // T47(#20, §14.8.2) — 메신저 챌린지 세션은 entryChannel/channel/surface를 채운다(스킨
        // 렌더·UX-022 라우팅용). 보이스 챌린지는 기존과 동일하게 entryChannel:"voice"만.
        entryChannel: scenarioChannel === "messenger" ? "messenger" : "voice",
        ...(scenarioChannel === "messenger" ? { channel: "messenger" as const } : {}),
        ...(scenarioSurface ? { surface: scenarioSurface } : {}),
        challengeId: resolved.challengeId,
        challengeCreatorDisplayName: resolved.displayName,
        // T72(§15.6 G9) — 챌린지의 난이도를 체험 세션으로 복사한다. 이 복사가 빠지면 sendMessage·
        // createRealtimeCall이 세션에서 난이도를 읽지 못해 항상 중급으로 진행된다.
        difficultyLevel: resolved.difficultyLevel,
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
        ...(scenarioChannel === "messenger" ? { channel: "messenger" as const } : {}),
      } satisfies MessageDoc);
      return { action: "create" as const, sessionId: sessionRef.id };
    });

    if (claim.action === "resume") {
      return { sessionId: claim.sessionId };
    }

    // 오프닝 합성 — createSession과 동일한 비차단 패턴(functions/src/session/index.ts 참고).
    // voiceId는 트랜잭션 커밋 후(=이 호출자가 유일한 승자로 확정된 뒤) challenge 문서에서 다시
    // in-memory로만 읽는다 — 세션 문서 어디에도 assign하지 않는다(A1, 파일 상단 불변식).
    // T47(#20, §14.8.2) — 메신저 챌린지는 재생할 복제 음성이 없고(voiceId 부재, AC-051) 채팅
    // UI가 애초에 오디오를 재생하지 않는다(createSession의 channel!=="messenger" 게이팅과 동형) —
    // 합성 자체를 건너뛴다.
    // T56(#23, §14.9.2) — 3분기: messenger(스킵, 무변경) / clone(challenge.voiceId, 무변경) /
    // generic(GENERIC_VOICE_ID — self-training generic과 동일 값·동일 provider). 판별은
    // `resolved.voiceMode`로 한다(voiceId-부재 추론 금지, §14.9.1) — resolveChallengeByTokenHash가
    // 이미 이 값을 비민감 필드로 반환해 별도 문서 재조회 없이 판정할 수 있다.
    let openingAudioUrl: string | undefined;
    if (scenarioChannel !== "messenger") {
      try {
        if (resolved.voiceMode === "generic") {
          const synthesis = await getVoiceProvider().synthesize({
            sessionId: claim.sessionId,
            voiceId: GENERIC_VOICE_ID,
            text: openingMessage.text,
          });
          openingAudioUrl = synthesis.audioUrl;
        } else {
          const challengeSnap = await challengeRef.get();
          const challenge = challengeSnap.data() as ChallengeDoc;
          if (challenge.voiceId) {
            const synthesis = await getVoiceProvider().synthesize({
              sessionId: claim.sessionId,
              voiceId: challenge.voiceId,
              text: openingMessage.text,
            });
            openingAudioUrl = synthesis.audioUrl;
          }
        }
      } catch {
        // 합성 실패는 무시(P-4 비차단) — 클라는 openingAudioUrl 없으면 텍스트만 표시.
      }
    }

    await challengeRef.update({ status: "in_progress" });

    // 사용자 신고(2026-07-24) — 실시간 통화에서 사용자가 먼저 말해야 하던 문제. 이미 생성한
    // openingMessage.text를 함께 반환해 클라가 ElevenLabs 세션의 firstMessage로 쓴다
    // (createSession의 동일 수정과 짝, src/lib/recording/pendingSession.ts 참고).
    return {
      sessionId: claim.sessionId,
      ...(openingAudioUrl ? { openingAudioUrl } : {}),
      openingMessageText: openingMessage.text,
    };
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
 * (T9의 deceivedMoments는 "속은 시점"이지 "의심한 시점"이 아니라 대체 근거로 쓸 수 없다).
 *
 * T47 증분(#20, §14.8.3, AC-055/OQ-31) — channel 파라미터로 "메신저 챌린지는 의심 시점을 절대
 * 계산·저장하지 않는다"를 **구조적으로 고정**한다. 오늘은 보이스도 아직 suspicion 필드를 채우지
 * 않지만(위 known gap), 장래 보이스 쪽에 resistedMoments가 추가되어도 이 분기(messenger)는
 * 절대 값을 채우지 않는다 — 쓰기 시점 강제가 읽기 필터보다 안전하다(store-nothing-sensitive).
 *
 * T56 증분(#23, §14.9.3, AC-058/OQ-32) — voiceMode 파라미터를 추가해 "channel==='messenger' 또는
 * voiceMode==='generic'이면 {completed:true}만 파생"한다(OQ-32 planner default="완료 여부만",
 * D-34 — 메신저 챌린지와 동일 계층). clone 보이스 챌린지만 장래 의심-타이밍 확장 여지를 유지한다. */
export function deriveChallengeResultSummary(
  report: Pick<ReportDoc, "sessionId">,
  channel: ChallengeDoc["channel"] = "voice",
  voiceMode: ChallengeDoc["voiceMode"] = "clone",
): ChallengeResultSummary {
  void report; // 현재는 존재 자체(=완료)만 반영한다. 추후 resistedMoments 도입 시 이 함수를 확장.
  if (channel === "messenger" || voiceMode === "generic") {
    // AC-055/OQ-31/OQ-32 — 스미싱 링크 탭·가짜 랜딩 입력·에스컬레이션 도달·통화 의심 시점 등
    // "의심 시점"은 어떤 형태로도 계산·포함하지 않는다. 이 분기는 앞으로도 절대 확장하지 않는다
    // (구조적 고정).
    return { completed: true };
  }
  // clone 보이스 챌린지 — DECISIONS #26 resistedMoments 도입 시 이 분기에서만 suspicionTimeLabel
  // 등을 채우도록 확장한다(messenger/generic 분기는 위에서 이미 구조적으로 차단됨).
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
  const resultSummary = deriveChallengeResultSummary(report, resolved.channel, resolved.voiceMode);

  await challengeRef.update({
    resultSharingConsented: true,
    resultSummary,
  } satisfies Partial<ChallengeDoc>);

  return { shared: true };
});
