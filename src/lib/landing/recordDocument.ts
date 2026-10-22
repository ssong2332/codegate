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
// ⛔ 네트워크 · 저장 0 — 값은 호출한 컴포넌트의 로컬 state에서 와서 화면 문자열로만 돌아간다(AC-045 · G138 무변경).

export type RecordRow = { label: string; value: string };

export function recordSubjectRows(
  fieldLabels: readonly string[],
  values: Readonly<Record<string, string>>,
  fixedRows: readonly RecordRow[],
): RecordRow[] {
  const entered = fieldLabels.map((label) => ({ label, value: (values[label] ?? "").trim() || "-" }));
  return [...entered, ...fixedRows];
}
