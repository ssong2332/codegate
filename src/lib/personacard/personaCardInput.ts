// §88(docs/Architecture.md · DECISIONS #199 · UX D-131 · PRD AC-104 갱신 고지 v1.30) — "이번 훈련 속 내 정보" **입력** 쪽 순수 함수 · 정본 문면.
//
// ⭐ 입력은 선택이다(기본 비움). 비어 있으면 요청에 필드를 싣지 않는다 = 카드 0 = 사기범이 이름 · 생년월일을 직접 묻는다.
// ⭐ 이 파일의 규칙은 서버 `functions/src/session/personaCard.ts` `readPersonaCardInput`과 같다 — 화면은 미리 알리는 용도이고
//    **판정은 서버가 한다**(서버가 거부하면 `details.reason`으로 같은 문면을 낸다). 시 · 도 목록 · 대상 시나리오는 서버 카탈로그와
//    같아야 한다(`personaCardInput.test.ts`가 서버 소스와 대조한다).
// ⛔ 클라는 완성 카드(`personaCard`)를 만들어 보내지 않는다 — 원값(`personaCardInput`)만 보낸다.
// ⛔ 문면은 `docs/UX.md` D-131 정본 글자 그대로(의역 금지).

/** 요청 원값(서버 `PersonaCardInput`과 같은 모양). */
export type PersonaCardInput = { name?: string; birthYear?: number; region?: string };

/** 입력 칸 상태(문자열 그대로 — 화면 상태). */
export type PersonaCardForm = { name: string; birthYear: string; region: string };
export const EMPTY_PERSONA_CARD_FORM: PersonaCardForm = { name: "", birthYear: "", region: "" };

/** 카드 대상 시나리오(서버 `PERSONA_CARD_SCENARIOS`와 같다). */
export const PERSONA_CARD_SCENARIO_IDS: readonly string[] = [
  "institutional-impersonation",
  "card-company-impersonation",
  "loan-refinance-scam",
  "courier-customs-scam",
];

/** 사는 곳 선택지 — 시 · 도 17개 정식 명칭(서버 `PERSONA_REGION_POOL`의 `name`과 같은 순서). */
export const PERSONA_REGION_OPTIONS: readonly string[] = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
];

export const PERSONA_NAME_MIN_LENGTH = 2;
export const PERSONA_NAME_MAX_LENGTH = 10;
export const PERSONA_BIRTH_YEAR_INPUT_MIN = 1920;
export const PERSONA_BIRTH_YEAR_INPUT_MIN_AGE = 14;

/** 서버 오류 사유(`details.reason`). */
export const PERSONA_CARD_INVALID_REASON = "persona-card-invalid";
export const PERSONA_CARD_NOT_APPLICABLE_REASON = "persona-card-not-applicable";

/** UX D-131 (2)(3) 정본 문면. */
export const PERSONA_INPUT_COPY = {
  selfTitle: "이번 훈련 속 내 정보 (선택)",
  sendTitle: "받는 분 정보 (선택)",
  selfGuide: "넣으면 전화한 사람이 이 정보를 이미 알고 있는 것처럼 먼저 말합니다. 비워 두면 전화한 사람이 이름과 생년월일을 직접 물어봅니다.",
  sendGuide:
    "넣으면 전화한 사람이 이 정보를 이미 알고 있는 것처럼 먼저 말합니다. 받는 분에게는 통화가 끝날 때까지 보이지 않습니다. 비워 두면 전화한 사람이 이름과 생년월일을 직접 물어봅니다.",
  privacy: "실제 정보 대신 비슷하게 지어낸 정보를 넣어도 훈련 효과는 같습니다. 넣은 정보는 이번 훈련과 그 결과 리포트에만 쓰입니다.",
  invalid: "넣은 정보를 확인해 주세요. 이름은 한글이나 영문 2~10자, 출생 연도는 네 자리 숫자로 넣어 주세요.",
  notApplicable: "이 훈련에는 내 정보를 넣을 수 없습니다. 칸을 비우고 다시 시도해 주세요.",
} as const;

/** 칸 라벨 · 자리표시(라벨 = 카드 라벨 — UX D-131 (2)). */
export const PERSONA_INPUT_FIELDS = {
  name: { label: "이름", placeholder: "예: 홍길동" },
  birthYear: { label: "출생 연도", placeholder: "예: 1962" },
  region: { label: "사는 곳", noneLabel: "선택 안 함" },
} as const;

/** 입력 블록을 그릴지(UX D-131 (1)) — 대상 4종 × 고급 × 통화형(메신저 시나리오 0). */
export function personaCardInputVisible(
  scenarioId: string | null | undefined,
  difficultyLevel: string | null | undefined,
  scenarioChannel: string | undefined,
): boolean {
  return (
    !!scenarioId &&
    PERSONA_CARD_SCENARIO_IDS.includes(scenarioId) &&
    difficultyLevel === "advanced" &&
    scenarioChannel !== "messenger"
  );
}

const NAME_PATTERN = /^[가-힣A-Za-z]+(?: [가-힣A-Za-z]+)*$/;

export type PersonaCardFormResult = { ok: true; input: PersonaCardInput | undefined } | { ok: false };

/**
 * 칸 상태 → 요청 원값. 세 칸 모두 비면 `{ok: true, input: undefined}`(요청에 싣지 않는다 = 카드 0). 규칙 밖이면 `{ok: false}`
 * (화면은 진행하지 않고 `PERSONA_INPUT_COPY.invalid`를 낸다). 실존 금융사명 거부는 서버만 한다(사전이 서버에 있다).
 */
export function readPersonaCardForm(form: PersonaCardForm, nowYear: number = new Date().getFullYear()): PersonaCardFormResult {
  const input: PersonaCardInput = {};
  const name = form.name.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name) {
    const length = [...name].length;
    if (length < PERSONA_NAME_MIN_LENGTH || length > PERSONA_NAME_MAX_LENGTH || !NAME_PATTERN.test(name)) return { ok: false };
    input.name = name;
  }
  const year = form.birthYear.trim();
  if (year) {
    if (!/^\d{4}$/.test(year)) return { ok: false };
    const value = Number(year);
    if (value < PERSONA_BIRTH_YEAR_INPUT_MIN || value > nowYear - PERSONA_BIRTH_YEAR_INPUT_MIN_AGE) return { ok: false };
    input.birthYear = value;
  }
  if (form.region) {
    if (!PERSONA_REGION_OPTIONS.includes(form.region)) return { ok: false };
    input.region = form.region;
  }
  return { ok: true, input: Object.keys(input).length > 0 ? input : undefined };
}

/** 서버 거부 사유 → 문면(이 기능의 사유가 아니면 `null` — 호출부의 기존 오류 처리로 넘긴다). */
export function personaCardErrorLine(reason: string | null): string | null {
  if (reason === PERSONA_CARD_INVALID_REASON) return PERSONA_INPUT_COPY.invalid;
  if (reason === PERSONA_CARD_NOT_APPLICABLE_REASON) return PERSONA_INPUT_COPY.notApplicable;
  return null;
}
