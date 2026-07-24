// 2인 소셜 챌린지 — 사용자1 생성·클론 스코프·공유 링크 (T36, Architecture.md §14, ADR-0005,
// Database.md §challenges, AC-041/044/048/049).
//
// ⚠️ 스코프: 이 모듈은 "사용자1(발신) 측"만 채운다 — 사용자2 동의 랜딩·체험·정체 공개·결과 열람·
// 신고(UX-021, AC-040/042/043/049)는 T37 소관이다. 이 파일 하단의 resolveChallengeByTokenHash/
// markChallengeConsumed는 T37이 재사용할 primitive를 미리 만들어 둔 것일 뿐, 아직 어떤 콜러블에서도
// 호출되지 않는다(functions/src/index.ts가 export하지 않는다 — 배포 대상 아님).
//
// ⚠️ Database.md §Storage Layout 편차(구현 보고서에 명시, architect 확인 권장): Database.md는
// `users/{uid}/challenges/{cid}/voice_input.webm`라는 챌린지 전용 녹음 업로드 경로를 정의하지만,
// 이 태스크 지시는 "이미 완료된 온보딩 녹음을 재사용"하라고 명시했다. 새 녹음 화면을 만들지 않고
// 대신 caller의 최근 완료 클론 세션(cloneStatus:"ready")의 기존 voiceInputStoragePath를 소스로
// 재사용해 챌린지 전용 신규 clone을 발급한다. 알려진 한계: T10(onSessionEnded 즉시 폐기)이 그
// 원본 세션을 이미 종료·폐기했다면 원본 녹음이 Storage에서 사라져 있을 수 있다 — 이 경우
// "클론 미완료"와 동일한 failed-precondition으로 안내한다(사용자 관점에서는 결국 "본인 목소리부터
// 준비해야 한다"는 동일한 요구라 UX 문구를 굳이 나누지 않았다).
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { voiceInputStoragePath } from "../voice";
import { getVoiceProvider } from "../voice/provider";
import { PUBLIC_SCENARIOS } from "../scenarios/publicMeta";
import {
  CHALLENGE_DEFAULT_RETENTION_MS,
  CHALLENGE_FREE_ACTIVE_CAP,
  CHALLENGE_FREE_LINK_EXPIRY_MS,
} from "../shared/constants";
import { generateShareToken } from "./token";
import { purgeChallengeArtifacts, selectChallengesToPurge } from "./purge";
import type { ChallengeDoc, DeletionLogDoc, SessionDoc } from "../shared/types";
import type {
  CreateChallengeRequest,
  CreateChallengeResponse,
  DeleteChallengeRequest,
  DeleteChallengeResponse,
  ListMyChallengesItem,
  ListMyChallengesRequest,
  ListMyChallengesResponse,
} from "./types";

ensureFirebaseAdminApp();

/** §14.5 "활성" 판정 상태 집합 — 만료 여부는 별도로 확인한다(status만으로는 부족, linkExpiresAt도 봐야 함). */
const ACTIVE_STATUSES = ["pending", "consented", "in_progress"] as const;

