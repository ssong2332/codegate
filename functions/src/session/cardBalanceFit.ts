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
