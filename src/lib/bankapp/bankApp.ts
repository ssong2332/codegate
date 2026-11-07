// ⭐ BA-1(2026-11-01 · docs/research/in-service-bank-app-design-2026-11-01.md §2 · 사용자 결정 BA0~BA12 "권고대로") — 훈련용 홈 화면 ·
// 가상 "내 은행 앱"의 순수 로직(잎 모듈 · 렌더 하네스가 `@/` 별칭을 풀지 못하므로 상대 경로만 import한다).
//
// 왜: 현실에서는 사이트가 돈을 옮기지 못한다. 피해자는 **자기 은행(송금) 앱으로** 받는 분 이름을 확인하고 인증한 뒤 보낸다.
// ⭐ 간소화안(2026-11-01 · 사용자 승인 "간소화안으로") — 훈련용 홈 · 탐색 막대 · 앱 안 클립보드 · 잠금 해제 · 내 계좌 화면을 뺐다
// (실기기 확인: "복사 -> 은행앱 -> 받는 분 이름 확인으로 가는 절차가 복잡" · "실제로 계좌번호가 복사되지도 않네" · "뒤로가기랑 최근 앱 보기 버튼은 사용도 불가능").
// 실기 근거: 삼성 메시지는 문자 속 계좌번호를 알아보고 '송금' 버튼을 띄워 송금 앱(토스 · 하나은행)으로 넘긴다(삼성 뉴스룸 2019 · 삼성 커뮤니티 2025 답변).
// iOS 문자 앱의 같은 기능은 공개 자료에서 확인하지 못했다(추정 — 같은 동작으로 둔다).
//
// | 항목 | 정책 |
// |---|---|
// | 켜는 조건 | 진단 플래그 `bankapp=1`(`debugFlags.ts` 저장 키) — 플래그가 없으면 계좌 누름 · 은행 앱 0(종전 링크 이체 화면 그대로) |
// | 여는 길 | 통화 중 문자 속 계좌번호 한 번 누름 → '송금' · 메신저 송금 칩 → 받는 계좌가 채워진 송금 화면 |
// | 서버 | 송금 완료(인증 버튼) = 종전 이체 화면 제출과 **같은 기록 경로**(통화 `landing_submitted` · 메신저 `recordMockScreen(…, "submitted")`) |
// | 입력값 | 금액은 화면 state를 벗어나지 않는다(G138 — 네트워크 · 저장소 0). N1 — 완료 콜백은 요구액 대비 **비교 결과 하나**만 싣는다(아래 판정표 C) |
// | 비밀번호 | 2026-11-07 사용자 결정 (a)(BA3 갱신) — 입력 칸(<input>) 0 · 인증은 생체 인증 시트(`BankAuthSheet` · 지문 센서 누름 · 얼굴 자동 스캔) · 대체 수단 간편 비밀번호 = 매번 섞는 숫자 **버튼** 키패드 · 누른 값은 저장하지 않고 개수만 센다(6번 = 통과) · 네트워크 · 저장소로 나가는 값 0 |
// | 출금 계좌 | 가상 계좌 3개 중 고른다(`withdrawAccounts.ts` — 첫 계좌 잔액 = `fictionalBalanceFor` · 잔액 · 1일 한도 판정표 W) |
// | 클립보드 | 쓰지 않는다(기기 클립보드 API 0 · 앱 안 복사 0). 인증번호는 여전히 복사할 수 없다(AC-061 그대로) |
// | 은행 이름 | 가상 은행명만(서버 `functions/src/shared/fictionalBank.ts` `FICTIONAL_BANK_NAMES`와 같은 목록 — 드리프트 테스트) · 실존 은행명 0 |
// ⚠️ 이 파일은 값을 import하지 않는다(테스트 러너가 확장자 없는 상대 import를 풀지 못한다). 금액 형식 · 1회 한도 판정은 화면이
// `@/lib/landing/amountInput`(`amountError` · `transferLimitError` · `amountHint`)으로 먼저 하고, 잔액 판정만 여기 `balanceError`가 한다.

