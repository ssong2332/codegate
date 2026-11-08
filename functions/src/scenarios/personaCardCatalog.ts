// T194-b(docs/Architecture.md §84.3.1 · §84.3.2 · PRD AC-104 · UX-014 v1.38 (2)) — 훈련용 가상 신상 카드의 **데이터**.
// ⭐ §88(DECISIONS #199) — 카드 값은 사용자가 넣는다(선택 · 기본 비움). 이 파일은 대상 · 라벨 · 입력 규칙 · 시 · 도 목록만 둔다.
//
// ⛔ 금지(§84.0 X2 · AC-104 (e)): 사용자 계정 정보(표시 이름 · 이메일 · 계정 식별자)는 이 파일 어디에도 들어오지 않는다.
//    실존 금융사 이름 0 · 시 · 군 · 구 이하 지명 0(사는 곳은 시 · 도까지만).
// ⭐ 대상 범위 — 2026-10-20 User 결정(고급 + 기관형 4종) → **§93(2026-10-21 · 사용자 승인 "시나리오 결정 권고안대로 진행")로 확대**:
//    기관형 8종 + 협박형 2종(자녀 납치 · 불법업소 유포). ⚠️ 카드 배송(card-delivery-call)은 넣지 않는다 — 카드사 고급의 흐름
//    변형으로 흡수된다(advanced-catalog-impl · 2026-10-21 조기 통보). 카드사가 이미 대상이라 흡수 변형까지 덮는다. 고급 × 통화 시작 × 입력이 있을 때만은 그대로다.
//    협박형은 신원을 밝히지 않는 협박범(anonymous)이라 본인확인형 문면이 맞지 않는다 ⇒ 시나리오마다 **카드 종류**(`PERSONA_CARD_KIND`)를
//    두고, 종류가 입력 칸 · 프롬프트 블록 · 리포트 교훈을 정한다. 자녀 납치는 자녀 행(`childName` 등)만, 유포 협박은 신상 + 하는 일을 받는다.
import type { PersonaCardKey } from "../shared/types";
import {
  ASSET_PROTECTION_NOTICE_CALL_SCENARIO_ID,
  BANK_SECURITY_VERIFY_SCAM_SCENARIO_ID,
  CARD_COMPANY_IMPERSONATION_SCENARIO_ID,
  COURIER_CUSTOMS_SCAM_SCENARIO_ID,
  INSTITUTIONAL_IMPERSONATION_SCENARIO_ID,
  KIDNAPPING_THREAT_SCENARIO_ID,
  LOAN_SCAM_SCENARIO_ID,
  PROSECUTION_COOPERATION_CALL_SCENARIO_ID,
  REPUTATION_BLACKMAIL_SCAM_SCENARIO_ID,
  TAX_REFUND_SCAM_SCENARIO_ID,
} from "./publicMeta";

/** 카드 대상 시나리오(데이터 상수 — 바꾸려면 planner/User 확인이 먼저다 · AC-104 (a)). */
export const PERSONA_CARD_SCENARIOS: readonly string[] = [
  INSTITUTIONAL_IMPERSONATION_SCENARIO_ID,
  CARD_COMPANY_IMPERSONATION_SCENARIO_ID,
  LOAN_SCAM_SCENARIO_ID,
  COURIER_CUSTOMS_SCAM_SCENARIO_ID,
  TAX_REFUND_SCAM_SCENARIO_ID,
  BANK_SECURITY_VERIFY_SCAM_SCENARIO_ID,
  ASSET_PROTECTION_NOTICE_CALL_SCENARIO_ID,
  PROSECUTION_COOPERATION_CALL_SCENARIO_ID,
  KIDNAPPING_THREAT_SCENARIO_ID,
  REPUTATION_BLACKMAIL_SCAM_SCENARIO_ID,
];

/**
 * §93 카드 종류 판정표(⛔ 이 표대로만 — G569 가드가 `roleplay/personaAuthority.ts`와 대조한다):
 * | 종류 | 페르소나 권한 | 입력 칸 | 카드가 있을 때 사기범 |
 * |---|---|---|---|
 * | `identity` | institution | 이름 · 출생 연도 · 생일 · 사는 곳 | 신원 요구 대신 "○○ 님 본인 맞으시죠?"로 먼저 확인 |
 * | `self-threat` | anonymous | 이름 · 출생 연도 · 생일 · 사는 곳 · 하는 일 | 신상을 먼저 대며 "다 알고 있다"고 협박 |
 * | `child-threat` | anonymous | 자녀 이름 · 자녀 학년 · 자녀가 다니는 학원 | 자녀 이름을 먼저 대며 압박(부모 이름은 여전히 모른다) |
 */
