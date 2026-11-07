// ⭐ P2(2026-10-31 · docs/research/in-service-experience-plan-2026-10-31.md §2.1 K1 `bank-transfer` · X6) — 훈련용 이체 화면의 화면 쪽 계약.
// | # | 고정하는 것 |
// |---|---|
// | C1 | 클라 `BANK_TRANSFER_LANDINGS` = 서버 `BANK_TRANSFER_LANDINGS`(목록 드리프트 0) |
// | C2 | 흐름 = 이체 정보(폼) → 이체 정보 확인 → 생체 인증 시트 → 완료. 제출 콜백(속은 순간)은 **인증 성공에서만** · 무인자(G138) |
// | C3 | 2026-11-07 사용자 결정 (a)(BA3 갱신) — 확인 화면 · 인증 시트에 입력 칸(<input>) 0 · 간편 비밀번호 버튼 키패드는 누른 숫자 값 저장 · 전송 0(개수만) |
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

test("[P2 C1] 클라 · 서버 훈련용 이체 화면 목록이 같다(통화 중 문자 6종 + 메신저 칩 2종 + B7 계좌 문자 3종 + §142 안전계좌 1종 + PR-B 대출금 보관 1종)", () => {
  assert.deepEqual(listOf(component), listOf(catalog));
  // PR-B — 기관 고급 3통화 대출금 보관 이체 화면 +1.
  // 2026-11-07 앱 안 결말 — 납치 협박 고급 이체 화면 +1.
  assert.equal(listOf(component).length, 14);
});

