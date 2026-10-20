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
import type { MessengerChannel, PersonaCard, PersonaCardInputBy, PersonaCardItem } from "../shared/types";
import {
  PERSONA_BIRTH_YEAR_INPUT_MIN,
  PERSONA_BIRTH_YEAR_INPUT_MIN_AGE,
  PERSONA_CARD_LABELS,
  PERSONA_CARD_SCENARIOS,
  PERSONA_NAME_MAX_LENGTH,
  PERSONA_NAME_MIN_LENGTH,
  PERSONA_REGION_POOL,
} from "../scenarios/personaCardCatalog";

export type PersonaCardEligibilityInput = {
  scenarioId: string;
  /** 정규화(`normalizeDifficultyLevel`) 뒤 값. */
  difficultyLevel: DifficultyLevel;
  /** 세션 시작 채널(부재 = voice). 대상 4종은 전부 통화형이라 메신저 시작은 대상 밖이다. 챌린지 = 시나리오 채널. */
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
 * 클라 요청의 원값(UX D-131 (2) · D-133). 전부 선택 — 빈 문자열 · 부재 = 넣지 않음.
 * `birthMonth` · `birthDay`(생일 — §88 후속)는 **둘 다 · 출생 연도와 함께**일 때만 받는다(OQ-U102 권고안).
 */
export type PersonaCardInput = { name?: string; birthYear?: number; birthMonth?: number; birthDay?: number; region?: string };

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
 */
export function readPersonaCardInput(raw: unknown, nowYear: number = new Date().getFullYear()): PersonaCardInputReadResult {
  if (raw === undefined || raw === null) return { ok: true, input: undefined };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
  const { name, birthYear, birthMonth, birthDay, region, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return { ok: false };
  const input: PersonaCardInput = {};

  if (name !== undefined && name !== null && name !== "") {
    if (typeof name !== "string") return { ok: false };
    const normalized = normalizeName(name);
    if (normalized !== "") {
      const length = [...normalized].length;
      if (length < PERSONA_NAME_MIN_LENGTH || length > PERSONA_NAME_MAX_LENGTH) return { ok: false };
      if (!NAME_PATTERN.test(normalized)) return { ok: false };
      if (replaceRealFinancialNames(normalized).replacedCount > 0 || hasBankPlaceholder(normalized)) return { ok: false };
      input.name = normalized;
    }
  }

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

  return { ok: true, input: Object.keys(input).length > 0 ? input : undefined };
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
 * 검증된 원값 → 카드(v2). 넣은 항목만 · 순서 이름 → 출생 연도(또는 생년월일) → 사는 곳. 항목 0이면 `undefined`.
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
  if (!personaCardEligible(eligibility)) return { ok: false, reason: PERSONA_CARD_NOT_APPLICABLE_REASON };
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
