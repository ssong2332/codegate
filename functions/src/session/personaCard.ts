// T194-b(docs/Architecture.md §84.3.1 · PRD AC-104) — 훈련용 가상 신상 카드의 **대상 술어 · 입력 검증 · 카드 조립**(순수 — Firestore · LLM import 0).
// ⭐ §88(DECISIONS #199 · UX D-131 · 사용자 요청 2026-10-20) — 서버 임의 생성(§84.3.2)은 폐지됐다. 카드 값은 사용자가 **선택으로** 넣은
//    이름 · 출생 연도 · 사는 곳뿐이고, 비어 있으면 카드 0(사기범은 시나리오 프롬프트대로 성함 · 생년월일을 묻는다).
//
// ⛔ 금지(§84.0 X1 · X2 · §88.0):
//   - 클라이언트가 보낸 **완성 카드**를 읽는 경로 0 — 요청 원값(`personaCardInput`)은 `readPersonaCardInput`만 통과해 카드가 된다.
//   - 사용자 계정 정보(표시 이름 · 이메일 · 계정 식별자 · 챌린지 표시 이름) 사용 0 — 조립 입력 키가 `{input, inputBy}`로 고정이다(G566).
// ⭐ 술어 · 검증은 `createSession` · `createChallenge` 안에서 **한 번** 평가되고, 결과는 세션 · 챌린지 문서 `personaCard` 필드의
//    존재/부재로만 남는다. 다른 경로(프롬프트 조립 · 통화 화면 · 리포트)는 다시 평가하지 않고 필드만 읽는다(§84.3.1).
import type { DifficultyLevel } from "../shared/difficulty";
import { hasBankPlaceholder } from "../shared/fictionalBank";
import { replaceRealFinancialNames } from "../guardrails/realFinancialNames";
import type { MessengerChannel, PersonaCard, PersonaCardInputBy, PersonaCardItem, PersonaCardKey } from "../shared/types";
import {
  personaCardKind,
  PERSONA_BIRTH_YEAR_INPUT_MIN,
  PERSONA_BIRTH_YEAR_INPUT_MIN_AGE,
  PERSONA_CARD_INPUT_KEYS_BY_KIND,
  PERSONA_CARD_LABELS,
  PERSONA_CARD_SCENARIOS,
  PERSONA_CHILD_ACADEMY_OPTIONS,
  PERSONA_CHILD_GRADE_OPTIONS,
  PERSONA_JOB_OPTIONS,
  PERSONA_NAME_MAX_LENGTH,
  PERSONA_NAME_MIN_LENGTH,
  PERSONA_REGION_POOL,
} from "../scenarios/personaCardCatalog";

export type PersonaCardEligibilityInput = {
  scenarioId: string;
  /** 정규화(`normalizeDifficultyLevel`) 뒤 값. */
  difficultyLevel: DifficultyLevel;
  /** 세션 시작 채널(부재 = voice). 대상 10종은 전부 통화형이라 메신저 시작은 대상 밖이다. 챌린지 = 시나리오 채널. */
  channel: MessengerChannel | undefined;
};

/** 대상 술어(§84.3.1 · §88 — 챌린지 축 삭제) — 대상 시나리오 ∧ 고급 ∧ 통화 시작. 자가 · 챌린지 모두. */
export function personaCardEligible(input: PersonaCardEligibilityInput): boolean {
  return (
    PERSONA_CARD_SCENARIOS.includes(input.scenarioId) &&
    input.difficultyLevel === "advanced" &&
    (input.channel === undefined || input.channel === "voice")
  );
}

/**
 * 클라 요청의 원값(UX D-131 (2) · D-133 · D-136). 전부 선택 — 빈 문자열 · 부재 = 넣지 않음.
 * `birthMonth` · `birthDay`(생일 — §88 후속)는 **둘 다 · 출생 연도와 함께**일 때만 받는다(OQ-U102 권고안).
 * §93 — `job`(하는 일) · `childName` · `childGrade` · `childAcademy`(자녀). 자녀 학년 · 학원은 **자녀 이름과 함께**일 때만 받는다
 * (생일 ↔ 출생 연도와 같은 규칙 — 이름 없이 학년만으로는 "자녀를 안다"가 성립하지 않는다).
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

/** 출생 연도 상한(올해 − 14). 테스트 재현을 위해 연도를 주입받는다. */
export function personaBirthYearMax(nowYear: number): number {
  return nowYear - PERSONA_BIRTH_YEAR_INPUT_MIN_AGE;
}

