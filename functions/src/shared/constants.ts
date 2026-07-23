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

// 2인 소셜 챌린지(T36, Architecture.md §14.3/14.4/14.5, ADR-0005) — 무료 티어 확정값만 정의한다.
// 유료 티어 확장(§14.6 AC-050: tier는 용량 축에만 영향, 안전장치는 등급 무관 동일 코드경로)은 이번
// 범위 밖(P1) — 이름에 FREE_ 접두를 붙여 나중에 PAID_ 상수를 나란히 추가하기 쉽게 해둔다.
export const CHALLENGE_FREE_ACTIVE_CAP = 3; // 사용자1당 동시 활성(pending|consented|in_progress·미만료) 챌린지 상한
export const CHALLENGE_FREE_LINK_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000; // 공유 링크 만료(3일, AC-048)
export const CHALLENGE_DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 복제 음성 보존 기본값(30일, §14.3). 조정 UI(7~90일)는 범위 밖.
