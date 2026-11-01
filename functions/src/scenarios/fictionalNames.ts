// §118(DECISIONS #233) — 사기범 대사·프롬프트가 쓰는 **가상 고유명 정본**. "OO" 가림 표시는 음성으로 "오오"라고 들려 몰입을 깨므로,
// 실존과 겹치지 않는 이름 1벌씩을 쓴다. 허용은 **정확 일치 닫힌 열거**다(`__tests__/harmlessnessPatterns.ts` `FICTIONAL_INSTITUTION_NAMES`).
// ⛔ 늘리거나 바꿀 때: 실존 기관 · 인물과 겹치지 않음을 웹 검색으로 확인해 docs/Architecture.md §118 표에 남기고 `caseRecordDocument.test.ts`의 역검증 표를 함께 갱신한다.

/** §109 — 검찰 사건 기록 열람본 · 통화 사기범 공통 이름(문서와 통화가 어긋나면 그것이 곧 가짜 신호). */
export const CASE_RECORD_NAMES = {
  office: "한빛지방검찰청",
  department: "금융범죄조사부",
  prosecutor: "윤서진",
  investigator: "정하람",
} as const;

/** §118 — 금융감독원 사칭(기관 사칭 시나리오). "금융감독원"은 사칭 대상으로 실존명을 쓰는 것이 콘텐츠다(PRD) · 팀 · 이름만 가상이다. */
export const FSS_CALLER_NAMES = {
  team: "계좌안전점검팀",
  investigator: "권도하",
} as const;

/** §118 — 자산 보호 안내 시나리오의 가상 센터 이름(통화 사기범이 밝히는 소속). */
export const ASSET_PROTECTION_CENTER_NAME = "새빛자산보호센터";

/**
 * 카드사 고급 재구성(2026-11-01 · 설계 `docs/research/card-company-advanced-redesign-2026-11-01.md` D1 · D2 · 메인 "권고대로").
 * | 이름 | 확인 |
 * |---|---|
 * | 윤슬카드 | 웹 검색 2026-11-01 "윤슬카드" · "윤슬카드 신용카드 고객센터" — 실존 카드사 · 카드 상품 겹침 0. 기각 후보: "가온카드"(KB국민카드 실존 상품) · "단비카드"(삼성카드 제휴 상품 "단비교육") |
 * | 금융감독기관 | 일반 명사(D1 (b)) — 실명 "금융감독원" 대신. 팀 · 담당자는 §118 `FSS_CALLER_NAMES` 재사용 |
 */
export const CARD_REBUILD_NAMES = {
  cardCompany: "윤슬카드",
  supervisor: "금융감독기관",
} as const;
