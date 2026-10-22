// §110.5(실기 신고 14 · 2026-10-22) — 가족 사칭 시나리오에서 사기범이 참가자를 부를 호칭(UX D-150 (5)).
// 신고 원문: *"무조건 엄마라고 호칭을 부르는데, 나는 남자인데?"*.
//
// 판정표 — 서버 `functions/src/scenarios/familyAddress.ts` `FAMILY_ADDRESS_SCENARIOS`와 같아야 한다(`familyAddress.test.ts` 소스 대조):
// | 시나리오 | 선택지 |
// |---|---|
// | messenger-child-impersonation-kakao | 엄마 · 아빠 |
// | family-accident-deepvoice | 엄마 · 아빠 |
// | grandchild-impersonation | 할머니 · 할아버지 |
// | 그 밖 | 고르지 않는다(칸 없음 · 요청 필드 부재) |
// 화면: 난이도 화면(self)에서 고른다(고르기 전에는 시작 불가 — 기본값으로 성별을 짐작하지 않는다). 보내기(챌린지)는 이번 범위 밖(종전 문면).
// 고른 값은 이 탭 sessionStorage 힌트로 세션 생성 화면(난이도 · 목소리 선택 · 클론 대기)까지 넘어간다.

export type FamilyAddressTerm = "엄마" | "아빠" | "할머니" | "할아버지";

export const FAMILY_ADDRESS_OPTIONS: Readonly<Record<string, readonly FamilyAddressTerm[]>> = {
  "messenger-child-impersonation-kakao": ["엄마", "아빠"],
  "family-accident-deepvoice": ["엄마", "아빠"],
  "grandchild-impersonation": ["할머니", "할아버지"],
};

export function familyAddressOptionsFor(scenarioId: string | null | undefined): readonly FamilyAddressTerm[] | undefined {
  return scenarioId ? FAMILY_ADDRESS_OPTIONS[scenarioId] : undefined;
}

export const FAMILY_ADDRESS_LABEL = "사기범이 나를 부를 호칭";
export const FAMILY_ADDRESS_REQUIRED_LINE = "사기범이 나를 부를 호칭을 골라 주세요.";
/** 서버 거부 사유(`details.reason`). */
export const FAMILY_ADDRESS_INVALID_REASON = "family-address-invalid";
export const FAMILY_ADDRESS_INVALID_LINE = "호칭을 다시 골라 주세요.";

const STORAGE_KEY = "fv.selectedFamilyAddress";

/** 이 탭 힌트 저장(`null` = 지운다). 저장소를 쓸 수 없으면 아무것도 하지 않는다(그 경우 서버는 종전 문면). */
export function setSelectedFamilyAddress(term: FamilyAddressTerm | null): void {
  try {
    if (term) window.sessionStorage.setItem(STORAGE_KEY, term);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 비차단.
  }
}

/** createSession 요청에 붙이는 필드(힌트가 없거나 대상 밖 = 빈 객체 — 필드 부재). */
export function familyAddressRequestField(scenarioId: string | null | undefined): { familyAddress?: FamilyAddressTerm } {
  const term = getSelectedFamilyAddress(scenarioId);
  return term ? { familyAddress: term } : {};
}

/** 시나리오 선택지 안의 값만 돌려준다(다른 시나리오에서 남은 값 · 모양 이상 = `undefined`). */
export function getSelectedFamilyAddress(scenarioId: string | null | undefined): FamilyAddressTerm | undefined {
  const options = familyAddressOptionsFor(scenarioId);
  if (!options) return undefined;
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return options.find((o) => o === value);
  } catch {
    return undefined;
  }
}
