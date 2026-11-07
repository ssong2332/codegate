// ⭐ 2026-11-07(Edge 시험 판 12 — 검찰 고급 상품권형 앱 밖 구매 요구 · 사용자 결정 "앱 안 화면 추가") — 앱 안 상품권 구매 화면의 고정 단언.
// | # | 고정하는 것 |
// |---|---|
// | VC1 | 핀 = 12자리 4-4-4(실제 문화상품권 16 · 18자리와 다른 형식) · 결정적 · 한 숫자 반복 · 연속 묶음 0 · 세션 · 장 번호마다 다르다 |
// | VC2 | 권종 · 수량 · 1회 한도 판정 |
// | VC3 | 저장 · 전송 0 — `voucher.ts` · `VoucherPurchaseMockup`에 네트워크 · 저장소 호출 0 · 완료 콜백 무인자(핀 · 권종 · 수량이 서버로 가지 않는다) |
// | VC4 | 가상명 — 서버 카탈로그 `voucher-purchase`와 같은 상품권 · 판매처 이름 · 화면 문구에 '모의 · 훈련' 0(G437) |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  VOUCHER_BRAND,
  VOUCHER_COPY,
  VOUCHER_DENOMINATIONS,
  VOUCHER_MAX_QUANTITY,
  VOUCHER_PURCHASE_LIMIT,
  VOUCHER_SELLER,
  denominationLabel,
  lastVoucherPurchase,
  recordVoucherPurchase,
  voucherOrderError,
  voucherPinFor,
} from "./voucher.ts";

const VOUCHER_SOURCE = readFileSync(new URL("./voucher.ts", import.meta.url), "utf8");
const LANDING_SOURCE = readFileSync(new URL("../../components/MessengerFakeLanding.tsx", import.meta.url), "utf8");
const SERVER_CATALOG = readFileSync(new URL("../../../functions/src/scenarios/mockScreens.ts", import.meta.url), "utf8");

function voucherComponentSource(): string {
  const start = LANDING_SOURCE.indexOf("function VoucherPurchaseMockup(");
  assert.ok(start > 0, "VoucherPurchaseMockup이 있어야 한다");
  const end = LANDING_SOURCE.indexOf("\nfunction ", start + 10);
  assert.ok(end > start);
  return LANDING_SOURCE.slice(start, end);
}

test("[VC1] 핀은 12자리 4-4-4 · 결정적 · 뻔한 묶음 0 · 세션과 장마다 다르다", () => {
  const seen = new Set<string>();
  for (let s = 0; s < 40; s += 1) {
    for (let serial = 0; serial < 5; serial += 1) {
      const pin = voucherPinFor(`session-${s}`, serial);
      assert.match(pin, /^\d{4}-\d{4}-\d{4}$/, pin);
      assert.equal(pin.replace(/-/g, "").length, 12, "실제 문화상품권 핀(16 · 18자리)과 다른 12자리");
      assert.equal(voucherPinFor(`session-${s}`, serial), pin, "같은 세션 · 같은 장이면 같은 핀");
      for (const group of pin.split("-")) {
        assert.doesNotMatch(group, /^(\d)\1{3}$/, `한 숫자 반복 묶음: ${pin}`);
        assert.ok(!["0123", "1234", "2345", "3456", "4567", "5678", "6789", "9876", "8765", "7654", "6543", "5432", "4321", "3210"].includes(group), `연속 묶음: ${pin}`);
      }
      seen.add(pin);
    }
  }
  assert.equal(seen.size, 200, "세션 · 장 번호가 다르면 핀이 겹치지 않는다(이 표본 200개)");
});

test("[VC1] 같은 세션에서 다시 사면 이어지는 장 번호로 새 핀 · 마지막 구매를 다시 보여 준다", () => {
  const first = recordVoucherPurchase("vc-ledger", "voucher-purchase", 50_000, 2, new Date(0));
  const second = recordVoucherPurchase("vc-ledger", "voucher-purchase", 10_000, 1, new Date(0));
  assert.equal(first.pins.length, 2);
  assert.equal(second.pins.length, 1);
  assert.ok(!first.pins.includes(second.pins[0]!), "두 번째 구매 핀은 첫 구매 핀과 다르다");
  assert.deepEqual(lastVoucherPurchase("vc-ledger", "voucher-purchase"), second);
  assert.equal(lastVoucherPurchase("other-ledger", "voucher-purchase"), undefined, "다른 세션의 구매는 보이지 않는다");
});

test("[VC2] 권종 · 수량 · 1회 한도 판정", () => {
  assert.equal(voucherOrderError(undefined, 1), "권종을 골라 주세요.");
  assert.equal(voucherOrderError(20_000, 1), "권종을 골라 주세요.", "목록 밖 권종");
  assert.match(voucherOrderError(10_000, 0) ?? "", /수량/);
  assert.match(voucherOrderError(10_000, VOUCHER_MAX_QUANTITY + 1) ?? "", /수량/);
  assert.equal(voucherOrderError(100_000, VOUCHER_MAX_QUANTITY), undefined, "한도와 같은 금액은 통과");
  assert.equal(100_000 * VOUCHER_MAX_QUANTITY, VOUCHER_PURCHASE_LIMIT);
  for (const value of VOUCHER_DENOMINATIONS) assert.equal(voucherOrderError(value, 1), undefined);
  assert.equal(denominationLabel(50_000), "5만원권");
});

test("[VC3] 핀 · 권종 · 수량은 저장 · 전송되지 않는다(네트워크 · 저장소 0 · 완료 콜백 무인자)", () => {
  const forbidden = /\b(fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|httpsCallable|firebase|setDoc|addDoc|updateDoc)\b/;
  assert.doesNotMatch(VOUCHER_SOURCE.replace(/^\s*\/\/.*$/gm, ""), forbidden, "voucher.ts");
  const component = voucherComponentSource();
  assert.doesNotMatch(component.replace(/^\s*\/\/.*$/gm, ""), forbidden, "VoucherPurchaseMockup");
  assert.match(component, /onCredentialSubmit: \(\) => void;/, "완료 콜백은 인자를 받지 않는다");
  for (const call of component.match(/onCredentialSubmit\([^)]*\)/g) ?? []) {
    assert.equal(call, "onCredentialSubmit()", `완료 콜백에 값을 실어 보내면 안 된다: ${call}`);
  }
  assert.doesNotMatch(VOUCHER_SOURCE, /^import /m, "잎 모듈(값 import 0)");
});

test("[VC4] 가상 상품권 · 판매처 이름이 서버 카탈로그와 같고 '모의 · 훈련' 문구가 없다", () => {
  assert.equal(VOUCHER_BRAND, "다솜 문화상품권");
  assert.equal(VOUCHER_SELLER, "한올기프트");
  assert.ok(SERVER_CATALOG.includes(`headline: "${VOUCHER_BRAND} 구매"`), "서버 voucher-purchase 헤드라인과 같은 상품권 이름");
  assert.ok(SERVER_CATALOG.includes(`issuerLabel: "ⓒ ${VOUCHER_SELLER}"`), "서버 voucher-purchase 판매처와 같은 이름");
  const visible = Object.values(VOUCHER_COPY).join("\n");
  assert.doesNotMatch(visible, /모의|훈련|가상|연습|체험/, "세션 중 화면 문구(G437)");
});
