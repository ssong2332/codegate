// 긴 페이지 "목록" 토글(UX D-140 · docs/Architecture.md §96). 화면 · DOM과 무관한 순수 판정만 둔다(테스트 대상).
// ⛔ 훈련 화면(통화 · 문자 · 메신저 · 이체)에는 두지 않는다 — 실제 폰에 없는 UI다(`isTrainingSurfacePath`).

/** 목록에 보이는 한 칸 — `id`는 이동할 구역 요소의 id(같은 화면 안에서 고유). */
export type TocSection = { id: string; label: string };

/** 판정표 (b) — 이동할 구역이 이보다 적으면 목록을 그리지 않는다(구역 1개짜리 목록은 할 일이 없다). */
export const TOC_MIN_SECTIONS = 2;

/** 위에 붙는 목록 막대 높이(px) — 모아보기 묶음 머리줄은 이만큼 아래에 붙는다(`top-[56px]`). */
export const TOC_BAR_HEIGHT_PX = 56;

/** 구역 제목이 고정 목록 막대에 가려지지 않게 남기는 위 여백(px) — 막대 높이 56 + 여유 16. */
export const TOC_SCROLL_MARGIN_PX = 72;

export function shouldShowPageToc(sections: readonly TocSection[]): boolean {
  return sections.length >= TOC_MIN_SECTIONS;
}

/** reduced-motion이면 즉시 이동(부드러운 스크롤 0). */
export function tocScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? "auto" : "smooth";
}

/** 보이스피싱 시나리오 목록의 카테고리(UX D-140 (3)). 표에 없는 id는 `OTHER_CATEGORY`로 간다. */
export const VOICE_SCENARIO_CATEGORY: Readonly<Record<string, string>> = {
  "institutional-impersonation": "수사기관 · 금융기관 사칭",
  "bank-security-verify-scam": "수사기관 · 금융기관 사칭",
  "tax-refund-scam": "수사기관 · 금융기관 사칭",
  "asset-protection-notice-call": "수사기관 · 금융기관 사칭",
  "prosecution-cooperation-call": "수사기관 · 금융기관 사칭",
  "loan-refinance-scam": "대출 · 카드 상담원 사칭",
  "card-company-impersonation": "대출 · 카드 상담원 사칭",
  "card-delivery-call": "대출 · 카드 상담원 사칭",
  "kidnapping-threat": "협박 전화",
  "reputation-blackmail-scam": "협박 전화",
  "courier-customs-scam": "택배 사칭",
  "family-accident-deepvoice": "가족 목소리 사칭",
  "grandchild-impersonation": "가족 목소리 사칭",
};

export const OTHER_CATEGORY = "그 밖의 수법";

export type CategoryGroup<T> = { key: string; label: string; entries: T[] };

/**
 * 순서를 지키며 묶는다 — 묶음 순서는 그 묶음의 첫 항목이 원래 목록에 처음 나온 순서, 묶음 안 순서는 원래 순서 그대로.
 * (§92 우선순위 낮음 시나리오는 원래 목록 뒤쪽이라 각 묶음의 맨 뒤에 남는다.)
 */
export function groupInOrder<T>(entries: readonly T[], labelOf: (entry: T) => string, keyPrefix: string): CategoryGroup<T>[] {
  const groups: CategoryGroup<T>[] = [];
  for (const entry of entries) {
    const label = labelOf(entry);
    let group = groups.find((g) => g.label === label);
    if (!group) {
      group = { key: `${keyPrefix}-${groups.length + 1}`, label, entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

export function voiceScenarioCategory(scenarioId: string): string {
  return VOICE_SCENARIO_CATEGORY[scenarioId] ?? OTHER_CATEGORY;
}
