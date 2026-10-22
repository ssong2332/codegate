// §108(2026-10-22 실기 신고 *"문자 발송이 여전히 느리게 온다"*) — 모델 도구 목적 보정 판정표 P-1~P-3(`correctModelSmsPurpose`).
// 운영 로그 두 세션의 요청 순서를 그대로 재현한다(§108.3 표). 배선은 소스 스캔(`deliverInCallSmsGateOrdering.test.ts` 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { correctModelSmsPurpose, resolveSmsGate } from "../smsGate";
import type { DeliveredSmsRecord } from "../smsGate";
import type { FlowVariantSms } from "../../scenarios/flowVariants";

const INSTITUTION: FlowVariantSms[] = [
  { purpose: "identity", smsId: "institution-otp", required: true, notBeforeUserTurns: 2 },
  { purpose: "transfer", smsId: "institution-safe-account", required: true, notBeforeUserTurns: 4 },
];
const LINK_THEN_TRANSFER: FlowVariantSms[] = [
  { purpose: "link", smsId: "loan-check-app-link", required: true, notBeforeUserTurns: 2 },
  { purpose: "transfer", smsId: "loan-account", required: true, notBeforeUserTurns: 3 },
];

test("[§108 P-1] 게이트를 통과하는 목적은 그대로", () => {
  const r = correctModelSmsPurpose({ purpose: "identity", declared: INSTITUTION, delivered: [], userTurns: 4 });
  assert.deepEqual(r, { purpose: "identity" });
});

test("[§108 P-2] 로그 1a54b807 재현 — 없는 목적(link)을 부르면 열린 필수 문자(transfer)로 바꾼다 · 발화 8에 도착(종전 백스톱 10)", () => {
  const delivered: DeliveredSmsRecord[] = [{ smsId: "institution-otp", userTurnsAtArrival: 4 }];
  const r = correctModelSmsPurpose({ purpose: "link", declared: INSTITUTION, delivered, userTurns: 8 });
  assert.deepEqual(r, { purpose: "transfer", correctedFrom: "link" });
  assert.equal(resolveSmsGate({ purpose: r.purpose, declared: INSTITUTION, delivered, userTurns: 8 }).status, "allowed");
});

test("[§108 P-2] 로그 47891afd 형태 재현 — 이미 보낸 목적(link)을 다시 부르면 남은 필수(transfer)로 바꾼다", () => {
  const delivered: DeliveredSmsRecord[] = [{ smsId: "loan-check-app-link", userTurnsAtArrival: 3 }];
  const r = correctModelSmsPurpose({ purpose: "link", declared: LINK_THEN_TRANSFER, delivered, userTurns: 6 });
  assert.deepEqual(r, { purpose: "transfer", correctedFrom: "link" });
});

test("[§108 P-3] 하한은 앞당기지 않는다 — 문자 간격(too_soon) · 첫 문자 하한(too_early) · 남은 필수 0 · 게이트 닫힘", () => {
  const afterOtp: DeliveredSmsRecord[] = [{ smsId: "institution-otp", userTurnsAtArrival: 4 }];
  // 요청 목적 자체가 too_soon — 보정 대상 아님(거절 그대로).
  assert.deepEqual(correctModelSmsPurpose({ purpose: "transfer", declared: INSTITUTION, delivered: afterOtp, userTurns: 5 }), {
    purpose: "transfer",
  });
  // 없는 목적 · 남은 필수의 게이트가 아직 닫힘(발화 5 < 열림 6) → 그대로(not_allowed).
  assert.deepEqual(correctModelSmsPurpose({ purpose: "link", declared: INSTITUTION, delivered: afterOtp, userTurns: 5 }), {
    purpose: "link",
  });
  // 첫 문자 하한 전(발화 1) → 그대로.
  assert.deepEqual(correctModelSmsPurpose({ purpose: "link", declared: INSTITUTION, delivered: [], userTurns: 1 }), { purpose: "link" });
  // 남은 필수 0 → 그대로(already_delivered 거절).
  const all: DeliveredSmsRecord[] = [
    { smsId: "institution-otp", userTurnsAtArrival: 4 },
    { smsId: "institution-safe-account", userTurnsAtArrival: 6 },
  ];
  assert.deepEqual(correctModelSmsPurpose({ purpose: "transfer", declared: INSTITUTION, delivered: all, userTurns: 9 }), {
    purpose: "transfer",
  });
});

test("[§108 배선] deliverInCallSms — 모델 도구 경로만 보정을 거치고, 발송은 같은 단일 통로 · 로그에 보정 전 목적", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/inCallSms/index.ts"), "utf8");
  const at = src.indexOf("correctModelSmsPurpose({ purpose, declared");
  assert.ok(at > 0, "보정 호출이 없다");
  assert.ok(src.lastIndexOf('if (trigger !== "backstop") {', at) > src.indexOf("purpose = plan.item.purpose;"), "백스톱 분기 뒤 · 모델 도구 경로에서만");
  assert.ok(src.indexOf("deliverSmsThroughGate(", at) > at, "보정 뒤 같은 통로로 발송");
  assert.ok(src.includes("...(purposeCorrectedFrom ? { purposeCorrectedFrom } : {}),"));
});