export const createChallenge = onCall<CreateChallengeRequest, Promise<CreateChallengeResponse>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { scenarioId, displayName } = request.data ?? {};
    if (!scenarioId || !displayName || !displayName.trim()) {
      throw new HttpsError("invalid-argument", "scenarioId와 displayName이 필요합니다.");
    }
    const scenario = PUBLIC_SCENARIOS[scenarioId];
    if (!scenario) {
      throw new HttpsError("invalid-argument", `존재하지 않는 scenarioId입니다: ${scenarioId}`);
    }
    if (scenario.voiceMode !== "clone") {
      throw new HttpsError(
        "invalid-argument",
        "딥보이스(내 목소리 복제) 시나리오만 챌린지로 만들 수 있습니다.",
      );
    }

    const uid = request.auth.uid;
    const db = getFirestore();

    // (a) 완료된 클론 보유 확인 — createSession/createVoiceClone과 달리 클라가 voiceId를 직접
    // 넘기지 않는다(챌린지 voiceId는 항상 서버가 새로 발급하므로, §스코프 고정). 대신 caller의 가장
    // 최근 cloneStatus:"ready" 세션을 찾아 그 세션의 소스 녹음을 재사용한다(UF-004 Step1 "이미
    // 클론 보유 시 재사용"). 신규 복합 인덱스를 추가하지 않기 위해 기존 sessions uid+createdAt desc
    // 인덱스(firestore.indexes.json, T7/T8이 이미 사용 중)만으로 커버되는 최근 20건을 훑어 JS에서
    // cloneStatus를 판정한다 — 이 규모(개인당 최근 훈련 이력)에서는 충분하다.
    const recentSessionsSnap = await db
      .collection("sessions")
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();
    let sourceSessionId: string | null = null;
    for (const doc of recentSessionsSnap.docs) {
      const data = doc.data() as SessionDoc;
      if (data.cloneStatus === "ready" && data.voiceId) {
        sourceSessionId = doc.id;
        break;
      }
    }
    if (!sourceSessionId) {
      throw new HttpsError(
        "failed-precondition",
        "먼저 본인 목소리 클론을 완료해 주세요.",
      );
    }
    const storagePath = voiceInputStoragePath(uid, sourceSessionId);
    const [recordingExists] = await getStorage().bucket().file(storagePath).exists();
    if (!recordingExists) {
      // 원본 세션이 이미 종료·즉시폐기(T10 onSessionEnded)되어 녹음이 Storage에서 사라진 경우 —
      // 알려진 한계(이 파일 상단 주석 참고). 사용자에게는 "클론 미완료"와 동일하게 안내한다.
      throw new HttpsError(
        "failed-precondition",
        "먼저 본인 목소리 클론을 완료해 주세요.",
      );
    }

    // (b) 활성 챌린지 개수 상한(무료 3개, §14.5/AC-049) — 생성 전에 미리 막는다(생성 후 롤백 없음).
    const now = Timestamp.now();
    const activeSnap = await db
      .collection("challenges")
      .where("creatorUid", "==", uid)
      .where("status", "in", [...ACTIVE_STATUSES])
      .get();
    const activeCount = activeSnap.docs.filter((doc) => {
      const data = doc.data() as ChallengeDoc;
      return data.linkExpiresAt.toMillis() > now.toMillis();
    }).length;
    if (activeCount >= CHALLENGE_FREE_ACTIVE_CAP) {
      throw new HttpsError(
        "resource-exhausted",
        "동시에 만들 수 있는 챌린지 수를 초과했습니다. 기존 챌린지가 끝나거나 만료되면 다시 만들 수 있어요.",
      );
    }

    // (c) 챌린지 전용 신규 클론(ADR-0005 스코프 고정) — 원본 세션의 voiceId를 재사용하지 않고
    // 항상 새로 발급한다. MockVoiceProvider는 매 호출 randomUUID 기반 voiceId를 반환하므로 소스
    // 세션의 voiceId와 절대 같을 수 없다(에뮬레이터 검증 대상).
    const challengeRef = db.collection("challenges").doc();
    const provider = getVoiceProvider();
    const cloneResult = await provider.createClone({
      sessionId: challengeRef.id,
      uid,
      voiceInputStoragePath: storagePath,
    });
    if (cloneResult.cloneStatus !== "ready") {
      throw new HttpsError("internal", "음성 클론 생성에 실패했습니다.");
    }

    // (d) 토큰 — 평문은 이 응답에서만 반환, 해시만 저장(§14.4).
    const { token, tokenHash } = generateShareToken();

    const linkExpiresAt = Timestamp.fromMillis(now.toMillis() + CHALLENGE_FREE_LINK_EXPIRY_MS);
    const retentionDeleteAt = Timestamp.fromMillis(now.toMillis() + CHALLENGE_DEFAULT_RETENTION_MS);

    // (e)(f) challenges/{challengeId} 문서 작성 — Architecture.md §14.1 스키마 그대로. T37 소관
    // 필드(resultSharingConsented 등)는 옵셔널이라 여기서는 키 자체를 만들지 않는다(Firestore admin
    // SDK가 undefined 값을 기본 거부하는 기존 관례, session/index.ts와 동일 패턴).
    const challengeDoc: ChallengeDoc = {
      challengeId: challengeRef.id,
      creatorUid: uid,
      scenarioId,
      voiceId: cloneResult.voiceId,
      displayName: displayName.trim(),
      status: "pending",
      linkTokenHash: tokenHash,
      linkExpiresAt,
      retentionDeleteAt,
      createdAt: now,
    };
    await challengeRef.set(challengeDoc);

    return {
      challengeId: challengeRef.id,
      shareToken: token,
      linkExpiresAt: linkExpiresAt.toDate().toISOString(),
    };
  },
);

