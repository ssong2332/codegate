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
  /** 판정표 C1 — 첫 계좌 하나만(다른 은행 계좌 숨김). 부재 = C2(종전 3개). */
  single?: boolean;
}): WithdrawAccount[] {
  const { seed, appBankName, primaryBalance, avoidBankName, single } = input;
  const others: string[] = [];
  const start = hash(`other-banks:${seed}`) % BANKS.length;
  for (let i = 0; i < BANKS.length && others.length < 2; i += 1) {
    const name = BANKS[(start + i) % BANKS.length]!;
    if (name !== appBankName && name !== avoidBankName) others.push(name);
  }
  // 다른 은행 잔액: 1번 = 200만 ~ 900만 · 2번 = 30만 ~ 400만(10만 원 단위) — 첫 계좌(1,000만 이상)보다 늘 적다.
  const otherBalance = (key: string, min: number, max: number) => (min + (hash(`${key}:${seed}`) % (max - min + 1))) * 100_000;
  const all: WithdrawAccount[] = [
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
  return single ? all.slice(0, 1) : all;
}

// ── ⭐ 2026-11-08 실기기 신고(검찰 고급 상품권 화면에 참가자와 무관한 은행 · 금액 3개) · 사용자 결정 D1 ~ D3 ─────────────────────────
// 판정표 A — 출금 계좌(첫 계좌)의 값 출처. 은행 · 잔액 **칸마다 따로** 정한다(앞 행이 먼저 · ⚠️ 칸마다 따로 = 이 세션 판단 — PR 본문에 보고).
// | # | If | Then |
// |---|---|---|
// | A1 | 카드 은행(시작 전 '이번 훈련 속 내 정보' 선택 칸 · 가상 은행 목록 안) 있음 | 은행 = 카드 은행 |
// | A2 | A1 아님 ∧ 통화에서 말한 가상 은행 있음(판정표 S1) | 은행 = 말한 은행 |
// | A3 | A1 · A2 아님 ∧ 통화에서 마지막으로 말한 은행이 가상 목록 밖(판정표 S2 · 실제 은행 등) | 은행 = 이름 없는 표기 `NAMELESS_BANK_NAME`("주거래은행" — ⚠️ 문구 제안) |
// | A4 | 그 밖 | 은행 = 고정 값(화면이 넘긴 세션 고정 가상 은행 — 종전) |
// | A5 | 카드 잔액(1만 원 ~ 10억 원) 있음 | 잔액 = 카드 잔액 |
// | A6 | A5 아님 ∧ 통화에서 말한 잔액 있음(판정표 S4 ~ S9 · 범위 S8 그대로) | 잔액 = 말한 잔액 |
// | A7 | 그 밖 | 잔액 = 고정 값(`fictionalBalanceFor` — 종전) |
// 판정표 C — 계좌 수(D3).
// | # | If | Then |
// |---|---|---|
// | C1 | A1 · A2 · A3 · A5 · A6 중 하나라도 해당(참가자 쪽 값이 하나라도 있음) | 그 계좌 하나만(다른 은행 계좌 숨김) |
// | C2 | 그 밖(값 0) | 종전 3개(이 앱 은행 1 + 다른 은행 2) |
// 기존 규칙과의 관계(바꾸지 않음): 출금 가능 금액 · 1일 한도 = 판정표 W 그대로(요구액보다 잔액이 적으면 W3로 이체가 막힌다 — C1이면 다른 계좌로 바꿀 수도 없다 = 현실과 같다) ·
// 출금 예약 최소 100만 원(S8 결정 "그대로 둠") 그대로 · 값은 화면 안에서만(서버 · 콜백 0 · G138).
//
// ⭐ 2026-11-09 사용자 결정 — 내 출금 계좌에 **실제 은행 이름**을 허용한다. 단 **'내 계좌' 줄에만 글자로**(로고 · 브랜드 색 0) · 사기 쪽은 가상 이름 그대로 ·
// 카드 값은 그 훈련 한 번만(종전 K5 · K6 그대로). 위 표 A1 · A3이 아래처럼 바뀐다(A2 · A4 ~ A7 · C 무변경).
// | # | If | Then |
// |---|---|---|
// | A1′ | 카드 은행 = 가상 은행 목록 ∪ 실제 은행 표 R 안 | 은행 = 카드 은행(실제 은행이면 그 표기 그대로) |
// | A3a | A1 · A2 아님 ∧ 통화에서 마지막으로 말한 은행 = 표 R이 알아본 실제 은행(`realBankName`) | 은행 = 그 표기(R의 '표기' 열) |
// | A3b | A1 · A2 · A3a 아님 ∧ 마지막 언급이 가상 목록 밖이지만 표 R이 모르는 이름("○○은행" · "○○뱅크") | 은행 = `NAMELESS_BANK_NAME`(종전 A3) |
// 판정표 P — 실제 은행 이름이 **나와도 되는 곳 / 안 되는 곳**(이름이 실제 은행일 때만 적용 · 가상 은행 · 주거래은행은 종전 그대로).
// | # | 위치 | 실제 은행 이름 |
// |---|---|---|
// | P1 | 출금 · 결제 · 입금 계좌 줄(`accountLabel` — "KB국민은행 209-****-2900") · 확인 화면 '출금 계좌' 칸 | 허용 |
// | P2 | 출금 계좌 선택 시트 '내 계좌' 묶음(이름 · 상품 줄 · 계좌 줄 · 머리글자 동그라미 — 색은 기본 남색 = 브랜드 색 0) | 허용 |
// | P3 | 시작 전 카드 '거래 은행' 고르기 칸(난이도 화면 — 세션 화면 밖) | 허용(고르기만 · 자유 입력 0) |
// | P4 | 화면 머리띠 · 송금 앱 머리 · 인증 시트 앱 이름 · 꼬리말 | 불허 → 판정표 H |
// | P5 | 사기 사이트 · 받는 계좌 · 문자 · 사기범 대사 · 리포트 · 이체 완료 캡처 | 불허(이 값이 닿지 않는다 — 카드 · 말한 값은 화면 state뿐 · 서버 · 콜백 0) |
// | P6 | 서버 · 요청 · 사기범 프롬프트 · 저장소(세션 id와 함께 탭 `sessionStorage`만 — K5) | 0 |
// 판정표 H — 머리 · 앱 이름 표기(`myBankBrand` · `myBankAppName`).
// | # | If | Then |
// |---|---|---|
// | H1 | 내 은행 = 가상 은행 · `NAMELESS_BANK_NAME` | 종전 그대로("{은행} 모바일뱅킹" · "{은행} 송금" · 꼬리말 "{은행}") |
// | H2 | 내 은행 = 표 R 실제 은행 | 은행 이름을 빼고 "모바일뱅킹" · "송금" · 꼬리말 "모바일뱅킹"(⚠️ 문구 제안) |
// 판정표 I — 머리글자 동그라미 글자(`bankInitial` · 2026-11-09 사용자 결정 — 영문 머리글자 "K" · "N" · "S" · "i" 대신 한글).
// | # | If | Then |
// |---|---|---|
// | I1 | 내 은행 = 표 R 실제 은행 | 그 행의 '머리글자' 열(한글 한 글자 — 영문 표기 앞머리는 건너뛴 은행 이름 첫 글자 · 씨티 = "씨" · iM뱅크 = 읽는 소리 "아") |
// | I2 | 그 밖(가상 은행 · `NAMELESS_BANK_NAME`) | 이름의 첫 한글 글자(종전 첫 글자와 같다 — 모두 한글로 시작) · 한글이 없으면 첫 글자 |
// ⛔ 실제 은행 이름 글자는 이 파일의 표 R 블록(아래 "실제 은행 표 R 시작" ~ "끝") 한 곳에만 둔다 — `realBankScope.test.ts`가 src 전체를 스캔한다
//    (예외 = 이 블록 · 통화 자막 가드 사본 `realtime/liveTranscriptGuard.ts`(실존명을 지우는 쪽) · 시험 · 주석).

/** A3b — 참가자가 표 R이 모르는 은행을 말했을 때 은행 이름 대신 쓰는 이름 없는 표기(실존 기관명 아님 · 일반어). */
export const NAMELESS_BANK_NAME = "주거래은행";

// ── 실제 은행 표 R 시작 ──────────────────────────────────────────────────────────────────────────────
// 표 R — 실제 은행(2026-11 기준 · 개인 입출금 계좌가 흔한 곳 21개). '표기' = 화면 글자(⚠️ 표기 확정 제안 — 대구은행은 2024년 iM뱅크로 이름을 바꿨다 ·
// 지역 · 단위농협도 'NH농협은행' 한 표기로 묶는다(추정 — 참가자는 둘을 가르지 않는다)). '알아보는 말' = 통화 자막에서 이 은행을 가리키는 꼴(판정표 S2′).
// 짧은 이름(신한 · 신협 · 수협)은 한글 낱말 안에 박히지 않게 앞 경계를 둔다 · 띄어 쓴 "우리 은행" · "하나 은행"은 일반어라 세지 않는다 ·
// 카드사 말("신한카드" · "농협카드")은 은행 언급이 아니다 · 단독 "우체국"은 택배와 겹쳐 뒤에 통장 · 계좌 · 예금 · 대답 어미가 올 때만 센다 · 단독 "토스"는 세지 않는다.
// '머리글자' = 계좌 선택 시트 · 출금 계좌 줄의 동그라미 글자(판정표 I — 2026-11-09 사용자 결정 "영문 대신 한글 첫 글자" · 색은 기본 남색 그대로).
const REAL_BANKS: readonly { name: string; initial: string; alias: string }[] = [
  { name: "KB국민은행", initial: "국", alias: "(?:KB\\s?)?국민\\s?은행|KB\\s?국민|KB\\s?은행" },
  { name: "신한은행", initial: "신", alias: "신한\\s?은행|(?<![가-힣])신한(?!\\s?(?:카드|금융|라이프|투자|캐피탈))" },
  { name: "우리은행", initial: "우", alias: "우리은행" },
  { name: "하나은행", initial: "하", alias: "(?:KEB\\s?)?하나은행|KEB\\s?하나" },
  { name: "NH농협은행", initial: "농", alias: "(?:(?:지역|단위)\\s?)?(?:NH\\s?)?농협(?!\\s?(?:카드|생명|손해))(?:\\s?은행)?|농축협" },
  { name: "IBK기업은행", initial: "기", alias: "IBK(?:\\s?기업)?(?:\\s?은행)?|(?:중소\\s?)?기업은행" },
  { name: "카카오뱅크", initial: "카", alias: "카카오\\s?뱅크|카뱅" },
  { name: "토스뱅크", initial: "토", alias: "토스\\s?뱅크" },
  { name: "케이뱅크", initial: "케", alias: "케이\\s?뱅크|K\\s?뱅크" },
  { name: "우체국", initial: "우", alias: "우체국(?=\\s?(?:통장|계좌|예금|은행|뱅킹|이에요|이예요|이요|입니다|이고|이랑|에\\s?(?:있|넣|돈)))" },
  { name: "새마을금고", initial: "새", alias: "새마을\\s?금고" },
  { name: "신협", initial: "신", alias: "(?<![가-힣])신협" },
  { name: "Sh수협은행", initial: "수", alias: "(?<![가-힣])(?:Sh\\s?)?수협(?:\\s?은행)?" },
  { name: "SC제일은행", initial: "제", alias: "(?:SC\\s?)?제일\\s?은행|SC\\s?제일|SC\\s?은행|스탠다드\\s?차타드(?:\\s?은행)?" },
  { name: "한국씨티은행", initial: "씨", alias: "(?:한국\\s?)?[씨시]티\\s?은행" },
  { name: "iM뱅크", initial: "아", alias: "i\\s?M\\s?뱅크|아이엠\\s?뱅크|(?:DGB\\s?)?대구\\s?은행" },
  { name: "부산은행", initial: "부", alias: "(?:BNK\\s?)?부산\\s?은행" },
  { name: "경남은행", initial: "경", alias: "(?:BNK\\s?)?경남\\s?은행" },
  { name: "광주은행", initial: "광", alias: "광주\\s?은행" },
  { name: "전북은행", initial: "전", alias: "전북\\s?은행" },
  { name: "제주은행", initial: "제", alias: "제주\\s?은행" },
];
// ── 실제 은행 표 R 끝 ────────────────────────────────────────────────────────────────────────────────

/** 표 R의 표기(카드 고르기 칸 순서 그대로). */
export const REAL_BANK_NAMES: readonly string[] = REAL_BANKS.map((bank) => bank.name);

const REAL_BANK_PATTERNS = REAL_BANKS.map((bank) => ({ name: bank.name, pattern: new RegExp(bank.alias, "gi") }));

/** 표 R의 실제 은행 표기인가(판정표 H · P의 '실제 은행일 때'). */
export function isRealBankName(bankName: string): boolean {
  return REAL_BANK_NAMES.includes(bankName);
}

/**
 * 판정표 S2′ — 한 대사 안에서 표 R이 알아본 실제 은행 언급(끝 위치 · 표기). `bankApp.ts` `spokenAccountFrom`에 넘기는 알아보기 함수다
 * (`bankApp.ts`는 실존 은행명 0을 지키는 파일이라 표를 두지 않고 이 함수를 받는다).
 */
export function realBankMentionsIn(text: string): { end: number; name: string }[] {
  const found: { end: number; name: string }[] = [];
  for (const { name, pattern } of REAL_BANK_PATTERNS) {
    for (const match of text.matchAll(pattern)) found.push({ end: (match.index ?? 0) + match[0].length, name });
  }
  return found;
}

/** 판정표 I — 계좌 동그라미 머리글자(I1 표 R '머리글자' · I2 첫 한글 글자). */
export function bankInitial(bankName: string): string {
  const real = REAL_BANKS.find((bank) => bank.name === bankName);
  if (real) return real.initial;
  return bankName.match(/[가-힣]/)?.[0] ?? bankName.slice(0, 1);
}

/** 판정표 H — 머리 · 앱 이름에 쓰는 내 은행 이름(H1 = 그 이름 · H2 실제 은행 = 빈 문자열). */
export function myBankBrand(bankName: string): string {
  return isRealBankName(bankName) ? "" : bankName;
}

/** 판정표 H 중립 표기(H2 꼬리말 · 인증 시트 앱 이름). */
export const MY_BANK_NEUTRAL_APP_NAME = "모바일뱅킹";

/** 판정표 H — "{은행} 모바일뱅킹"(H1) · "모바일뱅킹"(H2). `suffix`로 "송금" 등. */
export function myBankAppName(bankName: string, suffix: string = MY_BANK_NEUTRAL_APP_NAME): string {
  const brand = myBankBrand(bankName);
  return brand ? `${brand} ${suffix}` : suffix;
}

/** 시작 전 카드에 넣은 거래 은행 · 잔액(둘 다 선택). */
export type CardAccount = { bankName?: string; balance?: number };
/** 통화에서 말한 값(`bankApp.ts` `SpokenAccount`와 같은 모양 — 잎 모듈이라 타입만 다시 둔다). `realBankName` = 표 R이 알아본 표기(A3a). */
export type SpokenAccountValues = { bankName?: string; balance?: number; realBank?: true; realBankName?: string };

/** A5 · S8과 같은 잔액 범위(1만 원 ~ 10억 원). */
export const MY_ACCOUNT_BALANCE_MIN = 10_000;
export const MY_ACCOUNT_BALANCE_MAX = 1_000_000_000;

function validBalance(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value >= MY_ACCOUNT_BALANCE_MIN && value <= MY_ACCOUNT_BALANCE_MAX ? value : undefined;
}

export type MyAccount = {
  /** 첫 계좌 은행 이름(가상 은행 · 표 R 실제 은행 · `NAMELESS_BANK_NAME`). 머리띠에는 그대로 쓰지 않는다 — `myBankAppName`(판정표 H). */
  bankName: string;
  balance: number;
  /** C1 — 이 계좌 하나만 보인다. */
  single: boolean;
};

/** 판정표 A · C. `fixedBankName` · `fixedBalance` = 화면이 종전에 쓰던 값(A4 · A7). */
export function resolveMyAccount(input: {
  card?: CardAccount;
  spoken?: SpokenAccountValues;
  fixedBankName: string;
  fixedBalance: number;
}): MyAccount {
  const { card, spoken, fixedBankName, fixedBalance } = input;
  const cardBank = card?.bankName && isCardBankName(card.bankName) ? card.bankName : undefined; // A1′
  const spokenBank =
    spoken?.bankName && BANKS.includes(spoken.bankName)
      ? spoken.bankName // A2
      : spoken?.realBankName && isRealBankName(spoken.realBankName)
        ? spoken.realBankName // A3a
        : undefined;
  const namelessBank = spoken?.realBank ? NAMELESS_BANK_NAME : undefined; // A3b
  const cardBalance = validBalance(card?.balance); // A5
  const spokenBalance = validBalance(spoken?.balance); // A6
  const bankName = cardBank ?? spokenBank ?? namelessBank ?? fixedBankName; // A4
  const balance = cardBalance ?? spokenBalance ?? fixedBalance; // A7
  const single = [cardBank, spokenBank, namelessBank, cardBalance, spokenBalance].some((value) => value !== undefined); // C1 · C2
  return { bankName, balance, single };
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

// ── ⭐ 2026-11-08(사용자 결정 D1 ①) — 시작 전 '이번 훈련 속 내 정보' 카드의 거래 은행 · 잔액 칸(선택) ─────────────────────────────
// 판정표 K(카드 칸 → 값 · 저장).
// | # | If | Then |
// |---|---|---|
// | K1 | 두 칸 모두 비움 | 카드 값 없음(저장된 값 지움) → 판정표 A2 ~ A7 |
// | K2 | 거래 은행 = 표 R 실제 은행 ∪ 가상 은행 목록 안(고르기만 — 자유 입력 0 · ⭐ 2026-11-09 사용자 결정으로 실제 은행 추가) | 은행 = 그 이름 |
// | K3 | 잔액 = 만 원 단위 숫자(쉼표 · 띄어쓰기 허용) · 1 ~ 100,000(= 1만 원 ~ 10억 원 · 판정표 S8과 같은 범위) | 잔액 = 숫자 × 10,000 |
// | K4 | 잔액이 숫자 아님 · 범위 밖 · 목록 밖 은행 | 진행 안 함 + `CARD_ACCOUNT_COPY.invalid` 1줄 |
// | K5 | 저장 | 이 탭 `sessionStorage`에 세션 id와 함께(서버 · 요청 · 리포트 0 — 사기범에게 알리지 않는다 · `fv-akj5` · `fv-6s5p` 무변경) |
// | K6 | 읽기 | 저장된 세션 id = 지금 세션 id일 때만(다른 세션 값 0) · 저장소를 못 쓰면(사생활 보호 모드 등) 값 없음 |
// | K7 | 보이는 곳 | 카드 입력 블록이 보일 때만(대상 10종 × 고급 × 통화형 × 내가 하는 훈련) — 챌린지 보내기 · 메신저 = 칸 0 |

/** 카드 은행 선택지 — 실제 은행(표 R 순서) 다음 가상 은행(서버 `FICTIONAL_BANK_NAMES`와 같은 목록 · 순서 — `bankApp.ts`와 대조 테스트). */
export const CARD_ACCOUNT_BANK_OPTIONS: readonly string[] = [...REAL_BANK_NAMES, ...BANKS];

/** 고르기 칸의 묶음(`<optgroup>` — 실제 은행 / 가상 은행). ⚠️ 묶음 이름 = 문구 제안. */
export const CARD_ACCOUNT_BANK_GROUPS: readonly { label: string; banks: readonly string[] }[] = [
  { label: "은행", banks: REAL_BANK_NAMES },
  { label: "가상 은행", banks: BANKS },
];

/** K2 · K4 — 카드 은행으로 받는 이름(실제 은행 표 R ∪ 가상 은행). */
function isCardBankName(bankName: string): boolean {
  return CARD_ACCOUNT_BANK_OPTIONS.includes(bankName);
}

export const CARD_ACCOUNT_COPY = {
  bankLabel: "거래 은행",
  bankNone: "선택 안 함",
  balanceLabel: "통장 잔액 (만 원)",
  balancePlaceholder: "예: 1200",
  hint: "거래 은행과 잔액은 통화 중 열리는 은행 · 결제 화면의 내 계좌에만 쓰입니다. 비워 두면 통화에서 말한 값이나 정해진 값으로 보입니다.",
  invalid: "통장 잔액은 만 원 단위 숫자로 1부터 100000까지 넣어 주세요. 예: 1200(= 1,200만 원)",
} as const;

export type CardAccountForm = { bankName: string; balanceManwon: string };
export const EMPTY_CARD_ACCOUNT_FORM: CardAccountForm = { bankName: "", balanceManwon: "" };

export type CardAccountFormResult = { ok: true; card: CardAccount | undefined } | { ok: false };

/** 판정표 K1 ~ K4. */
export function readCardAccountForm(form: CardAccountForm): CardAccountFormResult {
  const card: CardAccount = {};
  if (form.bankName) {
    if (!isCardBankName(form.bankName)) return { ok: false }; // K4
    card.bankName = form.bankName; // K2
  }
  const raw = form.balanceManwon.replace(/[\s,]/g, "");
  if (raw) {
    if (!/^\d{1,6}$/.test(raw)) return { ok: false }; // K4
    const balance = Number(raw) * 10_000;
    if (validBalance(balance) === undefined) return { ok: false }; // K4
    card.balance = balance; // K3
  }
  return { ok: true, card: Object.keys(card).length > 0 ? card : undefined }; // K1
}

const CARD_ACCOUNT_STORAGE_KEY = "fv.cardAccount.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function sessionStore(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** K5 — 세션 id와 함께 저장(값 없음 = 지움). `store`는 시험용. */
export function saveCardAccount(sessionId: string, card: CardAccount | undefined, store: StorageLike | undefined = sessionStore()): void {
  if (!store) return;
  try {
    if (!card || !sessionId) store.removeItem(CARD_ACCOUNT_STORAGE_KEY);
    else store.setItem(CARD_ACCOUNT_STORAGE_KEY, JSON.stringify({ sessionId, ...card }));
  } catch {
    // 저장소를 못 쓰면 카드 값 없이 진행(K6).
  }
}

/** K6 — 지금 세션의 카드 값(없음 · 다른 세션 · 모양 이상 = undefined). */
export function loadCardAccount(sessionId: string, store: StorageLike | undefined = sessionStore()): CardAccount | undefined {
  if (!store || !sessionId) return undefined;
  try {
    const parsed: unknown = JSON.parse(store.getItem(CARD_ACCOUNT_STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return undefined;
    const { sessionId: savedId, bankName, balance } = parsed as Record<string, unknown>;
    if (savedId !== sessionId) return undefined;
    const card: CardAccount = {};
    if (typeof bankName === "string" && isCardBankName(bankName)) card.bankName = bankName;
    if (typeof balance === "number" && validBalance(balance) !== undefined) card.balance = balance;
    return Object.keys(card).length > 0 ? card : undefined;
  } catch {
    return undefined;
  }
}
