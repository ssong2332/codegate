import { test } from "node:test";
import assert from "node:assert/strict";
import { maskPII } from "../index";

test("maskPII(): 휴대폰 번호(대시 포함)를 [전화]로 토큰화한다", () => {
  assert.equal(maskPII("내 번호는 010-1234-5678이야"), "내 번호는 [전화]이야");
});

test("maskPII(): 휴대폰 번호(대시 없이 붙여 쓴 경우)도 [전화]로 토큰화한다", () => {
  assert.equal(maskPII("01012345678로 연락해"), "[전화]로 연락해");
});

test("maskPII(): 유선 전화(지역번호)도 [전화]로 토큰화한다", () => {
  assert.equal(maskPII("사무실은 02-123-4567이야"), "사무실은 [전화]이야");
});

test("maskPII(): 주민등록번호형(6자리-7자리)을 [주민번호]로 토큰화한다", () => {
  assert.equal(maskPII("주민번호는 901231-1234567이야"), "주민번호는 [주민번호]이야");
});

test("maskPII(): 이메일 주소를 [이메일]로 토큰화한다", () => {
  assert.equal(maskPII("연락은 test.user@example.com로 줘"), "연락은 [이메일]로 줘");
});

test("maskPII(): 8자리 이상 연속 숫자(계좌형)를 [계좌]로 토큰화한다", () => {
  assert.equal(maskPII("계좌번호 110123456789 로 보내줘"), "계좌번호 [계좌] 로 보내줘");
});

test("maskPII(): 대시 포함 계좌형 숫자도 [계좌]로 토큰화한다", () => {
  assert.equal(maskPII("110-234-567890 여기로"), "[계좌] 여기로");
});

test("maskPII(): 7자리 이하 숫자는 계좌형으로 오탐하지 않는다(예: 우편번호·나이 등)", () => {
  assert.equal(maskPII("우편번호는 1234567이야"), "우편번호는 1234567이야");
});

test("maskPII(): PII가 없는 일반 대화는 원문 그대로 통과한다", () => {
  const text = "지금 정말 사고 난거야? 어느 병원이야?";
  assert.equal(maskPII(text), text);
});

test("maskPII(): 한 문장에 여러 PII 종류가 섞여도 모두 각자의 토큰으로 치환된다", () => {
  const input = "전화는 010-1234-5678, 이메일은 me@test.com, 계좌는 110-234-567890 이야";
  const result = maskPII(input);
  assert.ok(result.includes("[전화]"));
  assert.ok(result.includes("[이메일]"));
  assert.ok(result.includes("[계좌]"));
  assert.ok(!result.includes("010-1234-5678"));
  assert.ok(!result.includes("me@test.com"));
  assert.ok(!result.includes("110-234-567890"));
});

test("maskPII(): 반환값에는 원문 숫자/이메일 조각이 전혀 남지 않는다(AC-024 '원문 미저장')", () => {
  const input = "제 번호 01098765432 이고 주민번호 880101-2345678 입니다";
  const result = maskPII(input);
  assert.ok(!/\d{6}-\d{7}/.test(result));
  assert.ok(!/01098765432/.test(result));
});
