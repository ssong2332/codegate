// §88(docs/Architecture.md · DECISIONS #199 · UX D-131 · PRD AC-104 갱신 고지 v1.30) — "이번 훈련 속 내 정보" **입력** 쪽 순수 함수 · 정본 문면.
//
// ⭐ 입력은 선택이다(기본 비움). 비어 있으면 요청에 필드를 싣지 않는다 = 카드 0 = 사기범이 이름 · 생년월일을 직접 묻는다.
// ⭐ 이 파일의 규칙은 서버 `functions/src/session/personaCard.ts` `readPersonaCardInput`과 같다 — 화면은 미리 알리는 용도이고
//    **판정은 서버가 한다**(서버가 거부하면 `details.reason`으로 같은 문면을 낸다). 시 · 도 목록 · 대상 시나리오는 서버 카탈로그와
//    같아야 한다(`personaCardInput.test.ts`가 서버 소스와 대조한다).
// ⛔ 클라는 완성 카드(`personaCard`)를 만들어 보내지 않는다 — 원값(`personaCardInput`)만 보낸다.
// ⛔ 문면은 `docs/UX.md` D-131 정본 글자 그대로(의역 금지).

/**
 * 요청 원값(서버 `PersonaCardInput`과 같은 모양). 생일(월 · 일 — UX D-133)은 둘 다 · 출생 연도와 함께일 때만 싣는다.
 * §93(UX D-136) — 하는 일 · 자녀 이름 · 자녀 학년 · 자녀가 다니는 학원(학년 · 학원은 자녀 이름과 함께일 때만).
 */
export type PersonaCardInput = {
  name?: string;
  birthYear?: number;
  birthMonth?: number;
  birthDay?: number;
  region?: string;
  job?: string;
  childName?: string;
  childGrade?: string;
  childAcademy?: string;
};

/** 입력 칸 상태(문자열 그대로 — 화면 상태). 월 · 일 = `""`(선택 안 함) 또는 `"1"`~`"12"` · `"1"`~`"31"`. 선택 칸 = `""` 또는 선택지 값. */
export type PersonaCardForm = {
  name: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  region: string;
  job: string;
  childName: string;
  childGrade: string;
  childAcademy: string;
};
export const EMPTY_PERSONA_CARD_FORM: PersonaCardForm = {
  name: "",
  birthYear: "",
  birthMonth: "",
  birthDay: "",
  region: "",
  job: "",
  childName: "",
  childGrade: "",
  childAcademy: "",
};

/** 카드 대상 시나리오(서버 `PERSONA_CARD_SCENARIOS`와 같다 — 소스 대조 테스트). */
export const PERSONA_CARD_SCENARIO_IDS: readonly string[] = [
  "institutional-impersonation",
  "card-company-impersonation",
  "loan-refinance-scam",
  "courier-customs-scam",
  "tax-refund-scam",
  "bank-security-verify-scam",
  "asset-protection-notice-call",
  "prosecution-cooperation-call",
  "kidnapping-threat",
  "reputation-blackmail-scam",
];

/**
 * §93 카드 종류(서버 `PERSONA_CARD_KIND`와 같다 — 소스 대조 테스트). 종류가 입력 칸을 정한다 — 기관형 = 이름 · 출생 연도 · 생일 ·
 * 사는 곳 / 본인 협박형 = 기관형 칸 + 하는 일 / 자녀 협박형 = 자녀 이름 · 자녀 학년 · 자녀가 다니는 학원만.
 */
export type PersonaCardKind = "identity" | "self-threat" | "child-threat";
export const PERSONA_CARD_THREAT_KIND: Readonly<Record<string, PersonaCardKind>> = {
  "kidnapping-threat": "child-threat",
  "reputation-blackmail-scam": "self-threat",
};

/** 대상 시나리오의 카드 종류(대상 밖 = `null` · 협박형 2종 밖의 대상 = 기관형). */
export function personaCardKindFor(scenarioId: string | null | undefined): PersonaCardKind | null {
  if (!scenarioId || !PERSONA_CARD_SCENARIO_IDS.includes(scenarioId)) return null;
  return PERSONA_CARD_THREAT_KIND[scenarioId] ?? "identity";
}

