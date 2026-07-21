// 세션 턴/시간 한도 판정 (AC-007, DECISIONS #10). 순수 함수 — Firestore 없이 단위 테스트 가능.
export type SessionLimitInput = {
  turnCount: number;
  maxUserTurns: number;
  elapsedMs: number;
  maxSessionMs: number;
};

export function isSessionLimitReached(input: SessionLimitInput): boolean {
  return input.turnCount >= input.maxUserTurns || input.elapsedMs >= input.maxSessionMs;
}
