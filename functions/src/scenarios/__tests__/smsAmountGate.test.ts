// W1(2026-11-27 · docs/research/realism-criteria-2026-11-27.md 판정표 M1 · M2 · M3 · T6) — 문자 금액 ↔ 지시문 금액 일치 게이트.
//
// | # | If | Then(이 파일이 고정한다) |
// |---|---|---|
// | G1 | 변형이 선언한 문자(그 레그)에 `금액:` 줄이 있다 | 그 변형이 모델에 주는 지시문(페르소나 + 수법)에 같은 금액이 있다 — 하나라도 빠지면 실패 |
// | G2 | 같은 변형(바이트 고정 변형 제외) | 지시문에 요구 금액 줄(`[요구 금액]` · 문자 도착 전 다른 숫자 금지 · 바꾸지 않음)이 실렸다 |
// | G3 | 가족 사고 · 납치 · 손주(소액 급전형) 변형의 문자 금액 | 30만 ~ 300만 원 |
// | G4 | 게이트 자체 | 금액을 지운 지시문에서는 실제로 실패한다(역검증) |
// | G5 | 바이트 고정 변형 fv-6s5p | 요구 금액 줄을 싣지 않는다(해시 단언은 smsGate.test.ts) · 지시문에는 이미 같은 금액이 있다 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { FLOW_VARIANTS, resolveVariantPrompt, type FlowVariant } from "../flowVariants";
import { SCENARIO_PROMPTS } from "../index";
import {
  AMOUNT_RULE_EXEMPT,
  AMOUNT_RULE_MARK,
  declaredSmsAmounts,
  digitsWon,
  spokenWon,
} from "../smsAmount";

/** 지시문 속 금액("50만 원" · "9만 9천 원" · "1,850,000원") → 원 단위. 숫자 표기만 읽는다(한글 수는 같은 줄의 숫자 표기가 짝이다). */
function amountsInText(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/(\d[\d,]*)\s*만(?:\s*(\d+)\s*천)?/g)) {
    out.add(Number(m[1].replace(/,/g, "")) * 1e4 + (m[2] ? Number(m[2]) * 1e3 : 0));
  }
  for (const m of text.matchAll(/(\d{1,3}(?:,\d{3})+)\s*원/g)) out.add(Number(m[1].replace(/,/g, "")));
  return out;
}

/** 모델이 받는 지시문 = 페르소나(흐름 블록 포함) + 수법. 다통화는 레그마다. */
function promptTexts(v: FlowVariant): { legIndex: number; text: string }[] {
  const base = SCENARIO_PROMPTS[v.scenarioId];
  assert.ok(base, `${v.scenarioId}: 시나리오 프롬프트 없음`);
  const legs = v.multiCall ? v.legs.map((_, i) => i) : [0];
  return legs.map((legIndex) => {
    const doc = resolveVariantPrompt(base, v, legIndex);
    return { legIndex, text: [doc.personaPrompt, ...(doc.weakenedTactics ?? [])].join("\n") };
  });
}

type Gap = { variantId: string; legIndex: number; amount: number };

/** 게이트 본체 — 문자 금액이 지시문에 없는 (변형 · 레그 · 금액) 목록. `textOf`를 바꿔 끼워 역검증한다. */
function amountGaps(textOf: (v: FlowVariant) => { legIndex: number; text: string }[]): Gap[] {
  const gaps: Gap[] = [];
  for (const v of FLOW_VARIANTS) {
    for (const { legIndex, text } of textOf(v)) {
      const have = amountsInText(text);
      const want = declaredSmsAmounts(v, v.multiCall ? legIndex : undefined);
      for (const amount of want) if (!have.has(amount)) gaps.push({ variantId: v.variantId, legIndex, amount });
    }
  }
  return gaps;
}

test("[W1 G1] 금액이 든 문자를 선언한 모든 변형 — 문자 금액 ∈ 지시문 금액", () => {
  assert.deepEqual(amountGaps(promptTexts), []);
  const covered = FLOW_VARIANTS.filter((v) => declaredSmsAmounts(v).length > 0).length;
  assert.ok(covered >= 35, `금액 문자 변형 ${covered}개 — 스캔(2026-11-27)은 35개`);
});

test("[W1 G2] 요구 금액 줄 — 바이트 고정 변형 외 모두 · 문자 전 금지 · 바꾸지 않음", () => {
  for (const v of FLOW_VARIANTS) {
    if (declaredSmsAmounts(v).length === 0 || AMOUNT_RULE_EXEMPT.has(v.variantId)) continue;
    const texts = promptTexts(v).filter((t) => declaredSmsAmounts(v, v.multiCall ? t.legIndex : undefined).length > 0);
    assert.ok(texts.length > 0, `${v.variantId}: 금액 문자가 있는 레그가 없다`);
    for (const { legIndex, text } of texts) {
      const line = text.split("\n").find((l) => l.startsWith(AMOUNT_RULE_MARK));
      assert.ok(line, `${v.variantId} 레그 ${legIndex}: 요구 금액 줄 없음`);
      assert.match(line, /문자가 도착하기 전에는 이 금액 말고 다른 금액 · 숫자를 말하지 않고/);
      assert.match(line, /바꾸지 않는다/);
    }
  }
});