/** §93 고정 선택지(서버 `personaCardCatalog.ts`의 같은 이름 목록과 같다 — 소스 대조 테스트). */
export const PERSONA_JOB_OPTIONS: readonly string[] = ["회사원", "공무원", "교사", "자영업자", "의료인", "군인", "프리랜서"];
export const PERSONA_CHILD_GRADE_OPTIONS: readonly string[] = [
  "유치원생",
  "초등학교 1학년",
  "초등학교 2학년",
  "초등학교 3학년",
  "초등학교 4학년",
  "초등학교 5학년",
  "초등학교 6학년",
  "중학교 1학년",
  "중학교 2학년",
  "중학교 3학년",
  "고등학교 1학년",
  "고등학교 2학년",
  "고등학교 3학년",
];
export const PERSONA_CHILD_ACADEMY_OPTIONS: readonly string[] = [
  "영어학원",
  "수학학원",
  "논술학원",
  "피아노학원",
  "미술학원",
  "태권도장",
  "종합학원",
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

/** UX D-131 (2)(3) 정본 문면 · `privacy` · `invalid` · `birthdayHint` = D-133 정본(§88 후속 — 생일 칸 · 가상 값 권고). */
export const PERSONA_INPUT_COPY = {
  selfTitle: "이번 훈련 속 내 정보 (선택)",
  sendTitle: "받는 분 정보 (선택)",
  selfGuide: "넣으면 전화한 사람이 이 정보를 이미 알고 있는 것처럼 먼저 말합니다. 비워 두면 전화한 사람이 이름과 생년월일을 직접 물어봅니다.",
  sendGuide:
    "넣으면 전화한 사람이 이 정보를 이미 알고 있는 것처럼 먼저 말합니다. 받는 분에게는 통화가 끝날 때까지 보이지 않습니다. 비워 두면 전화한 사람이 이름과 생년월일을 직접 물어봅니다.",
  privacy:
    "실제 정보 대신 가상의 값을 넣어 주세요. 비슷하게 지어낸 정보여도 훈련 효과는 같습니다. 넣은 정보는 이번 훈련과 그 결과 리포트에만 쓰입니다.",
  invalid:
    "넣은 정보를 확인해 주세요. 이름은 한글이나 영문 2~10자, 출생 연도는 네 자리 숫자로 넣어 주세요. 생일은 출생 연도와 함께 실제 있는 날짜로 월과 일을 모두 골라 주세요.",
  birthdayHint: "출생 연도와 함께 월과 일을 모두 고르면 생년월일로 씁니다. 비워 두면 출생 연도만 씁니다.",
  notApplicable: "이 훈련에는 내 정보를 넣을 수 없습니다. 칸을 비우고 다시 시도해 주세요.",
  // §93(UX D-136) — 협박형 2종의 안내 · 자녀 칸 힌트 · 자녀 형식 오류(제목 · 고지 · 대상 밖 오류는 위 문면 그대로).
  selfGuideChild:
    "넣으면 전화한 사람이 자녀 정보를 이미 알고 있는 것처럼 먼저 말하며 협박합니다. 비워 두면 전화한 사람이 자녀 이름을 모르는 채로 내가 먼저 말하게 유도합니다.",
  sendGuideChild:
    "넣으면 전화한 사람이 받는 분의 자녀 정보를 이미 알고 있는 것처럼 먼저 말하며 협박합니다. 받는 분에게는 통화가 끝날 때까지 보이지 않습니다. 비워 두면 전화한 사람이 자녀 이름을 모르는 채로 받는 분이 먼저 말하게 유도합니다.",
  selfGuideThreat:
    "넣으면 전화한 사람이 이 정보를 이미 알고 있는 것처럼 먼저 말하며 협박합니다. 비워 두면 전화한 사람이 내 이름을 모르는 채로 협박합니다.",
  sendGuideThreat:
    "넣으면 전화한 사람이 이 정보를 이미 알고 있는 것처럼 먼저 말하며 협박합니다. 받는 분에게는 통화가 끝날 때까지 보이지 않습니다. 비워 두면 전화한 사람이 받는 분의 이름을 모르는 채로 협박합니다.",
  childHint: "자녀 학년과 학원은 자녀 이름을 넣었을 때만 씁니다.",
  invalidChild:
    "넣은 정보를 확인해 주세요. 자녀 이름은 한글이나 영문 2~10자로 넣어 주세요. 자녀 학년과 학원은 자녀 이름과 함께 골라 주세요.",
} as const;

/** 칸 라벨 · 자리표시(라벨 = 카드 라벨 — UX D-131 (2)). */
export const PERSONA_INPUT_FIELDS = {
  name: { label: "이름", placeholder: "예: 홍길동" },
  birthYear: { label: "출생 연도", placeholder: "예: 1962" },
  birthday: { label: "생일 (월 · 일)", monthLabel: "생일 월", dayLabel: "생일 일", monthNone: "월 선택", dayNone: "일 선택" },
  region: { label: "사는 곳", noneLabel: "선택 안 함" },
  // §93(UX D-136) — 라벨 = 카드 라벨(서버 `PERSONA_CARD_LABELS`).
  job: { label: "하는 일", noneLabel: "선택 안 함" },
  childName: { label: "자녀 이름", placeholder: "예: 김민준" },
  childGrade: { label: "자녀 학년", noneLabel: "선택 안 함" },
  childAcademy: { label: "자녀가 다니는 학원", noneLabel: "선택 안 함" },
} as const;

/** §93 — 종류별 안내 문면(제목 · 고지는 종류와 무관). */
export function personaInputGuide(mode: "self" | "send", kind: PersonaCardKind): string {
  if (kind === "child-threat") return mode === "self" ? PERSONA_INPUT_COPY.selfGuideChild : PERSONA_INPUT_COPY.sendGuideChild;
  if (kind === "self-threat") return mode === "self" ? PERSONA_INPUT_COPY.selfGuideThreat : PERSONA_INPUT_COPY.sendGuideThreat;
  return mode === "self" ? PERSONA_INPUT_COPY.selfGuide : PERSONA_INPUT_COPY.sendGuide;
}

/** §93 — 종류별 형식 오류 문면(자녀 협박형만 자녀 칸 문면 · 그 밖 = 종전 문면). */
export function personaInvalidLine(kind: PersonaCardKind | null): string {
  return kind === "child-threat" ? PERSONA_INPUT_COPY.invalidChild : PERSONA_INPUT_COPY.invalid;
}

/** 생일 선택지 — 월 1~12 · 일 1~31(달마다 다른 마지막 날은 제출 때 검증한다 — 서버와 같은 규칙). */
export const PERSONA_BIRTH_MONTH_OPTIONS: readonly number[] = Array.from({ length: 12 }, (_, i) => i + 1);
export const PERSONA_BIRTH_DAY_OPTIONS: readonly number[] = Array.from({ length: 31 }, (_, i) => i + 1);

/** 입력 블록을 그릴지(UX D-131 (1)) — 대상 10종(§93) × 고급 × 통화형(메신저 시나리오 0). */
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

/** 이름 칸 정리 · 검증(name · childName 공용) — 빈 값 = `""` · 규칙 밖 = `null`. */
function readNameValue(raw: string): string | null {
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!name) return "";
  const length = [...name].length;
  if (length < PERSONA_NAME_MIN_LENGTH || length > PERSONA_NAME_MAX_LENGTH || !NAME_PATTERN.test(name)) return null;
  return name;
}

