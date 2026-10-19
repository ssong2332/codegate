// T194-b(docs/Architecture.md §84.3.1 · §84.3.2 · PRD AC-104 · UX-014 v1.38 (2)) — 훈련용 가상 신상 카드의 **데이터**.
//
// ⛔ 금지(§84.0 X2 · AC-104 (e)): 사용자 계정 정보(표시 이름 · 이메일 · 계정 식별자)는 이 파일 어디에도 들어오지 않는다.
//    값은 전부 아래 풀에서 고른 **지어낸** 값이다. 실존 금융사 · 학교 · 학원 이름 0 · 시 · 군 · 구 이하 실제 지명 0.
// ⭐ 대상 범위 = 2026-10-20 User 결정(설계 기본값 5종보다 우선): **고급 + 아래 4종 · 자가 훈련만**.
//    `kidnapping-threat`는 빠졌다 — 납치 고급의 "상대 이름을 먼저 말하지 않는다" 규칙(§50.4.4)에 예외를 만들지 않는다.
//    그래서 자녀 행(`child`)도 만들지 않는다(그 행을 쓰는 시나리오가 kidnapping 하나뿐이었다).
// ⭐ 주소 = 광역 도 이름 + "○○시"까지(User 결정). 특별 · 광역시는 "○○구" 꼴이 되므로 풀에 넣지 않았다.
import type { PersonaCardKey } from "../shared/types";
import {
  CARD_COMPANY_IMPERSONATION_SCENARIO_ID,
  COURIER_CUSTOMS_SCAM_SCENARIO_ID,
  INSTITUTIONAL_IMPERSONATION_SCENARIO_ID,
  LOAN_SCAM_SCENARIO_ID,
} from "./publicMeta";

/** 카드 대상 시나리오(데이터 상수 — 바꾸려면 planner/User 확인이 먼저다 · AC-104 (a)). */
export const PERSONA_CARD_SCENARIOS: readonly string[] = [
  INSTITUTIONAL_IMPERSONATION_SCENARIO_ID,
  CARD_COMPANY_IMPERSONATION_SCENARIO_ID,
  LOAN_SCAM_SCENARIO_ID,
  COURIER_CUSTOMS_SCAM_SCENARIO_ID,
];

/** 라벨(화면 · 프롬프트 공통 — UX-014 v1.38 (2)). */
export const PERSONA_CARD_LABELS: Readonly<Record<PersonaCardKey, string>> = {
  name: "이름",
  birthYear: "출생 연도",
  region: "사는 곳",
  bank: "거래 은행",
  card: "사용 카드",
  loan: "대출",
};

/** 시나리오별 행 구성(공통 4행 + 추가 행 최대 1 — 5행 초과 0 · D-119). */
export const PERSONA_CARD_ROWS: Readonly<Record<string, readonly PersonaCardKey[]>> = {
  [INSTITUTIONAL_IMPERSONATION_SCENARIO_ID]: ["name", "birthYear", "region", "bank"],
  [CARD_COMPANY_IMPERSONATION_SCENARIO_ID]: ["name", "birthYear", "region", "bank", "card"],
  [LOAN_SCAM_SCENARIO_ID]: ["name", "birthYear", "region", "bank", "loan"],
  [COURIER_CUSTOMS_SCAM_SCENARIO_ID]: ["name", "birthYear", "region", "bank"],
};

/**
 * 흔한 가상 이름(성 1 + 이름 2 · 3자). 순서가 곧 배정 순서다 — 바꾸면 같은 sessionId의 카드가 달라진다.
 * ⚠️ 실존 유명인 대조(#164 관례)는 이 구현 패스에서 **외부 검색으로 하지 못했다** — 작성자가 아는 유명인 이름만 뺐다(추정).
 */
export const PERSONA_NAME_POOL: readonly string[] = [
  "김영숙",
  "최명순",
  "정옥희",
  "조영순",
  "윤정례",
  "서경애",
  "임춘자",
  "오복희",
  "박상만",
  "송기철",
];

/** 출생 연도 범위(연도만 · 월일 0 — UX-014 v1.38 (2)). */
export const PERSONA_BIRTH_YEAR_MIN = 1955;
export const PERSONA_BIRTH_YEAR_MAX = 1975;

/**
 * 사는 곳 — 광역 도 이름(8). 화면 값 = `"{name} ○○시"`. `shortNames`는 리포트 첫 언급 대조용 줄임말이다
 * (`경기`는 "경기가 안 좋아서" 같은 일상어와 겹쳐 넣지 않았다 — 거짓 양성 방지).
 */
export const PERSONA_REGION_POOL: readonly { name: string; shortNames: readonly string[] }[] = [
  { name: "경기도", shortNames: [] },
  { name: "강원특별자치도", shortNames: ["강원도", "강원"] },
  { name: "충청북도", shortNames: ["충북"] },
  { name: "충청남도", shortNames: ["충남"] },
  { name: "전북특별자치도", shortNames: ["전라북도", "전북"] },
  { name: "전라남도", shortNames: ["전남"] },
  { name: "경상북도", shortNames: ["경북"] },
  { name: "경상남도", shortNames: ["경남"] },
];

/** 지역 값의 가림 꼬리(시 · 군 · 구 이하 실제 지명 0). */
export const PERSONA_REGION_MASK_SUFFIX = "○○시";

/**
 * 가림 고정 값. ⚠️ `card`의 `"○○카드"`는 §83 카드사 자리표시자 패턴(`shared/fictionalBank.ts` `CARD_PLACEHOLDER_PATTERN`)에
 * 걸린다 — 조립 끝의 `applyFictionalBank`가 **프롬프트 안에서만** 이 값을 세션 가상 카드사명으로 바꾼다(화면 값은 "○○카드" 그대로).
 * 설계 §84.3.2는 §83 이전에 쓰여 은행 패턴만 검토했다 — 구현 보고에 열린 질문으로 올렸다.
 * `loan`의 `"○○저축은행"`은 `○○` 바로 뒤가 `저`라 은행 자리표시자 패턴에 걸리지 않는다(G565가 전 풀로 단언).
 */
export const PERSONA_CARD_FIXED_VALUES = {
  card: "○○카드",
  loan: "○○저축은행 대출 이용 중",
} as const;
