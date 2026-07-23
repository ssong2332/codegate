// 유지형 복제 음성 보관함 조회 (T30, UX-025, ADR-0005/Database.md `users/{uid}/voices/{voiceId}`).
// history/fetchReportHistory.ts와 동일한 판단 — 본인 귀속 read는 콜러블 없이 클라 Firestore SDK로
// 직접 한다(firestore.rules가 `request.auth.uid == uid`만 허용). 이 컬렉션을 채우는 저장 UI는
// 범위 밖(P-8)이라 이 모듈은 조회만 한다.
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type StoredVoiceSummary = { voiceId: string; label: string };

export async function fetchStoredVoices(uid: string): Promise<StoredVoiceSummary[]> {
  const voicesQuery = query(
    collection(db, "users", uid, "voices"),
    orderBy("createdAt", "desc"),
  );
  const snapshot = await getDocs(voicesQuery);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      voiceId: (data.voiceId as string | undefined) ?? docSnap.id,
      label: (data.label as string | undefined) ?? "내 목소리",
    };
  });
}
