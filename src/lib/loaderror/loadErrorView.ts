// UX-01(외부 보안 점검 2026-11-01) — 불러오기 실패 안내를 오류 종류별로 나눈다.
//
// 전에는 리포트 · 되짚어보기 · 챌린지 랜딩이 모든 예외를 "다시 시도" 하나로 묶었다. 권한 없음 · 잘못된
// 링크는 다시 시도해도 결과가 같아 사용자를 헛돌게 한다.
//
// | 오류 코드(콜러블 `functions/` 접두어 제거 · Firestore는 접두어 없음) | 종류 | 안내 |
// |---|---|---|
// | `permission-denied` | forbidden | 접근할 수 없음 + 기록 목록으로 |
// | `not-found` · `invalid-argument` | invalid-link | 종료 안내(다시 시도 없음) |
// | 그 밖(네트워크 `unavailable` · `deadline-exceeded` · `internal` · 코드 없음 …) | retryable | 다시 시도 |
//
// ⛔ 비소유자에게 리포트가 있는지 · 누구 것인지 알리지 않는다 — forbidden 문구는 존재 여부와 무관한
// 한 문장이고 서버 메시지 · 소유자 정보를 화면에 옮기지 않는다. (Firestore 규칙상 없는 세션 · 남의
// 세션 read는 둘 다 permission-denied라 화면에서도 구분되지 않는다.)

export type LoadErrorKind = "forbidden" | "invalid-link" | "retryable";

export function errorCodeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code: unknown }).code;
  if (typeof code !== "string") return null;
  return code.startsWith("functions/") ? code.slice("functions/".length) : code;
}

export function classifyLoadError(error: unknown): LoadErrorKind {
  const code = errorCodeOf(error);
  if (code === "permission-denied") return "forbidden";
  if (code === "not-found" || code === "invalid-argument") return "invalid-link";
  return "retryable";
}

export const REPORT_FORBIDDEN_MESSAGE = "이 리포트에 접근할 수 없습니다.";
export const REPORT_FORBIDDEN_ACTION_LABEL = "기록 목록으로";
export const REPORT_FORBIDDEN_ACTION_HREF = "/history";
export const REPORT_INVALID_LINK_MESSAGE = "리포트를 찾을 수 없습니다. 받은 링크가 올바른지 확인해 주세요.";
export const CHALLENGE_INVALID_LINK_MESSAGE = "유효하지 않은 링크입니다. 받은 링크를 다시 확인해 주세요.";
