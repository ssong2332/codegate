// ⭐ 출금 계좌 선택(2026-11-07 실기기 신고 — "출금 계좌도 내가 은행을 선택할 수 있게 한다던가 계좌를 선택할 수 있다던가").
// 두 이체 화면(`MessengerFakeLanding` 훈련용 이체 · `BankAppOverlay` 내 은행 송금)이 같은 목록 · 같은 장부를 쓴다.
//
// | 항목 | 정책 |
// |---|---|
// | 계좌 수 | 3개 · 가상 은행 3곳(이 앱 은행 입출금 1 + 다른 은행 계좌 2 — 실제 앱의 "다른 은행 계좌" 묶음 근사) |
// | 첫 계좌 | 이 앱 은행 입출금 · 잔액 = 세션 고정 가상 잔액(`fictionalBalanceFor` — 종전 화면과 같은 값) · 기본 선택 |
// | 다른 은행 | 받는 계좌 은행 · 이 앱 은행과 다른 가상 은행(결정적) · 잔액은 첫 계좌보다 적다(요구액을 못 채울 수 있다) |
// | 계좌번호 | 가상 숫자 · 가운데 가림(`352-****-7781`) — 실제 계좌 아님 |
// | 잔액 · 한도 | 보낸 만큼 잔액이 줄고(같은 세션 · 탭 메모리) · 1일 한도(5,000만 원)는 계좌와 무관하게 합친다 |
// | 서버 | 0 — 장부는 이 모듈의 메모리 표뿐(탭을 닫으면 사라진다 · G138) |
//
// 판정표 W(금액 → 안내 · 앞 행이 먼저). 형식(W1) · 1회 한도(W2)는 화면이 `@/lib/landing/amountInput`으로 먼저 하고, W3 · W4만 여기서 한다.
// | # | If | Then |
// |---|---|---|
// | W1 | 빈 칸 · 숫자 아님 · 0 | `amountError` 안내(이 모듈 밖) |
// | W2 | 1회 1,000만 원 초과 | `transferLimitError` 안내(이 모듈 밖) |
// | W3 | 고른 계좌의 출금 가능 금액(잔액 − 이 세션에서 그 계좌로 보낸 합계) 초과 | "출금 가능 금액보다 많습니다." |
// | W4 | 오늘 보낸 합계 + 이번 금액 > 1일 5,000만 원 | 1일 한도 안내 + 남은 한도 |
// | W5 | 그 밖 | 통과(undefined) |
//
// ⚠️ 잎 모듈이다 — 값 import 0(루트 테스트 러너가 확장자 없는 상대 import를 풀지 못한다 · `bankApp.ts` 머리 주석과 같다).
// 그래서 해시 · 금액 파싱을 여기 다시 둔다(같은 식 — `withdrawAccounts.test.ts`가 `bankApp.ts`와 대조한다).

/** 1일 이체 한도(원). `amountInput.ts` `TRANSFER_LIMIT_PER_DAY`와 같은 값(드리프트 테스트). */
export const DAILY_TRANSFER_LIMIT = 50_000_000;