export type PersonaCardKind = "identity" | "self-threat" | "child-threat";
export const PERSONA_CARD_KIND: Readonly<Record<string, PersonaCardKind>> = {
  [INSTITUTIONAL_IMPERSONATION_SCENARIO_ID]: "identity",
  [CARD_COMPANY_IMPERSONATION_SCENARIO_ID]: "identity",
  [LOAN_SCAM_SCENARIO_ID]: "identity",
  [COURIER_CUSTOMS_SCAM_SCENARIO_ID]: "identity",
  [TAX_REFUND_SCAM_SCENARIO_ID]: "identity",
  [BANK_SECURITY_VERIFY_SCAM_SCENARIO_ID]: "identity",
  [ASSET_PROTECTION_NOTICE_CALL_SCENARIO_ID]: "identity",
  [PROSECUTION_COOPERATION_CALL_SCENARIO_ID]: "identity",
  [KIDNAPPING_THREAT_SCENARIO_ID]: "child-threat",
  [REPUTATION_BLACKMAIL_SCAM_SCENARIO_ID]: "self-threat",
};

/** 대상 시나리오의 카드 종류(대상 밖 = `undefined`). */
export function personaCardKind(scenarioId: string): PersonaCardKind | undefined {
  return PERSONA_CARD_SCENARIOS.includes(scenarioId) ? PERSONA_CARD_KIND[scenarioId] : undefined;
}

/** 라벨(화면 · 프롬프트 공통 — UX-014 v1.38 (2) · §93 UX D-136). */
export const PERSONA_CARD_LABELS: Readonly<Record<PersonaCardKey, string>> = {
  name: "이름",
  birthYear: "출생 연도",
  birthDate: "생년월일",
  region: "사는 곳",
  bank: "거래 은행",
  card: "사용 카드",
  loan: "대출",
  job: "하는 일",
  childName: "자녀 이름",
  childGrade: "자녀 학년",
  childAcademy: "자녀가 다니는 학원",
  balance: "통장 잔액",
};

/**
 * ⭐ §88(DECISIONS #199 · 사용자 요청 2026-10-20) — 사용자가 넣을 수 있는 카드 행(순서 = 카드 행 순서). 서버 임의 생성(§84.3.2 —
 * 이름 풀 · 출생 연도 범위 · 카드 은행 · 가림 고정값)은 폐지됐다. 거래 은행 · 사용 카드 · 대출 행은 입력 대상이 아니다(실존 은행명을
 * 넣으면 사기범이 실존 금융사명을 말한다 — §81 · OQ-U96). `card` · `loan` 키는 옛 카드(v1) 읽기 하위호환으로만 남는다.
 * ⭐ 2026-11-09 사용자 결정 — 기관형에 `bank`(거래 은행)를 다시 받는다. 단 실제 은행 이름은 서버로 오지 않는다(요청 값 = 가상 은행 이름 또는
 * `PERSONA_BANK_REAL_INPUT` — `session/personaCard.ts` 판정표 BK). 사용 카드 · 대출은 여전히 입력 대상 아님.
 * ⭐ §93 — 종류별 행(위 판정표). 종류에 없는 행을 보내면 서버가 `persona-card-not-applicable`로 거부한다(조용히 버리지 않는다).
 */
export const PERSONA_CARD_INPUT_KEYS_BY_KIND: Readonly<Record<PersonaCardKind, readonly PersonaCardKey[]>> = {
  // 2026-11-09 사용자 결정 — 기관형(은행 사칭 포함)에 거래 은행 · 통장 잔액(`session/personaCard.ts` 판정표 BK · BL). 협박형 = 0(BK6 · BL4).
  identity: ["name", "birthYear", "birthDate", "region", "bank", "balance"],
  "self-threat": ["name", "birthYear", "birthDate", "region", "job"],
  "child-threat": ["childName", "childGrade", "childAcademy"],
};

/**
 * §93 고정 선택지(UX D-136 — 자유 입력 0 = 실명 학교 · 학원 · 회사 0). 값이 곧 카드 값이고 프롬프트에도 그대로 실린다.
 * ⚠️ 클라 `src/lib/personacard/personaCardInput.ts`의 같은 이름 목록과 같아야 한다(`personaCardInput.test.ts` 소스 대조).
 */
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
 * ⭐ 2026-11-09 사용자 결정(판정표 BK · BL — `session/personaCard.ts`) — 거래 은행 · 통장 잔액 행의 값.
 * - 요청 `bank` = 가상 은행 이름(`FICTIONAL_BANK_NAMES`) 또는 이 표시(`"real"` — 실제 은행을 골랐다 · 이름은 탭 밖으로 나가지 않는다)
 * - 실제 은행 카드 행의 값 = `PERSONA_BANK_UNNAMED_VALUE`(화면 · 리포트 표시) · 프롬프트 = `PERSONA_BANK_UNNAMED_PROMPT_VALUE`
 * - 요청 `balance` = 원 단위 정수 · 1만 원 단위 · 1만 원 ~ 10억 원(클라 판정표 K3 · S8과 같은 범위)
 */
