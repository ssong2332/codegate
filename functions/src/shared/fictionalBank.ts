// 세션별 가상 은행명 (2026-10-18 사용자 결정 "가상 은행 이름(권장)" · Architecture §81).
//
// 왜: 문자·대사에 "OO은행 604-2270-1183-91"이 보이면 참가자가 곧바로 훈련(=가짜)인 줄 안다(현실감 저하).
// 그래서 **실제처럼 들리지만 존재하지 않는** 은행 이름을 세션마다 하나 골라, 문자·대사·랜딩에서 같은 이름을 쓴다.
//
// 원칙(#277·#289 "실존 기관 사칭 회피"와의 관계): 실존 은행명은 여전히 쓰지 않는다 — 모델이 실존명을 말하면
// `guardrails/realFinancialNames.ts`가 바꾼다. 가상명은 **존재하지 않는 기관**이라 사칭이 아니다. 단, 실존·과거
// 은행·저축은행·상호금융·카드사 이름과 겹치거나 헷갈리면 사실상 사칭이 되므로 아래 목록은 대조를 통과한 것만 둔다
// (대조 출처·결과는 Architecture §81.1).
//
// ⛔ 이름을 늘리거나 바꿀 때는 §81.1 대조표를 다시 돌린다. "OO뱅크"류, 실존 브랜드와 한 글자 차이, 카드사·
//    증권사·보험사 상호와 같은 이름은 넣지 않는다.

import { IN_CALL_SMS } from "../scenarios/inCallSms";

/** 카탈로그·프롬프트에 쓰는 가상 은행 자리표시자(템플릿 토큰). 실제 출력 전에 세션 은행명으로 바뀐다. */
export const BANK_PLACEHOLDER = "OO은행";

/** 대조를 통과한 가상 은행명(§81.1). 순서가 곧 배정 순서다 — 바꾸면 기존 세션의 해시 폴백 배정이 달라진다. */
export const FICTIONAL_BANK_NAMES: readonly string[] = [
  "한결은행",
  "다온은행",
  "새솔은행",
  "늘봄은행",
  "해담은행",
  "가온은행",
  "미르은행",
  "보담은행",
];

/**
 * FNV-1a 32비트 — 결정적이고 의존성이 없다.
 * T194-b(§84.3.2) — 가상 신상 카드의 시드도 이 함수를 쓴다(복사 0 — `session/personaCard.ts`).
 */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** 새 세션의 가상 은행명을 고른다. `random`은 테스트 주입점(기본 Math.random). */
export function pickFictionalBankName(random: () => number = Math.random): string {
  const index = Math.min(FICTIONAL_BANK_NAMES.length - 1, Math.floor(random() * FICTIONAL_BANK_NAMES.length));
  return FICTIONAL_BANK_NAMES[index]!;
}

/**
 * 세션의 가상 은행명. 세션 문서의 `fictionalBankName`이 유일한 원천이고, 그 필드가 없는 옛 세션은 sessionId 해시로
 * 결정적으로 고른다(같은 세션 안에서 문자·대사가 갈라지지 않게). 목록 밖의 값이 저장돼 있으면 해시 폴백을 쓴다.
 */
export function resolveFictionalBankName(session: { sessionId?: string; fictionalBankName?: string }): string {
  const stored = session.fictionalBankName;
  if (stored && FICTIONAL_BANK_NAMES.includes(stored)) return stored;
  return FICTIONAL_BANK_NAMES[hash(session.sessionId ?? "") % FICTIONAL_BANK_NAMES.length]!;
}

/**
 * 대조를 통과한 가상 카드사·캐피탈 이름(§83.1). **세션 은행명과 같은 자리(index)의 이름을 쓴다** — 세션 원천은
 * 여전히 `fictionalBankName` 하나라서, 은행명이 전달되는 모든 경로(프롬프트·대사 후처리·문자·확인창구·Live)가
 * 새 필드·새 배선 없이 같은 카드사·캐피탈 이름을 쓴다(§83.2). 순서·길이를 바꾸면 기존 세션의 배정이 달라진다.
 * ⛔ 이름을 늘리거나 바꿀 때는 §83.1 대조표를 다시 돌린다. 은행명 어간과 같은 어간은 쓰지 않는다(계열사로 오인).
 */
export const FICTIONAL_CARD_NAMES: readonly string[] = [
  "초롱카드",
  "반디카드",
  "버들카드",
  "마중카드",
  "찬별카드",
  "윤채카드",
  "잎새카드",
  "타래카드",
];
export const FICTIONAL_CAPITAL_NAMES: readonly string[] = [
  "이랑캐피탈",
  "벼리캐피탈",
  "너울캐피탈",
  "포근캐피탈",
  "자람캐피탈",
  "마노캐피탈",
  "휘나리캐피탈",
  "아띠캐피탈",
];

