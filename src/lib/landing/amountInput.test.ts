// §99 추가 — 모의 랜딩 금액 칸의 검증 · 한글 단위 표기(amountInput.ts 머리 표).
import { test } from "node:test";
import assert from "node:assert/strict";
import { amountError, amountHint, formatKoreanAmount, parseAmount, requiredFieldError } from "./amountInput.ts";

test("[§99 금액 표기] 은행 앱 관례 — 47억 원 · 1,234만 5,000원 · 3만 원 · 1,500원", () => {
  const cases: [string, string][] = [
    ["4700000000", "47억 원"],
    ["12345000", "1,234만 5,000원"],
    ["30000", "3만 원"],
    ["1500", "1,500원"],
    ["1", "1원"],
    ["100000000", "1억 원"],
    ["1000000001", "10억 1원"],
    ["123456789012", "1,234억 5,678만 9,012원"],
    ["2000000000000", "2조 원"],
    ["4,700,000,000", "47억 원"],
    [" 30000 ", "3만 원"],
  ];
  for (const [raw, expected] of cases) assert.equal(amountHint(raw), expected, raw);
});

test("[§99 금액 검증] 빈 칸 · 숫자 아님 · 0은 막고 안내한다 · 통과면 안내 없음", () => {
  assert.deepEqual(parseAmount(""), { kind: "empty" });
  assert.equal(amountError("  "), "금액을 입력해 주세요.");
  assert.equal(amountError("삼천만"), "금액은 숫자로만 입력해 주세요.");
  assert.equal(amountError("12.5"), "금액은 숫자로만 입력해 주세요.");
  assert.equal(amountError("-100"), "금액은 숫자로만 입력해 주세요.");
  assert.equal(amountError("000"), "0원보다 큰 금액을 입력해 주세요.");
  assert.equal(amountError("4700000000"), undefined);
  assert.equal(amountHint("abc"), undefined);
  assert.equal(amountHint("0"), undefined);
  // 큰 수도 정확하다(Number 정밀도 밖).
  assert.equal(formatKoreanAmount(BigInt("9007199254740993")), "9,007조 1,992억 5,474만 993원");
});

test("[§99 필수 칸] 빈 칸 안내 — 받침에 따라 을/를", () => {
  assert.equal(requiredFieldError("성명", ""), "성명을 입력해 주세요.");
  assert.equal(requiredFieldError("생년월일", " "), "생년월일을 입력해 주세요.");
  assert.equal(requiredFieldError("연락처", ""), "연락처를 입력해 주세요.");
  assert.equal(requiredFieldError("받는 분 성함", ""), "받는 분 성함을 입력해 주세요.");
  assert.equal(requiredFieldError("은행", "가온"), undefined);
});
