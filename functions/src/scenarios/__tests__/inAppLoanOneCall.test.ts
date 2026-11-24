// ⭐ 2026-11-23(사용자 실기 시험 · 결정 "앱 안 대출로 바꾸기") — 카드 배송 고급 `fv-e5mv` · 검찰 고급 `fv-a6lq`가 참가자에게 **실제 금융회사에서 대출을 받아
// 대출금을 현금으로 찾아 직원에게 맡기라**고 시켰다(서비스 밖 행동). 결말을 한 통화 앱 안 대출 체험으로 바꿨다(`flowVariants.ts` `IN_APP_LOAN_*` 표):
// 대출 안내 문자 → 앱 안 대출 신청(`loan-apply`) → 입금 안내 문자(서버 · 판정표 LD5) → 대출금 보관 계좌 문자 → 대출금 보관 이체 화면(`loan-safe-transfer` · 결정 화면 4-c).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { findFlowVariant, resolveSessionScenarioPrompt } from "../flowVariants";
import { IN_CALL_SMS, findInCallSmsItem } from "../inCallSms";
import { MOCK_SCREENS, findMockScreenItem, isBankTransferLanding } from "../mockScreens";
import { fixedBankForHolder } from "../../shared/fictionalBank";
import { loanDisbursedOnApply, LOAN_DISBURSED_SMS_ID } from "../../callLegs/loanReviewOrder";
import { resolveSmsGate, resolveDeclaredSms } from "../../inCallSms/smsGate";
import { isDecisionScreenPending, VERBAL_DECISION_VARIANTS } from "../../scammerHangup/goalAction";

const ROUTES = [
  { variantId: "fv-e5mv", scenarioId: "card-delivery-call", prefix: "card-delivery", firstLink: "card-delivery-app-link" },
  { variantId: "fv-a6lq", scenarioId: "prosecution-cooperation-call", prefix: "prosecution", firstLink: "prosecution-case-link" },
] as const;

/** 앱 밖 대출 · 현금 인출 · 대면 전달 표현(신고 재현 — 종전 단계 · 수법 · 결정 순간이 이 꼴이었다). */
const OUTSIDE_LOAN = /금융회사에서 대출을 받아|대출금을 현금으로 찾|현금으로 찾아|직원에게 맡기|은행 직원이 용도를 물으면/;

/** 조립에 실리는 사기범 쪽 문면 전부(단계 · 수법 · 결정 순간 · 페르소나). */
function routeTexts(variantId: string, scenarioId: string): string[] {
  const v = findFlowVariant(variantId)!;
  const prompt = resolveSessionScenarioPrompt(scenarioId, variantId)!;
  return [...v.stages.map((s) => s.summary), ...v.tactics, v.decisionMoment ?? "", prompt.personaPrompt, ...prompt.weakenedTactics];
}

test("[재현] 두 루트의 조립 문면에 앱 밖 대출 · 현금 인출 · 직원 대면 전달 지시가 0이다", () => {
  for (const { variantId, scenarioId } of ROUTES) {
    const hits = routeTexts(variantId, scenarioId).filter((t) => OUTSIDE_LOAN.test(t));
    assert.deepEqual(hits, [], variantId);
  }
});

test("[흐름] 선언 문자 = 앞 화면 → 대출 안내(loan-apply) → 대출금 보관 계좌(loan-safe-transfer) · 선언 순서 = 하한 순서 · 고급 문자 0~3", () => {
  for (const { variantId, scenarioId, prefix, firstLink } of ROUTES) {
    const sms = findFlowVariant(variantId)!.sms;
    assert.deepEqual(sms.map((s) => s.smsId), [firstLink, `${prefix}-loan-guide`, `${prefix}-loan-safe-account`], variantId);
    assert.ok(sms.length <= 3, "AC-096 (b)");
    for (let i = 1; i < sms.length; i += 1) assert.ok(sms[i - 1]!.notBeforeUserTurns < sms[i]!.notBeforeUserTurns, variantId);
    assert.equal(findInCallSmsItem(scenarioId, `${prefix}-loan-guide`)?.fakeLandingId, "loan-apply");
    const safe = findInCallSmsItem(scenarioId, `${prefix}-loan-safe-account`)!;
    assert.equal(safe.fakeLandingId, "loan-safe-transfer");
    assert.ok(isBankTransferLanding(safe.fakeLandingId!), "대출금 보관 이체 = 훈련용 이체 화면");
    // 예금주 · 은행 한 묶음(U3).
    const holder = safe.body.match(/예금주: (\S+)/)?.[1];
    assert.ok(fixedBankForHolder(holder), `${variantId}: 예금주 고정 은행`);
    // 화면은 기관 고급과 같은 카탈로그 항목(같은 객체).
    assert.equal(findMockScreenItem(scenarioId, "loan-apply"), findMockScreenItem("institutional-impersonation", "loan-apply"));
    assert.equal(findMockScreenItem(scenarioId, "loan-safe-transfer"), findMockScreenItem("institutional-impersonation", "loan-safe-transfer"));
  }
  // 입금 안내 문자는 세 시나리오가 같은 항목(같은 smsId — 화면 `disburseLoan`이 id 하나로 안다).
  const disbursed = findInCallSmsItem("institutional-impersonation", LOAN_DISBURSED_SMS_ID)!;
  for (const { scenarioId } of ROUTES) assert.equal(findInCallSmsItem(scenarioId, LOAN_DISBURSED_SMS_ID), disbursed, scenarioId);
  assert.ok(Object.keys(MOCK_SCREENS).length > 0 && Object.keys(IN_CALL_SMS).length > 0);
});