/**
 * 칸 상태 → 요청 원값. 모든 칸이 비면 `{ok: true, input: undefined}`(요청에 싣지 않는다 = 카드 0). 규칙 밖이면 `{ok: false}`
 * (화면은 진행하지 않고 `personaInvalidLine(kind)`를 낸다). 실존 금융사명 거부는 서버만 한다(사전이 서버에 있다).
 * §93 — `kind`의 칸만 읽는다(다른 종류 칸에 남은 값은 싣지 않는다 — 챌린지 화면에서 시나리오를 바꿔도 안전). 부재 = 기관형.
 */
export function readPersonaCardForm(
  form: PersonaCardForm,
  nowYear: number = new Date().getFullYear(),
  kind: PersonaCardKind = "identity",
): PersonaCardFormResult {
  const input: PersonaCardInput = {};
  if (kind === "child-threat") {
    const childName = readNameValue(form.childName);
    if (childName === null) return { ok: false };
    if (childName) input.childName = childName;
    const grade = form.childGrade;
    const academy = form.childAcademy;
    if (grade && !PERSONA_CHILD_GRADE_OPTIONS.includes(grade)) return { ok: false };
    if (academy && !PERSONA_CHILD_ACADEMY_OPTIONS.includes(academy)) return { ok: false };
    if ((grade || academy) && !childName) return { ok: false };
    if (grade) input.childGrade = grade;
    if (academy) input.childAcademy = academy;
    return { ok: true, input: Object.keys(input).length > 0 ? input : undefined };
  }
  const name = readNameValue(form.name);
  if (name === null) return { ok: false };
  if (name) input.name = name;
  const year = form.birthYear.trim();
  if (year) {
    if (!/^\d{4}$/.test(year)) return { ok: false };
    const value = Number(year);
    if (value < PERSONA_BIRTH_YEAR_INPUT_MIN || value > nowYear - PERSONA_BIRTH_YEAR_INPUT_MIN_AGE) return { ok: false };
    input.birthYear = value;
  }
  // 생일(UX D-133) — 둘 다 · 출생 연도와 함께 · 실제 날짜일 때만(하나만 · 연도 없이 = 진행 안 함 — OQ-U102 권고안).
  const month = form.birthMonth.trim();
  const day = form.birthDay.trim();
  if (month || day) {
    if (!month || !day || input.birthYear === undefined) return { ok: false };
    if (!/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return { ok: false };
    const m = Number(month);
    const d = Number(day);
    if (m < 1 || m > 12 || d < 1 || d > 31 || !isCalendarDate(input.birthYear, m, d)) return { ok: false };
    input.birthMonth = m;
    input.birthDay = d;
  }
  if (form.region) {
    if (!PERSONA_REGION_OPTIONS.includes(form.region)) return { ok: false };
    input.region = form.region;
  }
  if (kind === "self-threat" && form.job) {
    if (!PERSONA_JOB_OPTIONS.includes(form.job)) return { ok: false };
    input.job = form.job;
  }
  return { ok: true, input: Object.keys(input).length > 0 ? input : undefined };
}

/** 실제 달력 날짜인가(UTC — 서버 `isCalendarDate`와 같은 규칙). */
function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// ── 펼칠 때 자동 스크롤(UX D-133 (1) — 사용자 요청 2026-10-20 *"고급 난이도를 선택하면 … 자동으로 스크롤"*) ──

/** 블록 위 여백(px) — 바로 위 맥락(고급 고지 · 표시 이름 칸)이 한 줄 남게 한다. 컴포넌트의 `scroll-mt-28`(7rem)과 같다. */
export const PERSONA_REVEAL_SCROLL_MARGIN_PX = 112;

/**
 * 블록이 나타났을 때 스크롤할지 · 어떻게. 블록 전체가 이미 화면 안이면 `null`(움직이지 않는다). 그 밖이면
 * reduced-motion = `"auto"`(즉시) · 그 밖 = `"smooth"`. ⛔ 포커스는 옮기지 않는다(어르신 기기에서 키보드가 바로 뜨지 않게).
 */
export function personaRevealScroll(
  rect: { top: number; bottom: number },
  viewportHeight: number,
  reducedMotion: boolean,
): ScrollBehavior | null {
  const fullyVisible = rect.top >= 0 && rect.bottom <= viewportHeight;
  if (fullyVisible) return null;
  return reducedMotion ? "auto" : "smooth";
}

/** 서버 거부 사유 → 문면(이 기능의 사유가 아니면 `null` — 호출부의 기존 오류 처리로 넘긴다). §93 — 형식 오류는 종류별 문면. */
export function personaCardErrorLine(reason: string | null, kind: PersonaCardKind | null = null): string | null {
  if (reason === PERSONA_CARD_INVALID_REASON) return personaInvalidLine(kind);
  if (reason === PERSONA_CARD_NOT_APPLICABLE_REASON) return PERSONA_INPUT_COPY.notApplicable;
  return null;
}