/** 진단 플래그 키(`debugFlags.ts` `PERSISTED_DEBUG_FLAGS`에 있다). */
export const BANK_APP_FLAG = "bankapp";

/** 주소 쿼리(저장 값을 얹은 `readDebugFlagSearch()` 결과)에서 은행 앱이 켜졌는가. 값 `1`만 켠다. */
export function isBankAppEnabled(search: string): boolean {
  try {
    return new URLSearchParams(search).get(BANK_APP_FLAG) === "1";
  } catch {
    return false;
  }
}

/** 서버 `FICTIONAL_BANK_NAMES`와 같은 목록·순서(§81.1 대조 통과 — `bankApp.test.ts`가 서버 파일과 대조한다). */
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

/** FNV-1a 32비트(서버 `fictionalBank.ts` `hash`와 같은 식 — 결정적 · 의존성 0). */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * 참가자의 "내 은행"(세션마다 하나 · 결정적). 사기범 계좌의 은행(문자 속 은행명)과 **다른** 이름을 고른다 — 현실에서도 피해자의 거래 은행과
 * 대포통장 은행은 대개 다르고, 같으면 "내 은행 앱으로 내 은행에 보내는" 화면이 되어 받는 분 확인이 흐려진다.
 */
export function myBankNameFor(seed: string, avoid?: string): string {
  const start = hash(`my-bank:${seed}`) % FICTIONAL_BANK_NAMES.length;
  for (let i = 0; i < FICTIONAL_BANK_NAMES.length; i += 1) {
    const name = FICTIONAL_BANK_NAMES[(start + i) % FICTIONAL_BANK_NAMES.length]!;
    if (name !== avoid) return name;
  }
  return FICTIONAL_BANK_NAMES[start]!;
}

/** BA4 — 세션별 고정 가상 잔액(1,000만 ~ 3,000만 원 · 1만 원 단위 · 결정적). 서버로 가지 않고 사기범도 모른다. 출금 계좌 목록의 첫 계좌 잔액이다. */
export function fictionalBalanceFor(seed: string): number {
  const steps = (3000 - 1000) + 1; // 만 원 단위 칸 수
  return (1000 + (hash(`balance:${seed}`) % steps)) * 10_000;
}

/** 금액(숫자 · 쉼표만 남긴 값)을 정수로. 판정 불가면 undefined. */
function amountValue(raw: string): bigint | undefined {
  const compact = raw.replace(/[\s,]/g, "");
  if (!/^\d+$/.test(compact)) return undefined;
  const value = BigInt(compact);
  return value > BigInt(0) ? value : undefined;
}

/** 출금 가능 금액(잔액) 초과 안내. 통과 · 판정 불가(형식 오류는 `amountError`가 먼저 막는다)면 undefined. */
export function balanceError(raw: string, balance: number): string | undefined {
  const value = amountValue(raw);
  return value !== undefined && value > BigInt(balance) ? "출금 가능 금액보다 많습니다." : undefined;
}

/** "1,234,000원" 표기. 판정 불가면 빈 문자열. */
export function wonText(raw: string): string {
  const value = amountValue(raw);
  return value !== undefined ? `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원` : "";
}

