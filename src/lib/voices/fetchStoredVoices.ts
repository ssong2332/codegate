// 목소리 프로필 조회(§144 · ADR-0005 · Database.md `users/{uid}/voices/{profileId}`).
// 본인 귀속 read는 콜러블 없이 클라 Firestore SDK로 직접 한다(firestore.rules가 `request.auth.uid == uid`만 허용).
// 쓰기 · 삭제는 Functions(saveVoiceProfile · deleteVoiceProfile)만 한다.
import { collection, getDocs, orderBy, query, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { VoiceProfileSummary } from "./voiceProfileConsent";

/** 메신저 voice-select ②(self에서 숨김)가 쓰는 옛 모양 — `voiceId` = 프로필 id. */
export type StoredVoiceSummary = { voiceId: string; label: string };

export async function fetchVoiceProfiles(uid: string): Promise<VoiceProfileSummary[]> {
  const snapshot = await getDocs(query(collection(db, "users", uid, "voices"), orderBy("createdAt", "desc")));
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      profileId: docSnap.id,
      label: (data.label as string | undefined) ?? "내 목소리",
      retentionDeleteAtMs: (data.retentionDeleteAt as Timestamp | undefined)?.toMillis() ?? 0,
    };
  });
}

export async function fetchStoredVoices(uid: string): Promise<StoredVoiceSummary[]> {
  const profiles = await fetchVoiceProfiles(uid);
  return profiles
    .filter((p) => p.retentionDeleteAtMs > Date.now())
    .map((p) => ({ voiceId: p.profileId, label: p.label }));
}
