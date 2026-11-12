// ⭐ PR-B(2026-11-07 · 기관 사칭 고급 앱 안 대출 체험 — docs/research/institution-advanced-loan-design-2026-11-07.md §6 · §8) —
// | # | 고정하는 것 |
// |---|---|
// | C1 | 대출 신청 판정표 L1~L4(형식 → 한도 → 용도 → 통과 순서) |
// | C2 | 조회 한도 · 금리가 결정적이고 범위 안(1,500만 ~ 3,000만 · 100만 단위 · 연 9.9% ~ 15.9%) · 캐피탈 이름 읽기 |
// | C3 | 탭 메모리 장부 — 신청 → 입금(한 번만) → 첫 계좌 출금 가능 금액에만 더해짐 · 세션끼리 섞이지 않음 · 신청 없으면 입금 0 |
// | C4 | 화면이 아는 id가 서버 카탈로그(문자 · 화면 · 결과 기록)와 같다(드리프트 0) · 클라 이체 화면 목록에 대출금 보관 화면 |
// | C5 | 상대가 걸어 오는 통화(`incoming`) 뒤 화면 = 전화 앱 · 결과 보고 도구 라우팅 · 같은 배치 끊기를 막지 않음 |
// | C6 | 신청 금액은 콜백 · 네트워크로 나가지 않는다(G138 — 화면 소스 스캔) |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LOAN_APPLY_LANDING_ID,
  LOAN_DISBURSED_SMS_ID,
  LOAN_PURPOSES,
  LOAN_SAFE_TRANSFER_LANDING_ID,
  lenderNameFromSmsBody,
  loanApplyError,
  loanOfferFor,
} from "./loanFlow.ts";
import { availableBalance, disburseLoan, loanDisbursedAmount, recordLoanApplication, recordWithdrawal } from "./withdrawAccounts.ts";
import { screenAfterLegEnd, LEG_INCOMING_CALL_DELAY_MS } from "../callLegs/legTransition.ts";
import { endCallBatchHasOtherCalls, readLoanReviewOutcomeArg, resolveToolCallKind } from "../realtime/liveToolResponse.ts";

const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

test("[C1] 대출 신청 판정표 L1~L4 — 앞 행이 먼저", () => {
  const limit = 20_000_000;
  assert.equal(loanApplyError({ raw: "", formatError: "금액을 입력해 주세요.", limit, purpose: undefined }), "금액을 입력해 주세요.", "L1 > L3");
  assert.equal(loanApplyError({ raw: "25,000,000", formatError: undefined, limit, purpose: undefined }), "대출 가능 한도를 넘었습니다.", "L2 > L3");
  assert.equal(loanApplyError({ raw: "9,800,000", formatError: undefined, limit, purpose: undefined }), "대출 용도를 선택해 주세요.", "L3");
  assert.equal(loanApplyError({ raw: "20,000,000", formatError: undefined, limit, purpose: "생활비" }), undefined, "L4 — 한도와 같으면 통과");
  assert.ok(LOAN_PURPOSES.length >= 3 && LOAN_PURPOSES.includes("생활비"));
});

test("[C2] 조회 한도 · 금리 결정적 · 범위 · 캐피탈 이름", () => {
  for (const seed of ["a", "session-1", "세션", "x".repeat(40)]) {
    const offer = loanOfferFor(seed);
    assert.deepEqual(loanOfferFor(seed), offer, "같은 세션 = 같은 값");
    assert.ok(offer.limit >= 15_000_000 && offer.limit <= 30_000_000 && offer.limit % 1_000_000 === 0, `${seed}: 한도 ${offer.limit}`);
    const rate = Number(offer.ratePercent);
    assert.ok(rate >= 9.9 && rate <= 15.9, `${seed}: 금리 ${offer.ratePercent}`);
  }
  assert.equal(lenderNameFromSmsBody("[누리캐피탈] 신청하신 비대면 신용대출금이"), "누리캐피탈");
  assert.equal(lenderNameFromSmsBody(undefined), "비대면 대출센터");
  assert.equal(lenderNameFromSmsBody("[명의도용 입증 절차] 안내"), "비대면 대출센터");
});

test("[C3] 탭 메모리 장부 — 신청 → 입금 한 번 → 첫 계좌만 · 세션 분리", () => {
  const key = "loan-ledger-c3";
  const main = { id: "main" as const, balance: 12_000_000 };
  const other = { id: "other-1" as const, balance: 3_000_000 };
  disburseLoan(key);
  assert.equal(loanDisbursedAmount(key), undefined, "신청 없으면 입금 0");
  assert.equal(availableBalance(key, main), 12_000_000);
  recordLoanApplication(key, "abc");
  disburseLoan(key);
  assert.equal(loanDisbursedAmount(key), undefined, "판정 불가 금액은 적지 않는다");
  recordLoanApplication(key, "18,000,000");
  disburseLoan(key);
  disburseLoan(key);
  assert.equal(loanDisbursedAmount(key), "18,000,000");
  assert.equal(availableBalance(key, main), 30_000_000, "두 번 불러도 한 번");
  assert.equal(availableBalance(key, other), 3_000_000, "다른 은행 계좌에는 더하지 않는다");
  recordWithdrawal(key, "main", "18,000,000");
  assert.equal(availableBalance(key, main), 12_000_000, "보낸 만큼 준다");
  assert.equal(availableBalance("loan-ledger-c3-other", main), 12_000_000, "세션끼리 섞이지 않는다");
  assert.equal(loanDisbursedAmount("loan-ledger-c3-other"), undefined);
});

