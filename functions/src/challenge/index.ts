// 2인 소셜 챌린지 — 사용자1 생성·클론 스코프·공유 링크 (T36, Architecture.md §14, ADR-0005,
// Database.md §challenges, AC-041/044/048/049).
//
// ⚠️ 스코프: 이 모듈은 "사용자1(발신) 측"만 채운다 — 사용자2 동의 랜딩·체험·정체 공개·결과 열람·
// 신고(UX-021, AC-040/042/043/049)는 T37 소관이다. 이 파일 하단의 resolveChallengeByTokenHash/
// markChallengeConsumed는 T37이 재사용할 primitive를 미리 만들어 둔 것일 뿐, 아직 어떤 콜러블에서도
// 호출되지 않는다(functions/src/index.ts가 export하지 않는다 — 배포 대상 아님).
//
// T49(#20, MVP Scope #20, Architecture.md §14.8) — createChallenge에 채널 분기를 추가했다: 메신저
// (비에스컬레이션) 시나리오는 클론/Storage/voiceId 발급을 전부 스킵하고 challenges.channel:"messenger"
// 로 표시된 문서만 생성한다(AC-051). 에스컬레이션 가능 메신저 시나리오(#21/OQ-28 대기)는 여기서
// failed-precondition(reason: "escalation_not_supported")으로 명시 거부한다. 보이스 챌린지 경로
// (아래 (a)(c) 클론 검증)는 무변경.
//
// T56(#23, MVP Scope #23, Architecture.md §14.9.1) — 보이스 채널 게이트를 완화했다: 기존엔
// `scenario.voiceMode !== "clone"`이면 전부 거부해 generic 보이스 챌린지가 성립할 수 없었다. 이제
// voice 채널은 clone·generic 둘 다 허용하고(AC-058), generic이면 클론 블록(아래 (a)(c))을 메신저와
// 동형으로 전부 스킵한다 — voiceId 미발급·미기록, `voiceMode:"generic"`만 기록한다.
//
// §144(DECISIONS #257) — 보이스 clone 챌린지의 소스 녹음은 발신자가 고른 **목소리 프로필**(`voiceProfileRules.ts` ·
// `voiceProfiles.ts`)의 녹음 사본이다. 챌린지마다 그 녹음으로 새 클론을 발급한다(스코프 고정 무변경). 종전의
// "최근 완료 클론 세션 녹음 재사용"(T36 편차)은 지웠다 — 세션 녹음은 세션 종료 · 프로필 저장 때 폐기된다.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { denyAnonymous } from "../shared/anonymousGate";
import { isDocId, readDocId } from "../shared/requestValidation";
import {
  VOICE_PROFILE_REQUIRED_REASON,
  checkProfileForChallenge,
  voiceProfileRecordingPath,
} from "./voiceProfileRules";
import { getVoiceProvider } from "../voice/provider";
import { GSV_TOKEN_KEY } from "../shared/config";
import { gsvKey } from "../voice/gsvKey";
import { PUBLIC_SCENARIOS, isAdvancedOnlyScenario } from "../scenarios/publicMeta";
import { assertDifficultyAllowed } from "../session/difficultyAllowance";
import { resolvePersonaCardRequest } from "../session/personaCard";
import type { VoiceMode } from "../scenarios/publicMeta";
import {
  CHALLENGE_DEFAULT_RETENTION_MS,
  CHALLENGE_DISPLAY_NAME_MAX_LENGTH,
  CHALLENGE_FREE_ACTIVE_CAP,
  CHALLENGE_FREE_LINK_EXPIRY_MS,
} from "../shared/constants";
import { normalizeDifficultyLevel } from "../shared/difficulty";
import type { DifficultyLevel } from "../shared/difficulty";
import { generateShareToken } from "./token";
import { listedChallengeStatus } from "./consentGate";
import { purgeChallengeArtifacts, selectChallengesToPurge } from "./purge";
import type { ChallengeDoc, DeletionLogDoc, MessengerChannel, VoiceProfileDoc } from "../shared/types";
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
  // §143 — 챌린지 전용 새 클론 = GSV `/prepare` 다시 실행(콜드 스타트 포함 최대 약 3분).
  { secrets: [GSV_TOKEN_KEY], timeoutSeconds: 240 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    denyAnonymous(request.auth);
    const { scenarioId, displayName, difficultyLevel, personaCardInput, voiceProfileId } = request.data ?? {};
    // SEC-07 — 숫자 · 객체 displayName은 `.trim()`에서 예외가 났다. 문자열 · 문서 ID 모양을 read 앞에서 판독한다.
    if (!isDocId(scenarioId) || typeof displayName !== "string" || !displayName.trim()) {
      throw new HttpsError("invalid-argument", "scenarioId와 displayName이 필요합니다.");
    }
    // 자체 감사 결함 5 — displayName은 UX-020 목록·UX-021 동의 랜딩에 그대로 노출되는 표시용
    // 문자열이라 길이 상한을 둔다(rewind/judge.ts REWIND_ANSWER_MAX_LENGTH 선례와 동일 원칙 —
    // 조용히 자르지 않고 거절한다).
    if (displayName.length > CHALLENGE_DISPLAY_NAME_MAX_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `displayName은 ${CHALLENGE_DISPLAY_NAME_MAX_LENGTH}자까지 입력할 수 있습니다.`,
      );
    }
    const scenario = Object.prototype.hasOwnProperty.call(PUBLIC_SCENARIOS, scenarioId) ? PUBLIC_SCENARIOS[scenarioId] : undefined;
    if (!scenario) {
      throw new HttpsError("invalid-argument", `존재하지 않는 scenarioId입니다: ${scenarioId}`);
    }
    // T191 S5(PRD AC-097 (b)(g) · UX 계약 C-2 · D-107) — 고급 전용 시나리오는 ① 비고급 · 난이도 미전달이면
    // createSession과 **같은 술어**로 `difficulty-not-allowed` ② 고급이어도 챌린지로 보낼 수 없다(AC-097 (g)
    // 확정 전 기본값 — 선택 목록에 없음). ⛔ 위치가 설계다: 어떤 Firestore 읽기 · 쓰기 · 음성 호출보다 앞.
    assertDifficultyAllowed(scenarioId, difficultyLevel);
    if (isAdvancedOnlyScenario(scenarioId)) {
      throw new HttpsError("failed-precondition", "이 시나리오는 지인에게 보내는 챌린지를 지원하지 않습니다.", {
        reason: "advanced-only-not-challengeable",
      });
    }

    // T47(#20, §14.8.1) — 명시 channel 판별자. 부재→"voice"(하위호환, 무백필).
    const scenarioChannel: MessengerChannel = scenario.channel ?? "voice";
    // T56(#23, §14.9.1) — 명시 voiceMode 판별자. voice 시나리오는 publicMeta.ts상 항상 세팅돼
    // 있다(부재는 방어적으로 clone 취급 — 계산 기본값, §14.9.1과 동형).
    const scenarioVoiceMode: VoiceMode = scenario.voiceMode ?? "clone";

    if (scenarioChannel === "voice") {
      // T56(#23, AC-058) — clone·generic 둘 다 유효한 챌린지 종류다(기존엔 clone만 허용하던
      // 게이트를 완화). VoiceMode 타입 자체가 "clone"|"generic" 둘뿐이라 별도 화이트리스트
      // 검증은 불필요 — 두 값 모두 아래 분기가 처리한다.
    } else {
      // 메신저 — #20 게이트(§14.8.1): 에스컬레이션 가능 시나리오(scenario.escalation 존재)는
      // #21(P1)/OQ-28 확정 대기라 명시적으로 거부한다(조용한 실패 금지). client가 "클론 미완료"
      // failed-precondition과 구분할 수 있도록 details.reason을 함께 싣는다.
      if (scenario.escalation) {
        throw new HttpsError(
          "failed-precondition",
          "이 시나리오는 아직 지인에게 보내는 챌린지를 지원하지 않습니다.",
          { reason: "escalation_not_supported" },
        );
      }
    }

    // T72(§15.3.2, AC-064/065) — 난이도 enum 확정. ⚠️ 이 값은 아래 **어떤 게이트도 바꾸지 않는다**:
    // 활성 챌린지 상한(AC-049)·링크 만료(AC-048)·클론 보유 검증(AC-041)·채널/음성모드 분기는
    // 세 난이도에서 완전히 동일하게 적용된다(D-42). 난이도는 기록·전달만 되는 값이다.
    const resolvedDifficultyLevel = normalizeDifficultyLevel(difficultyLevel);

    // ⭐ §88(DECISIONS #199 · UX D-131) — 발신자가 넣은 **받는 분 정보**(선택 · 비면 카드 0). `createSession`과 같은 조합 함수 ·
    // 같은 술어(시나리오 채널로 판정)다. 카드는 챌린지 문서에만 두고 `consentChallenge`가 수신자 세션에 복사한다 — 받는 사람은
    // 통화가 끝날 때까지 보지 못한다(랜딩 응답에 싣지 않는다). ⛔ 위치가 설계다: 어떤 Firestore 읽기 · 쓰기 · 음성 호출보다 앞.
    const personaCardResult = resolvePersonaCardRequest(
      personaCardInput,
      { scenarioId, difficultyLevel: resolvedDifficultyLevel, channel: scenarioChannel },
      "sender",
    );
    if (!personaCardResult.ok) {
      throw new HttpsError("invalid-argument", "받는 분 정보를 확인해 주세요.", { reason: personaCardResult.reason });
    }
    const personaCard = personaCardResult.personaCard;

    const uid = request.auth.uid;
    const db = getFirestore();

    // (b) 활성 챌린지 개수 상한(무료 3개, §14.5/AC-049·OQ-30 채널 무관 전역 합산) — 채널 분기
    // 이전에 동일하게 적용한다(§14.8.4). 값비싼 클론 검증(아래 (a)(c))보다 먼저 막아 실패를
    // 빠르게 반환한다(생성 후 롤백 없음).
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

    const challengeRef = db.collection("challenges").doc();
    let voiceId: string | undefined;
    let usedProfileId: string | undefined;

    if (scenarioChannel === "voice" && scenarioVoiceMode === "clone") {
      // (a) §144 판정표 VU — 보낼 목소리 = 발신자가 고른 **목소리 프로필**의 녹음 사본(`voiceProfileRules.ts`).
      // 종전 "최근 cloneStatus:ready 세션 녹음" 탐색은 지웠다(DECISIONS #257 Q2 — 저장 필수). 프로필 id는 클라가
      // 넘기지만 문서는 caller uid 경로에서만 읽으므로 남의 프로필을 고를 수 없다.
      const profileSnap = isDocId(voiceProfileId)
        ? await db.collection("users").doc(uid).collection("voices").doc(voiceProfileId).get()
        : undefined;
      const profileData = profileSnap?.exists ? (profileSnap.data() as VoiceProfileDoc) : undefined;
      const profileProblem = checkProfileForChallenge(
        profileData ? { retentionDeleteAtMs: profileData.retentionDeleteAt.toMillis() } : undefined,
        now.toMillis(),
      );
      if (profileProblem) {
        throw new HttpsError("failed-precondition", profileProblem, { reason: VOICE_PROFILE_REQUIRED_REASON });
      }
      const storagePath = voiceProfileRecordingPath(uid, voiceProfileId as string);
      const [recordingExists] = await getStorage().bucket().file(storagePath).exists();
      if (!recordingExists) {
        throw new HttpsError("failed-precondition", "보낼 목소리를 다시 녹음해 주세요.", {
          reason: VOICE_PROFILE_REQUIRED_REASON,
        });
      }
      usedProfileId = voiceProfileId as string;

      // (c) 챌린지 전용 신규 클론(ADR-0005 스코프 고정) — 원본 세션의 voiceId를 재사용하지 않고
      // 항상 새로 발급한다. MockVoiceProvider는 매 호출 randomUUID 기반 voiceId를 반환하므로 소스
      // 세션의 voiceId와 절대 같을 수 없다(에뮬레이터 검증 대상).
      const provider = getVoiceProvider(gsvKey());
      const cloneResult = await provider.createClone({
        sessionId: challengeRef.id,
        uid,
        voiceInputStoragePath: storagePath,
      });
      if (cloneResult.cloneStatus !== "ready") {
        throw new HttpsError("internal", "음성 클론 생성에 실패했습니다.");
      }
      voiceId = cloneResult.voiceId;
    }
    // 메신저(#20, §14.8.0)·generic 보이스(#23, §14.9.1) — 클론·Storage 검증·voiceId 발급을 아예
    // 타지 않는다(AC-051/058, 유출 리스크 표면 자체가 없다). generic 보이스는 기존
    // GENERIC_VOICE_ID 폴백 합성으로 성립(consentChallenge §14.9.2가 처리).

    // (d) 토큰 — 평문은 이 응답에서만 반환, 해시만 저장(§14.4).
    const { token, tokenHash } = generateShareToken();

    const linkExpiresAt = Timestamp.fromMillis(now.toMillis() + CHALLENGE_FREE_LINK_EXPIRY_MS);
    const retentionDeleteAt = Timestamp.fromMillis(now.toMillis() + CHALLENGE_DEFAULT_RETENTION_MS);

    // (e)(f) challenges/{challengeId} 문서 작성 — Architecture.md §14.1/§14.8.1/§14.9.1 스키마
    // 그대로. T37 소관 필드(resultSharingConsented 등)와 T47/T56 신규 필드(voiceId/channel/
    // voiceMode)는 옵셔널이라 값이 없으면 키 자체를 만들지 않는다(Firestore admin SDK가 undefined
    // 값을 기본 거부하는 기존 관례, session/index.ts와 동일 패턴). 보이스 clone 챌린지는
    // channel·voiceMode를 둘 다 생략(부재→voice/clone, 기존 문서와 동일 형태 유지) — 메신저
    // 챌린지는 channel:"messenger", generic 보이스 챌린지는 voiceMode:"generic"만 명시 기록한다.
    const challengeDoc: ChallengeDoc = {
      challengeId: challengeRef.id,
      creatorUid: uid,
      scenarioId,
      displayName: displayName.trim(),
      status: "pending",
      linkTokenHash: tokenHash,
      linkExpiresAt,
      retentionDeleteAt,
      createdAt: now,
      ...(voiceId ? { voiceId } : {}),
      // §144 VD2 — 프로필 삭제 · 만료 때 함께 폐기할 챌린지를 찾는 키.
      ...(usedProfileId ? { voiceProfileId: usedProfileId } : {}),
      ...(scenarioChannel === "messenger" ? { channel: "messenger" as const } : {}),
      ...(scenarioChannel === "voice" && scenarioVoiceMode === "generic"
        ? { voiceMode: "generic" as const }
        : {}),
      // T72(§15.3.2/§15.6 G9) — 항상 확정값을 기록한다. consentChallenge가 이 값을 사용자2 체험
      // 세션에 복사하지 않으면 발신자가 고른 난이도가 수신자 통화에 전혀 반영되지 않는다.
      difficultyLevel: resolvedDifficultyLevel,
      // §88 — 입력이 있을 때만 필드가 생긴다(부재 = 카드 0).
      ...(personaCard ? { personaCard } : {}),
    };
    await challengeRef.set(challengeDoc);

    return {
      challengeId: challengeRef.id,
      shareToken: token,
      linkExpiresAt: linkExpiresAt.toDate().toISOString(),
    };
  },
);