const NAME_PATTERN = /^[가-힣A-Za-z]+(?: [가-힣A-Za-z]+)*$/;

/** 이름 정리(NFC · 앞뒤 공백 제거 · 연속 공백 1개). */
function normalizeName(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ");
}

export type PersonaCardInputReadResult =
  | { ok: true; input: PersonaCardInput | undefined }
  | { ok: false };

/**
 * 요청의 `personaCardInput` 검증(§88.2). 부재 · 세 칸 모두 빈 값 = `{ok: true, input: undefined}`(카드 0).
 * 한 칸이라도 규칙 밖이면 `{ok: false}` — ⛔ 호출부는 조용히 버리지 않고 `invalid-argument`로 알린다.
 * - name: 문자열 · 정리 뒤 2~10자 · 한글/영문 + 단어 사이 공백 1개 · 실존 금융사명 · 은행 자리표시자 0
 * - birthYear: 정수 · 1920 ~ 올해−14
 * - birthMonth · birthDay(§88 후속 · UX D-133): 정수 월 1~12 · 일 1~31 · **둘 다**(하나만 = 거부) · **출생 연도 필요**(연도 없이 = 거부 —
 *   OQ-U102 권고안) · 연도와 합쳐 실제 날짜(예: 2월 30일 · 평년 2월 29일 = 거부)
 * - region: 시 · 도 17개 정식 명칭 중 하나
 * - §93 job · childGrade · childAcademy: 고정 선택지 중 하나(정확 일치) / childName: name과 같은 규칙 / childGrade · childAcademy = childName 필요
 * ⚠️ 이 함수는 시나리오를 모른다 — 그 시나리오 종류의 칸인지는 `resolvePersonaCardRequest`가 본다(`personaCardInputFitsScenario`).
 */
export function readPersonaCardInput(raw: unknown, nowYear: number = new Date().getFullYear()): PersonaCardInputReadResult {
  if (raw === undefined || raw === null) return { ok: true, input: undefined };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
  const { name, birthYear, birthMonth, birthDay, region, ...rest } = raw as Record<string, unknown>;
  const { job, childName, childGrade, childAcademy, ...unknownKeys } = rest;
  if (Object.keys(unknownKeys).length > 0) return { ok: false };
  const input: PersonaCardInput = {};

  const readName = readNameField(name);
  if (readName === false) return { ok: false };
  if (readName) input.name = readName;

  if (birthYear !== undefined && birthYear !== null) {
    if (typeof birthYear !== "number" || !Number.isInteger(birthYear)) return { ok: false };
    if (birthYear < PERSONA_BIRTH_YEAR_INPUT_MIN || birthYear > personaBirthYearMax(nowYear)) return { ok: false };
    input.birthYear = birthYear;
  }

  const hasMonth = birthMonth !== undefined && birthMonth !== null;
  const hasDay = birthDay !== undefined && birthDay !== null;
  if (hasMonth || hasDay) {
    if (!hasMonth || !hasDay || input.birthYear === undefined) return { ok: false };
    if (!isIntegerIn(birthMonth, 1, 12) || !isIntegerIn(birthDay, 1, 31)) return { ok: false };
    if (!isCalendarDate(input.birthYear, birthMonth, birthDay)) return { ok: false };
    input.birthMonth = birthMonth;
    input.birthDay = birthDay;
  }

  if (region !== undefined && region !== null && region !== "") {
    if (typeof region !== "string" || !PERSONA_REGION_POOL.some((r) => r.name === region)) return { ok: false };
    input.region = region;
  }

  // §93 — 하는 일 · 자녀(고정 선택지 · 이름 규칙). 학년 · 학원은 자녀 이름과 함께일 때만.
  const readJob = readOptionField(job, PERSONA_JOB_OPTIONS);
  if (readJob === false) return { ok: false };
  if (readJob) input.job = readJob;
  const readChildName = readNameField(childName);
  if (readChildName === false) return { ok: false };
  if (readChildName) input.childName = readChildName;
  const readChildGrade = readOptionField(childGrade, PERSONA_CHILD_GRADE_OPTIONS);
  const readChildAcademy = readOptionField(childAcademy, PERSONA_CHILD_ACADEMY_OPTIONS);
  if (readChildGrade === false || readChildAcademy === false) return { ok: false };
  if ((readChildGrade || readChildAcademy) && !input.childName) return { ok: false };
  if (readChildGrade) input.childGrade = readChildGrade;
  if (readChildAcademy) input.childAcademy = readChildAcademy;

  return { ok: true, input: Object.keys(input).length > 0 ? input : undefined };
}