export const deleteChallenge = onCall<DeleteChallengeRequest, Promise<DeleteChallengeResponse>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { challengeId } = request.data ?? {};
    if (!challengeId) {
      throw new HttpsError("invalid-argument", "challengeId가 필요합니다.");
    }

    const db = getFirestore();
    const ref = db.collection("challenges").doc(challengeId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("failed-precondition", "존재하지 않는 챌린지입니다.");
    }
    const challenge = snap.data() as ChallengeDoc;
    if (challenge.creatorUid !== request.auth.uid) {
      throw new HttpsError("permission-denied", "본인 챌린지가 아닙니다.");
    }

    // 멱등 처리(endSession/deleteChallenge 재호출 대비 — 이미 삭제된 챌린지를 다시 지우려 해도
    // deletionLogs가 중복으로 쌓이거나 이미 없는 voice를 다시 지우려 시도하지 않는다).
    if (challenge.status === "deleted") {
      return { status: "deleted" };
    }

    await purgeChallenge(challengeId, challenge.creatorUid, challenge.voiceId);
    return { status: "deleted" };
  },
);

// 본인 챌린지 목록 조회(UX-020, reviewer 발견 Critical #1 수정) — 예전엔 클라가 challenges
// 컬렉션을 직접 read해 voiceId(ElevenLabs 클론 id)·linkTokenHash까지 그대로 브라우저로 전송되고
// 있었다(ADR-0005 §14.2 "raw voiceId를 반환하는 경로가 어디에도 없다" 위반). 이 콜러블이
// resolveChallengeByTokenHash와 동일한 원칙 — 민감 필드는 서버가 절대 응답에 싣지 않는다 — 으로
// 안전한 필드만 골라 반환한다. firestore.rules의 challenges read는 이제 전면 거부로 좁혔으므로
// (아래 및 firestore.rules 참고) 이 콜러블이 유일한 조회 경로다.
export const listMyChallenges = onCall<
  ListMyChallengesRequest,
  Promise<ListMyChallengesResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const db = getFirestore();
  const snap = await db.collection("challenges").where("creatorUid", "==", request.auth.uid).get();

  const challenges: ListMyChallengesItem[] = snap.docs.map((doc) => {
    const data = doc.data() as ChallengeDoc;
    return {
      challengeId: data.challengeId,
      displayName: data.displayName,
      status: data.status,
      resultSharingConsented: Boolean(data.resultSharingConsented),
      suspicionTimeLabel: data.resultSummary?.suspicionTimeLabel ?? null,
      createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
    };
  });

  return { challenges };
});

/**
 * 챌린지 폐기 실행 지점(부수효과 배선) — deleteChallenge(수동)와 purgeExpiredChallenges(자동, 아래)
 * 양쪽이 공유한다(중복 로직 금지, ADR-0005 "폐기 기계 재사용"). purge.ts의 순수 집계 로직에 실제
 * VoiceProvider 구현을 주입하고, deletionLogs 기록(challengeId 세팅) + challenges.status="deleted"
 * 갱신까지 완료한다.
 */
async function purgeChallenge(challengeId: string, creatorUid: string, voiceId: string): Promise<void> {
  const provider = getVoiceProvider();
  const { targets, overallResult } = await purgeChallengeArtifacts(voiceId, {
    deleteVoice: (id) => provider.deleteVoice(id),
  });

  const db = getFirestore();
  const deletionLog: DeletionLogDoc = {
    challengeId,
    uid: creatorUid,
    deletedAt: Timestamp.now(),
    targets,
    overallResult,
  };
  await db.collection("deletionLogs").add(deletionLog);
  await db.collection("challenges").doc(challengeId).update({ status: "deleted" });
}

