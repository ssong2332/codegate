// §114(UX D-152) — 모의 랜딩 신원 칸(생년월일 · 휴대전화)의 정리 · 검증 · 보조 표기(identityInput.ts 머리 표) + 화면 배선.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { identityError, identityHint, identityMaxLength, isValidMobile, parseBirthdate, sanitizeIdentityInput } from "./identityInput.ts";

const TODAY = new Date(2026, 9, 23); // 2026-10-23

test("[§114 정리] 실기 신고 입력이 그대로 들어가지 않는다 — 생년월일 8자리 · 휴대전화 11자리 + 하이픈", () => {
  assert.equal(sanitizeIdentityInput("birthdate", "123456374636262738"), "12345637");
  assert.equal(sanitizeIdentityInput("mobile", "01011111111111111111"), "010-1111-1111");
  assert.equal(sanitizeIdentityInput("birthdate", "90.01-01"), "900101", "숫자 말고는 지운다");
  assert.equal(sanitizeIdentityInput("mobile", "010"), "010");
  assert.equal(sanitizeIdentityInput("mobile", "0101"), "010-1");
  assert.equal(sanitizeIdentityInput("mobile", "0101234"), "010-1234");
  assert.equal(sanitizeIdentityInput("mobile", "01012345"), "010-1234-5");
  assert.equal(sanitizeIdentityInput("mobile", "010-1234-5678"), "010-1234-5678", "이미 정리된 값은 그대로(멱등)");
  assert.equal(identityMaxLength("birthdate"), 8);
  assert.equal(identityMaxLength("mobile"), "010-1234-5678".length);
});

test("[§114 생년월일] 6 · 8자리 · 세기 해석 · 날짜 · 미래 검사", () => {
  const ok = (raw: string) => parseBirthdate(raw, TODAY);
  assert.deepEqual(ok("900101"), { kind: "ok", date: { year: 1990, month: 1, day: 1 } });
  assert.deepEqual(ok("19900101"), { kind: "ok", date: { year: 1990, month: 1, day: 1 } });
  assert.deepEqual(ok("051231"), { kind: "ok", date: { year: 2005, month: 12, day: 31 } }, "YY ≤ 26 → 20YY");
  assert.deepEqual(ok("270101"), { kind: "ok", date: { year: 1927, month: 1, day: 1 } }, "YY > 26 → 19YY");
  assert.deepEqual(ok("20000229"), { kind: "ok", date: { year: 2000, month: 2, day: 29 } }, "윤년");
  for (const bad of ["19000229", "990229", "901301", "900132", "900431", "000000", "18991231", "20261024", "261024"]) {
    assert.equal(ok(bad).kind, "invalid", bad);
  }
  assert.equal(ok("12345637").kind, "invalid", "실기 신고 값(정리 뒤)도 막힌다");
  for (const bad of ["9001", "9001011", "123"]) assert.equal(ok(bad).kind, "length", bad);
  assert.equal(ok("").kind, "empty");
});

test("[§114 휴대전화] 010으로 시작하는 11자리만", () => {
  assert.equal(isValidMobile("010-1234-5678"), true);
  assert.equal(isValidMobile("01012345678"), true);
  for (const bad of ["010-1234-567", "011-1234-5678", "02-123-4567", "0101111111111"]) assert.equal(isValidMobile(bad), false, bad);
});

test("[§114 안내] 칸 아래 문구 · 빈 칸 조사 · 통과하면 생년월일 보조 표기", () => {
  assert.equal(identityError("birthdate", "생년월일", "", TODAY), "생년월일을 입력해 주세요.");
  assert.equal(identityError("mobile", "휴대전화 번호", "  ", TODAY), "휴대전화 번호를 입력해 주세요.");
  assert.equal(identityError("mobile", "연락처", "", TODAY), "연락처를 입력해 주세요.");
  assert.equal(identityError("birthdate", "생년월일", "9001", TODAY), "생년월일은 6자리(예: 900101) 또는 8자리(예: 19900101)로 입력해 주세요.");
  assert.equal(identityError("birthdate", "생년월일", "901301", TODAY), "없는 날짜예요. 생년월일을 다시 확인해 주세요.");
  assert.equal(identityError("mobile", "휴대전화 번호", "010-1111", TODAY), "휴대전화 번호는 010으로 시작하는 11자리로 입력해 주세요.");
  assert.equal(identityError("birthdate", "생년월일", "900101", TODAY), undefined);
  assert.equal(identityError("mobile", "연락처", "010-1234-5678", TODAY), undefined);
  assert.equal(identityHint("birthdate", "900101", TODAY), "1990년 1월 1일");
  assert.equal(identityHint("birthdate", "9001", TODAY), undefined);
  assert.equal(identityHint("mobile", "010-1234-5678", TODAY), undefined);
});

test("[§114 화면 배선] 생년월일 · 휴대전화 · 연락처 칸 전부에 형식이 붙고, 정리 · 자판 · 검증 · 보조 표기가 그 형식을 쓴다", () => {
  const src = readFileSync("src/components/MessengerFakeLanding.tsx", "utf8").replace(/\r\n/g, "\n");
  const fields = [...src.matchAll(/\{ label: "(생년월일|휴대전화 번호|연락처)"[^}]*\}/g)].map((m) => m[0]);
  assert.ok(fields.length >= 9, `신원 칸 ${fields.length}개`);
  for (const field of fields) {
    const expected = field.includes('"생년월일"') ? 'format: "birthdate"' : 'format: "mobile"';
    assert.ok(field.includes(expected), field);
  }
  assert.ok(src.includes("if (field.format) return identityError(field.format, field.label, raw);"), "제출 검증");
  assert.ok(src.includes("const next = field.format ? sanitizeIdentityInput(field.format, event.target.value) : event.target.value;"), "입력 중 정리");
  assert.ok(src.includes('inputMode={field.format === "mobile" ? "tel" : field.format === "birthdate" ? "numeric" : field.inputMode}'), "자판");
  assert.ok(src.includes("identityHint(field.format, values[field.label] ?? \"\")"), "보조 표기");
});