/** 세션 은행명에 딸린 가상 카드사·캐피탈 이름(§83.2). 목록 밖의 은행명이면 그 이름의 해시로 고른다(결정적). */
export function fictionalOrgNamesFor(bankName: string): { cardName: string; capitalName: string } {
  const at = FICTIONAL_BANK_NAMES.indexOf(bankName);
  const index = at >= 0 ? at : hash(bankName) % FICTIONAL_CARD_NAMES.length;
  return { cardName: FICTIONAL_CARD_NAMES[index]!, capitalName: FICTIONAL_CAPITAL_NAMES[index]! };
}

/**
 * 자리표시자 표기 변형까지 잡는다(리뷰 #4 — 모델이 "OO 은행"·"oo은행"·전각 "ＯＯ은행"으로 쓸 수 있다).
 * ⚠️ 한계: 한글로 읽은 "오오은행"·"OO뱅크"는 대상이 아니다(§81.5).
 */
const PLACEHOLDER_PATTERN = /[Oo○Ｏｏ]{2}\s?은행/g;
/** §83 — 카드사·캐피탈 자리표시자("○○카드"·"○○캐피탈" 및 같은 표기 변형). 실명 가드레일의 "OO카드" 출력도 여기서 바뀐다. */
const CARD_PLACEHOLDER_PATTERN = /[Oo○Ｏｏ]{2}\s?카드/g;
// 리뷰 Minor #2 — 표준어 표기 "캐피털"도 잡는다.
const CAPITAL_PLACEHOLDER_PATTERN = /[Oo○Ｏｏ]{2}\s?캐피[탈털]/g;

/** 텍스트에 가상 **은행** 자리표시자가 있는가(문자 문서 `bankName` 필드 판정용 — 카드·캐피탈 자리표시자는 세지 않는다). */
export function hasBankPlaceholder(text: string): boolean {
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return PLACEHOLDER_PATTERN.test(text);
}

/**
 * 텍스트의 가상 금융사 자리표시자를 세션 이름으로 바꾼다 — "OO은행"·"○○은행" → 세션 은행명, §83 "○○카드" → 세션
 * 카드사명, "○○캐피탈" → 세션 캐피탈명(모두 표기 변형 포함). 자리표시자가 없으면 입력을 그대로 돌려준다.
 */
export function applyFictionalBank(text: string, bankName: string): string {
  PLACEHOLDER_PATTERN.lastIndex = 0;
  CARD_PLACEHOLDER_PATTERN.lastIndex = 0;
  CAPITAL_PLACEHOLDER_PATTERN.lastIndex = 0;
  const hasBank = PLACEHOLDER_PATTERN.test(text);
  const hasCard = CARD_PLACEHOLDER_PATTERN.test(text);
  const hasCapital = CAPITAL_PLACEHOLDER_PATTERN.test(text);
  if (!hasBank && !hasCard && !hasCapital) return text;
  const { cardName, capitalName } = fictionalOrgNamesFor(bankName);
  let out = hasBank ? text.replace(PLACEHOLDER_PATTERN, bankName) : text;
  if (hasCard) out = out.replace(CARD_PLACEHOLDER_PATTERN, cardName);
  if (hasCapital) out = out.replace(CAPITAL_PLACEHOLDER_PATTERN, capitalName);
  return out;
}

/**
 * 프롬프트·시나리오 수법의 **예시 계좌번호**(템플릿 토큰) — §81.6. 모델이 이 예시를 문자 속 계좌인 양 그대로 읽어
 * 문자(카탈로그 계좌)와 대사가 갈렸다(R8: 예시 계좌를 말한 세션 pre 6/7 · post 3/7, 문자 속 계좌를 말한 세션 0/14).
 */
export const EXAMPLE_ACCOUNT_NUMBER = "948-2716-5093-27";
const ACCOUNT_NUMBER_PATTERN = /\d{3}-\d{4}-\d{4}-\d{2}/;

/** 문자 본문에서 가상 은행 자리표시자 줄의 계좌번호를 뽑는다(없으면 undefined). */
export function extractAccountNumber(body: string): string | undefined {
  const line = body.split("\n").find((l) => l.includes(BANK_PLACEHOLDER) || /[Oo○Ｏｏ]{2}\s?은행/.test(l));
  return line?.match(ACCOUNT_NUMBER_PATTERN)?.[0];
}

/**
 * ⭐ P2(2026-10-31 · X6) — 계좌 문자 본문의 "예금주: …" 줄 이름 · "금액: …원" 줄 숫자(쉼표 제거). 훈련용 이체 화면의 미리 채움 원천이다
 * (두 번째 리터럴 0 — 문자 본문이 유일한 원천). 줄이 없으면 undefined.
 */
export function extractAccountHolder(body: string): string | undefined {
  const name = body.split("\n").find((l) => l.startsWith("예금주:"))?.slice("예금주:".length).trim();
  return name ? name : undefined;
}