test("[W1 G3] 소액 급전형(가족 사고 · 납치 · 손주) 문자 금액 = 30만 ~ 300만 원 · fv-h5sz = 50만 원", () => {
  const SMALL = new Set(["family-accident-deepvoice", "kidnapping-threat", "grandchild-impersonation"]);
  let n = 0;
  for (const v of FLOW_VARIANTS) {
    if (!SMALL.has(v.scenarioId)) continue;
    for (const amount of declaredSmsAmounts(v)) {
      n++;
      assert.ok(amount >= 300_000 && amount <= 3_000_000, `${v.variantId}: ${amount}원은 30만 ~ 300만 밖`);
    }
  }
  assert.ok(n >= 8, `소액 급전형 금액 ${n}건`);
  const h5sz = FLOW_VARIANTS.find((v) => v.variantId === "fv-h5sz")!;
  assert.deepEqual(declaredSmsAmounts(h5sz), [500_000]);
  assert.ok(amountsInText(promptTexts(h5sz)[0].text).has(500_000));
});

test("[W1 G4] 역검증 — 금액을 지운 지시문 · 한 변형만 지워도 게이트가 실패한다", () => {
  // 전부 지움 → 금액 문자 변형 수만큼 실패
  const stripped = amountGaps((v) => promptTexts(v).map((t) => ({ ...t, text: t.text.replace(/\d[\d,]*\s*만|\d{1,3}(?:,\d{3})+\s*원/g, "") })));
  assert.ok(stripped.length >= 35, `금액을 지웠는데 실패 ${stripped.length}건`);
  // fv-h5sz 하나만 지움 → 그 변형만 실패
  const one = amountGaps((v) =>
    promptTexts(v).map((t) => (v.variantId === "fv-h5sz" ? { ...t, text: t.text.replace(/\d[\d,]*\s*만|\d{1,3}(?:,\d{3})+\s*원/g, "") } : t)),
  );
  assert.deepEqual(one.map((g) => g.variantId), ["fv-h5sz"]);
});

test("[W1 G4b] 요구 금액 줄을 뺀 조립이면 G1이 실패한다 — 수정 전 재현(fv-h5sz · fv-35f2 · fv-xuvu 등 7개)", () => {
  const withoutRule = amountGaps((v) =>
    promptTexts(v).map((t) => ({ ...t, text: t.text.split("\n").filter((l) => !l.startsWith(AMOUNT_RULE_MARK)).join("\n") })),
  );
  assert.deepEqual(
    [...new Set(withoutRule.map((g) => g.variantId))].sort(),
    ["fv-35f2", "fv-62q8", "fv-bqr9", "fv-d8pw", "fv-h5sz", "fv-mhnv", "fv-xuvu"],
  );
});

test("[W1 G5] 바이트 고정 fv-6s5p — 요구 금액 줄 0 · 지시문에 이미 185만 원", () => {
  const v = FLOW_VARIANTS.find((x) => x.variantId === "fv-6s5p")!;
  const { text } = promptTexts(v)[0];
  assert.ok(!text.includes(AMOUNT_RULE_MARK));
  assert.ok(amountsInText(text).has(1_850_000));
  assert.ok(!FLOW_VARIANTS.some((x) => x.variantId === "fv-akj5" && declaredSmsAmounts(x).length > 0), "fv-akj5는 금액 문자 선언 0");
});

test("[W1] 금액 → 말투 · 숫자 표기 — 카탈로그 금액 전부", () => {
  const cases: [number, string, string][] = [
    [500_000, "오십만 원", "50만 원"],
    [3_000_000, "삼백만 원", "300만 원"],
    [9_800_000, "구백팔십만 원", "980만 원"],
    [1_850_000, "백팔십오만 원", "185만 원"],
    [2_340_000, "이백삼십사만 원", "234만 원"],
    [4_120_000, "사백십이만 원", "412만 원"],
    [7_600_000, "칠백육십만 원", "760만 원"],
    [5_000_000, "오백만 원", "500만 원"],
    [99_000, "구만 구천 원", "9만 9천 원"],
    [78_000, "칠만 팔천 원", "7만 8천 원"],
  ];
  for (const [won, said, digits] of cases) {
    assert.equal(spokenWon(won), said);
    assert.equal(digitsWon(won), digits);
    assert.ok(amountsInText(digitsWon(won)).has(won));
  }
  assert.throws(() => spokenWon(1_234));
});
