// ⭐ 2026-11-09 사용자 결정 BL3 "카드 잔액 있을 때만 맞춤" — 시작 전 카드 '통장 잔액'이 있으면 **잔액을 옮기라는** 문자 · 이체 화면 · 말로 하는
// 요구액을 그 잔액에 맞춘다(순수 함수 — Firestore · LLM import 0). 카드 잔액이 없으면 입력 그대로(카탈로그 · `fv-akj5` · `fv-6s5p` 바이트 무변경).
//
// 판정표 BL3(앞 행이 먼저).
// | # | If | Then |
// |---|---|---|
// | F1 | 카드 잔액 없음(행 0 · 형식 밖) | 종전 금액 그대로 |
// | F2 | 잔액형 금액(아래 `BALANCE_FIT_SOURCE_AMOUNTS` — 내 돈을 보호 · 안전 · 이관 계좌로 옮기라는 금액) ∧ 잔액 ≤ 1회 이체 한도 1,000만 원 | 맞춘 금액 = 잔액 전부 |
// | F3 | 잔액형 금액 ∧ 잔액 > 1,000만 원 | 맞춘 금액 = 1,000만 원(1회 한도 — 이체 화면 W2와 같은 값 · 넘기면 화면이 막는다) |
// | F4 | 고정형 금액(수수료 7.8만 · 9.9만 · 대환 상환 185만 · 공탁금 500만 · 대출금 보관(입금된 대출금) · 협박형 300만 · 50만) | 종전 그대로(잔액과 무관한 값) |
// | F5 | 반올림 | 없음 — 카드 잔액은 만 원 단위(클라 K3 · 서버 BL)라 맞춘 금액도 만 원 단위다 |
// 적용 지점(같은 함수 · 두 벌 금지): 문자 본문 '금액:' 줄 + 문서 `transferAmount`(`inCallSms/buildDoc.ts`) · 사기범 프롬프트 속 같은 금액 표기
// (`roleplay/promptAssembly.ts` 조립 끝 — 수법 · 단계 문면의 "980만 원" 등). 리포트 '적은 금액 비교'(N1)와 이체 W3는 이 두 원천을 읽으므로 따라온다.
// 잔액형 표(카탈로그 문자 · 금액) — 새 잔액형 문자를 넣으면 여기에도 넣는다(`personaCardAccount.test.ts` BF 행이 카탈로그와 대조한다):
// | smsId | 종전 금액 |
// |---|---|
// | bank-protect-account(은행 사칭 보호계좌) | 4,120,000원 |
// | institution-asset-safe-account · card-safe-account(안전계좌) | 9,800,000원 |
// | card-relief-account(피해금 이관) | 2,340,000원 |
// | courier-safe-account(국가 안전계좌) | 7,600,000원 |
import { personaBalanceText, personaBalanceWon } from "../scenarios/personaCardCatalog";
import type { PersonaCardItem } from "../shared/types";

// ⭐ 2026-11-23 사용자 결정 2b(*"참가자가 말한 잔액에 맞춰 요구액과 문자 금액을 바꾼다"*) — 판정표 BL3′(맞춤 잔액의 원천 · 앞 행이 먼저).
// | # | If | Then |
// |---|---|---|
// | B1 | 카드 잔액 있음 | 카드 잔액(종전 BL3 — 프롬프트 · 문자 둘 다) |
// | B2 | B1 아님 ∧ 문자 발송 요청에 말한 잔액(`spokenBalanceWon` — 화면 판정표 S4 ~ S9 · S14 · 정수 1만 ~ 10억 원 · 만 원 단위 내림) | 말한 잔액 → 위 F2 · F3으로 **문자**(본문 '금액:' 줄 · `transferAmount`) 금액만 맞춘다 |
// | B3 | B2로 문자 금액이 바뀜 | 도착 지시 끝에 새 금액 1줄(`spokenFitAnnounceLine` — 실시간 시스템 프롬프트는 통화 중에 바꿀 수 없어 단계 문면의 옛 금액을 이 줄이 덮는다) |
// | B4 | 둘 다 없음 · 말한 값이 범위 밖 · '돈 없다'(화면 Z3 — 클라가 싣지 않는다) | 종전 금액 그대로(화면은 판정표 Z3 · Z4로 잔액 부족) |
// | B5 | 고정형 금액(F4) | 종전 그대로 |
// ⚠️ 시스템 프롬프트(`fitPromptAmounts`)는 B1만 — 말한 잔액은 세션 시작 뒤에 생기므로 문자 도착 지시(B3)로만 알린다(바이트 고정 변형 해시 무변경).

