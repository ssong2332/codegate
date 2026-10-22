// §110.5(실기 신고 14 · 2026-10-22 · 갤럭시 S25) — 가족 사칭 시나리오에서 사기범이 참가자를 부르는 호칭.
//
// 신고 원문: *"무조건 엄마라고 호칭을 부르는데, 나는 남자인데?"* — 자녀 사칭 프롬프트 · 수법 예시가 전부 "엄마"였고, 참가자가
// 호칭을 고를 길이 없었다(훈련 속 내 정보 카드 §88 · §93은 기관형 · 협박형 고급 통화 전용이라 이 시나리오들은 대상 밖).
//
// 판정표 — 호칭 대상 시나리오(⛔ 이 표대로만):
// | 시나리오 | 선택지 | 프롬프트 원문의 호칭(기본) |
// |---|---|---|
// | messenger-child-impersonation-kakao | 엄마 · 아빠 | 엄마 |
// | family-accident-deepvoice | 엄마 · 아빠 | 엄마 |
// | grandchild-impersonation | 할머니 · 할아버지 | 할머니 |
// | 그 밖 | — | (호칭 없음 — 요청에 값이 있으면 거부) |
//
// 조립 판정표(`buildSystemPrompt` `familyAddress` · 오프닝 · 메신저 · Live 세 호출부 같은 값):
// | 세션 값 | 페르소나 · 수법 문면 | [호칭] 블록 |
// |---|---|---|
// | 부재(옛 세션 · 챌린지 · 대상 밖) | 원문 그대로 | 없음(조립 결과 바이트 동일) |
// | 기본 호칭과 같다 | 원문 그대로 | 있음 |
// | 기본 호칭과 다르다 | 두 호칭을 맞바꾼다(엄마↔아빠 · 할머니↔할아버지) | 있음 |
// ⚠️ 맞바꾸기인 이유: 원문에는 다른 가족을 가리키는 말도 있다("아빠한테는 비밀로 해줘" — 참가자가 아빠면 "엄마한테는"이 맞다).
// ⛔ 참가자 실명 · 계정 정보 0 — 선택지 4개 중 하나만 저장한다.
import {
  FAMILY_ACCIDENT_SCENARIO_ID,
  GRANDCHILD_IMPERSONATION_SCENARIO_ID,
  MESSENGER_CHILD_IMPERSONATION_KAKAO_SCENARIO_ID,
} from "./publicMeta";

export type FamilyAddressTerm = "엄마" | "아빠" | "할머니" | "할아버지";

type FamilyAddressRow = { options: readonly [FamilyAddressTerm, FamilyAddressTerm]; promptDefault: FamilyAddressTerm };

const PARENT_ROW: FamilyAddressRow = { options: ["엄마", "아빠"], promptDefault: "엄마" };
const GRANDPARENT_ROW: FamilyAddressRow = { options: ["할머니", "할아버지"], promptDefault: "할머니" };

export const FAMILY_ADDRESS_SCENARIOS: Readonly<Record<string, FamilyAddressRow>> = {
  [MESSENGER_CHILD_IMPERSONATION_KAKAO_SCENARIO_ID]: PARENT_ROW,
  [FAMILY_ACCIDENT_SCENARIO_ID]: PARENT_ROW,
  [GRANDCHILD_IMPERSONATION_SCENARIO_ID]: GRANDPARENT_ROW,
};

/** 이 시나리오의 호칭 선택지(대상 밖 = `undefined`). */
export function familyAddressOptions(scenarioId: string): readonly FamilyAddressTerm[] | undefined {
  return FAMILY_ADDRESS_SCENARIOS[scenarioId]?.options;
}

/** 거부 사유(`HttpsError` `details.reason` — 클라가 문면을 고른다). */
export const FAMILY_ADDRESS_INVALID_REASON = "family-address-invalid";

export type FamilyAddressReadResult = { ok: true; term: FamilyAddressTerm | undefined } | { ok: false };

/**
 * 요청값 검증 — 부재 · 빈 값 = `{ok: true, term: undefined}`(종전 동작). 선택지 밖 · 대상 밖 시나리오에 값 = `{ok: false}`
 * (⛔ 조용히 버리지 않는다 — 호출부가 `invalid-argument`로 알린다).
 */
export function readFamilyAddress(raw: unknown, scenarioId: string): FamilyAddressReadResult {
  if (raw === undefined || raw === null || raw === "") return { ok: true, term: undefined };
  const options = familyAddressOptions(scenarioId);
  if (!options || typeof raw !== "string" || !options.includes(raw as FamilyAddressTerm)) return { ok: false };
  return { ok: true, term: raw as FamilyAddressTerm };
}

/** 세션 문서 값 읽기(모양이 다르거나 시나리오와 맞지 않으면 `undefined` — 종전 문면으로 진행). */
export function sessionFamilyAddress(session: { scenarioId: string; familyAddress?: unknown }): FamilyAddressTerm | undefined {
  const read = readFamilyAddress(session.familyAddress, session.scenarioId);
  return read.ok ? read.term : undefined;
}

/** 프롬프트 조립 입력(호출부가 시나리오 · 세션 값으로 1회 해석해 넘긴다 — 조립 함수는 시나리오를 모른다). */
export type FamilyAddressPrompt = { term: FamilyAddressTerm; swapWith?: FamilyAddressTerm };

export function resolveFamilyAddressPrompt(
  scenarioId: string,
  term: FamilyAddressTerm | undefined,
): FamilyAddressPrompt | undefined {
  const row = FAMILY_ADDRESS_SCENARIOS[scenarioId];
  if (!row || !term || !row.options.includes(term)) return undefined;
  return term === row.promptDefault ? { term } : { term, swapWith: row.promptDefault };
}

/** 두 호칭을 맞바꾼다(조사 · 띄어쓰기 무관 — 낱말 그대로). `swapWith` 없음 = 입력 그대로. */
export function applyFamilyAddressText(text: string, address: FamilyAddressPrompt | undefined): string {
  if (!address?.swapWith) return text;
  const a = address.swapWith;
  const b = address.term;
  // "할머니"가 "할아버지"를, "엄마"가 "아빠"를 포함하지 않으므로 한 번의 정규식으로 맞바꿀 수 있다.
  return text.replace(new RegExp(`${a}|${b}`, "g"), (match) => (match === a ? b : a));
}

/** [호칭] 블록(따옴표 대사 예시 0 · 호칭 낱말만). */
export function buildFamilyAddressBlock(term: FamilyAddressTerm): string {
  return `[호칭]
- 너는 상대(훈련 참가자)를 "${term}"라고 부른다. 참가자가 이 호칭을 골랐다 — 다른 호칭(성별이 다른 부모 · 조부모 호칭)으로 부르지 않는다.`;
}
