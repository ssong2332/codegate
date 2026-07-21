// 본인 리포트 히스토리 조회 (Track B, T15, UX-012, AC-016).
// Database.md §Indexes가 `reports` uid+createdAt desc 복합 인덱스를 이미 요구하고 있고,
// firestore.rules의 reports read 규칙(`resource.data.uid == request.auth.uid`)이 본인 데이터만
// 허용하므로, generateReport.ts와 달리 콜러블 없이 클라 Firestore SDK로 직접 read한다
// (consent/index.ts의 hasGrantedConsent와 동일한 "본인 귀속 read는 직접" 판단).
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ReportHistorySource } from "./mapHistoryItems";

export async function fetchReportHistory(uid: string): Promise<ReportHistorySource[]> {
  const historyQuery = query(
    collection(db, "reports"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc"),
  );
  const snapshot = await getDocs(historyQuery);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;
    return {
      reportId: (data.reportId as string | undefined) ?? docSnap.id,
      sessionId: data.sessionId as string,
      wasDeceived: Boolean(data.wasDeceived),
      createdAt,
    };
  });
}
