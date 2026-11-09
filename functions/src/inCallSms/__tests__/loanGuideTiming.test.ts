// ⭐ 2026-11-09 라이브 재시험 21 · 22 관찰 ⑦(기관 사칭 고급 `fv-c5fj` · Gemini Live · 2판 연속) — 대출 안내 문자가 사기범 언급보다 늦게 왔다.
//
// 재시험 21: 980만 원 이체 뒤 4:28 사기범 "문자로 보내 드린 링크의 대출 신청 화면에서 … 생활비로 선택하여 신청해 주십시오" → 문자 5:30(참가자가 한 번 더 말한 뒤).
// 재시험 22: 3:58 "문자로 보낸 안내 화면에서 대출을 신청해 주십시오" → 40초 넘게 문자 0 → 참가자가 말하자 사기범이 확인 전화 코칭으로 먼저 넘어감 → 문자 5:27.
// 코드 경로: 대출 안내 문자 선언 `notBeforeUserTurns: 9`(명시 하한 없음) — 이체 화면을 빨리 마친 참가자는 발화 7 ~ 8에 대출 단계에 이른다. 그 턴 끝의 "보냈다"
// 주장 백스톱(`planSmsBackstop` claimed · explicitFloor)은 하한 전이라 `wait` → 서버가 정정 1줄(`SMS_CLAIM_NOT_YET` "하던 이야기를 이어가라")을 돌려줬고,
// 모델 도구 호출도 `too_early`였다. 판정표 FE(`smsGate.ts`): 이체 화면 제출 뒤의 명시 요청만 하한 6 · 간격 검사 없음으로 연다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claimTargetsPending,
  correctModelSmsPurpose,
  gateOpensAtUserTurns,
  planSmsBackstop,
  resolveDeclaredSms,
  resolveSmsGate,
} from "../smsGate";
import type { DeliveredSmsRecord } from "../smsGate";
import { findFlowVariant, FLOW_VARIANTS } from "../../scenarios/flowVariants";
import { findInCallSmsItem } from "../../scenarios/inCallSms";

const SCENARIO = "institutional-impersonation";
const LEG0 = resolveDeclaredSms(SCENARIO, "fv-c5fj", { relay: undefined }).declared;
const LOAN = "institution-loan-guide";
const SAFE = "institution-asset-safe-account";

/** 레그 0 도착 기록 — 인증번호(발화 4) · 안전계좌(발화 `safeAt` · 이체 화면 제출 여부). */
function delivered(safeAt: number, submitted: boolean): DeliveredSmsRecord[] {
  return [
    { smsId: "institution-otp", userTurnsAtArrival: 4 },
    { smsId: SAFE, userTurnsAtArrival: safeAt, fakeLandingId: "safe-account-transfer", ...(submitted ? { landingSubmitted: true as const } : {}) },
  ];
}

test("[재시험 21 · 22 ⑦ 재현] 이체 화면 제출 뒤 발화 7 · 8의 '보냈다' 주장 → 그 턴에 대출 문자 발송(종전 wait + 정정)", () => {
  for (const userTurns of [7, 8]) {
    const plan = planSmsBackstop({ declared: LEG0, delivered: delivered(6, true), userTurns, claimed: true, explicitFloor: true });
    assert.equal(plan.action, "deliver", `발화 ${userTurns}`);
    assert.equal(plan.action === "deliver" && plan.item.smsId, LOAN);
    // 발송 통로의 재판정(주장 백스톱 = explicit · explicitFloor)도 같은 결론.
    assert.equal(resolveSmsGate({ purpose: "link", declared: LEG0, delivered: delivered(6, true), userTurns, explicit: true, explicitFloor: true }).status, "allowed");
  }
  // 재시험 21 문장 · 재시험 22 문장 모두 주장 대상이 아직 안 간 문자다(CL2 · CL4 — 서버는 주장으로 본다).
  assert.equal(claimTargetsPending(["link"], LEG0, delivered(6, true)), true);
  assert.equal(claimTargetsPending([], LEG0, delivered(6, true)), true);
});

test("[재시험 ⑦ 재현] 모델 도구 호출(말보다 먼저)도 이체 화면 제출 뒤 발화 7에 allowed(종전 too_early)", () => {
  const corrected = correctModelSmsPurpose({ purpose: "link", declared: LEG0, delivered: delivered(6, true), userTurns: 7, explicitFloor: true });
  assert.equal(corrected.purpose, "link");
  assert.equal(resolveSmsGate({ purpose: "link", declared: LEG0, delivered: delivered(6, true), userTurns: 7, explicit: true, explicitFloor: true }).status, "allowed");
});