export const PERSONA_BANK_REAL_INPUT = "real";
export const PERSONA_BANK_UNNAMED_VALUE = "직접 고른 은행";
export const PERSONA_BANK_UNNAMED_PROMPT_VALUE =
  "참가자가 실제로 거래하는 은행(이름은 너도 모르고 지어내지도 않는다) — 네가 그 은행 직원으로 전화했다면 자기소개부터 '저희 은행 금융사고대응팀'처럼 '저희 은행'으로만, 그 밖에는 '고객님 거래 은행'으로만 부른다";
export const PERSONA_BALANCE_MIN = 10_000;
export const PERSONA_BALANCE_MAX = 1_000_000_000;
export const PERSONA_BALANCE_UNIT = 10_000;

/** 잔액(원) → 카드 값("2,000만 원" · "1억 원" · "1억 2,000만 원"). */
export function personaBalanceText(won: number): string {
  const manwon = Math.floor(won / PERSONA_BALANCE_UNIT);
  const eok = Math.floor(manwon / 10_000);
  const rest = manwon % 10_000;
  const comma = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (eok === 0) return `${comma(rest)}만 원`;
  return rest === 0 ? `${eok}억 원` : `${eok}억 ${comma(rest)}만 원`;
}

/**
 * 카드 값("2,000만 원" 등) → 원. 형식 밖 = `undefined`. ⭐ BL3(문자 속 고정 금액을 잔액에 맞출지 — 사용자 결정 대기)가 정해지면 문자 · 이체 화면이
 * 세션 문서 `personaCard`에서 잔액을 읽는 자리다(지금은 리포트 · 시험만 쓴다).
 */
export function personaBalanceWon(value: string): number | undefined {
  const match = /^(?:(\d+)억)?\s?(?:([\d,]+)만)?\s?원$/.exec(value);
  if (!match || (match[1] === undefined && match[2] === undefined)) return undefined;
  const eok = match[1] ? Number(match[1]) : 0;
  const manwon = match[2] ? Number(match[2].replace(/,/g, "")) : 0;
  return (eok * 10_000 + manwon) * PERSONA_BALANCE_UNIT;
}

/**
 * 카드 행의 **프롬프트용** 값(화면 값은 세션 문서 그대로). 블록 안 `"○○"` 리터럴 0이 목표다(리뷰 M1).
 * - loan: 일반명(`PERSONA_LOAN_PROMPT_VALUE` — 옛 v1 카드)
 * - birthDate: 사기범이 줄여 말하는 꼴(`"65년 3월 2일생"`)을 앞에 두고 네 자리 연도를 괄호로 붙인다(§88 후속 — 사용자 요청
 *   *"65년 3월 2일생"처럼 말함*). 저장 값 `"1965년 3월 2일생"` 꼴이 아니면 그대로
 * - region: 가림 꼬리(`" ○○시"` — 옛 v1 카드)가 있으면 떼고 시 · 도 이름만. 입력 카드(v2) 값은 시 · 도 이름 그대로라 무변경
 * - card: 그대로 — 조립 끝 `applyFictionalBank`가 `"○○카드"`를 세션 가상 카드사명으로 바꾼다(§83 · 열린 질문)
 * - 그 밖: 그대로(가림 표기 없음)
 */
export function personaCardPromptValue(item: { key: PersonaCardKey; value: string }): string {
  if (item.key === "loan") return PERSONA_LOAN_PROMPT_VALUE;
  // 판정표 BK3 · BK5 — 실제 은행을 고른 카드(이름은 서버에 없다). 은행 사칭이면 자기 은행 = 참가자 은행이라 "저희 은행", 그 밖 = "고객님 거래 은행".
  if (item.key === "bank" && item.value === PERSONA_BANK_UNNAMED_VALUE) return PERSONA_BANK_UNNAMED_PROMPT_VALUE;
  // 판정표 BL2 — 잔액은 "약 2,000만 원"처럼(대략값으로 꺼낸다).
  if (item.key === "balance") return `약 ${item.value}`;
  if (item.key === "region") return item.value.replace(` ${PERSONA_REGION_MASK_SUFFIX}`, "");
  if (item.key === "birthDate") {
    const match = /^(\d{4})년 (\d{1,2})월 (\d{1,2})일생$/.exec(item.value);
    if (match) return `${match[1]!.slice(2)}년 ${match[2]}월 ${match[3]}일생(${match[1]}년)`;
  }
  return item.value;
}
