// §114(UX D-152) — 모의 랜딩 신원 칸(생년월일 · 휴대전화)의 정리 · 검증 · 보조 표기(identityInput.ts 머리 표) + 화면 배선.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { identityDisplayValue, identityError, identityHint, identityMaxLength, isValidMobile, parseBirthdate, sanitizeIdentityInput } from "./identityInput.ts";

const TODAY = new Date(2026, 9, 23); // 2026-10-23

test("[§114 · §122(10) 정리] 실기 신고 입력이 그대로 들어가지 않는다 — 생년월일 앞 6 + 뒷자리 첫 숫자 · 휴대전화 11자리 + 하이픈", () => {
  assert.equal(sanitizeIdentityInput("birthdate", "123456374636262738"), "123456-3", "뒷자리는 첫 숫자만 남는다(개인정보 최소화)");
  assert.equal(sanitizeIdentityInput("mobile", "01011111111111111111"), "010-1111-1111");
  assert.equal(sanitizeIdentityInput("birthdate", "90.01-01"), "900101", "숫자 말고는 지운다");
  assert.equal(sanitizeIdentityInput("birthdate", "900101-1234567"), "900101-1", "주민번호 전체를 붙여넣어도 첫 숫자까지만");
  assert.equal(sanitizeIdentityInput("birthdate", "900101-1"), "900101-1", "멱등");
  assert.equal(sanitizeIdentityInput("birthdate", "900101-"), "900101", "뒷자리를 지우면 하이픈도 사라진다");
  assert.equal(sanitizeIdentityInput("mobile", "010"), "010");
  assert.equal(sanitizeIdentityInput("mobile", "0101"), "010-1");
  assert.equal(sanitizeIdentityInput("mobile", "0101234"), "010-1234");
  assert.equal(sanitizeIdentityInput("mobile", "01012345"), "010-1234-5");
  assert.equal(sanitizeIdentityInput("mobile", "010-1234-5678"), "010-1234-5678", "이미 정리된 값은 그대로(멱등)");
  assert.equal(identityMaxLength("birthdate"), "900101-1".length);
  assert.equal(identityMaxLength("mobile"), "010-1234-5678".length);
});

test("[§122(10) 생년월일] 앞 6자리 + 뒷자리 첫 숫자(1~4) · 세기 해석 · 날짜 · 미래 검사", () => {
  const ok = (raw: string) => parseBirthdate(raw, TODAY);
  assert.deepEqual(ok("900101-1"), { kind: "ok", date: { year: 1990, month: 1, day: 1 } });
  assert.deepEqual(ok("030609-4"), { kind: "ok", date: { year: 2003, month: 6, day: 9 } }, "3 · 4 → 20YY");
  assert.deepEqual(ok("270101-2"), { kind: "ok", date: { year: 1927, month: 1, day: 1 } }, "1 · 2 → 19YY");
  assert.deepEqual(ok("000229-3"), { kind: "ok", date: { year: 2000, month: 2, day: 29 } }, "윤년");
  for (const bad of ["000229-1", "990229-1", "901301-1", "900132-1", "900431-2", "000000-3", "261024-3", "300101-3"]) {
    assert.equal(ok(bad).kind, "invalid", bad);
  }
  for (const bad of ["900101-0", "900101-5", "900101-9"]) assert.equal(ok(bad).kind, "backDigit", bad);
  for (const bad of ["900101", "9001", "19900101", "123"]) assert.equal(ok(bad).kind, "length", bad);
  assert.equal(ok("").kind, "empty");
});

test("[§122(10) 열람본 표시] 생년월일은 입력 칸과 같은 모양 · 그 밖은 그대로", () => {
  assert.equal(identityDisplayValue("birthdate", "030609-4"), "030609-4●●●●●●");
  assert.equal(identityDisplayValue("birthdate", "0306"), "0306", "형식이 덜 찬 값은 그대로(제출 검증이 막아 오늘은 도달 0)");
  assert.equal(identityDisplayValue("mobile", "010-1234-5678"), "010-1234-5678");
  assert.equal(identityDisplayValue(undefined, "홍길동"), "홍길동");
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
  assert.equal(identityError("birthdate", "생년월일", "9001", TODAY), "생년월일 6자리와 뒷자리 첫 숫자 1자리를 입력해 주세요.");
  assert.equal(identityError("birthdate", "생년월일", "900101-7", TODAY), "뒷자리 첫 숫자는 1~4만 입력할 수 있어요.");
  assert.equal(identityError("birthdate", "생년월일", "901301-1", TODAY), "없는 날짜예요. 생년월일을 다시 확인해 주세요.");
  assert.equal(identityError("mobile", "휴대전화 번호", "010-1111", TODAY), "휴대전화 번호는 010으로 시작하는 11자리로 입력해 주세요.");
  assert.equal(identityError("birthdate", "생년월일", "900101-1", TODAY), undefined);
  assert.equal(identityError("mobile", "연락처", "010-1234-5678", TODAY), undefined);
  assert.equal(identityHint("birthdate", "900101-1", TODAY), "1990년 1월 1일");
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
  // §122(10) — 생년월일 칸만 가림 표시 상자로 감싸고, 열람본은 같은 모양의 표시값을 쓴다.
  assert.ok(src.includes('<IdentityBox masked={field.format === "birthdate"}'), "가림 표시 상자");
  assert.ok(src.includes("{BIRTHDATE_MASK}"), "가림 표시 6칸");
  assert.ok(src.includes('identityDisplayValue(field.format, values[field.label] ?? "")'), "열람본 표시");
  assert.ok(src.includes("displayValues,"), "열람본 행이 표시값을 받는다");
});
