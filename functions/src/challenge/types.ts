// challenge 모듈 요청/응답 타입 — src/lib/api/types.ts(클라 계약)와 1:1 대응
// (Architecture.md §14, ADR-0005, T36). API.md에는 아직 반영 안 됨 — architect 확인/문서 갱신 권장
// (createSession의 sessionId 필드 등 기존 선례와 동일한 "서버 코드가 문서보다 먼저 나간" 패턴).

// --- createChallenge (UX-019 · AC-041/044/048/049) ---
export type CreateChallengeRequest = {
  scenarioId: string;
  displayName: string;
};
export type CreateChallengeResponse = {
  challengeId: string;
  /** 평문 토큰 — 이 응답에서 1회만 반환된다. 서버는 SHA-256 해시만 저장한다(§14.4). */
  shareToken: string;
  /** ISO 문자열 — Firestore Timestamp를 그대로 onCall 응답에 실을 수 없어 변환한다. */
  linkExpiresAt: string;
};

// --- deleteChallenge (UX-020 수동 삭제 · AC-041) ---
export type DeleteChallengeRequest = {
  challengeId: string;
};
export type DeleteChallengeResponse = {
  status: "deleted";
};
