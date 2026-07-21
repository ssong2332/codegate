// 공용 상수(계약 원천, Architecture.md §4·§10, DECISIONS #7/#9/#10).

// OQ-U4 확정(DECISIONS #10) — 세션 한도.
export const MAX_USER_TURNS = 10;
export const MAX_SESSION_MS = 6 * 60 * 1000; // 6분

// 합성 표식(AC-022, DECISIONS #7).
export const SYNTHETIC_LABEL = "AI 훈련용 합성" as const;

// OQ-U3 잠정 확정(DECISIONS #9) — T1 PoC 실측 후 확정 절차 있음(Architecture.md §11).
export const CLONE_SOFT_TIMEOUT_MS = 15_000;
export const CLONE_HARD_TIMEOUT_MS = 45_000;
export const TTS_HARD_TIMEOUT_MS = 20_000;