/**
 * 기간제 자동 삭제 스캔(§14.3 "자동 삭제 = retentionDeleteAt 도달 시 스케줄 함수가 폐기"). 이
 * 코드베이스 첫 onSchedule 함수라 참고할 기존 패턴이 없다 — 하루 1회면 최대 24시간의 보존 초과
 * 지연은 §14.3의 "기본 30일" 스케일에서 무시 가능하다고 판단해 간격을 골랐다(다른 상수처럼 향후
 * 조정 가능). retentionDeleteAt<=now로 1차 필터링은 Firestore 쿼리가 하고(단일 필드 범위 쿼리라
 * 신규 복합 인덱스 불필요), "이미 deleted인 문서 제외"는 순수 함수(selectChallengesToPurge)가
 * 한다 — 그래야 스케줄이 매일 돌 때마다 예전에 이미 지운 챌린지를 또 지우려 시도하지 않는다.
 */
export const purgeExpiredChallenges = onSchedule("every 24 hours", async () => {
  const db = getFirestore();
  const nowMs = Date.now();
  const dueSnap = await db
    .collection("challenges")
    .where("retentionDeleteAt", "<=", Timestamp.fromMillis(nowMs))
    .get();

  const candidates = dueSnap.docs.map((doc) => {
    const data = doc.data() as ChallengeDoc;
    return { id: doc.id, status: data.status, retentionDeleteAtMs: data.retentionDeleteAt.toMillis() };
  });
  const idsToPurge = selectChallengesToPurge(candidates, nowMs);

  for (const id of idsToPurge) {
    const doc = dueSnap.docs.find((d) => d.id === id);
    const data = doc?.data() as ChallengeDoc | undefined;
    if (!data) continue;
    try {
      await purgeChallenge(id, data.creatorUid, data.voiceId);
      logger.info("purgeExpiredChallenges: 기간제 폐기 완료", { challengeId: id });
    } catch (err) {
      // 개별 챌린지 폐기 실패가 나머지 스캔을 막지 않는다(ADR-0003과 동일한 부분 실패 원칙) —
      // 다음 스케줄 실행에서 retentionDeleteAt이 여전히 과거이므로 자연히 재시도된다.
      logger.error("purgeExpiredChallenges: 폐기 중 예외", { challengeId: id, err });
    }
  }
});

// --- T37이 재사용할 토큰 해석 primitive (아직 어떤 콜러블에도 배선되지 않음) ---
//
// T37은 사용자2 무로그인 진입 콜러블(예: redeemChallengeToken)에서 이 두 함수를 조합해 쓰면 된다:
// 1. 클라가 보낸 평문 토큰을 hashToken()으로 해시 → resolveChallengeByTokenHash(hash)로 조회.
// 2. expired가 아니고 사용자2가 명시 동의(AC-040)하면 markChallengeConsumed(challengeId) 호출.
// 토큰 해시 방식(hashToken)을 createChallenge와 반드시 공유해야 조회가 성립하므로, T37은 새 해시
// 로직을 만들지 말고 반드시 이 모듈의 hashToken을 import해서 쓸 것.

export type ResolvedChallenge = {
  challengeId: string;
  displayName: string;
  scenarioId: string;
  /** true면 linkExpiresAt이 이미 지났다(UX-021 "이 링크는 만료되었습니다" 상태 판정용). */
  expired: boolean;
};

/** linkTokenHash로 챌린지를 조회한다. raw voiceId 등 민감 필드는 반환하지 않는다(AC-041 추출 차단). */
export async function resolveChallengeByTokenHash(tokenHash: string): Promise<ResolvedChallenge | null> {
  const db = getFirestore();
  const snap = await db.collection("challenges").where("linkTokenHash", "==", tokenHash).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data() as ChallengeDoc;
  return {
    challengeId: doc.id,
    displayName: data.displayName,
    scenarioId: data.scenarioId,
    expired: data.linkExpiresAt.toMillis() <= Date.now(),
  };
}

/** 동의 통과 시점의 1회성 토큰 소모(§14.4) — linkConsumedAt 세팅 + status를 "consented"로 전이. */
export async function markChallengeConsumed(challengeId: string): Promise<void> {
  const db = getFirestore();
  await db.collection("challenges").doc(challengeId).update({
    linkConsumedAt: Timestamp.now(),
    status: "consented",
  } satisfies Partial<ChallengeDoc>);
}
