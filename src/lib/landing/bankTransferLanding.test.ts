// ⭐ P2(2026-10-31 · docs/research/in-service-experience-plan-2026-10-31.md §2.1 K1 `bank-transfer` · X6) — 훈련용 이체 화면의 화면 쪽 계약.
// | # | 고정하는 것 |
// |---|---|
// | C1 | 클라 `BANK_TRANSFER_LANDINGS` = 서버 `BANK_TRANSFER_LANDINGS`(목록 드리프트 0) |
// | C2 | 흐름 = 이체 정보(폼) → 이체 정보 확인 → 본인 인증 → 완료. 제출 콜백(속은 순간)은 **인증 버튼에서만** · 무인자(G138) |
// | C3 | 본인 인증 화면에 비밀번호 · 인증번호 입력 칸이 없다(참가자가 실제 비밀번호를 치는 일을 만들지 않는다) |
// | C4 | 미리 채움 = 문자 문서 구조화 필드(`prefilledTransferOf`) — 은행명 없는 옛 문서는 미리 채우지 않는다 |
// | C5 | 실존 은행명을 쓰지 않는다 — 머리띠 은행명은 세션 가상 은행명(§81) 변수뿐 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prefilledTransferOf } from "../incallsms/inCallSms.ts";

const component = readFileSync("src/components/MessengerFakeLanding.tsx", "utf8");
const catalog = readFileSync("functions/src/scenarios/mockScreens.ts", "utf8");
const code = component.replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const listOf = (source: string): string[] => {
  const start = source.indexOf("BANK_TRANSFER_LANDINGS: readonly string[] = [");
  assert.ok(start > 0, "목록 선언이 있어야 한다");
  const body = source.slice(start, source.indexOf("];", start));
  return [...body.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]).sort();
};

test("[P2 C1] 클라 · 서버 훈련용 이체 화면 목록이 같다(5종)", () => {
  assert.deepEqual(listOf(component), listOf(catalog));
  assert.equal(listOf(component).length, 5);
});

test("[P2 C2] 폼 → 확인 → 인증 → 완료 · 제출 콜백은 인증 버튼에서만(무인자)", () => {
  const submit = code.slice(code.indexOf("const handleSubmit"), code.indexOf("const finishSubmit"));
  assert.ok(submit.includes('if (bankTransfer && bankStage === "form") {'), "폼 다음은 확인 화면");
  assert.ok(submit.indexOf('setBankStage("confirm")') < submit.indexOf("finishSubmit(event.timeStamp)"));
  assert.ok(code.includes('onClick={() => setBankStage("auth")}'), "확인 화면의 이체 버튼 → 인증");
  assert.equal((code.match(/finishSubmit\(event\.timeStamp\)/g) ?? []).length, 2, "폼 제출(종전 랜딩) · 인증 버튼 두 곳뿐");
  const finish = code.slice(code.indexOf("const finishSubmit"), code.indexOf("const issuerBar"));
  assert.ok(finish.includes("onCredentialSubmit?.();"), "무인자 콜백");
  assert.ok(code.includes('onClick={() => setBankStage("form")}'), "취소 = 폼으로");
  for (const label of ["본인 인증", "인증하고 이체하기", "보이스피싱 주의", "출금 계좌"]) assert.ok(code.includes(label), label);
});

test("[P2 C3] 본인 인증 화면에 입력 칸이 없다(비밀번호 · 인증번호 0)", () => {
  const start = code.indexOf("if (bankTransfer && !submitted && bankStage !== \"form\")");
  const block = code.slice(start, code.indexOf("const recordDocument", start));
  assert.ok(start > 0 && block.length > 0);
  assert.equal(/<input/.test(block), false, "확인 · 인증 화면에 입력 요소 0");
  assert.equal(/비밀번호를|인증번호를/.test(block), false);
});

test("[P2 C4] 미리 채움 — 은행명이 있으면 받는 분 · 금액을, 없으면(옛 문서) 미리 채우지 않는다", () => {
  assert.deepEqual(prefilledTransferOf({ bankName: "한결은행", accountHolder: "김민재", transferAmount: "3000000" }), {
    bankName: "한결은행",
    holder: "김민재",
    amount: "3000000",
  });
  assert.deepEqual(prefilledTransferOf({ bankName: "다온은행" }), { bankName: "다온은행" });
  assert.equal(prefilledTransferOf({ accountHolder: "김민재" }), undefined);
});

test("[P2 C5] 머리띠 은행명은 세션 가상 은행명 변수뿐(리터럴 은행명 0)", () => {
  assert.ok(code.includes("`${prefilledTransfer.bankName} 모바일뱅킹`"));
  const bankBlock = code.slice(code.indexOf("if (bankTransfer && !submitted"), code.indexOf("const recordDocument"));
  assert.equal(/[가-힣]{1,6}은행/.test(bankBlock), false, "확인 · 인증 화면에 은행 이름 리터럴 0");
});
