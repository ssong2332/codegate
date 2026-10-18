// 히스토리 목록 표시용 순수 매핑 (Track B, T15, UX-012, AC-016).
// Firestore Timestamp 등 SDK 타입에 의존하지 않는 순수 함수로 분리해 node:test로 검증한다
// (functions/src/report/analyzeConversation.ts와 동일한 "부수효과와 로직 분리" 관례). 정렬 자체는
// Firestore 쿼리(uid + createdAt desc, Database.md 인덱스)가 담당하고, 이 함수는 이미 정렬된
// 입력을 화면 표시용 라벨로 변환만 한다.
//
// T186(R-5 · User 결정 2026-10-17) — 2인 챌린지 체험 리포트(`challengeId` 있음)는 **목록에서 뺀다**
// (UX.md UF-010 Actor: "2인 챌린지의 사용자2는 대상이 아니다"). 이미 Google로 로그인한 사람이 링크로 동의하면
// 그 체험 리포트가 본인 uid로 생기므로(src/app/challenge/join/page.tsx) 쿼리(uid 동등)만으로는 걸러지지
// 않는다. 실패 아카이브(src/lib/archive/buildArchiveItems.ts · AC-069)와 같은 규칙이다.

export type ReportHistorySource = {
  reportId: string;
  sessionId: string;
  wasDeceived: boolean;
  createdAt: Date | null; // 호출부에서 Firestore Timestamp.toDate()로 미리 변환해 전달한다.
  /** 2인 챌린지 체험 리포트면 그 challengeId, 아니면 null(T186 — 목록에서 제외 판정용). */
  challengeId?: string | null;
};

export type HistoryListItem = {
  reportId: string;
  sessionId: string;
  dateLabel: string;
  resultLabel: string;
};

export function mapReportsToHistoryItems(
  reports: readonly ReportHistorySource[],
): HistoryListItem[] {
  return reports.filter((report) => !report.challengeId).map((report) => ({
    reportId: report.reportId,
    sessionId: report.sessionId,
    dateLabel: formatDateLabel(report.createdAt),
    resultLabel: report.wasDeceived ? "속음" : "안 속음",
  }));
}

function formatDateLabel(date: Date | null): string {
  if (!date) return "날짜 미상";
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
