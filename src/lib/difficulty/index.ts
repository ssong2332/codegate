// 난이도 단계(초급/중급/고급) — 클라이언트 공통 어휘 (T72, docs/UX.md UX-029/P-22, AC-064/065/067).
//
// **P-22(난이도 표기 일관성)를 코드로 고정한다**: 사용자가 고른 난이도는 선택(UX-029) → 세션 셸
// (UX-014/UX-022 배지) → 리포트(UX-008) → 리플레이(UX-018) → 챌린지(UX-019/UX-021) 전 구간에서
// **같은 라벨·같은 3단계 어휘**로 표기돼야 한다. 화면마다 문자열을 따로 적으면 그 순간 어긋나므로
// 이 파일이 유일한 라벨 원천이다.
//
// **색 단독 표기 금지(P-22/접근성)**: 이 모듈은 색을 제공하지 않는다 — 화면은 반드시 텍스트 라벨을
// 쓴다("고급"을 빨강으로만 표시하지 않는다).
//
// **AC-067(용어 정합)**: "난이도"라는 단어는 **사용자가 고르는 이 3단계에만** 쓴다. 시나리오 카드의
// 기존 고정 문자열(`ScenarioDoc.difficulty`, 예: "쉬움~중간 — 이익 유혹이 강한 편입니다")은 삭제하지
// 않되 **"이 시나리오의 성향·심리적 부담"**으로 라벨을 바꿔 표기한다(SCENARIO_TRAIT_LABEL).
//
// 서버(functions/src/shared/difficulty.ts)와 enum·기본값이 1:1이다.

export const DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced"] as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

/** 부재·enum 밖일 때 서버가 확정하는 값과 동일(§15.3.2). */
export const DEFAULT_DIFFICULTY_LEVEL: DifficultyLevel = "intermediate";

/** UX-029 기본 강조값 — "처음 오는 사용자가 무엇을 고를지 몰라 멈추지 않게"(UX-029 States). */
export const RECOMMENDED_DIFFICULTY_LEVEL: DifficultyLevel = "intermediate";

/** 전 구간 공통 3단계 어휘(P-22). 이 값 외의 난이도 표현을 화면에서 만들지 않는다. */
export const DIFFICULTY_LABEL: Record<DifficultyLevel, string> = {
  beginner: "초급",
  intermediate: "중급",
  advanced: "고급",
};

/** 라벨 옆에 붙는 한 줄 설명(UX-029 Primary Actions "한 줄 설명 + 무엇이 달라지는지"). */
export const DIFFICULTY_SUMMARY: Record<DifficultyLevel, string> = {
  beginner: "수법이 눈에 띄게 드러납니다",
  intermediate: "지금까지와 같은 강도입니다",
  advanced: "실제처럼 정교합니다",
};

/** 본인 체험(self) 모드에서 "무엇이 달라지는지". */
export const DIFFICULTY_SELF_DESCRIPTION: Record<DifficultyLevel, string> = {
  beginner:
    "사기범이 전형적인 문구를 그대로 쓰고, 의심하면 쉽게 물러섭니다. 시작 전에 나올 수 있는 위험 신호를 미리 볼 수 있어요.",
  intermediate: "압박과 수법이 보통 수준으로 이어집니다. 어떤 난이도를 고를지 모르겠다면 여기서 시작하세요.",
  advanced:
    "압박이 세고 요구가 빨리 옵니다. 사기범이 수법을 자연스러운 대화에 섞고, 의심해도 침착하게 해명합니다.",
};

/** 지인에게 보내기(send) 모드 — 문구가 "상대가 겪을 강도"로 바뀐다(UX-029 States "send 모드"). */
export const DIFFICULTY_SEND_DESCRIPTION: Record<DifficultyLevel, string> = {
  beginner: "상대가 알아채기 쉬운 강도입니다.",
  intermediate: "상대가 보통 강도로 겪게 됩니다.",
  advanced: "상대가 강한 압박을 겪게 됩니다.",
};

/**
 * 고급 선택 시 인라인 고지(UX-029 States, AC-012 사전 고지의 난이도판). 다이얼로그를 띄우지 않는다
 * (D-2/P-9 확인 다이얼로그 최소화 원칙 유지) — 선택 직후 aria-live로 알린다.
 * ⚠️ 고지가 늘어나는 것이지 안전장치가 줄어드는 것이 아니다 — "언제든 종료할 수 있다"(AC-006)를
 * 문구에 함께 담는다.
 */
export const ADVANCED_SELF_NOTICE =
  "실제와 가깝게 강한 압박이 이어집니다. 언제든 '훈련 종료'로 멈출 수 있습니다.";

/** 발신자(send) 대상 고지 — 상대가 겪을 일을 알고 보내게 한다(AC-040 사전 동의 취지의 발신 측 대응). */
export const ADVANCED_SEND_NOTICE =
  "상대가 강한 압박을 겪게 됩니다. 상대는 시작 전 안내를 보고 동의해야만 체험이 시작되며, 도중에 언제든 멈출 수 있습니다.";

/**
 * AC-067 — 시나리오 메타의 기존 고정 문자열을 부르는 이름. "난이도"라는 단어를 여기에 쓰지 않아
 * 한 흐름에서 같은 단어가 두 뜻으로 쓰이는 것을 막는다(사용자가 어느 것이 자기 선택값인지 구분 가능).
 */
export const SCENARIO_TRAIT_LABEL = "이 시나리오의 성향";

export function isDifficultyLevel(value: unknown): value is DifficultyLevel {
  return typeof value === "string" && (DIFFICULTY_LEVELS as readonly string[]).includes(value);
}

/** 부재·enum 밖 → 중급(서버 normalizeDifficultyLevel과 동일 규칙). */
export function normalizeDifficultyLevel(value: unknown): DifficultyLevel {
  return isDifficultyLevel(value) ? value : DEFAULT_DIFFICULTY_LEVEL;
}

/** 표기용 한 덩어리("고급 — 실제처럼 정교합니다"). 전 화면이 이 함수를 쓴다(P-22). */
export function formatDifficultyLabel(level: DifficultyLevel): string {
  return `${DIFFICULTY_LABEL[level]} — ${DIFFICULTY_SUMMARY[level]}`;
}
