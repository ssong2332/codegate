// ⭐ 2026-11-07(Edge 재시험 2 S7 · 사용자 결정 D-G1 ~ D-G6 "앱 안 화면으로 바꾸기") — 앱 안 금 거래소 구매 화면의 고정 단언.
// | # | 고정하는 것 |
// |---|---|
// | GB1 | 상품 · 가상 시세 · 수량 · 1회 결제 한도 판정 |
// | GB2 | 고액 구매 확인 — 둘 다 골라야 진행 · 수사기관 안내 "예" = 보류 |
// | GB3 | 보증서 번호 결정적 · 세션 · 주문마다 다름 · 마지막 구매 다시 보기 · 다른 세션 0 |
// | GB4 | 저장 · 전송 0 — `goldBuy.ts` · `GoldBuyMockup`에 네트워크 · 저장소 호출 0 · 결제 · 보류 콜백 무인자 · 보류 = `landing_held` 한 값 |
// | GB5 | 가상명 — 서버 카탈로그 `gold-buy` · `asset-gold-buy`와 같은 거래소 이름 · 화면 문구에 '모의 · 훈련' 0(G437) · 매장 위치 · 주소 0 · 매장 방문 수령 · 신분증 안내 0(2026-11-08 사용자 결정) |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GOLD_COPY,
  GOLD_MAX_QUANTITY,
  GOLD_PAYMENT_LIMIT,
  GOLD_PRICE_PER_GRAM,
  GOLD_PRODUCTS,
  GOLD_SHOP_NAME,
  goldCheckResult,
  goldOrderError,
  goldProductPrice,
  goldWarrantyFor,
  goldWon,
  lastGoldPurchase,
  recordGoldPurchase,
} from "./goldBuy.ts";

const GOLD_SOURCE = readFileSync(new URL("./goldBuy.ts", import.meta.url), "utf8");
const LANDING_SOURCE = readFileSync(new URL("../../components/MessengerFakeLanding.tsx", import.meta.url), "utf8");
const SERVER_CATALOG = readFileSync(new URL("../../../functions/src/scenarios/mockScreens.ts", import.meta.url), "utf8");

function goldComponentSource(): string {
  const start = LANDING_SOURCE.indexOf("function GoldBuyMockup(");
  assert.ok(start > 0, "GoldBuyMockup이 있어야 한다");
  const end = LANDING_SOURCE.indexOf("\nfunction ", start + 10);
  assert.ok(end > start);
  return LANDING_SOURCE.slice(start, end);
}

test("[GB1] 상품 · 가상 시세 · 수량 · 1회 결제 한도", () => {
  assert.deepEqual(GOLD_PRODUCTS.map((p) => p.grams), [10, 37.5, 100, 1000]);
  assert.equal(goldProductPrice(GOLD_PRODUCTS[0]!), 10 * GOLD_PRICE_PER_GRAM);
  assert.equal(goldWon(goldProductPrice(GOLD_PRODUCTS[1]!)), "7,125,000원");
  assert.equal(goldOrderError(undefined, 1), "상품을 골라 주세요.");
  assert.match(goldOrderError("bar-10g", 0) ?? "", /수량/);
  assert.match(goldOrderError("bar-10g", GOLD_MAX_QUANTITY + 1) ?? "", /수량/);
  assert.equal(goldOrderError("bar-10g", 5), undefined, "950만 원 = 한도 안");
  assert.match(goldOrderError("bar-10g", 6) ?? "", /1회 한도/, "1,140만 원 = 한도 밖");
  assert.match(goldOrderError("bar-100g", 1) ?? "", /1회 한도/, "100g(1,900만 원)은 한 번에 결제 불가");
  assert.equal(GOLD_PAYMENT_LIMIT, 10_000_000);
});

test("[GB2] 고액 구매 확인 — 둘 다 골라야 진행 · 수사기관 안내 '예' = 보류", () => {
  assert.equal(goldCheckResult(undefined, false), "incomplete");
  assert.equal(goldCheckResult("개인 투자", undefined), "incomplete");
  assert.equal(goldCheckResult("모름", false), "incomplete", "목록 밖 목적");
  assert.equal(goldCheckResult("개인 투자", false), "proceed");
  assert.equal(goldCheckResult("자산 보관", true), "held");
});

test("[GB3] 보증서 번호 결정적 · 마지막 구매 다시 보기 · 다른 세션 0", () => {
  assert.match(goldWarrantyFor("s1", 0), /^HD-\d{8}$/);
  assert.equal(goldWarrantyFor("s1", 0), goldWarrantyFor("s1", 0));
  assert.notEqual(goldWarrantyFor("s1", 0), goldWarrantyFor("s1", 1));
  assert.notEqual(goldWarrantyFor("s1", 0), goldWarrantyFor("s2", 0));
  const first = recordGoldPurchase("gb-ledger", "gold-buy", "bar-37g", 1, new Date(0));
  assert.equal(first.total, 7_125_000);
  const second = recordGoldPurchase("gb-ledger", "gold-buy", "bar-10g", 2, new Date(0));
  assert.notEqual(first.warranty, second.warranty);
  assert.deepEqual(lastGoldPurchase("gb-ledger", "gold-buy"), second);
  assert.equal(lastGoldPurchase("gb-ledger", "asset-gold-buy"), undefined, "다른 화면");
  assert.equal(lastGoldPurchase("other", "gold-buy"), undefined, "다른 세션");
});

