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

// 채널 전이 폴백 수치(T30, Architecture.md §13.3, DECISIONS #16) — ⚠️ PoC 전 가정치다. 근거 없는
// 확정 금지 원칙에 따라 잠정으로 남기고, T30 PoC 실측 대화 길이로 후속 확정한다(§13.3 표와 동일).
// 메신저 단계에서 사용자 턴이 이 수까지 신호([[SIGNAL:ESCALATE_VOICE]]) 없이 진행되면
// sendMessage가 자동으로 transitionChannel(..., "maxturn_fallback")을 호출한다.
export const MESSENGER_ESCALATION_FALLBACK_TURNS = 6;
// 에스컬레이션 가능 시나리오(scenario.escalation 존재)로 세션 생성 시 발급하는 maxUserTurns —
// 두 채널을 합쳐도 기존 10턴(DECISIONS #10) 안에 다 담기 어려워 상향한다(§13.3, PoC 전 가정치).
export const MESSENGER_ESCALATION_MAX_USER_TURNS = 14;
