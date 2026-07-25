// 난이도 단계(사용자 선택형 3단계) — 서버측 enum·정규화 (T72, Architecture.md §15.3.2, AC-064/065).
//
// **이름을 `difficultyLevel`로 둔 이유(§15.3.2)**: 시나리오 메타의 기존 `difficulty`(산문, 예:
// "중간 — 감정적 압박이 강한 편입니다")는 그대로 두고 손대지 않는다(AC-002/AC-067 유지). 사용자가
// 고르는 강도 enum은 **다른 이름**을 쓴다 — 한 이름에 두 의미를 얹는 오버로드를 §14.8.1/§14.9.1이
// 이미 두 번 기각했다.
//
// **폴백 정책(§15.3.2 "조용한 임의 난이도 진행 금지")**: 값이 없거나 enum 밖이면 서버가
// `intermediate`로 확정한다. 이것은 "판별"이 아니라 **마이그레이션 정책**이다 — 난이도 도입 이전에
// 만들어진 세션·챌린지 문서는 전부 값이 없고, 그 문서들의 프롬프트는 실제로 현행(=중급) 그대로
// 조립돼야 하기 때문이다(회귀 0). 다만 폴백이 일어났다는 **사실 자체는 응답으로 노출**해
// 클라가 사용자에게 알릴 수 있게 한다(createSession 응답의 difficultyLevel — 조용한 실패 금지).

export const DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced"] as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

/** 기본값 — "현행 프롬프트 = 중급"이라는 §15.3.1 기준선. */
export const DEFAULT_DIFFICULTY_LEVEL: DifficultyLevel = "intermediate";

export function isDifficultyLevel(value: unknown): value is DifficultyLevel {
  return typeof value === "string" && (DIFFICULTY_LEVELS as readonly string[]).includes(value);
}

/** 요청/문서에서 읽은 값을 enum으로 확정한다(부재·오타·enum 밖 → intermediate). */
export function normalizeDifficultyLevel(value: unknown): DifficultyLevel {
  return isDifficultyLevel(value) ? value : DEFAULT_DIFFICULTY_LEVEL;
}
