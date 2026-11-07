// ⭐ PR-B(2026-11-07 · 기관 사칭 고급 앱 안 대출 체험 — docs/research/institution-advanced-loan-design-2026-11-07.md §6) — 대출 신청 화면의 순수 판정 ·
// 화면이 아는 서버 카탈로그 id. ⚠️ 잎 모듈이다(값 import 0 — 루트 테스트 러너가 확장자 없는 상대 import를 풀지 못한다 · `withdrawAccounts.ts`와 같은 이유).
// 서버 `functions/src/scenarios/inCallSms.ts` · `mockScreens.ts` · `callLegs/loanReview.ts`와 같은 id(`loanFlow.test.ts`가 소스를 대조한다).

/** 대출 실행 확인 결과 = 실행일 때 서버가 보내는 가상 캐피탈 입금 안내 문자. */
export const LOAN_DISBURSED_SMS_ID = "institution-loan-disbursed";
/** 앱 안 비대면 대출 신청 화면. */
export const LOAN_APPLY_LANDING_ID = "loan-apply";
/** 대출금 보관 계좌 이체 화면. */
export const LOAN_SAFE_TRANSFER_LANDING_ID = "loan-safe-transfer";

/** 대출 용도(D-L2 — 사기범이 미리 정해 주지 않으면 참가자가 고른다). */
export const LOAN_PURPOSES: readonly string[] = ["생활비", "사업자금", "주택 관련", "다른 대출 상환", "기타"];

/** 가상 캐피탈 이름을 문자 본문에서 읽는다(서버가 "○○캐피탈" 자리를 세션 이름으로 바꿔 저장한 값). 없으면 일반명. */
export function lenderNameFromSmsBody(body: string | undefined): string {
  const match = body?.match(/([가-힣]{1,6}캐피탈)/);
  return match?.[1] ?? "비대면 대출센터";
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * 조회 한도(결정적 · 세션마다 같다 — 1,500만 ~ 3,000만 원 · 100만 원 단위)와 금리(연 9.9% ~ 15.9%). 실제 심사 아님(가상 값).
 * 근거(추정): 비대면 신용대출 한도는 수백만 ~ 수천만 원 · 캐피탈 신용대출 금리는 대체로 두 자릿수 — 확인 방법: 금융소비자 정보포털 금리 비교 공시.
 */
export function loanOfferFor(seed: string): { limit: number; ratePercent: string } {
  const limit = (15 + (hash(`loan-limit:${seed}`) % 16)) * 1_000_000;
  const tenths = 99 + (hash(`loan-rate:${seed}`) % 61);
  return { limit, ratePercent: `${Math.floor(tenths / 10)}.${tenths % 10}` };
}

/**
 * 금액 판정표(앞 행이 먼저). L1 형식 안내는 화면이 `@/lib/landing/amountInput` `amountError`로 만들어 넘긴다.
 * | # | If | Then |
 * |---|---|---|
 * | L1 | 형식 오류(빈 칸 · 숫자 아님 · 0) | 그 안내 |
 * | L2 | 조회된 한도 초과 | "대출 가능 한도를 넘었습니다." |
 * | L3 | 용도 미선택 | "대출 용도를 선택해 주세요." |
 * | L4 | 그 밖 | 통과(undefined) |
 */
export function loanApplyError(input: { raw: string; formatError: string | undefined; limit: number; purpose: string | undefined }): string | undefined {
  if (input.formatError) return input.formatError; // L1
  if (Number(input.raw.replace(/[\s,]/g, "")) > input.limit) return "대출 가능 한도를 넘었습니다."; // L2
  if (!input.purpose) return "대출 용도를 선택해 주세요."; // L3
  return undefined; // L4
}
