// W1(2026-11-27 · docs/research/realism-criteria-2026-11-27.md 판정표 M1 · M2 · M3) — 문자 금액 ↔ 지시문 금액 일치.
// 문제: 지시문에 금액이 없으면 모델이 금액을 지어내 문자(카탈로그 고정값)와 어긋난다("500만 원 달라더니 문자는 50만 원").
// 해결: 카탈로그 문자 본문의 `금액:` 줄이 원천이다. 그 값을 사기범 말투 + 숫자로 지시문에 싣고(M1), 문자 도착 전에는 다른 숫자를
//       말하지 않게 하며(M2), 한 번 말한 금액은 바꾸지 않게 한다(T6). 값을 손으로 옮겨 적지 않으므로 어긋날 수 없다.
//
// | # | If | Then |
// |---|---|---|
// | AR1 | 변형이 선언한 문자(현재 레그) 본문에 `금액: N원` 줄이 있다 | 흐름 블록에 요구 금액 줄(말투 + 숫자 · M2 · T6)을 싣는다 |
// | AR2 | 그런 문자가 없다 | 아무것도 싣지 않는다(종전 문면) |
// | AR3 | 변형이 바이트 고정이다(`AMOUNT_RULE_EXEMPT`) | 싣지 않는다 — 이미 지시문에 같은 금액이 있다(시험이 고정) |

import { IN_CALL_SMS } from "./inCallSms";

/** #192 바이트 고정 변형 — 조립 산출물 해시 단언(`smsGate.test.ts` AFTER_R3)이 있어 문면을 바꾸지 않는다. fv-akj5는 문자 선언 0이라 해당 없음. */
export const AMOUNT_RULE_EXEMPT: ReadonlySet<string> = new Set(["fv-6s5p"]);

/** 요구 금액 줄의 표식 — 시험(M2)이 이 글자가 흐름에 실렸는지 본다. */
export const AMOUNT_RULE_MARK = "[요구 금액]";

const DIGIT = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

/** 1 ~ 9999 → 한글 수("백오십", "구천"). 십 · 백 · 천 앞의 '일'은 말하지 않는다. */
function koreanUnder10000(n: number): string {
  let out = "";
  for (const [unit, name] of [[1000, "천"], [100, "백"], [10, "십"]] as const) {
    const d = Math.floor(n / unit) % 10;
    if (d > 0) out += (d === 1 ? "" : DIGIT[d]) + name;
  }
  return out + DIGIT[n % 10];
}

/** 원 단위 금액 → 사기범 말투("오십만 원" · "구만 구천 원"). 1억 미만 · 천 원 단위만 쓴다(카탈로그 값이 전부 그렇다). */
export function spokenWon(won: number): string {
  if (!Number.isInteger(won) || won <= 0 || won >= 1e8 || won % 1000 !== 0) throw new Error(`spokenWon: 지원하지 않는 금액 ${won}`);
  const man = Math.floor(won / 1e4);
  const rest = won % 1e4;
  const parts: string[] = [];
  if (man > 0) parts.push(`${koreanUnder10000(man)}만`);
  if (rest > 0) parts.push(koreanUnder10000(rest));
  return `${parts.join(" ")} 원`;
}

/** 원 단위 금액 → 숫자 표기("50만 원" · "9만 9천 원"). 시험의 파서(`amountsInText`)가 같은 꼴을 읽는다. */
export function digitsWon(won: number): string {
  const man = Math.floor(won / 1e4);
  const cheon = (won % 1e4) / 1000;
  return `${man > 0 ? `${man}만` : ""}${man > 0 && cheon > 0 ? " " : ""}${cheon > 0 ? `${cheon}천` : ""} 원`;
}

/** 문자 본문의 `금액: 1,850,000원` 줄 → 숫자. 줄이 없으면 undefined. */
export function smsBodyAmount(body: string): number | undefined {
  const m = body.match(/금액:\s*([\d,]+)원/);
  return m ? Number(m[1].replace(/,/g, "")) : undefined;
}

type SmsDecl = { smsId: string; leg?: number };

/** 변형이 선언한 문자 중 금액 줄이 있는 것의 금액(중복 제거). `legIndex`가 있으면 그 레그 문자(+ 레그 구분 없는 문자)만. */
export function declaredSmsAmounts(variant: { scenarioId: string; sms: readonly SmsDecl[] }, legIndex?: number): number[] {
  const out = new Set<number>();
  for (const decl of variant.sms) {
    if (legIndex !== undefined && decl.leg !== undefined && decl.leg !== legIndex) continue;
    const item = (IN_CALL_SMS[variant.scenarioId] ?? []).find((i) => i.smsId === decl.smsId);
    const amount = item ? smsBodyAmount(item.body) : undefined;
    if (amount !== undefined) out.add(amount);
  }
  return [...out];
}

/** 지시문에 싣는 요구 금액 줄(M1 · M2 · T6). 해당 없으면 undefined. */
export function amountRuleLine(
  variant: { variantId: string; scenarioId: string; sms: readonly SmsDecl[] },
  legIndex?: number,
): string | undefined {
  if (AMOUNT_RULE_EXEMPT.has(variant.variantId)) return undefined;
  const amounts = declaredSmsAmounts(variant, legIndex);
  if (amounts.length === 0) return undefined;
  const said = amounts.map((a) => `${spokenWon(a)}(${digitsWon(a)})`).join(" 또는 ");
  return `${AMOUNT_RULE_MARK} 문자로 보내는 계좌 안내에 적힌 금액은 ${said}이다. 돈 얘기를 할 때는 이 금액만 말한다. 문자가 도착하기 전에는 이 금액 말고 다른 금액 · 숫자를 말하지 않고, 한 번 말한 금액은 상대가 얼마를 갖고 있다고 하든 바꾸지 않는다.`;
}
