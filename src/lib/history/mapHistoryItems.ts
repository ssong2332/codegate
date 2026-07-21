// 히스토리 목록 표시용 순수 매핑 (Track B, T15, UX-012, AC-016).
// Firestore Timestamp 등 SDK 타입에 의존하지 않는 순수 함수로 분리해 node:test로 검증한다
// (functions/src/report/analyzeConversation.ts와 동일한 "부수효과와 로직 분리" 관례). 정렬 자체는
// Firestore 쿼리(uid + createdAt desc, Database.md 인덱스)가 담당하고, 이 함수는 이미 정렬된
// 입력을 화면 표시용 라벨로 변환만 한다.

export type ReportHistorySource = {
  reportId: string;
  sessionId: string;
  wasDeceived: boolean;
  createdAt: Date | null; // 호출부에서 Firestore Timestamp.toDate()로 미리 변환해 전달한다.
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
  return reports.map((report) => ({
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
