// 목소리 프로필 콜러블 · 스케줄(Architecture.md §144 · DECISIONS #257 · PRD AC-041 · P-8).
// 판정은 voiceProfileRules.ts(순수), 여기는 Firestore · Storage · 폐기 배선만.
//
// - saveVoiceProfile(VP-SAVE): 보내기 사전 세션 녹음을 프로필 경로로 복사 → 사전 세션 즉시 폐기(Q3 — 종전엔
//   `created`로 남아 녹음이 무기한 남았다: onSessionEnded를 타지 않고 endStaleSessions는 active만 본다).
// - deleteVoiceProfile · purgeExpiredVoiceProfiles(VP-DEL): 녹음 사본 · 문서 삭제 + 그 목소리로 만든 챌린지 폐기(Q4).
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { denyAnonymous } from "../shared/anonymousGate";
import { readDocId } from "../shared/requestValidation";
import { GSV_TOKEN_KEY } from "../shared/config";
import { voiceInputStoragePath } from "../voice";
import { purgeSession } from "../guardrails";
import { purgeChallenge } from "./index";
import {
  VOICE_PROFILE_CAP,
  VOICE_PROFILE_CAP_REASON,
  checkSaveInput,
  checkSourceSession,
  liveProfileCount,
  retentionDeleteAtMs,
  selectChallengesForProfile,
  voiceProfileRecordingPath,
  voiceProfileStoragePrefix,
} from "./voiceProfileRules";
import type { ChallengeDoc, DeletionLogDoc, DeletionTarget, SessionDoc, VoiceProfileDoc } from "../shared/types";
import type {
  DeleteVoiceProfileRequest,
  DeleteVoiceProfileResponse,
  SaveVoiceProfileRequest,
  SaveVoiceProfileResponse,
} from "./types";

ensureFirebaseAdminApp();

// GSV_TOKEN_KEY — 사전 세션 · 챌린지 클론 폐기가 getVoiceProvider().deleteVoice를 거친다(§143 · challenge/index.ts와 같은 선언).
export const saveVoiceProfile = onCall<SaveVoiceProfileRequest, Promise<SaveVoiceProfileResponse>>(
  { secrets: [GSV_TOKEN_KEY] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    denyAnonymous(request.auth);
    const data = request.data ?? ({} as Partial<SaveVoiceProfileRequest>);
    const sessionId = readDocId(data.sessionId, "sessionId");
    const input = checkSaveInput(data); // VS1
    if (!input.ok) throw new HttpsError("invalid-argument", input.message);
    const uid = request.auth.uid;
    const db = getFirestore();
    const bucket = getStorage().bucket();

    // VS2 — 본인 · 시작 전 사전 세션 · 클론 준비 완료 · 녹음 있음.
    const sessionSnap = await db.collection("sessions").doc(sessionId).get();
    const session = sessionSnap.exists ? (sessionSnap.data() as SessionDoc) : undefined;
    const sessionProblem = checkSourceSession(session, uid);
    if (sessionProblem) throw new HttpsError("failed-precondition", sessionProblem);
    const sourcePath = voiceInputStoragePath(uid, sessionId);
    const [sourceExists] = await bucket.file(sourcePath).exists();
    if (!sourceExists) throw new HttpsError("failed-precondition", "녹음 파일을 찾을 수 없습니다. 다시 녹음해 주세요.");

    // VS3 — 개수 상한은 트랜잭션으로(동시 저장 두 번이 3을 넘지 않게).
    const voicesRef = db.collection("users").doc(uid).collection("voices");
    const profileRef = voicesRef.doc();
    const now = Timestamp.now();
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(voicesRef);
      const live = liveProfileCount(
        existing.docs.map((d) => (d.data() as VoiceProfileDoc).retentionDeleteAt.toMillis()),
        now.toMillis(),
      );
      if (live >= VOICE_PROFILE_CAP) {
        throw new HttpsError("resource-exhausted", "목소리는 3개까지 저장할 수 있어요. 하나를 지운 뒤 다시 저장해 주세요.", {
          reason: VOICE_PROFILE_CAP_REASON,
        });
      }
      const doc: VoiceProfileDoc = {
        profileId: profileRef.id,
        label: input.label,
        retentionDays: input.retentionDays,
        retentionDeleteAt: Timestamp.fromMillis(retentionDeleteAtMs(now.toMillis(), input.retentionDays)),
        consentTextVersion: data.consentTextVersion as string,
        consentedAt: now,
        createdAt: now,
      };
      tx.create(profileRef, doc);
    });

    // VS4 — 복사가 실패하면 자리를 돌려준다(녹음 없는 프로필을 남기지 않는다).
    try {
      await bucket.file(sourcePath).copy(bucket.file(voiceProfileRecordingPath(uid, profileRef.id)));
    } catch (err) {
      await profileRef.delete();
      logger.error("saveVoiceProfile: 녹음 복사 실패", { err });
      throw new HttpsError("internal", "목소리를 저장하지 못했습니다. 다시 시도해 주세요.");
    }

    // Q3 — 사전 세션 녹음 · 세션 클론은 이제 필요 없다(종래 무기한 잔존). 폐기 실패는 deletionLogs에 남고 저장은 성공.
    try {
      await purgeSession(sessionId, uid, session?.voiceId);
    } catch (err) {
      logger.error("saveVoiceProfile: 사전 세션 폐기 예외", { sessionId, err });
    }
    return { profileId: profileRef.id };
  },
);