/** 잔액 표기("12,340,000원"). */
export function balanceText(balance: number): string {
  return `${String(balance).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

/** 송금 화면이 받는 계좌(서버 문자 문서 · 메신저 칩의 구조화 필드 그대로 — 참가자 입력 아님). */
export type TransferTarget = {
  bankName: string;
  accountNumber: string;
  /** 서버가 실은 예금주. 부재 = 아래 표에서 결정적으로 고른 가상 이름(은행 앱은 예금주 조회 결과를 늘 보여 준다). */
  holder?: string;
  /** 문자에 적힌 금액("2,340,000"처럼 숫자 · 쉼표). 부재 = 금액 칸 빈 값. */
  amount?: string;
  /**
   * N1 — 사기범이 요구한 금액(비교 기준 · 금액 칸은 채우지 않는다). 메신저 칩은 대화에서 정해진 금액이라 미리 채우지 않고 비교에만 쓴다.
   * 부재 = `amount`를 기준으로 쓴다(문자 금액 줄).
   */
  requestedAmount?: string;
};

// ── N1(실기기 신고 2026-11-01 — 요구액 200만 원에 200원을 보내도 통과) — 요구액 대비 비교 ─────────────────────────────────────────
// 은행 화면은 현실처럼 아무 금액이나 보낼 수 있다(막지 않는다). 대신 제출 때 **비교 결과 하나**("less" · "equal" · "more")만 호출부로 올려
// 서버가 사기범에게 "적게 왔다"를 알린다. ⛔ 금액 값은 콜백 · 네트워크 · 저장소로 나가지 않는다(G138 — 비교는 이 모듈 안에서 끝난다).
// 같은 계좌로 나눠 보낸 금액은 합계로 비교한다(모자란 금액을 마저 보내면 "같음"이 된다) — 합계는 이 모듈의 메모리 표에만 있다(탭을 닫으면 사라진다).
// | # | If | Then |
// |---|---|---|
// | C1 | 요구액(`requestedAmount` ?? `amount`)을 모른다 · 보낸 금액 판정 불가 | 없음(비교 결과를 보내지 않는다) |
// | C2 | 합계 < 요구액 | `less` |
// | C3 | 합계 = 요구액 | `equal` |
// | C4 | 합계 > 요구액 | `more` |
export type AmountComparison = "less" | "equal" | "more";

const sentTotals = new Map<string, bigint>();

/** 이번 송금을 합계에 더하고 요구액과 비교한다(위 표). `ledgerKey` = 세션 id(다른 세션의 같은 계좌와 섞이지 않게). */
export function recordTransferAndCompare(
  ledgerKey: string,
  target: Pick<TransferTarget, "accountNumber" | "amount" | "requestedAmount">,
  raw: string,
): AmountComparison | undefined {
  const sent = amountValue(raw);
  if (sent === undefined) return undefined; // C1
  const key = `${ledgerKey}:${target.accountNumber.replace(/\D/g, "")}`;
  const total = (sentTotals.get(key) ?? BigInt(0)) + sent;
  sentTotals.set(key, total);
  const requested = amountValue(target.requestedAmount ?? target.amount ?? "");
  if (requested === undefined) return undefined; // C1
  return total < requested ? "less" : total === requested ? "equal" : "more"; // C2 · C3 · C4
}

// ── A4(실기기 신고 2026-11-01 · 자녀 사칭 — 칩에 요구액이 없어 비교가 빠졌다) — 대화방 요구액 ──────────────────────────────────────
// 서버는 칩을 붙인 순간까지의 대사로 요구액을 싣는다(`functions/src/roleplay/linkMarker.ts` `demandAmountFrom`). 사기범이 칩 **뒤에** 금액을 말하면 칩에는 없다.
// ⇒ 화면을 여는 순간 대화방에 보이는 사기범 메시지 중 **가장 최근** 금액을 요구액으로 쓰고, 없으면 칩 값. 금액 표기 규칙은 서버와 같다(드리프트 테스트).
const AMOUNT_UNITS: Readonly<Record<string, number>> = { 억: 100_000_000, 천만: 10_000_000, 백만: 1_000_000, 십만: 100_000, 만: 10_000, 천: 1_000 };
const AMOUNT_PATTERN = /((?:\d[\d,]*\s*(?:억|천만|백만|십만|만|천)\s*)*\d[\d,]*\s*(?:억|천만|백만|십만|만|천)?)\s*원/g;
const AMOUNT_TOKEN = /(\d[\d,]*)\s*(억|천만|백만|십만|만|천)?/g;

// ⭐ PR-A(2026-11-07 · 기관 사칭 고급 · 택배 통관 고급 — 적은 금액이 통과) — 통화(Live) 전사는 금액을 한글 수사로도 적는다(실측 *"삼백만 원"* ·
// *"구만 구천 원"* · *"5백만 원"* — `docs/research/p2-live-probe-2026-11-01.md:32`). 위 패턴은 숫자만 읽으므로 먼저 숫자로 바꾼다.
// 판정표(`docs/research/institution-advanced-loan-design-2026-11-07.md` §1.1):
// | # | If | Then |
// |---|---|---|
// | H1 | "원" 바로 앞 낱말 묶음(앞이 한글 · 숫자에 붙어 있지 않다)에 한글 수사가 있다 ∧ 단위(십 · 백 · 천 · 만 · 억)나 숫자가 있다 | 숫자로 바꾼다("구백팔십만 원" → "9800000 원") |
// | H2 | 한글 수사만 있고 단위 · 숫자가 없다("사원" · "구원") | 그대로(금액 아님) |
// | H3 | 숫자뿐이다 | 그대로(위 패턴이 읽는다) |
// ⚠️ 서버 `functions/src/roleplay/linkMarker.ts`에 같은 줄이 있다(드리프트 테스트 — 아래 두 상수와 두 함수의 원문이 같아야 한다).
const HANGUL_NUMERALS: Readonly<Record<string, number>> = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
const HANGUL_AMOUNT_PATTERN = /(^|[^가-힣\d,])((?:[\d,]+|[일이삼사오육칠팔구십백천만억])(?:\s?(?:[\d,]+|[일이삼사오육칠팔구십백천만억]))*)(?=\s*원)/g;

function hangulAmountValue(phrase: string): number | undefined {
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const [token] of phrase.replace(/\s/g, "").matchAll(/[\d,]+|[^\d,]/g)) {
    if (/^[\d,]+$/.test(token)) digit = Number(token.replace(/,/g, ""));
    else if (token in HANGUL_NUMERALS) digit = HANGUL_NUMERALS[token]!;
    else if (token === "십" || token === "백" || token === "천") {
      section += (digit || 1) * (token === "십" ? 10 : token === "백" ? 100 : 1_000);
      digit = 0;
    } else {
      total += (section + digit || 1) * (token === "억" ? 100_000_000 : 10_000);
      section = 0;
      digit = 0;
    }
  }
  const value = total + section + digit;
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** 한글 수사 금액을 숫자로 바꾼 대사(판정표 H1 ~ H3 — 클라 `src/lib/bankapp/bankApp.ts`). */
export function hangulAmountsToDigits(text: string): string {
  return text.replace(HANGUL_AMOUNT_PATTERN, (whole: string, before: string, phrase: string) => {
    if (!/[일이삼사오육칠팔구십백천만억]/.test(phrase) || !/[\d십백천만억]/.test(phrase)) return whole;
    const value = hangulAmountValue(phrase);
    return value === undefined ? whole : `${before}${value}`;
  });
}

/** 한 대사의 마지막 원 단위 금액("2,000,000"). 없으면 undefined. 한글 수사도 읽는다(PR-A). */
export function lastAmountIn(text: string): string | undefined {
  let last: number | undefined;
  for (const match of hangulAmountsToDigits(text).matchAll(AMOUNT_PATTERN)) {
    let total = 0;
    for (const token of match[1]!.matchAll(AMOUNT_TOKEN)) {
      total += Number(token[1]!.replace(/,/g, "")) * (token[2] ? AMOUNT_UNITS[token[2]]! : 1);
    }
    if (Number.isSafeInteger(total) && total > 0) last = total;
  }
  return last === undefined ? undefined : last.toLocaleString("en-US");
}

// ⭐ 2026-11-07(Edge 재시험 2 — 국세청 환급 고급: 사기범이 *"미수령 환급금이 오만 원 정도 조회"* 라고 말한 뒤 문자 수수료 99,000원을 그대로 보냈는데
// "요구받은 금액보다 많이 보냈습니다"로 나왔다) — 사기범이 **주겠다는** 돈(환급금 · 지원금 · 조회 금액)은 요구액이 아니다. 금액마다 판정한다(대사 안 뒤 금액부터):
// | # | If | Then |
// |---|---|---|
// | D1 | 같은 문장 안 금액 앞쪽 가장 가까운 열쇠말 = 주는 돈 말(`DEMAND_GIVE_WORDS`) | 요구액 아님 — 건너뜀 |
// | D2 | 앞쪽 가장 가까운 열쇠말 = 요구 말(`DEMAND_ASK_WORDS`) | 요구액 |
// | D3 | 앞쪽에 열쇠말 없음 | 뒤쪽(같은 문장) 가장 가까운 열쇠말로 D1 · D2 |
// | D4 | 앞뒤 모두 없음 | 요구액(종전 — "300만 원 필요해") |
// | D5 | 모든 대사에 요구액 없음 | 없음 → 호출부가 문자 금액(미리 채운 값)을 쓴다(종전 R2 · M3) |
// ⚠️ 서버 `functions/src/roleplay/linkMarker.ts`에 같은 줄이 있다(드리프트 테스트 — 두 상수와 `lastDemandAmountIn` 원문이 같아야 한다).
const DEMAND_GIVE_WORDS = /환급|지원금|보상금|지급|받으실|받으시|받을|수령|돌려\s?드|조회|입금해\s?드|입금(?:됩|되|돼)/g;
const DEMAND_ASK_WORDS = /수수료|보내|이체|송금|옮기|옮겨|납부|결제|선입금|입금하|입금해\s?주|보증금|공탁금|예치금|상환/g;

/** 한 대사에서 요구액으로 볼 마지막 금액(판정표 D1 ~ D4). 없으면 undefined. */
function lastDemandAmountIn(text: string): string | undefined {
  const converted = hangulAmountsToDigits(text);
  const amounts = [...converted.matchAll(AMOUNT_PATTERN)];
  for (const match of amounts.reverse()) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const sentenceStart = Math.max(...[".", "?", "!", "\n"].map((mark) => converted.lastIndexOf(mark, start - 1))) + 1;
    const after = converted.slice(end);
    const stop = after.search(/[.?!\n]/);
    const before = converted.slice(sentenceStart, start);
    const following = stop < 0 ? after : after.slice(0, stop);
    const lastEnd = (re: RegExp) => Math.max(-1, ...[...before.matchAll(re)].map((m) => (m.index ?? 0) + m[0].length));
    const firstAt = (re: RegExp) => Math.min(Infinity, ...[...following.matchAll(re)].map((m) => m.index ?? 0));
    const give = lastEnd(DEMAND_GIVE_WORDS);
    const ask = lastEnd(DEMAND_ASK_WORDS);
    const kind = give >= 0 || ask >= 0 ? (give > ask ? "give" : "ask") : firstAt(DEMAND_GIVE_WORDS) < firstAt(DEMAND_ASK_WORDS) ? "give" : "ask";
    if (kind === "give") continue; // D1 · D3
    let total = 0;
    for (const token of match[1]!.matchAll(AMOUNT_TOKEN)) {
      total += Number(token[1]!.replace(/,/g, "")) * (token[2] ? AMOUNT_UNITS[token[2]]! : 1);
    }
    if (Number.isSafeInteger(total) && total > 0) return total.toLocaleString("en-US"); // D2 · D4
  }
  return undefined;
}

/** 사기범 대사(오래된 순) 중 가장 최근 요구액(판정표 D1 ~ D5 — 주겠다는 돈은 건너뜀). 없으면 undefined. */
export function latestDemandAmount(scammerTexts: readonly string[]): string | undefined {
  for (const text of [...scammerTexts].reverse()) {
    const amount = lastDemandAmountIn(text);
    if (amount) return amount;
  }
  return undefined;
}

/** 완료 화면 시각("오후 3:07" — 기기 시계 · 화면에만). */
export function transferTimeText(date: Date): string {
  const hours = date.getHours();
  return `${hours < 12 ? "오전" : "오후"} ${hours % 12 === 0 ? 12 : hours % 12}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * 받는 분 이름(예금주 조회 결과). 서버가 예금주를 실었으면 그 값이다.
 * 그 밖은 계좌 숫자로 결정적으로 고른 **가상 개인 이름**이다(대포통장은 개인 명의 — 설계 §3.2 W1). 실존 인물 아님.
 */
export const FALLBACK_HOLDER_NAMES: readonly string[] = ["김민서", "이도윤", "박서연", "최준호", "정하은", "윤지성"];

export function recipientHolderFor(target: Pick<TransferTarget, "accountNumber" | "holder">): string {
  if (target.holder) return target.holder;
  const digits = target.accountNumber.replace(/\D/g, "");
  return FALLBACK_HOLDER_NAMES[hash(`holder:${digits}`) % FALLBACK_HOLDER_NAMES.length]!;
}

/**
 * 구조화 필드가 없는 옛 계좌 문자(§51 즉시형 등 — 서버가 `accountHolder` · `transferAmount`를 P2 이체 화면 문자에만 싣는다)의 표시용 보정.
 * 서버 문구의 고정 줄 "예금주: {이름}" · "금액: {숫자}원"만 읽는다(문자를 분류하지 않는다 — 화면에 보일 값이 문자와 어긋나지 않게 할 뿐).
 * 실기 확인(2026-11-01 로컬): 피해금 이관 문자 "예금주: 오현수"인데 송금 화면이 가상 이름을 보였다.
 */
export function holderFromSmsBody(body: string): string | undefined {
  return /^예금주:\s*(\S+)\s*$/m.exec(body)?.[1];
}

export function amountFromSmsBody(body: string): string | undefined {
  return /^금액:\s*([\d,]+)원\s*$/m.exec(body)?.[1];
}

/**
 * 화면 단계(간소화안). 받는 분 확인 → 금액(출금 계좌 선택) → 인증(보낼 내용 요약 → 생체 인증 시트) → 완료.
 * | # | If (지금 · 행동) | Then |
 * |---|---|---|
 * | S1 | recipient · 다음 | amount |
 * | S2 | amount · 다음(금액 통과) | auth |
 * | S3 | auth · 인증 | done (= 송금 완료 기록 1회) |
 * | S4 | amount · 뒤로 | recipient |
 * | S5 | auth · 취소 | amount(값 유지) |
 * | S6 | 표에 없는 조합 | 그대로 |
 * 앱 닫기(통화 띠 · 닫기 · 완료 확인 · Esc)는 단계가 아니라 호출부 `onClose`다.
 */
export type BankAppStage = "recipient" | "amount" | "auth" | "done";

export type BankAppAction = "next" | "authenticate" | "cancel" | "back";

const NEXT: Partial<Record<BankAppStage, Partial<Record<BankAppAction, BankAppStage>>>> = {
  recipient: { next: "amount" },
  amount: { next: "auth", back: "recipient" },
  auth: { authenticate: "done", cancel: "amount" },
};

/** 위 표(S1~S6). */
export function nextBankAppStage(stage: BankAppStage, action: BankAppAction): BankAppStage {
  return NEXT[stage]?.[action] ?? stage;
}

/** 화면 문구(한 곳에서 관리 — 테스트가 실존 은행명 · 비밀번호 요구 문구를 스캔한다). */
export const BANK_APP_COPY = {
  callPill: "눌러서 통화로 돌아가기",
  close: "닫기",
  /** 문자 속 계좌번호를 누르면 뜨는 메뉴(삼성 메시지 '송금' 버튼 근사). */
  sendToAccount: "송금",
  recipientTitle: "받는 분이 맞는지 확인해 주세요",
  recipientNote: "받는 분 이름이 생각한 사람과 다르면 보내지 마세요.",
  amountTitle: "얼마를 보낼까요?",
  next: "다음",
  confirmCaution: "보이스피싱 주의 · 모르는 사람이 전화나 문자로 이체를 요구하면 보내기 전에 멈추고 확인하세요.",
  cancel: "취소",
  /** 확인 화면 보내기 = 생체 인증 시트를 연다(실제 앱처럼 버튼은 '보내기' · 인증은 시트가 한다). */
  authButton: "보내기",
  doneButton: "확인",
} as const;
