// 공유 링크 토큰 (T36, Architecture.md §14.4, AC-048).
//
// 평문 토큰은 createChallenge 응답으로 사용자1에게 1회만 반환되고 어디에도 저장되지 않는다 —
// Firestore에는 SHA-256 해시(linkTokenHash)만 남긴다(§14.4 "저장" 행). node:crypto만 의존하는
// 순수 함수라 Firestore/네트워크 없이 유닛테스트할 수 있다(guardrails/purge.ts의 "순수 로직과
// 부수효과 분리" 관례와 동일).
import { createHash, randomBytes } from "node:crypto";

/** 256-bit 랜덤 토큰(base64url) + 그 SHA-256 해시(hex)를 함께 만든다. */
export function generateShareToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/**
 * SEC-01(외부 보안 점검 2026-11-01) — 공개(무인증) 콜러블이 받은 토큰의 형식 검사.
 * generateShareToken()은 32바이트를 base64url(패딩 없음)로 내므로 항상 정확히 43자다.
 * 숫자 · 객체 · 배열이 hashToken()에 들어가면 createHash().update()가 던져 500 INTERNAL이 된다 —
 * 해시 · Firestore 조회보다 앞에서 이 검사로 거절(invalid-argument)한다.
 */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedShareToken(value: unknown): value is string {
  return typeof value === "string" && SHARE_TOKEN_PATTERN.test(value);
}

/**
 * 토큰 → 해시(hex). T37이 사용자2 진입 시 "받은 토큰을 해시해 linkTokenHash로 조회"할 때도
 * 이 함수를 그대로 재사용해야 한다(해시 방식이 두 곳에서 갈리면 조회가 항상 실패한다).
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