test("[C4] 화면이 아는 id = 서버 카탈로그(드리프트 0)", () => {
  const sms = read("functions/src/scenarios/inCallSms.ts");
  assert.ok(sms.includes(`smsId: "${LOAN_DISBURSED_SMS_ID}"`), "입금 안내 문자 id");
  assert.ok(sms.includes(`fakeLandingId: "${LOAN_APPLY_LANDING_ID}"`), "대출 신청 문자 → 신청 화면");
  assert.ok(sms.includes(`fakeLandingId: "${LOAN_SAFE_TRANSFER_LANDING_ID}"`), "보관 계좌 문자 → 이체 화면");
  const screens = read("functions/src/scenarios/mockScreens.ts");
  assert.ok(screens.includes(`landingId: "${LOAN_APPLY_LANDING_ID}"`) && screens.includes(`landingId: "${LOAN_SAFE_TRANSFER_LANDING_ID}"`));
  // 2026-11-12 판정표 LD — 정본이 `loanReviewOrder.ts`로 옮겨 갔다(`loanReview.ts`는 다시 내보낸다).
  assert.match(read("functions/src/callLegs/loanReviewOrder.ts"), new RegExp(`LOAN_DISBURSED_SMS_ID = "${LOAN_DISBURSED_SMS_ID}"`));
  assert.match(read("functions/src/inCallSms/confirmResult.ts"), new RegExp(`LOAN_APPLY_LANDING_ID = "${LOAN_APPLY_LANDING_ID}"`));
  // 클라 이체 화면 목록(서버 BANK_TRANSFER_LANDINGS와 같은 목록)에 대출금 보관 화면이 있다.
  const landing = read("src/components/MessengerFakeLanding.tsx");
  const list = landing.slice(landing.indexOf("const BANK_TRANSFER_LANDINGS: readonly string[] = ["));
  assert.ok(list.slice(0, list.indexOf("];")).includes(`"${LOAN_SAFE_TRANSFER_LANDING_ID}"`), "클라 이체 화면 목록");
});

test("[C5] 걸려 오는 통화 뒤 화면 · 결과 보고 도구 라우팅", () => {
  assert.deepEqual(screenAfterLegEnd("incoming"), { kind: "dialer", digits: "" }, "상대가 걸어 올 때까지 전화 앱");
  assert.deepEqual(screenAfterLegEnd("transfer"), { kind: "holding" }, "종전 넘김 그대로");
  assert.ok(LEG_INCOMING_CALL_DELAY_MS > 0 && LEG_INCOMING_CALL_DELAY_MS <= 30_000);
  const tools = { sendPreparedSms: "", offerVerificationDesk: "", endCall: "end_call", reportLoanReview: "report_loan_review" } as unknown as Parameters<typeof resolveToolCallKind>[1];
  assert.equal(resolveToolCallKind("report_loan_review", tools), "report_loan_review");
  assert.equal(resolveToolCallKind("report_loan_review", { endCall: "end_call" } as unknown as Parameters<typeof resolveToolCallKind>[1]), "unsupported", "선언 안 된 세션");
  assert.equal(endCallBatchHasOtherCalls([{ name: "report_loan_review" }, { name: "end_call" }], tools), false, "결과 보고는 끊기를 막지 않는다");
  assert.equal(endCallBatchHasOtherCalls([{ name: "send_prepared_sms" }, { name: "end_call" }], tools), true, "종전 판정 그대로");
  assert.equal(readLoanReviewOutcomeArg({ outcome: "approved" }), "approved");
  assert.equal(readLoanReviewOutcomeArg({ outcome: "held" }), "held");
  assert.equal(readLoanReviewOutcomeArg({ outcome: "maybe" }), undefined);
  assert.equal(readLoanReviewOutcomeArg(null), undefined);
});

test("[C6] 신청 금액은 콜백 · 네트워크로 나가지 않는다(G138) · 화면은 가짜 랜딩 파일 안 서브 컴포넌트(§15.9.1 R1)", () => {
  const file = read("src/components/MessengerFakeLanding.tsx");
  const start = file.indexOf("function LoanApplyMockup(");
  assert.ok(start > 0, "LoanApplyMockup이 MessengerFakeLanding.tsx 안에 있다");
  const end = file.indexOf("\nfunction ", start + 1);
  const src = file.slice(start, end > 0 ? end : undefined);
  assert.ok(!/fetch\(|httpsCallable|@\/lib\/api|localStorage|sessionStorage/.test(src), "네트워크 · 저장소 0");
  assert.ok(src.includes("recordLoanApplication(ledgerKey, amount)"), "탭 메모리 장부에만 적는다");
  assert.ok(src.includes("onSubmit?.();") && !/onSubmit\?\.\([^)]/.test(src), "제출 콜백은 무인자");
  assert.ok(file.includes("onSubmit={() => onCredentialSubmit?.()}"), "종전 제출 콜백으로 사실 하나만(비교 결과 0)");
});