/** B2 — 요청의 말한 잔액(원). 정수 · 1만 ~ 10억 원 밖 = undefined · 만 원 단위로 내린다. */
export function spokenBalanceWonFrom(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 10_000 || raw > 1_000_000_000) return undefined;
  return Math.floor(raw / 10_000) * 10_000;
}

/** B3 — 말한 잔액으로 바뀐 문자 금액을 알리는 1줄. */
export function spokenFitAnnounceLine(balanceWon: number): string {
  return `(문자에 적힌 금액은 상대가 말한 잔액에 맞춘 ${personaBalanceText(fittedDemandWon(balanceWon))}이다. 앞서 다른 금액을 말했더라도 이제부터 금액은 이것만 말하라.)`;
}

export const BALANCE_FIT_SOURCE_AMOUNTS: readonly number[] = [4_120_000, 9_800_000, 2_340_000, 7_600_000];
/** 1회 이체 한도(클라 `amountInput.ts` · 판정표 W2와 같은 값). */
export const TRANSFER_LIMIT_PER_ONCE = 10_000_000;

/** 카드 잔액(원) — 행 없음 · 형식 밖 = undefined(F1). */
export function cardBalanceWonFrom(items: readonly PersonaCardItem[] | undefined): number | undefined {
  const value = items?.find((item) => item.key === "balance")?.value;
  return value === undefined ? undefined : personaBalanceWon(value);
}

/** F2 · F3 — 맞춘 금액(원). */
export function fittedDemandWon(balanceWon: number): number {
  return Math.min(balanceWon, TRANSFER_LIMIT_PER_ONCE);
}

const comma = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** "9,800,000원" 꼴. */
const wonText = (won: number) => `${comma(won)}원`;
/** "980만 원" 꼴(만 원 단위 금액만 — 잔액형 표 전부 만 원 단위). */
const manwonText = (won: number) => personaBalanceText(won);

/** 문자 본문의 '금액:' 줄이 잔액형 금액이면 맞춘 금액으로(F1 · F4 = 그대로). */
export function fitSmsBodyAmount(body: string, balanceWon: number | undefined): string {
  if (balanceWon === undefined) return body;
  const to = fittedDemandWon(balanceWon);
  return body.replace(/^금액: ([\d,]+)원$/m, (line, digits: string) =>
    BALANCE_FIT_SOURCE_AMOUNTS.includes(Number(digits.replace(/,/g, ""))) ? `금액: ${wonText(to)}` : line,
  );
}

/** 프롬프트 속 잔액형 금액 표기("980만 원" · "9,800,000원")를 맞춘 금액으로(F1 = 그대로). */
export function fitPromptAmounts(text: string, balanceWon: number | undefined): string {
  if (balanceWon === undefined) return text;
  const to = fittedDemandWon(balanceWon);
  let out = text;
  for (const from of BALANCE_FIT_SOURCE_AMOUNTS) {
    const manwon = String(from / 10_000);
    out = out.replace(new RegExp(`(?<![\\d,])${manwon}만\\s?원`, "g"), manwonText(to));
    out = out.replace(new RegExp(`(?<![\\d,])${comma(from)}원`, "g"), wonText(to));
  }
  return out;
}