test("[P2 C2] 폼 → 확인 → 인증 → 완료 · 제출 콜백은 인증 버튼에서만(입력값 0 · N1 비교 결과만)", () => {
  const submit = code.slice(code.indexOf("const handleSubmit"), code.indexOf("const finishSubmit"));
  assert.ok(submit.includes('if (bankTransfer && bankStage === "form") {'), "폼 다음은 확인 화면");
  assert.ok(submit.indexOf('setBankStage("confirm")') < submit.indexOf("finishSubmit(event.timeStamp)"));
  assert.ok(code.includes('onClick={() => setBankStage("auth")}'), "확인 화면의 이체 버튼 → 인증");
  // 2026-11-07 — 인증 버튼이 생체 인증 시트로 바뀌었다: 폼 제출(종전 랜딩) 한 곳 + 시트의 인증 성공 한 곳.
  assert.equal((code.match(/finishSubmit\(event\.timeStamp\)/g) ?? []).length, 1, "폼 제출(종전 랜딩)");
  assert.equal((code.match(/onSuccess=\{finishSubmit\}/g) ?? []).length, 1, "생체 인증 성공 한 곳");
  assert.ok(code.includes('onCancel={() => setBankStage("confirm")}'), "인증 취소 = 확인 화면");
  const finish = code.slice(code.indexOf("const finishSubmit"), code.indexOf("const issuerBar"));
  assert.ok(finish.includes("onCredentialSubmit?.();"), "무인자 콜백(이체 화면 밖 랜딩)");
  // 줄바꿈(LF · CRLF 체크아웃)에 무관하게 — 공백 묶음으로 본다.
  assert.match(finish, /onCredentialSubmit\?\.\(\s+recordTransferAndCompare\(/, "N1 — 이체 화면은 요구액 대비 비교 결과 하나만");
  assert.ok(code.includes('onClick={() => setBankStage("form")}'), "취소 = 폼으로");
  for (const label of ["<BankAuthSheet", "<WithdrawAccountRow", "보이스피싱 주의", "출금 계좌"]) assert.ok(code.includes(label), label);
});

test("[P2 C3] 확인 화면 · 인증 시트에 입력 칸 0 · 키패드 값 저장 · 전송 0(사용자 결정 (a))", () => {
  const start = code.indexOf("if (bankTransfer && !submitted && bankStage !== \"form\")");
  const block = code.slice(start, code.indexOf("const recordDocument", start));
  assert.ok(start > 0 && block.length > 0);
  assert.equal(/<input/.test(block), false, "확인 · 인증 화면에 입력 요소 0");
  assert.equal(/비밀번호를|인증번호를/.test(block), false);
  // 인증은 공용 시트(`BankAuthSheet`)가 한다 — 시트에도 입력 칸 0 · 숫자 버튼은 값 없는 사건 · 저장소 · 네트워크 0.
  assert.ok(block.includes("<BankAuthSheet"));
  const sheet = readFileSync("src/components/BankAuthSheet.tsx", "utf8").replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.equal(/<input|type="password"|localStorage|sessionStorage|fetch\(/.test(sheet), false, "시트에 입력 칸 · 저장 · 전송 0");
  assert.ok(sheet.includes('onClick={() => dispatch("pin-digit")}'), "숫자 버튼 = 값 없는 사건 하나");
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
  // N2(실기기 신고 2026-11-01) — 머리띠는 받는 계좌 은행이 아니라 참가자의 "내 은행"(세션 가상 은행 변수 · `myBankNameFor`).
  assert.ok(code.includes("`${prefilledTransfer.myBankName} 모바일뱅킹`"));
  const bankBlock = code.slice(code.indexOf("if (bankTransfer && !submitted"), code.indexOf("const recordDocument"));
  assert.equal(/[가-힣]{1,6}은행/.test(bankBlock), false, "확인 · 인증 화면에 은행 이름 리터럴 0");
});

test("[P2-c] 메신저 칩 — 대화방이 칩의 세션 은행명 · 계좌를 받는 계좌(읽기 전용) · 머리띠로 넘기고, 받는 분 이름을 지어내지 않는다", () => {
  const room = readFileSync("src/components/MessengerChatRoom.tsx", "utf8");
  assert.ok(room.includes("prefilledAccount: `${fakeLanding.bankName} ${fakeLanding.accountNumber}`"));
  assert.ok(room.includes("bankName: fakeLanding.bankName,"));
  // P2-d — 변형의 가상 예금주를 받는 분으로 넘긴다(대화의 사기범 이름과 같은 값).
  assert.ok(room.includes("...(fakeLanding.accountHolder ? { holder: fakeLanding.accountHolder } : {}),"));
  assert.ok(code.includes("...(holder ? [[\"받는 분\", holder] as [string, string]] : [])"), "이름을 모르면 받는 분 행 0");
  assert.ok(code.includes("`이 계좌로 ${amountText}을 보낼까요?`"));
});

test("[P2-d] 이체 한도 — 1회 1,000만 원 초과는 막고(이체 화면만) · 1회 · 1일 한도 안내 줄 · 근거 주소", async () => {
  const { transferLimitError, TRANSFER_LIMIT_NOTE, TRANSFER_LIMIT_PER_TRANSACTION, TRANSFER_LIMIT_PER_DAY } = await import("./amountInput.ts");
  assert.equal(TRANSFER_LIMIT_PER_TRANSACTION, 10_000_000);
  assert.equal(TRANSFER_LIMIT_PER_DAY, 50_000_000);
  assert.equal(transferLimitError("10000000"), undefined, "한도와 같으면 통과");
  assert.match(transferLimitError("10000001") ?? "", /1회 이체 한도\(1,000만 원\)/);
  assert.equal(transferLimitError(""), undefined, "빈 칸은 amountError가 먼저 막는다");
  assert.equal(TRANSFER_LIMIT_NOTE, "이체 한도 · 1회 1,000만 원 · 1일 5,000만 원");
  assert.ok(
    code.includes("(amountError(raw) ?? (bankTransfer ? (transferLimitError(raw) ?? withdrawError(ledger, account, raw)) : undefined))"),
    "이체 화면에서만 한도 검사(1회 → 출금 가능 금액 · 1일 — 2026-11-07)",
  );
  assert.ok(readFileSync("src/lib/landing/amountInput.ts", "utf8").includes("kebhana.com/cont/info/info01/info0104/info010404"), "근거 주소");
});

// ⭐ S2(실기기 확인 2026-11-01 · 지인 사칭 fv-42wd) — 대화방의 이체 화면 칩(송금하기 · 이체하기)은 웹 링크 미리보기가 아니라 송금 카드다 — 빈 그림 자리(회색 칸)를 두지 않는다.
// 칩이 붙는 시점(계좌가 대화에 나온 뒤)은 서버 `functions/src/scenarios/__tests__/realismSmall3.test.ts` S2.
test("[S2] 이체 화면 칩 = 그림 자리 없음 · 그 밖 링크 카드는 단색 그림 자리 그대로", () => {
  const room = readFileSync("src/components/MessengerChatRoom.tsx", "utf8").replace(/\r\n/g, "\n");
  const fake = component.replace(/\r\n/g, "\n");
  assert.ok(fake.includes("export function isBankTransferLandingId(landingId: string): boolean {\n  return BANK_TRANSFER_LANDINGS.includes(landingId);\n}"));
  assert.ok(room.includes('import MessengerFakeLanding, { isBankTransferLandingId } from "@/components/MessengerFakeLanding";'));
  assert.ok(
    room.includes(
      '{isBankTransferLandingId(attachment.fakeLandingId) ? null : (\n            <span aria-hidden="true" className="h-[72px] w-full" style={{ backgroundColor: chatTokens.linkCardThumb }} />\n          )}',
    ),
  );
  assert.equal((room.match(/chatTokens\.linkCardThumb/g) ?? []).length, 1, "그림 자리는 이 한 곳뿐");
});
