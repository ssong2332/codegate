// SEC-07(외부 보안 점검 2차 · 2026-11-02) — 콜러블 입력 판독 공용 함수(잎 모듈 — Firestore 0, 테스트가 직접 부른다).
//
// 숫자 · 객체 · `"a/b"` 같은 값이 `db.collection(...).doc(x)` · `.trim()` 에 그대로 닿으면 SDK가 예외를 던져
// 클라에는 `internal`(500)로 보였다. 문서 ID · 메시지 · 전사 항목은 **어떤 Firestore 읽기 · LLM 호출보다 앞에서**
// 이 함수들로 읽고, 어긋나면 `invalid-argument` 로 거절한다(저장 0 · AI 호출 0).
//
// | 값 | 허용 | 그 밖 |
// |---|---|---|
// | 문서 ID(sessionId · reportId · challengeId · 카탈로그 id) | 문자열 · `[A-Za-z0-9_-]` 1~128자 | invalid-argument |
// | 메시지 본문 | 문자열 · 공백만 아님 · 상한 이하 | invalid-argument |
// | 선택 불리언 · 선택 숫자 | 부재 또는 그 타입(숫자는 유한) | invalid-argument |
//
// ⭐ 문서 ID 문자 집합을 좁힌 이유 — Firestore 자동 ID(20자 영숫자)와 카탈로그 id(케밥 표기)가 모두 들어가고,
// `/`(경로 분리) · `.`/`..` · `__x__`(예약) 처럼 SDK가 거부하는 모양은 하나도 들어가지 않는다.
import { HttpsError } from "firebase-functions/v2/https";

const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isDocId(value: unknown): value is string {
  // `__x__` 모양은 Firestore 예약 ID다(문자 집합 안이라 따로 막는다).
  return typeof value === "string" && DOC_ID_PATTERN.test(value) && !/^__.*__$/.test(value);
}

/** 문서 ID 판독 — 어긋나면 invalid-argument(메시지에 받은 값을 싣지 않는다). */
export function readDocId(value: unknown, field: string): string {
  if (!isDocId(value)) {
    throw new HttpsError("invalid-argument", `${field}가 올바르지 않습니다.`);
  }
  return value;
}

/** 공백만이 아닌 문자열 판독 — 길이 상한 초과는 별도 문구로 거절하는 호출부가 있어 상한은 선택이다. */
export function readText(value: unknown, field: string, maxLength?: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${field}가 필요합니다.`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new HttpsError("invalid-argument", `${field}는 ${maxLength}자까지 보낼 수 있습니다.`);
  }
  return value;
}

export function readOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw new HttpsError("invalid-argument", `${field}가 올바르지 않습니다.`);
  }
  return value;
}

export function readOptionalFiniteNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpsError("invalid-argument", `${field}가 올바르지 않습니다.`);
  }
  return value;
}
