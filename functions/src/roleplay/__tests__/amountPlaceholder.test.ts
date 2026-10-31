// F4(2026-10-31 · P0 실 키 실측 납치 고급) — 사기범이 "지금 당장 얼마 준비해서"라고 금액 자리를 그대로 읽었다.
// 원인: 수법 인용구 5곳의 금액 자리가 "얼마"였다(§129 D5는 "얼마만"만 지웠다).
// | # | 규칙 | 판정 |
// |---|---|---|
// | A1 | 인용구('…') 안의 "얼마"는 묻는 말("얼마 있으신지")만 허용 | 그 밖은 실패 |
// | A2 | 통화 중 계좌 문자에 금액이 있는 시나리오는 인용구 금액 = 문자 금액 | 다르면 실패(말과 문자가 갈리면 현실과 다르다) |
// | A3 | 납치 협박 금액 = 사례 C17(100만 원 요구) | 다르면 실패 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { IN_CALL_SMS } from "../../scenarios/inCallSms";

const QUOTE = /'([^']*)'/g;

function quotesOf(id: string): string[] {
  const prompt = SCENARIO_PROMPTS[id];
  assert.ok(prompt, id);
  return [prompt.personaPrompt, ...prompt.weakenedTactics].flatMap((text) => [...text.matchAll(QUOTE)].map((m) => m[1]));
}

test("[F4 A1] 수법 인용구에 금액 자리 \"얼마\"가 없다(묻는 말은 허용)", () => {
  for (const id of Object.keys(SCENARIO_PROMPTS)) {
    for (const quote of quotesOf(id)) {
      assert.ok(!/얼마(?!\s*있)/.test(quote), `${id}: ${quote}`);
    }
  }
});

test("[F4 A2] 인용구 금액이 같은 시나리오 계좌 문자의 금액과 같다", () => {
  const cases: Array<[string, string, string]> = [
    ["loan-refinance-scam", "185만 원", "1,850,000원"],
    ["courier-customs-scam", "7만 8천 원", "78,000원"],
    ["reputation-blackmail-scam", "300만 원", "3,000,000원"],
  ];
  for (const [id, spoken, written] of cases) {
    assert.ok(quotesOf(id).some((q) => q.includes(spoken)), `${id} 인용구 ${spoken}`);
    assert.ok((IN_CALL_SMS[id] ?? []).some((item) => item.body.includes(`금액: ${written}`)), `${id} 문자 ${written}`);
  }
});

test("[F4 A3] 납치 협박 즉시 송금 금액은 사례 C17(100만 원)", () => {
  assert.ok(quotesOf("kidnapping-threat").some((q) => q.includes("100만 원")));
});