/** 서버 `FICTIONAL_BANK_NAMES`와 같은 목록(`bankApp.ts`와 대조 테스트). */
const BANKS: readonly string[] = ["한결은행", "다온은행", "새솔은행", "늘봄은행", "해담은행", "가온은행", "미르은행", "보담은행"];

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function amountValue(raw: string): number | undefined {
  const compact = raw.replace(/[\s,]/g, "");
  if (!/^\d+$/.test(compact)) return undefined;
  const value = Number(compact);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function won(value: number): string {
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

export type WithdrawAccount = {
  /** 장부 열쇠(세션 안에서 계좌를 가른다). */
  id: "main" | "other-1" | "other-2";
  bankName: string;
  /** 상품 이름(예금 종류 — 실존 상품명 아님). */
  productName: string;
  /** 가운데를 가린 가상 계좌번호. */
  maskedNumber: string;
  /** 처음 잔액(원). 출금 가능 금액은 `availableBalance`. */
  balance: number;
  /** 이 앱 은행 계좌인가(목록의 묶음 제목이 갈린다). */
  own: boolean;
};

function maskedNumberFor(seed: string, id: string): string {
  const h = hash(`acct:${seed}:${id}`);
  const head = 100 + (h % 900);
  const tail = String(hash(`acct-tail:${seed}:${id}`) % 10_000).padStart(4, "0");
  return `${head}-****-${tail}`;
}

/**
 * 참가자의 출금 계좌 목록(결정적 · 세션마다 같다). `appBankName` = 이 화면 은행(`myBankNameFor`), `primaryBalance` = `fictionalBalanceFor`,
 * `avoidBankName` = 받는 계좌 은행(다른 은행 계좌로 고르지 않는다).
 */
export function withdrawAccountsFor(input: {
  seed: string;
  appBankName: string;
  primaryBalance: number;
  avoidBankName?: string;
}): WithdrawAccount[] {
  const { seed, appBankName, primaryBalance, avoidBankName } = input;
  const others: string[] = [];
  const start = hash(`other-banks:${seed}`) % BANKS.length;
  for (let i = 0; i < BANKS.length && others.length < 2; i += 1) {
    const name = BANKS[(start + i) % BANKS.length]!;
    if (name !== appBankName && name !== avoidBankName) others.push(name);
  }
  // 다른 은행 잔액: 1번 = 200만 ~ 900만 · 2번 = 30만 ~ 400만(10만 원 단위) — 첫 계좌(1,000만 이상)보다 늘 적다.
  const otherBalance = (key: string, min: number, max: number) => (min + (hash(`${key}:${seed}`) % (max - min + 1))) * 100_000;
  return [
    { id: "main", bankName: appBankName, productName: "입출금통장", maskedNumber: maskedNumberFor(seed, "main"), balance: primaryBalance, own: true },
    {
      id: "other-1",
      bankName: others[0] ?? appBankName,
      productName: "입출금통장",
      maskedNumber: maskedNumberFor(seed, "other-1"),
      balance: otherBalance("other-1", 20, 90),
      own: false,
    },
    {
      id: "other-2",
      bankName: others[1] ?? appBankName,
      productName: "급여통장",
      maskedNumber: maskedNumberFor(seed, "other-2"),
      balance: otherBalance("other-2", 3, 40),
      own: false,
    },
  ];
}

/** 표시용 한 줄("새솔은행 352-****-7781"). */
export function accountLabel(account: Pick<WithdrawAccount, "bankName" | "maskedNumber">): string {
  return `${account.bankName} ${account.maskedNumber}`;
}

// ── 장부(탭 메모리 · 서버 0) ───────────────────────────────────────────────────────────────────────────
const withdrawn = new Map<string, number>();
const sentToday = new Map<string, number>();

/** 출금 가능 금액(처음 잔액 + 이 세션에 입금된 대출금(첫 계좌만) − 이 세션에서 그 계좌로 보낸 합계). */
export function availableBalance(ledgerKey: string, account: Pick<WithdrawAccount, "id" | "balance">): number {
  const deposit = account.id === "main" ? (deposited.get(ledgerKey) ?? 0) : 0;
  return Math.max(0, account.balance + deposit - (withdrawn.get(`${ledgerKey}:${account.id}`) ?? 0));
}

// ── ⭐ PR-B(2026-11-07 · 기관 사칭 고급 앱 안 대출 체험) — 대출 신청 · 입금(탭 메모리 · 서버 0 · G138) ─────────────────────────────
// | 때 | 무엇 |
// |---|---|
// | 대출 신청 화면 마지막 버튼(`MessengerFakeLanding.tsx` `LoanApplyMockup`) | 신청 금액을 이 표에 적는다(`recordLoanApplication`) — 콜백 · 네트워크에는 싣지 않는다 |
// | 입금 안내 문자 도착(대출 실행 확인 결과 = 실행 · 화면이 문자 id로 안다) | 신청 금액을 첫 계좌에 입금(`disburseLoan` — 두 번 불러도 한 번) |
// | 대출금 보관 이체 화면 | 요구액 대사가 없으면 입금된 대출금을 요구액으로 쓴다(`loanDisbursedAmount`) |
// 실제 돈 · 실제 대출 0 — 숫자는 이 탭에서만 살고 탭을 닫으면 사라진다.
const loanApplied = new Map<string, number>();
const deposited = new Map<string, number>();
const disbursed = new Map<string, number>();

/** 대출 신청 금액을 적는다(판정 불가 금액은 적지 않는다 · 다시 신청하면 마지막 값). */
export function recordLoanApplication(ledgerKey: string, raw: string): void {
  const value = amountValue(raw);
  if (value !== undefined) loanApplied.set(ledgerKey, value);
}

/** 신청한 대출금을 첫 계좌에 입금한다(한 세션에 한 번 · 신청 기록이 없으면 0). */
export function disburseLoan(ledgerKey: string): void {
  if (disbursed.has(ledgerKey)) return;
  const value = loanApplied.get(ledgerKey);
  if (value === undefined) return;
  disbursed.set(ledgerKey, value);
  deposited.set(ledgerKey, (deposited.get(ledgerKey) ?? 0) + value);
}

/** 입금된 대출금(숫자 문자열 · 쉼표 포함 "12,000,000") — 없으면 undefined. */
export function loanDisbursedAmount(ledgerKey: string): string | undefined {
  const value = disbursed.get(ledgerKey);
  return value === undefined ? undefined : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 오늘 더 보낼 수 있는 금액(1일 한도 − 이 세션에서 보낸 합계). */
export function remainingDailyLimit(ledgerKey: string): number {
  return Math.max(0, DAILY_TRANSFER_LIMIT - (sentToday.get(ledgerKey) ?? 0));
}

/** 판정표 W3 · W4. 형식 오류 · 1회 한도(W1 · W2)는 호출부가 먼저 막는다 — 판정 불가 금액은 통과(undefined)로 둔다. */
export function withdrawError(ledgerKey: string, account: Pick<WithdrawAccount, "id" | "balance">, raw: string): string | undefined {
  const value = amountValue(raw);
  if (value === undefined) return undefined;
  if (value > availableBalance(ledgerKey, account)) return "출금 가능 금액보다 많습니다."; // W3
  const remaining = remainingDailyLimit(ledgerKey);
  if (value > remaining) return `1일 이체 한도(5,000만 원)를 넘었습니다. 오늘 더 보낼 수 있는 금액은 ${won(remaining)}입니다.`; // W4
  return undefined; // W5
}

/** 보낸 금액을 장부에 적는다(인증 성공 = 송금 완료 순간 한 번). 판정 불가 금액은 적지 않는다. */
export function recordWithdrawal(ledgerKey: string, accountId: WithdrawAccount["id"], raw: string): void {
  const value = amountValue(raw);
  if (value === undefined) return;
  const key = `${ledgerKey}:${accountId}`;
  withdrawn.set(key, (withdrawn.get(key) ?? 0) + value);
  sentToday.set(ledgerKey, (sentToday.get(ledgerKey) ?? 0) + value);
}

/** 출금 가능 금액 표기("12,340,000원"). */
export function availableText(ledgerKey: string, account: Pick<WithdrawAccount, "id" | "balance">): string {
  return won(availableBalance(ledgerKey, account));
}
