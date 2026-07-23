// 본인 챌린지 목록 조회 (Track A/C, T36, UX-020, AC-043).
// firestore.rules의 challenges read 규칙(`resource.data.creatorUid == request.auth.uid`)이 본인
// 챌린지만 허용하므로, src/lib/history/fetchReportHistory.ts와 동일하게 콜러블 없이 클라 Firestore
// SDK로 직접 read한다. creatorUid 단일 필드 조건만 걸고(자동 단일 필드 인덱스, 신규 복합 인덱스
// 불필요) 정렬은 호출부가 JS에서 한다 — firestore.indexes.json에는 활성 개수 판정용
// creatorUid+status 복합만 있고 creatorUid+createdAt 복합은 없다(Database.md §Indexes가 목록 조회도
// creatorUid+status 인덱스로 충분하다고 명시).
import { collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ChallengeSource } from "./mapChallengeItems";

export async function fetchMyChallenges(uid: string): Promise<ChallengeSource[]> {
  const challengesQuery = query(collection(db, "challenges"), where("creatorUid", "==", uid));
  const snapshot = await getDocs(challengesQuery);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;
    const resultSummary = data.resultSummary as { suspicionTimeLabel?: string } | undefined;
    return {
      challengeId: (data.challengeId as string | undefined) ?? docSnap.id,
      displayName: (data.displayName as string | undefined) ?? "",
      status: (data.status as ChallengeSource["status"] | undefined) ?? "pending",
      resultSharingConsented: Boolean(data.resultSharingConsented),
      suspicionTimeLabel: resultSummary?.suspicionTimeLabel ?? null,
      createdAt,
    };
  });
}