test("[판정표 FE] FE2 같은 발화 · FE3 제출 전 · FE4 자동 백스톱 · 텍스트 폴백", () => {
  // FE2 — 안전계좌 문자가 온 발화(6)에 바로 이체를 마치고 사기범이 그 턴에 대출 문자를 말해도 간다(화면 제출이 두 문자 사이 행동).
  assert.equal(planSmsBackstop({ declared: LEG0, delivered: delivered(6, true), userTurns: 6, claimed: true, explicitFloor: true }).action, "deliver");
  assert.equal(gateOpensAtUserTurns(LEG0[2]!, delivered(6, true), true, true), 6);
  // FE3 — 이체 화면 제출 전이면 명시 요청도 종전 하한 9(이체 전에 대출 문자를 당기지 않는다).
  for (const userTurns of [7, 8]) {
    assert.equal(planSmsBackstop({ declared: LEG0, delivered: delivered(6, false), userTurns, claimed: true, explicitFloor: true }).action, "wait");
    assert.equal(resolveSmsGate({ purpose: "link", declared: LEG0, delivered: delivered(6, false), userTurns, explicit: true, explicitFloor: true }).status, "too_early");
  }
  assert.equal(planSmsBackstop({ declared: LEG0, delivered: delivered(6, false), userTurns: 9, claimed: true, explicitFloor: true }).action, "deliver");
  // FE4 — 주장 없는 자동 백스톱: 제출 뒤에도 종전(열림 9 · 넛지 10 · 강제 11).
  const auto = (userTurns: number) => planSmsBackstop({ declared: LEG0, delivered: delivered(6, true), userTurns }).action;
  assert.deepEqual([7, 8, 9, 10, 11].map(auto), ["wait", "wait", "wait", "nudge", "deliver"]);
  // FE4 — 텍스트 폴백(explicitFloor 없음)도 종전 하한 9.
  assert.equal(resolveSmsGate({ purpose: "link", declared: LEG0, delivered: delivered(6, true), userTurns: 8, explicit: true }).status, "too_early");
  // 앞 필수 문자(안전계좌) 미도착이면 2-b 그대로.
  assert.equal(resolveSmsGate({ purpose: "link", declared: LEG0, delivered: [{ smsId: "institution-otp", userTurnsAtArrival: 4 }], userTurns: 8, explicit: true, explicitFloor: true }).status, "too_early");
});

test("[판정표 F · CL 회귀] 인증번호 명시 하한 3 · 이미 도착한 안전계좌만 가리킨 주장(CL3)은 대출 문자를 당기지 않는다", () => {
  // F1 — 인증번호 문자(`explicitAfterScreenOf` 없음 = FE1)는 종전 그대로 명시 하한 3.
  assert.equal(resolveSmsGate({ purpose: "identity", declared: LEG0, delivered: [], userTurns: 3, explicit: true, explicitFloor: true }).status, "allowed");
  assert.equal(resolveSmsGate({ purpose: "identity", declared: LEG0, delivered: [], userTurns: 3, explicit: true }).status, "too_early");
  // CL3 — "보내 드린 안전계좌로 옮기셨죠"(대상 = transfer · 이미 도착) → 주장 아님 → 자동 백스톱 판정(발화 7 = wait).
  assert.equal(claimTargetsPending(["transfer"], LEG0, delivered(6, true)), false);
  assert.equal(planSmsBackstop({ declared: LEG0, delivered: delivered(6, true), userTurns: 7, claimed: false, explicitFloor: false }).action, "wait");
});

test("[선언] explicitAfterScreenOf는 fv-c5fj 대출 안내 문자 하나 — 같은 레그 앞선 · 화면을 여는 문자를 가리킨다", () => {
  const users = FLOW_VARIANTS.flatMap((v) => v.sms.filter((s) => s.explicitAfterScreenOf !== undefined).map((s) => `${v.variantId}:${s.smsId}`));
  assert.deepEqual(users, [`fv-c5fj:${LOAN}`]);
  const sms = findFlowVariant("fv-c5fj")!.sms;
  const loanIndex = sms.findIndex((s) => s.smsId === LOAN);
  const loan = sms[loanIndex]!;
  assert.equal(loan.notBeforeUserTurns, 9, "자동 백스톱 · 폴백 하한은 종전 그대로");
  assert.equal(loan.explicitNotBeforeUserTurns, 6);
  const prior = sms.findIndex((s) => s.smsId === loan.explicitAfterScreenOf);
  assert.ok(prior >= 0 && prior < loanIndex);
  assert.equal(sms[prior]!.leg ?? 0, loan.leg ?? 0);
  assert.ok(findInCallSmsItem(SCENARIO, sms[prior]!.smsId)?.fakeLandingId, "화면을 여는 문자");
  assert.ok(loan.explicitNotBeforeUserTurns! <= loan.notBeforeUserTurns);
});