/**
 * ⭐ U3(실기기 신고 2026-11-01 · 카드사 고급 fv-x7ue — *"예금주는 같은데 은행명은 다른데?"* 지난번 미르은행 · 이번 새솔은행 · 예금주 오현수) —
 * 계좌번호 · 예금주는 문자 · 변형에 고정인데 은행명만 세션마다 골라, 같은 대포통장이 은행만 바뀌어 보였다. 예금주가 보이는 계좌는
 * **계좌번호 · 은행 · 예금주를 한 묶음으로 고정**한다(메인 권고 — 한 사람 명의 통장은 한 은행에 있다. 세션마다 셋을 다 바꾸면 문자 본문 ·
 * 변형 값을 세션마다 만들어야 하고, 대사 · 문자 · 이체 화면 · 리포트가 같은 값을 쓰는지 검증할 축이 늘어난다).
 *
 * | 세션이 보여 주는 계좌 | 세션 은행명(`fictionalBankName`) |
 * |---|---|
 * | 선언한 계좌 문자에 예금주 줄이 있다 | 그 예금주의 고정 은행(아래 표) |
 * | 계좌 문자는 없고 변형에 가상 예금주(`accountHolder` — 메신저)가 있다 | 그 예금주의 고정 은행 |
 * | 예금주가 보이지 않는다(말로 부르는 예시 계좌 · 계좌 없음) | 세션마다 고른다(종전 — 묶음이 없어 어긋남이 보이지 않는다) |
 *
 * ⚠️ 세션 은행명이 정해지면 같은 자리의 카드사 · 캐피탈 이름(`fictionalOrgNamesFor`)도 따라 고정된다(그 변형에서 늘 같은 이름).
 * ⚠️ 이미 만든 세션은 저장된 `fictionalBankName`을 그대로 쓴다(무소급). 표에 없는 예금주는 종전처럼 고른다 — 새 예금주를 넣으면 이 표에도 넣는다
 * (`__tests__/cardAdvancedU2U3U7.test.ts`가 문자 · 변형의 예금주 전부가 표에 있는지 본다).
 */
export const ACCOUNT_HOLDER_BANKS: Readonly<Record<string, string>> = {
  // 통화 계좌 문자(`scenarios/inCallSms.ts` "예금주:" 줄)
  윤재석: "다온은행",
  서지원: "늘봄은행",
  강태윤: "가온은행",
  오현수: "미르은행",
  임하늘: "해담은행",
  김민재: "보담은행",
  문성호: "새솔은행",
  배준영: "한결은행",
  신예린: "다온은행",
  // 메신저 변형 가상 예금주(`scenarios/flowVariants.ts` `accountHolder`)
  김도현: "새솔은행",
  이서준: "해담은행",
  박지훈: "가온은행",
  최민혁: "늘봄은행",
  정유나: "보담은행",
  한승우: "한결은행",
};

/** U3 — 예금주의 고정 은행(표에 없으면 undefined = 세션마다 고른다). */
export function fixedBankForHolder(holder: string | undefined): string | undefined {
  if (holder === undefined) return undefined;
  const bank = ACCOUNT_HOLDER_BANKS[holder];
  return bank !== undefined && FICTIONAL_BANK_NAMES.includes(bank) ? bank : undefined;
}

/** U3 — `resolveSessionAccountNumber`와 같은 문자(선언 문자 중 첫 계좌 문자)의 예금주. 없으면 undefined. */
export function resolveSessionAccountHolder(scenarioId: string, declaredSmsIds?: readonly string[]): string | undefined {
  for (const item of IN_CALL_SMS[scenarioId] ?? []) {
    if (declaredSmsIds && !declaredSmsIds.includes(item.smsId)) continue;
    if (extractAccountNumber(item.body)) return extractAccountHolder(item.body);
  }
  return undefined;
}

export function extractTransferAmount(body: string): string | undefined {
  const digits = body.split("\n").find((l) => l.startsWith("금액:"))?.match(/[\d,]+(?=원)/)?.[0]?.replace(/,/g, "");
  return digits ? digits : undefined;
}

/**
 * 이 시나리오의 세션 계좌번호 —**계좌 문자가 있으면 그 문자 속 계좌**(대사와 문자가 같은 번호), 없으면 예시 계좌.
 * 변형 세션은 `resolveRouteAccountNumber`(`inCallSms/smsGate.ts`)로 부른다 — 그 변형이 선언한 문자만 본다.
 * 프롬프트(`buildSystemPrompt` `sessionAccountNumber`)와 문자 문서(`accountNumber`)가 같은 값을 쓴다.
 */
export function resolveSessionAccountNumber(scenarioId: string, declaredSmsIds?: readonly string[]): string {
  // §132.5 — 변형(루트)이 선언한 문자만 본다(`declaredSmsIds`). 현금 예탁 · 금 구매 루트는 계좌 문자를 선언하지 않는데도 시나리오의
  // 안전계좌 문자 번호가 공통 규칙에 "이 번호를 그대로 쓴다"로 실려, 사기범이 그 계좌로 전액 이체를 요구했다(메인 라이브 확인 2026-10-24).
  // 부재 = 변형 없는 세션(무소급) = 종전대로 시나리오 전체.
  for (const item of IN_CALL_SMS[scenarioId] ?? []) {
    if (declaredSmsIds && !declaredSmsIds.includes(item.smsId)) continue;
    const found = extractAccountNumber(item.body);
    if (found) return found;
  }
  return EXAMPLE_ACCOUNT_NUMBER;
}