/** 이름 칸(name · childName 공용) — 빈 값 = `undefined` · 규칙 밖 = `false`. */
function readNameField(raw: unknown): string | undefined | false {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") return false;
  const normalized = normalizeName(raw);
  if (normalized === "") return undefined;
  const length = [...normalized].length;
  if (length < PERSONA_NAME_MIN_LENGTH || length > PERSONA_NAME_MAX_LENGTH) return false;
  if (!NAME_PATTERN.test(normalized)) return false;
  if (replaceRealFinancialNames(normalized).replacedCount > 0 || hasBankPlaceholder(normalized)) return false;
  return normalized;
}

/** 고정 선택지 칸 — 빈 값 = `undefined` · 목록 밖 = `false`(정확 일치만 — 자유 입력 0). */
function readOptionField(raw: unknown, options: readonly string[]): string | undefined | false {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string" || !options.includes(raw)) return false;
  return raw;
}

/** 원값의 칸 → 카드 행 키(생일은 출생 연도와 함께 `birthDate` 한 행 — `buildPersonaCard`와 같은 규칙). */
function inputCardKeys(input: PersonaCardInput): PersonaCardKey[] {
  const keys: PersonaCardKey[] = [];
  if (input.name) keys.push("name");
  if (input.birthYear !== undefined) keys.push(input.birthMonth !== undefined ? "birthDate" : "birthYear");
  if (input.region) keys.push("region");
  if (input.job) keys.push("job");
  if (input.childName) keys.push("childName");
  if (input.childGrade) keys.push("childGrade");
  if (input.childAcademy) keys.push("childAcademy");
  return keys;
}