// §143 — 이 파일은 createChallenge가 합성 키를 읽어 같은 파일의 모든 진입점이 같은 시크릿을 선언한다(secretDeclarationGate (i)).
export const deleteChallenge = onCall<DeleteChallengeRequest, Promise<DeleteChallengeResponse>>(
  { secrets: [GSV_TOKEN_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    denyAnonymous(request.auth);
    const { challengeId } = request.data ?? {};
    readDocId(challengeId, "challengeId"); // SEC-07

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
>({ secrets: [GSV_TOKEN_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  denyAnonymous(request.auth);
  const db = getFirestore();
  const snap = await db.collection("challenges").where("creatorUid", "==", request.auth.uid).get();
  const nowMs = Date.now();

  const challenges: ListMyChallengesItem[] = snap.docs.map((doc) => {
    const data = doc.data() as ChallengeDoc;
    const channel: MessengerChannel = data.channel ?? "voice";
    const voiceMode: VoiceMode = data.voiceMode ?? "clone";
    // U03(2026-11-26 · 사용자 결정 "세 종류 모두 동일") — 종전 메신저(AC-055) · generic(OQ-32) 의심 시점 숨김을 없앴다.
    // 대신 받은 사람이 공유에 동의한 경우에만 요약을 싣는다(아래 두 줄 · 판정표 RS).
    return {
      challengeId: data.challengeId,
      displayName: data.displayName,
      // D6 — 만료가 지난 미사용 링크는 "expired"(동의 게이트와 같은 판정 · `consentGate.ts`).
      status: listedChallengeStatus(data.status, data.linkExpiresAt.toMillis(), nowMs),
      resultSharingConsented: Boolean(data.resultSharingConsented),
      suspicionTimeLabel: data.resultSharingConsented ? (data.resultSummary?.suspicionTimeLabel ?? null) : null,
      // U03 — 공유 동의한 경우에만 요약을 싣는다(채널 · 음성 모드 무관 — 사용자 결정 "세 종류 모두 동일").
      resultSummary: data.resultSharingConsented ? (data.resultSummary ?? null) : null,
      createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
      channel,
      voiceMode,
      voiceProfileId: data.voiceProfileId ?? null,
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
export async function purgeChallenge(
  challengeId: string,
  creatorUid: string,
  voiceId: string | undefined,
): Promise<void> {
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
  // §88 — 받는 분 정보(카드)는 폐기와 함께 지운다(동의 전에 만료 · 삭제된 링크에 남지 않게). 없는 필드 삭제는 무해하다.
  await db.collection("challenges").doc(challengeId).update({ status: "deleted", personaCard: FieldValue.delete() });
}

/**
 * DECISIONS #258 판정표 RT3 — 보존 만료는 **음성만** 폐기한다: 클론 삭제 · voiceId · 받는 분 정보(카드) 삭제 ·
 * `retentionPurgedAt` 표식. 상태(status)는 그대로라 목록 · 결과(resultSummary) · 신고가 남는다. 통화 재개는
 * consentGate · createRealtimeCall의 retentionDeleteAt 검사가 막는다(무변경). "deleted"는 사용자 삭제 · 프로필 삭제만.
 */
async function purgeChallengeVoice(
  challengeId: string,
  creatorUid: string,
  voiceId: string | undefined,
): Promise<void> {
  const provider = getVoiceProvider();
  const { targets, overallResult } = await purgeChallengeArtifacts(voiceId, {
    deleteVoice: (id) => provider.deleteVoice(id),
  });
  const db = getFirestore();
  const deletionLog: DeletionLogDoc = { challengeId, uid: creatorUid, deletedAt: Timestamp.now(), targets, overallResult };
  await db.collection("deletionLogs").add(deletionLog);
  await db.collection("challenges").doc(challengeId).update({
    voiceId: FieldValue.delete(),
    personaCard: FieldValue.delete(),
    retentionPurgedAt: Timestamp.now(),
  });
}

/**
 * 기간제 자동 삭제 스캔(§14.3 "자동 삭제 = retentionDeleteAt 도달 시 스케줄 함수가 폐기"). 이
 * 코드베이스 첫 onSchedule 함수라 참고할 기존 패턴이 없다 — 하루 1회면 최대 24시간의 보존 초과
 * 지연은 §14.3의 "기본 30일" 스케일에서 무시 가능하다고 판단해 간격을 골랐다(다른 상수처럼 향후
 * 조정 가능). retentionDeleteAt<=now로 1차 필터링은 Firestore 쿼리가 하고(단일 필드 범위 쿼리라
 * 신규 복합 인덱스 불필요), "이미 deleted인 문서 제외"는 순수 함수(selectChallengesToPurge)가
 * 한다 — 그래야 스케줄이 매일 돌 때마다 예전에 이미 지운 챌린지를 또 지우려 시도하지 않는다.
 */
export const purgeExpiredChallenges = onSchedule({ schedule: "every 24 hours", secrets: [GSV_TOKEN_KEY] }, async () => {
  const db = getFirestore();
  const nowMs = Date.now();
  const dueSnap = await db
    .collection("challenges")
    .where("retentionDeleteAt", "<=", Timestamp.fromMillis(nowMs))
    .get();

  const candidates = dueSnap.docs.map((doc) => {
    const data = doc.data() as ChallengeDoc;
    return {
      id: doc.id,
      status: data.status,
      retentionDeleteAtMs: data.retentionDeleteAt.toMillis(),
      retentionPurged: data.retentionPurgedAt !== undefined,
    };
  });
  const idsToPurge = selectChallengesToPurge(candidates, nowMs);

  for (const id of idsToPurge) {
    const doc = dueSnap.docs.find((d) => d.id === id);
    const data = doc?.data() as ChallengeDoc | undefined;
    if (!data) continue;
    try {
      await purgeChallengeVoice(id, data.creatorUid, data.voiceId);
      logger.info("purgeExpiredChallenges: 보존 만료 음성 폐기", { challengeId: id });
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
  // T37 추가 — status(만료·소진 판정에 status만으로는 부족해 §14.4/§14.7.5 "status∈{consented,
  // in_progress}+미만료" 재검증에 필요) 자체는 민감 필드가 아니라(voiceId/linkTokenHash와 달리)
  // 반환해도 AC-041 위반이 아니다.
  status: ChallengeDoc["status"];
  // T47 추가(#20, §14.8.1) — 채널 판별자(부재→voice). 수신 랜딩(UX-021)이 UX-014(voice) vs
  // UX-022(messenger) 라우팅을 이 값만으로 결정한다(scenario 별도 룩업 불요). 민감 필드가
  // 아니라 반환해도 무방하다.
  channel: MessengerChannel;
  // T56 추가(#23, §14.9.1) — clone/generic 판별자(부재→clone). consentChallenge의 오프닝 합성
  // 3분기(§14.9.2)·발신자 결과 파생(§14.9.3)이 scenario 재조회 없이 이 값만으로 판정한다. channel
  // 과 동형으로 비민감 필드라 반환해도 무방하다(channel==="messenger"면 의미 없음 — 음성모드
  // 개념 없음, 값은 계산 기본값 "clone"이지만 무시된다).
  voiceMode: VoiceMode;
  // T72 추가(§15.3.2/§15.6 G9) — 발신자가 고른 강도(부재→"intermediate"). getChallengeLanding이
  // 동의 랜딩 표시에, consentChallenge가 사용자2 체험 세션 복사·오프닝 조립에 쓴다. 비민감 필드.
  difficultyLevel: DifficultyLevel;
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
    status: data.status,
    channel: data.channel ?? "voice",
    voiceMode: data.voiceMode ?? "clone",
    difficultyLevel: normalizeDifficultyLevel(data.difficultyLevel),
  };
}

/** 동의 통과 시점의 1회성 토큰 소모(§14.4) — linkConsumedAt 세팅 + status를 "consented"로 전이.
 * tx가 주어지면(reviewer 리뷰 Major 수정, 2026-07-24 — challenge/userAccess.ts의 "소모+세션 생성"
 * 원자화 트랜잭션 참고) 그 트랜잭션 안에서 쓰기를 큐잉만 하고 즉시 반환한다 — 커밋은 호출부의
 * db.runTransaction이 담당한다. tx 없이 단독 호출하면(현재 실사용처 없음, 향후 대비) 기존처럼
 * 즉시 write한다. */
export async function markChallengeConsumed(
  challengeId: string,
  tx?: FirebaseFirestore.Transaction,
): Promise<void> {
  const db = getFirestore();
  const ref = db.collection("challenges").doc(challengeId);
  const payload = {
    linkConsumedAt: Timestamp.now(),
    status: "consented",
    // §88(DECISIONS #199) — 받는 분 정보(카드)는 동의 = 수신자 세션 복사 순간에 챌린지 문서에서 지운다(호출부 트랜잭션이 세션
    // 문서 쓰기와 함께 커밋한다). 없는 필드 삭제는 무해하다.
    personaCard: FieldValue.delete(),
  } satisfies { linkConsumedAt: Timestamp; status: ChallengeDoc["status"]; personaCard: FieldValue };
  if (tx) {
    tx.update(ref, payload);
    return;
  }
  await ref.update(payload);
}
