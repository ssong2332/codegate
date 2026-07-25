// 실패 아카이브(UX-030, T74, AC-068/AC-069) — 본인 리포트 커서 페이징 조회.
//
// Architecture.md §15.4.1 확정 사항 그대로: **역정규화 컬렉션을 만들지 않고** 기존 `reports`를
// `uid + createdAt desc`로 50건씩 읽어 클라가 `deceivedMoments`를 평탄화한다. 필요한 복합 인덱스
// (`reports: uid ASC + createdAt DESC`)는 firestore.indexes.json에 **이미 있다** — 신규 인덱스·
// collectionGroup 설정 없음.
//
// ⚠️ AC-069 1차 방어 — 쿼리 조건은 `where("uid","==",uid)` 하나뿐이고, firestore.rules의 reports
// read 규칙(`resource.data.uid == request.auth.uid`)이 서버측에서 같은 조건을 강제한다. 2인
// 챌린지 사용자2의 리포트는 **익명 uid 소유**라(§14.7/ADR-0006) 사용자1의 결과에 애초에 들어오지
// 않는다. 2차 방어(`challengeId` 배제)는 summarizeArchive가 담당한다(§15.4.3).
//
// 콜러블을 두지 않고 클라 Firestore SDK로 직접 read하는 판단은 lib/history/fetchReportHistory.ts와
// 동일하다(본인 귀속 read는 규칙으로 이미 닫혀 있다). UX-030 Data Operations도 "Read 전용, 쓰기 없음".
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ArchiveChannel, ArchiveMomentSource, ArchiveReportSource } from "./buildArchiveItems";

/** §15.4.1 (c) — 리포트 50건 단위 커서 페이징. "더 보기"가 다음 50건을 읽는다. */
export const ARCHIVE_PAGE_SIZE = 50;

export type ArchivePage = {
  reports: ArchiveReportSource[];
  /** 다음 페이지 커서(마지막 문서 스냅샷). 더 읽을 게 없으면 null. */
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  /** 이번 페이지가 가득 찼는가 — "묶기 개수는 불러온 범위의 집계"임을 화면이 밝히는 근거(§15.4.1). */
  hasMore: boolean;
};

function toArchiveReport(snap: QueryDocumentSnapshot<DocumentData>): ArchiveReportSource {
  const data = snap.data();
  const rawMoments = Array.isArray(data.deceivedMoments) ? data.deceivedMoments : [];
  const deceivedMoments: ArchiveMomentSource[] = rawMoments.map((moment) => ({
    turnIndex: Number((moment as ArchiveMomentSource).turnIndex ?? 0),
    timeLabel: String((moment as ArchiveMomentSource).timeLabel ?? ""),
    tactic: String((moment as ArchiveMomentSource).tactic ?? ""),
    correctAction: String((moment as ArchiveMomentSource).correctAction ?? ""),
    tacticCategory: (moment as ArchiveMomentSource).tacticCategory,
  }));

  return {
    reportId: (data.reportId as string | undefined) ?? snap.id,
    sessionId: (data.sessionId as string | undefined) ?? null,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
    scenarioId: (data.scenarioId as string | undefined) ?? null,
    channel: (data.channel as ArchiveChannel | undefined) ?? null,
    challengeId: (data.challengeId as string | undefined) ?? null,
    deceivedMoments,
  };
}

/** 다음 리포트 페이지를 읽는다. `cursor`가 null이면 첫 페이지. */
export async function fetchArchiveReportPage(
  uid: string,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
): Promise<ArchivePage> {
  // §15.4.1은 `startAfter(createdAt, __name__)`를 적었지만, 문서 스냅샷을 그대로 넘기면 정렬
  // 필드 + 문서 id 타이브레이크를 SDK가 동일하게 조립해 준다(같은 커서, 값 추출 실수 여지 없음).
  const base = [where("uid", "==", uid), orderBy("createdAt", "desc")];
  const pageQuery = cursor
    ? query(collection(db, "reports"), ...base, startAfter(cursor), limit(ARCHIVE_PAGE_SIZE))
    : query(collection(db, "reports"), ...base, limit(ARCHIVE_PAGE_SIZE));

  const snapshot = await getDocs(pageQuery);
  const hasMore = snapshot.docs.length === ARCHIVE_PAGE_SIZE;

  return {
    reports: snapshot.docs.map(toArchiveReport),
    cursor: hasMore ? snapshot.docs[snapshot.docs.length - 1] : null,
    hasMore,
  };
}