/** §93 — 넣은 칸이 전부 이 시나리오 카드 종류의 칸인가(대상 밖 시나리오 = 거짓 · 판정표 = 카탈로그 `PERSONA_CARD_INPUT_KEYS_BY_KIND`). */
export function personaCardInputFitsScenario(input: PersonaCardInput, scenarioId: string): boolean {
  const kind = personaCardKind(scenarioId);
  if (!kind) return false;
  const allowed = PERSONA_CARD_INPUT_KEYS_BY_KIND[kind];
  return inputCardKeys(input).every((key) => allowed.includes(key));
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** 실제 달력 날짜인가(UTC — 시간대 영향 0). */
function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** ⛔ 이 타입의 키가 곧 G566의 고정 목록이다 — 계정 정보 키를 더하면 G566이 실패한다. */
export type BuildPersonaCardInput = {
  input: PersonaCardInput;
  inputBy: PersonaCardInputBy;
};

/**
 * 검증된 원값 → 카드(v2). 넣은 항목만 · 순서 이름 → 출생 연도(또는 생년월일) → 사는 곳 → 하는 일 → 자녀 이름 → 학년 → 학원.
 * 항목 0이면 `undefined`.
 * 생일(월 · 일)이 있으면 `birthYear` 행 **대신** `birthDate` 행 하나(`"1965년 3월 2일생"`) — 옛 카드(월 · 일 없음)는 `birthYear` 그대로.
 */
export function buildPersonaCard({ input, inputBy }: BuildPersonaCardInput): PersonaCard | undefined {
  const items: PersonaCardItem[] = [];
  if (input.name) items.push({ key: "name", label: PERSONA_CARD_LABELS.name, value: input.name });
  if (input.birthYear !== undefined && input.birthMonth !== undefined && input.birthDay !== undefined) {
    items.push({
      key: "birthDate",
      label: PERSONA_CARD_LABELS.birthDate,
      value: `${input.birthYear}년 ${input.birthMonth}월 ${input.birthDay}일생`,
    });
  } else if (input.birthYear !== undefined) {
    items.push({ key: "birthYear", label: PERSONA_CARD_LABELS.birthYear, value: `${input.birthYear}년생` });
  }
  if (input.region) items.push({ key: "region", label: PERSONA_CARD_LABELS.region, value: input.region });
  if (input.job) items.push({ key: "job", label: PERSONA_CARD_LABELS.job, value: input.job });
  if (input.childName) items.push({ key: "childName", label: PERSONA_CARD_LABELS.childName, value: input.childName });
  if (input.childGrade) items.push({ key: "childGrade", label: PERSONA_CARD_LABELS.childGrade, value: input.childGrade });
  if (input.childAcademy) items.push({ key: "childAcademy", label: PERSONA_CARD_LABELS.childAcademy, value: input.childAcademy });
  return items.length > 0 ? { v: 2, inputBy, items } : undefined;
}

/** 오류 사유(`HttpsError` `details.reason` — 클라가 문면을 고른다 · UX D-131 (3)). */
export const PERSONA_CARD_INVALID_REASON = "persona-card-invalid";
export const PERSONA_CARD_NOT_APPLICABLE_REASON = "persona-card-not-applicable";

export type ResolvePersonaCardResult =
  | { ok: true; personaCard: PersonaCard | undefined }
  | { ok: false; reason: typeof PERSONA_CARD_INVALID_REASON | typeof PERSONA_CARD_NOT_APPLICABLE_REASON };

/**
 * `createSession` · `createChallenge` 공용 조합 — 검증 → (입력이 있으면) 대상 확인 → 카드.
 * 입력 없음 = 카드 0(대상 여부와 무관). 입력이 있는데 대상 밖 = `not-applicable`(⛔ 조용히 버리지 않는다).
 */
export function resolvePersonaCardRequest(
  raw: unknown,
  eligibility: PersonaCardEligibilityInput,
  inputBy: PersonaCardInputBy,
  nowYear?: number,
): ResolvePersonaCardResult {
  const read = readPersonaCardInput(raw, nowYear);
  if (!read.ok) return { ok: false, reason: PERSONA_CARD_INVALID_REASON };
  if (!read.input) return { ok: true, personaCard: undefined };
  // §93 — 대상이어도 그 시나리오 종류에 없는 칸(예: 기관 사칭에 자녀 이름 · 납치 협박에 내 이름)이 있으면 not-applicable.
  if (!personaCardEligible(eligibility) || !personaCardInputFitsScenario(read.input, eligibility.scenarioId)) {
    return { ok: false, reason: PERSONA_CARD_NOT_APPLICABLE_REASON };
  }
  return { ok: true, personaCard: buildPersonaCard({ input: read.input, inputBy }) };
}

/**
 * 챌린지 문서에 저장된 카드 읽기(`consentChallenge` — 서버가 쓴 값이지만 모양을 다시 확인한다). 모양이 다르면 `undefined`
 * (UF-014 Failure (a)와 같은 방향 — 카드만 빠지고 훈련은 진행).
 */
export function readStoredPersonaCard(raw: unknown): PersonaCard | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { v, inputBy, items } = raw as { v?: unknown; inputBy?: unknown; items?: unknown };
  if (v !== 2 || (inputBy !== "self" && inputBy !== "sender") || !Array.isArray(items) || items.length === 0) return undefined;
  for (const item of items) {
    if (!item || typeof item !== "object") return undefined;
    const { key, label, value } = item as { key?: unknown; label?: unknown; value?: unknown };
    if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(PERSONA_CARD_LABELS, key) || typeof label !== "string" || typeof value !== "string") {
      return undefined;
    }
  }
  return { v: 2, inputBy, items: items as PersonaCardItem[] };
}
