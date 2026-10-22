// §106(2026-10-22 사용자 실기 요청) — 가짜 사건 기록 열람본의 **피의자 칸 값** 만들기(순수 함수 · 잎 모듈).
// ⚠️ `src/components/MessengerFakeLanding.tsx`가 상대 경로로 import한다 — 렌더 하네스가 `@/` 별칭을 풀지 못하므로 이 파일은 아무것도 import하지 않는다.
//
// 사용자 원문: *"실제 사건 기록을 사용자가 입력한 값대로 들어간 기록서가 있어야 할 거 같은데"*
//
// | 입력 | 결과 |
// |---|---|
// | 입력 칸 라벨 순서 · 그 칸에 넣은 값 | 같은 순서의 `{ label, value }` — 값은 앞뒤 공백만 뗀다(자동 서식 0) |
// | 칸이 비어 있음(제출 검증이 막아 오늘은 도달 0) | 값 `"-"` |
// | 뒤에 붙일 고정 칸(카탈로그 `subjectRows`) | 입력 칸 뒤에 그대로 |
// | §109 반 칸 라벨(카탈로그 `subjectHalfLabels`) | 그 라벨의 입력 칸에 `half: true`(표에서 두 칸이 한 줄에 나란히) · 그 밖 = 표시 0 |
// ⛔ 네트워크 · 저장 0 — 값은 호출한 컴포넌트의 로컬 state에서 와서 화면 문자열로만 돌아간다(AC-045 · G138 무변경).

/** `half` = 표에서 다른 반 칸과 한 줄에 나란히 그린다(§109 — 부재 = 한 줄 전체). */
export type RecordRow = { label: string; value: string; half?: boolean };

export function recordSubjectRows(
  fieldLabels: readonly string[],
  values: Readonly<Record<string, string>>,
  fixedRows: readonly RecordRow[],
  halfLabels: readonly string[] = [],
): RecordRow[] {
  const entered = fieldLabels.map((label) => {
    const row: RecordRow = { label, value: (values[label] ?? "").trim() || "-" };
    return halfLabels.includes(label) ? { ...row, half: true } : row;
  });
  return [...entered, ...fixedRows];
}

// §109(2026-10-22 사용자 실기 요청 — *"기록 열람본을 더 사실적인 문서로"*) — 문서 아래 **발급 정보** 값 만들기.
//
// | 입력 | 결과 |
// |---|---|
// | 제출 순간의 시각(`Date` — 기기 현지 시각) | 발급 일시 `"2026. 10. 22. 23:41"` 꼴 |
// | 같은 시각 + 30분 | 열람 만료(같은 꼴) |
// | 같은 시각 | 열람 신청 번호 `"2026-1022-2341"`(연 · 월일 · 시분 — 하이픈으로 끊어 8자리 연속 숫자 0) |
// ⛔ 입력값을 쓰지 않는다 — 시각만 받는다(무작위 0 · 같은 시각이면 같은 값).
export const RECORD_VIEW_MINUTES = 30;

export type RecordIssueInfo = { requestNo: string; issuedAt: string; expiresAt: string };

const pad2 = (n: number) => String(n).padStart(2, "0");

function stampOf(date: Date): string {
  return `${date.getFullYear()}. ${pad2(date.getMonth() + 1)}. ${pad2(date.getDate())}. ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function recordIssueInfo(issued: Date): RecordIssueInfo {
  const expires = new Date(issued.getTime() + RECORD_VIEW_MINUTES * 60_000);
  return {
    requestNo: `${issued.getFullYear()}-${pad2(issued.getMonth() + 1)}${pad2(issued.getDate())}-${pad2(issued.getHours())}${pad2(issued.getMinutes())}`,
    issuedAt: stampOf(issued),
    expiresAt: stampOf(expires),
  };
}
