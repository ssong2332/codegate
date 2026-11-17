// 2026-11-17 저장소 감사 2 — 리포트가 통화 전사보다 먼저 굳는 문제(잎 모듈 · Firestore 0 — 테스트가 직접 부른다).
//
// 전: `reports/{sid}`가 있으면 무조건 그대로 돌려줬다. 서버가 먼저 세션을 끝내는 경로(사기범 포기 · 끊기 → `triggerReportGeneration`)에서
// 리포트가 생긴 뒤 화면이 통화 전사를 제출하면(종료된 세션도 받는다) 그 전사는 리포트에 영영 반영되지 않았다.
// 후: 리포트에 만들 때 읽은 messages 수(`sourceMessageCount`)를 남기고, 그 뒤 메시지가 늘었으면 다음 `generateReport`에서 다시 계산한다.
// 리포트 화면은 열 때마다 `generateReport`를 먼저 부르므로(`src/app/report/page.tsx` fetchReport) 따로 낡음 표시를 쓰지 않는다.
// 다시 만든 쓰기가 옛 계산에 덮여도 저장된 수가 작아져 다음 호출이 또 다시 만든다(스스로 회복).
//
// 판정표 R(리포트가 이미 있을 때):
// | If | Then |
// |---|---|
// | R1 `sourceMessageCount` 부재(이 필드 전 리포트) | 그대로(무백필 · 종전) |
// | R2 지금 messages 수 ≤ 저장된 수 | 그대로 |
// | R3 늘었지만 되감기를 이미 시작함(`reports/{sid}/limits/rewind` 있음) | 그대로(되감기 기록이 가리키는 속은 순간 번호가 바뀌지 않게) |
// | R4 늘었고 되감기 전 | 다시 계산해 덮어쓴다(생성 시각 유지) |
export type ReportRegeneration = "keep" | "regenerate";

export function decideReportRegeneration(input: {
  storedCount: unknown;
  currentCount: number;
  rewindStarted: boolean;
}): ReportRegeneration {
  if (typeof input.storedCount !== "number") return "keep"; // R1
  if (input.currentCount <= input.storedCount) return "keep"; // R2
  if (input.rewindStarted) return "keep"; // R3
  return "regenerate"; // R4
}