test("[GB4] 저장 · 전송 0 · 결제 · 보류 콜백 무인자 · 보류 = landing_held", () => {
  const forbidden = /\b(fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|httpsCallable|firebase|setDoc|addDoc|updateDoc)\b/;
  assert.doesNotMatch(GOLD_SOURCE.replace(/^\s*\/\/.*$/gm, ""), forbidden, "goldBuy.ts");
  const component = goldComponentSource();
  assert.doesNotMatch(component.replace(/^\s*\/\/.*$/gm, ""), forbidden, "GoldBuyMockup");
  assert.match(component, /onCredentialSubmit: \(\) => void;/);
  assert.match(component, /onHeld: \(\) => void;/);
  for (const call of component.match(/(onCredentialSubmit|onHeld)\([^)]*\)/g) ?? []) {
    assert.ok(call === "onCredentialSubmit()" || call === "onHeld()", `콜백에 값을 실어 보내면 안 된다: ${call}`);
  }
  assert.ok(LANDING_SOURCE.includes('onHeld={() => onLandingStep?.("landing_held")}'), "보류 = 고정 값 한 개");
  assert.doesNotMatch(GOLD_SOURCE, /^import /m, "잎 모듈(값 import 0)");
  assert.ok(!component.includes("<input"), "입력 칸 0(버튼으로 고른다)");
});

test("[GB5] 가상 거래소 이름이 서버 카탈로그와 같고 '모의 · 훈련' 문구 · 매장 위치가 없다", () => {
  assert.equal(GOLD_SHOP_NAME, "해담골드");
  assert.ok(SERVER_CATALOG.includes(`headline: "${GOLD_SHOP_NAME} 골드바 구매"`));
  assert.ok(SERVER_CATALOG.includes(`headline: "${GOLD_SHOP_NAME} 금 실물 주문"`));
  assert.ok(SERVER_CATALOG.includes('export const GOLD_LANDINGS: readonly string[] = ["gold-buy", "asset-gold-buy"];'));
  assert.ok(LANDING_SOURCE.includes('const GOLD_LANDINGS: readonly string[] = ["gold-buy", "asset-gold-buy"];'), "클라 목록 = 서버 목록");
  const visible = Object.values(GOLD_COPY).flat().join("\n");
  assert.doesNotMatch(visible, /모의|훈련|가상|연습|체험/, "세션 중 화면 문구(G437)");
  assert.doesNotMatch(visible, /[가-힣]+(시|구|동|역|점)\s|지점|본점|주소/, "매장 위치 · 주소 0(AC-102 (d))");
  // 2026-11-08 사용자 결정(출금 예약 §15.4 (c)와 같게) — 주문 확인 · 완료 화면에 매장 방문 수령 · 신분증 안내 0. 완료 화면 = "구매 완료" + 보증서 번호까지.
  assert.ok(!("pickupNote" in GOLD_COPY) && !("pickupRow" in GOLD_COPY) && !("pickupValue" in GOLD_COPY), "수령 방법 줄 · 방문 안내 문구 0");
  assert.doesNotMatch(visible, /매장|수령|방문|신분증/, "화면 문구에 매장 방문 수령 안내 0");
  const start = LANDING_SOURCE.indexOf("function GoldBuyMockup(");
  const end = LANDING_SOURCE.indexOf("\nfunction ", start + 10);
  assert.ok(start > 0 && end > start, "GoldBuyMockup");
  assert.doesNotMatch(LANDING_SOURCE.slice(start, end), /pickup|매장|수령|신분증/, "주문 확인 · 완료 화면 렌더에 수령 안내 0");
  for (const [source, keyOf] of [[SERVER_CATALOG, (id: string) => `landingId: "${id}"`], [LANDING_SOURCE, (id: string) => `"${id}": {`]] as const) {
    for (const id of ["gold-buy", "asset-gold-buy"]) {
      const at = source.indexOf(keyOf(id));
      assert.ok(at > 0, `${id} 문구 항목`);
      const body = /bodyLines: \[([^\]]*)\]/.exec(source.slice(at, at + 1500))?.[1] ?? "";
      assert.ok(body.length > 0, `${id} bodyLines`);
      assert.doesNotMatch(body, /매장|수령|방문|신분증/, `${id} 본문에 매장 수령 안내 0`);
    }
  }
});