/** VD1 ~ VD3 — 수동 · 자동 삭제 공통. 반환 = 함께 폐기한 챌린지 수. */
async function purgeVoiceProfile(uid: string, profileId: string): Promise<number> {
  const db = getFirestore();
  const bucket = getStorage().bucket();

  // VD2 — 그 목소리로 만든 챌린지(링크도 무효 — purgeChallenge가 status "deleted").
  const challengeSnap = await db
    .collection("challenges")
    .where("creatorUid", "==", uid)
    .where("voiceProfileId", "==", profileId)
    .get();
  const ids = selectChallengesForProfile(
    challengeSnap.docs.map((d) => ({ id: d.id, status: (d.data() as ChallengeDoc).status })),
  );
  for (const id of ids) {
    const c = challengeSnap.docs.find((d) => d.id === id)?.data() as ChallengeDoc;
    await purgeChallenge(id, uid, c.voiceId);
  }

  // VD1 — 녹음 사본(접두 전체).
  const targets: DeletionTarget[] = [];
  const prefix = voiceProfileStoragePrefix(uid, profileId);
  try {
    const [files] = await bucket.getFiles({ prefix });
    for (const file of files) {
      try {
        await file.delete();
        targets.push({ kind: "storage", ref: file.name, result: "success" });
      } catch {
        targets.push({ kind: "storage", ref: file.name, result: "failed" });
      }
    }
  } catch {
    targets.push({ kind: "storage", ref: prefix, result: "failed" });
  }
  const failed = targets.filter((t) => t.result === "failed").length;
  const log: DeletionLogDoc = {
    voiceProfileId: profileId,
    uid,
    deletedAt: Timestamp.now(),
    targets,
    overallResult: failed === 0 ? "success" : failed === targets.length ? "failed" : "partial",
  };
  await db.collection("deletionLogs").add(log);
  // VD3 — 녹음 삭제가 실패해도 문서는 지우지 않는다: 남겨 두면 자동 스캐너가 다시 시도한다.
  if (failed === 0) await db.collection("users").doc(uid).collection("voices").doc(profileId).delete();
  return ids.length;
}

export const deleteVoiceProfile = onCall<DeleteVoiceProfileRequest, Promise<DeleteVoiceProfileResponse>>(
  { secrets: [GSV_TOKEN_KEY] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    denyAnonymous(request.auth);
    const profileId = readDocId(request.data?.profileId, "profileId");
    const uid = request.auth.uid;
    // 본인 경로에서만 찾는다 — 남의 프로필 id는 "없음"과 같다.
    const snap = await getFirestore().collection("users").doc(uid).collection("voices").doc(profileId).get();
    if (!snap.exists) throw new HttpsError("not-found", "이미 지워진 목소리입니다.");
    const deletedChallengeCount = await purgeVoiceProfile(uid, profileId);
    return { status: "deleted", deletedChallengeCount };
  },
);

// 하루 1회(purgeExpiredChallenges와 같은 간격). collectionGroup 범위 쿼리 = firestore.indexes.json fieldOverrides.
export const purgeExpiredVoiceProfiles = onSchedule({ schedule: "every 24 hours", secrets: [GSV_TOKEN_KEY] }, async () => {
  const due = await getFirestore()
    .collectionGroup("voices")
    .where("retentionDeleteAt", "<=", Timestamp.now())
    .get();
  for (const doc of due.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    try {
      await purgeVoiceProfile(uid, doc.id);
      logger.info("purgeExpiredVoiceProfiles: 만료 폐기", { profileId: doc.id });
    } catch (err) {
      logger.error("purgeExpiredVoiceProfiles: 폐기 예외", { profileId: doc.id, err });
    }
  }
});