test("[판정표 LD5] 확인 전화 레그가 없는 한 통화 앱 안 대출만 신청 제출 즉시 입금 안내 문자", () => {
  for (const { variantId, scenarioId } of ROUTES) {
    assert.equal(loanDisbursedOnApply({ flowVariantId: variantId, scenarioId }), true, variantId);
    assert.equal(loanDisbursedOnApply({ flowVariantId: variantId, scenarioId: "institutional-impersonation" }), false, `${variantId}: 시나리오 불일치`);
  }
  assert.equal(loanDisbursedOnApply({ flowVariantId: "fv-c5fj", scenarioId: "institutional-impersonation" }), false, "3통화 = 확인 전화 결과(LD1 ~ LD4)");
  assert.equal(loanDisbursedOnApply({ flowVariantId: "fv-tvnj", scenarioId: "card-delivery-call" }), true, "입금 항목이 있는 시나리오의 한 통화 변형(대출 화면이 없어 제출 자체가 오지 않는다)");
  assert.equal(loanDisbursedOnApply({ flowVariantId: undefined, scenarioId: "card-delivery-call" }), false, "변형 없음");
  assert.equal(loanDisbursedOnApply({ flowVariantId: "fv-m3hd", scenarioId: "loan-refinance-scam" }), false, "입금 항목 없는 시나리오");
  // 배선 — 대출 신청 화면 제출 분기(L0)에서 부른다.
  const src = readFileSync(path.resolve(__dirname, "../../../src/inCallSms/index.ts"), "utf8");
  assert.match(src, /LOAN_APPLY_LANDING_ID\) \{\r?\n(?:\s*\/\/[^\n]*\n)*\s*await deliverLoanDisbursedSmsIfDue\(db\.collection\("sessions"\)\.doc\(sessionId\), sessionId, loanDisbursedOnApply\);/);
});

test("[게이트 1-b] 같은 목적(link) 문자 둘 — 모델이 link를 두 번 불러도 선언 순서대로 앞 화면 → 대출 안내", () => {
  for (const { variantId, scenarioId, prefix, firstLink } of ROUTES) {
    const { declared } = resolveDeclaredSms(scenarioId, variantId);
    const first = resolveSmsGate({ purpose: "link", declared, delivered: [], userTurns: 3, explicit: true });
    assert.equal(first.status, "allowed");
    assert.equal(first.item?.smsId, firstLink, variantId);
    const second = resolveSmsGate({ purpose: "link", declared, delivered: [{ smsId: firstLink, userTurnsAtArrival: 3 }], userTurns: 7, explicit: true });
    assert.equal(second.status, "allowed", variantId);
    assert.equal(second.item?.smsId, `${prefix}-loan-guide`, variantId);
    const both = [{ smsId: firstLink, userTurnsAtArrival: 3 }, { smsId: `${prefix}-loan-guide`, userTurnsAtArrival: 7 }];
    assert.equal(resolveSmsGate({ purpose: "link", declared, delivered: both, userTurns: 9, explicit: true }).status, "already_delivered");
  }
});

test("[끊기 4-c] 결정 화면 = 대출금 보관 이체 — 대출 신청만으로는 goal 끊기가 열리지 않는다 · 말로 끝나는 결말 목록 0", () => {
  assert.deepEqual([...VERBAL_DECISION_VARIANTS], []);
  for (const { variantId, scenarioId, prefix, firstLink } of ROUTES) {
    const v = findFlowVariant(variantId)!;
    assert.equal(v.goalFollowUpUserTurns, undefined, variantId);
    const base = { scenarioId, flowVariantId: variantId, mockScreens: [], declared: v.sms, declaredKnown: true, verifyEnabled: false, followUpUserTurns: undefined };
    const head = { smsId: firstLink, landingSubmitted: true as const };
    const applied = { smsId: `${prefix}-loan-guide`, fakeLandingId: "loan-apply", landingSubmitted: true as const };
    const safe = { smsId: `${prefix}-loan-safe-account`, fakeLandingId: "loan-safe-transfer" };
    assert.equal(isDecisionScreenPending({ ...base, delivered: [head, applied] }), true, `${variantId}: 신청만`);
    assert.equal(isDecisionScreenPending({ ...base, delivered: [head, applied, safe] }), true, `${variantId}: 보관 계좌 문자만`);
    assert.equal(isDecisionScreenPending({ ...base, delivered: [head, applied, { ...safe, landingSubmitted: true }] }), false, `${variantId}: 이체 뒤 = 완료`);
  }
});
