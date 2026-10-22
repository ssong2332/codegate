// §104.10(2026-10-22 사용자 결정 "지금 전체 변경" · DECISIONS #219 · UX D-145 (3)) — 통화 중 문자 발신번호 = 시나리오별 고정 가상 번호.
// 규칙: 지역번호(02 · 0NZ) 또는 070 뒤 **국번 첫 자리 0** — 시내전화 국번은 2~9로 시작한다(⚠️ 추정 — 2차 자료만 확인 · Architecture §104.10).
// 대표번호(15XX · 16XX · 18XX) · 휴대전화(01X) 금지. 같은 시나리오의 문자는 같은 번호(무작위 0).
import { test } from "node:test";
import assert from "node:assert/strict";
import { IN_CALL_SMS, SMS_SENDER_NUMBER } from "../inCallSms";

const FICTIONAL_NUMBER = /^(?:02|0[3-6][1-5]|070)-0\d{3}-\d{4}$/;

test("[§104.10] 발신번호 표 — 모든 번호가 지역번호/070 + 국번 첫 자리 0 · 대표번호 · 휴대전화 0 · 번호끼리 중복 0", () => {
  const numbers = Object.values(SMS_SENDER_NUMBER);
  for (const n of numbers) {
    assert.match(n, FICTIONAL_NUMBER, n);
    assert.equal(/^1[5-8]\d{2}/.test(n.replace(/-/g, "")), false, `대표번호 꼴: ${n}`);
    assert.equal(/^01\d/.test(n), false, `휴대전화 꼴: ${n}`);
  }
  assert.equal(new Set(numbers).size, numbers.length, "시나리오끼리 같은 번호");
});

test("[§104.10] 카탈로그 전 문자 — 자리표시 0000-0000 0 · 발신번호 = 그 시나리오 번호(고정) · 괄호 안 발신 이름은 그대로", () => {
  let checked = 0;
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    const expected = SMS_SENDER_NUMBER[scenarioId];
    assert.ok(expected, `${scenarioId}: 번호 표에 없다`);
    for (const item of items) {
      assert.equal(item.senderLabel.includes("0000-0000"), false, item.smsId);
      assert.ok(item.senderLabel === expected || item.senderLabel.startsWith(`${expected} (`), `${item.smsId}: ${item.senderLabel}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 18, `문자 수 ${checked}`);
  // 사용자 신고 문자(검찰 자산 검수) — 발신 이름은 무변경.
  const asset = IN_CALL_SMS["prosecution-cooperation-call"]!.find((i) => i.smsId === "prosecution-asset-site-link")!;
  assert.equal(asset.senderLabel, "02-0714-3826 (자산검수 안내)");
});
