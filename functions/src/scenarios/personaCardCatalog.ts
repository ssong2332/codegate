// T194-b(docs/Architecture.md §84.3.1 · §84.3.2 · PRD AC-104 · UX-014 v1.38 (2)) — 훈련용 가상 신상 카드의 **데이터**.
// ⭐ §88(DECISIONS #199) — 카드 값은 사용자가 넣는다(선택 · 기본 비움). 이 파일은 대상 · 라벨 · 입력 규칙 · 시 · 도 목록만 둔다.
//
// ⛔ 금지(§84.0 X2 · AC-104 (e)): 사용자 계정 정보(표시 이름 · 이메일 · 계정 식별자)는 이 파일 어디에도 들어오지 않는다.
//    실존 금융사 이름 0 · 시 · 군 · 구 이하 지명 0(사는 곳은 시 · 도까지만).
// ⭐ 대상 범위 = 2026-10-20 User 결정(설계 기본값 5종보다 우선): **고급 + 아래 4종**(§88 — 자가 · 챌린지 모두 · 입력이 있을 때만).
//    `kidnapping-threat`는 빠졌다 — 납치 고급의 "상대 이름을 먼저 말하지 않는다" 규칙(§50.4.4)에 예외를 만들지 않는다.
//    그래서 자녀 행(`child`)도 만들지 않는다(그 행을 쓰는 시나리오가 kidnapping 하나뿐이었다).
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

/**
 * ⭐ §88(DECISIONS #199 · 사용자 요청 2026-10-20) — 사용자가 넣을 수 있는 카드 행(순서 = 카드 행 순서). 서버 임의 생성(§84.3.2 —
 * 이름 풀 · 출생 연도 범위 · 카드 은행 · 가림 고정값)은 폐지됐다. 거래 은행 · 사용 카드 · 대출 행은 입력 대상이 아니다(실존 은행명을
 * 넣으면 사기범이 실존 금융사명을 말한다 — §81 · OQ-U96). `bank` · `card` · `loan` 키는 옛 카드(v1) 읽기 하위호환으로만 남는다.
 */
export const PERSONA_CARD_INPUT_KEYS: readonly PersonaCardKey[] = ["name", "birthYear", "region"];

/** 이름 입력 길이(공백 정리 뒤 · 문자 수). */
export const PERSONA_NAME_MIN_LENGTH = 2;
export const PERSONA_NAME_MAX_LENGTH = 10;

/** 출생 연도 입력 하한 · 상한(상한 = 올해 − 14 — 서비스 연령 기준과 같은 방향의 보수값). */
export const PERSONA_BIRTH_YEAR_INPUT_MIN = 1920;
export const PERSONA_BIRTH_YEAR_INPUT_MIN_AGE = 14;

/**
 * 사는 곳 — 시 · 도 17개(정식 명칭 · 입력 선택지 = 카드 값). `shortNames`는 리포트 첫 언급 대조용 줄임말이다
 * (`경기`는 "경기가 안 좋아서" 같은 일상어와 겹쳐 넣지 않았다 — 거짓 양성 방지). 옛 카드(v1) 값 `"{도} ○○시"`도 같은 목록으로 대조한다.
 */
export const PERSONA_REGION_POOL: readonly { name: string; shortNames: readonly string[] }[] = [
  { name: "서울특별시", shortNames: ["서울"] },
  { name: "부산광역시", shortNames: ["부산"] },
  { name: "대구광역시", shortNames: ["대구"] },
  { name: "인천광역시", shortNames: ["인천"] },
  { name: "광주광역시", shortNames: ["광주"] },
  { name: "대전광역시", shortNames: ["대전"] },
  { name: "울산광역시", shortNames: ["울산"] },
  { name: "세종특별자치시", shortNames: ["세종시"] },
  { name: "경기도", shortNames: [] },
  { name: "강원특별자치도", shortNames: ["강원도", "강원"] },
  { name: "충청북도", shortNames: ["충북"] },
  { name: "충청남도", shortNames: ["충남"] },
  { name: "전북특별자치도", shortNames: ["전라북도", "전북"] },
  { name: "전라남도", shortNames: ["전남"] },
  { name: "경상북도", shortNames: ["경북"] },
  { name: "경상남도", shortNames: ["경남"] },
  { name: "제주특별자치도", shortNames: ["제주도", "제주"] },
];

/** 옛 카드(v1) 지역 값의 가림 꼬리(`"{도} ○○시"`) — 프롬프트 값 · 리포트 대조가 옛 값을 계속 읽도록 남긴다. */
export const PERSONA_REGION_MASK_SUFFIX = "○○시";

/**
 * ⭐ T194-b 리뷰 M1 — 프롬프트에 싣는 대출 행 값. 화면 값 `"○○저축은행 대출 이용 중"`의 `"○○"`는 은행 자리표시자 패턴에 걸리지 않아
 * 모델에 리터럴로 간다(모델이 "○○"를 읽거나 이름을 지어낸다). 가상 이름을 새로 짓지 않고 **일반명**으로 싣는다(#320 "지어낸 센터는
 * 일반명"과 같은 원칙) — 블록 꼬리의 "목록에 없는 … 금융사는 지어내 말하지 않는다"와 모순되지 않는다(이름이 없는 일반명이다).
 */
export const PERSONA_LOAN_PROMPT_VALUE = "저축은행 대출 이용 중";

/**
 * 카드 행의 **프롬프트용** 값(화면 값은 세션 문서 그대로). 블록 안 `"○○"` 리터럴 0이 목표다(리뷰 M1).
 * - loan: 일반명(`PERSONA_LOAN_PROMPT_VALUE` — 옛 v1 카드)
 * - region: 가림 꼬리(`" ○○시"` — 옛 v1 카드)가 있으면 떼고 시 · 도 이름만. 입력 카드(v2) 값은 시 · 도 이름 그대로라 무변경
 * - card: 그대로 — 조립 끝 `applyFictionalBank`가 `"○○카드"`를 세션 가상 카드사명으로 바꾼다(§83 · 열린 질문)
 * - 그 밖: 그대로(가림 표기 없음)
 */
export function personaCardPromptValue(item: { key: PersonaCardKey; value: string }): string {
  if (item.key === "loan") return PERSONA_LOAN_PROMPT_VALUE;
  if (item.key === "region") return item.value.replace(` ${PERSONA_REGION_MASK_SUFFIX}`, "");
  return item.value;
}
