// ⭐ §126(2026-10-24 실기 신고 *"문자가 바로 오지는 않아"* · 갤럭시 S25 · 기관 사칭 고급) — 명시 요청(모델 도구 · 사기범 주장)의 문자 간격 1.
// 운영 로그(2026-10-24 KST · 세션 e2a5fd9b): 인증번호 도착 발화 4 → 모델이 발화 5에 `link`(선언 없음)를 불러 `not_allowed`
// (남은 필수 `transfer`의 게이트가 간격 2로 닫혀 보정도 못 함) → 계좌 문자는 발화 6에 주장 백스톱으로 왔다(참가자가 한 번 더 말한 뒤).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  MIN_USER_TURNS_BETWEEN_SMS,
  MIN_USER_TURNS_BETWEEN_SMS_EXPLICIT,
  correctModelSmsPurpose,
  gateOpensAtUserTurns,
  planSmsBackstop,
  resolveSmsGate,
  smsSpacingFor,
} from "../smsGate";
import type { DeliveredSmsRecord } from "../smsGate";
import type { FlowVariantSms } from "../../scenarios/flowVariants";

const INSTITUTION: FlowVariantSms[] = [
  { purpose: "identity", smsId: "institution-otp", required: true, notBeforeUserTurns: 2 },
  { purpose: "transfer", smsId: "institution-safe-account", required: true, notBeforeUserTurns: 4, backstopUserTurns: 1 },
];
const AFTER_OTP: DeliveredSmsRecord[] = [{ smsId: "institution-otp", userTurnsAtArrival: 4 }];

test("[§126] 간격 값 — 명시 요청 1 · 그 밖 종전 2", () => {
  assert.equal(MIN_USER_TURNS_BETWEEN_SMS, 2);
  assert.equal(MIN_USER_TURNS_BETWEEN_SMS_EXPLICIT, 1);
  assert.equal(smsSpacingFor(true), 1);
  assert.equal(smsSpacingFor(false), 2);
  assert.equal(smsSpacingFor(undefined), 2);
});

test("[§126] 로그 e2a5fd9b 재현 — 발화 5의 모델 도구 `link`가 `transfer`로 보정돼 그 자리에서 발송된다(종전: 거절 → 발화 6 백스톱)", () => {
  const r = correctModelSmsPurpose({ purpose: "link", declared: INSTITUTION, delivered: AFTER_OTP, userTurns: 5 });
  assert.deepEqual(r, { purpose: "transfer", correctedFrom: "link" });
  assert.equal(resolveSmsGate({ purpose: r.purpose, declared: INSTITUTION, delivered: AFTER_OTP, userTurns: 5, explicit: true }).status, "allowed");
  // 종전 판정(명시 아님)은 그대로 막는다 — 자동 백스톱 · 텍스트 폴백의 간격은 바뀌지 않는다.
  assert.equal(resolveSmsGate({ purpose: "transfer", declared: INSTITUTION, delivered: AFTER_OTP, userTurns: 5 }).status, "too_soon");
});

test("[§126] 같은 발화 안 두 통은 명시 요청이어도 막는다(간격 1)", () => {
  assert.equal(resolveSmsGate({ purpose: "transfer", declared: INSTITUTION, delivered: AFTER_OTP, userTurns: 4, explicit: true }).status, "too_soon");
});

test("[§126] 하한(`notBeforeUserTurns` · 첫 문자 하한)은 명시 요청이어도 그대로", () => {
  assert.equal(resolveSmsGate({ purpose: "transfer", declared: INSTITUTION, delivered: [], userTurns: 3, explicit: true }).status, "too_early");
  assert.equal(resolveSmsGate({ purpose: "identity", declared: INSTITUTION, delivered: [], userTurns: 1, explicit: true }).status, "too_early");
  assert.equal(gateOpensAtUserTurns(INSTITUTION[1], [{ smsId: "institution-otp", userTurnsAtArrival: 2 }], true), 4);
});

test("[§126] 주장 백스톱 — 문자 간격 1로 연다 · 주장이 없으면 종전(열림 6 · 넛지 7 · 발송 8)", () => {
  assert.equal(planSmsBackstop({ declared: INSTITUTION, delivered: AFTER_OTP, userTurns: 5, claimed: true }).action, "deliver");
  assert.equal(planSmsBackstop({ declared: INSTITUTION, delivered: AFTER_OTP, userTurns: 4, claimed: true }).action, "wait");
  assert.equal(planSmsBackstop({ declared: INSTITUTION, delivered: AFTER_OTP, userTurns: 5 }).action, "wait");
  assert.equal(planSmsBackstop({ declared: INSTITUTION, delivered: AFTER_OTP, userTurns: 6 }).action, "wait");
  assert.equal(planSmsBackstop({ declared: INSTITUTION, delivered: AFTER_OTP, userTurns: 7 }).action, "nudge");
  assert.equal(planSmsBackstop({ declared: INSTITUTION, delivered: AFTER_OTP, userTurns: 8 }).action, "deliver");
});

test("[§126 배선] 발송 통로가 같은 명시 여부로 다시 판정한다 — 모델 도구 · 주장 백스톱만 명시", () => {
  const read = (rel: string) => readFileSync(path.join(__dirname, "../../../src/inCallSms", rel), "utf8").replace(/\r\n/g, "\n");
  const index = read("index.ts");
  assert.ok(index.includes('const smsClaimed = trigger === "backstop" && request.data?.smsClaimed === true;'));
  assert.ok(index.includes('explicit: trigger !== "backstop" || smsClaimed,'));
  const delivery = read("smsDelivery.ts");
  assert.ok(delivery.includes("explicit: input.explicit,"));
});
