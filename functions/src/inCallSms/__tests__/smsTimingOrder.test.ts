// ⭐ 2026-11-08 라이브 재시험 8 · 9(기관 사칭 고급 · Gemini Live) — 문자 지연(a) · 문자 순서(b). 사용자 결정 A1 · B1.
//
// a(재시험 8) — 사기범이 "인증번호 안내 문자 하나 보내드리겠습니다" → "문자로 간 인증번호 여섯 자리를 불러주시겠습니까?"라고 했는데 문자함 0,
//   참가자가 "아직 안 왔는데요"라고 한 뒤에야 도착했다. 코드 경로: 변형 선언 `INSTITUTION_OTP_V2.notBeforeUserTurns = 5`(§127 — 자동 백스톱이
//   인증번호 단계보다 먼저 강제하던 것을 막으려고 3 → 5)가 `resolveSmsGate` 3행에서 **모델 도구 호출에도** 걸린다. 흐름이 인증번호 단계에 발화 3 ~ 4에
//   먼저 이르면(§132.19 기록과 같은 모양) 도구는 `too_early`, "문자로 간 인증번호"는 화면 주장 정규식(`SMS_SENT_CLAIM`)에 걸리지 않아 정정도 없다.
//   ⇒ 판정표 F: 실시간 명시 요청(모델 도구 · 주장 백스톱)만 `explicitNotBeforeUserTurns`(3)로 연다. 자동 백스톱 · 텍스트 폴백은 5 그대로.
// b(재시험 9) — 인증번호 문자가 도착한 직후 사기범이 "보내 드린 인증번호를 불러 달라"고 했고(도착 안내 · 이미 도착 지시가 시키는 말), 그 말이 "보냈다"
//   주장으로 잡혀 서버가 남은 첫 필수 문자(안전계좌)를 바로 보냈다 — 인증번호를 불러 주기 전에 계좌 문자 도착. 코드 경로: `planSmsBackstop` claimed는
//   주장이 무엇을 가리키는지 보지 않고 `pending[0]`을 친다(문자 간격 1 · 명시).
//   ⇒ 판정표 CL: 주장 대상이 모두 이미 도착한 목적이면(CL3) 주장으로 보지 않는다(`claimTargetsPending`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  claimTargetsPending,
  correctModelSmsPurpose,
  gateOpensAtUserTurns,
  planSmsBackstop,
  resolveDeclaredSms,
  resolveSmsGate,
} from "../smsGate";
import type { DeliveredSmsRecord } from "../smsGate";
import { otpDemandGuardFor, SMS_OTP_DEMAND } from "../../roleplay/smsClaim";
import { findFlowVariant } from "../../scenarios/flowVariants";

const SCENARIO = "institutional-impersonation";
/** fv-c5fj(안전계좌 · 대출 3통화) · fv-q7cn(현금 출금 예약) · fv-g2ld(금 구매) — 인증번호 문자 `INSTITUTION_OTP_V2`를 쓰는 고급 루트 전부. */
const OTP_V2_VARIANTS = ["fv-c5fj", "fv-q7cn", "fv-g2ld"] as const;
const declaredOf = (variantId: string) => resolveDeclaredSms(SCENARIO, variantId, { relay: undefined }).declared;

test("[A1 판정표 F] 선언 — 고급 3루트의 인증번호 문자: 자동 하한 5 · 명시 하한 3", () => {
  for (const id of OTP_V2_VARIANTS) {
    const otp = findFlowVariant(id)?.sms.find((item) => item.purpose === "identity");
    assert.ok(otp, id);
    assert.equal(otp.notBeforeUserTurns, 5, id);
    assert.equal(otp.explicitNotBeforeUserTurns, 3, id);
    // 레그 범위 선언(발송 판정 지점)에도 값이 살아 있다(레그 0 — 시작 오프셋 0).
    assert.equal(declaredOf(id).find((item) => item.purpose === "identity")?.explicitNotBeforeUserTurns, 3, id);
  }
});

test("[A1 재현 a] 발화 3 · 4의 모델 도구 인증번호 호출 — 고친 뒤 allowed(종전 too_early → 참가자 재촉 뒤 발화 5에 도착)", () => {
  for (const id of OTP_V2_VARIANTS) {
    const declared = declaredOf(id);
    for (const userTurns of [3, 4]) {
      // 서버 `deliverInCallSms` 모델 도구 경로 = 보정(`correctModelSmsPurpose`) → 단일 통로(`resolveSmsGate` explicit · explicitFloor).
      const corrected = correctModelSmsPurpose({ purpose: "identity", declared, delivered: [], userTurns, explicitFloor: true });
      assert.equal(corrected.purpose, "identity");
      const gate = resolveSmsGate({ purpose: corrected.purpose, declared, delivered: [], userTurns, explicit: true, explicitFloor: true });
      assert.equal(gate.status, "allowed", `${id} 발화 ${userTurns}`);
      // 종전 판정(명시 하한 없음)은 같은 입력에서 막혔다 — 재시험 8의 거절.
      assert.equal(resolveSmsGate({ purpose: "identity", declared, delivered: [], userTurns, explicit: true }).status, "too_early");
    }
    // 첫 문자 하한(2)과 명시 하한(3)은 그대로 — 발화 2는 여전히 이르다.
    assert.equal(resolveSmsGate({ purpose: "identity", declared, delivered: [], userTurns: 2, explicit: true, explicitFloor: true }).status, "too_early");
  }
});

test("[A1 판정표 F3] 자동 백스톱 · 텍스트 폴백 하한은 5 그대로(§127 · §132.17 O2 · §132.19 B)", () => {
  for (const id of OTP_V2_VARIANTS) {
    const declared = declaredOf(id);
    // 주장 없는 백스톱: 발화 3 · 4 대기 · 6 넛지 · 7 발송(열림 5 + 간격 1 × 2) — 종전과 같다.
    assert.equal(planSmsBackstop({ declared, delivered: [], userTurns: 3 }).action, "wait");
    assert.equal(planSmsBackstop({ declared, delivered: [], userTurns: 4 }).action, "wait");
    assert.equal(planSmsBackstop({ declared, delivered: [], userTurns: 6 }).action, "nudge");
    assert.equal(planSmsBackstop({ declared, delivered: [], userTurns: 7 }).action, "deliver");
    // 텍스트 폴백 인증번호 요구 가드(O2)는 발화 4까지 그대로 막는다(`explicitFloor` 미사용).
    assert.equal(otpDemandGuardFor({ declared, delivered: [], userTurns: 4 }), SMS_OTP_DEMAND, id);
    assert.equal(otpDemandGuardFor({ declared, delivered: [], userTurns: 5 }), undefined, id);
  }
});

test("[A1] 실시간 주장 백스톱 — 명시 하한으로 열린다(발화 3 deliver · 2 wait) · 하한 없는 주장 판정은 종전(발화 4 wait)", () => {
  const declared = declaredOf("fv-c5fj");
  assert.equal(planSmsBackstop({ declared, delivered: [], userTurns: 3, claimed: true, explicitFloor: true }).action, "deliver");
  assert.equal(planSmsBackstop({ declared, delivered: [], userTurns: 2, claimed: true, explicitFloor: true }).action, "wait");
  assert.equal(planSmsBackstop({ declared, delivered: [], userTurns: 4, claimed: true }).action, "wait");
  // 게이트 열림 계산과 단일 판정이 같은 값(격자 전수 — 두 계산이 갈라지면 백스톱이 닫힌 문을 두드린다).
  const otp = declared[0];
  for (const explicitFloor of [true, false]) {
    const openAt = gateOpensAtUserTurns(otp, [], true, explicitFloor);
    const firstAllowed = [...Array(20).keys()].find(
      (userTurns) => resolveSmsGate({ purpose: "identity", declared, delivered: [], userTurns, explicit: true, explicitFloor }).status === "allowed",
    );
    assert.equal(firstAllowed, openAt, `explicitFloor ${explicitFloor}`);
  }
});

test("[A1] 다음 문자(안전계좌)의 하한은 바뀌지 않는다 — 명시여도 6 · 인증번호 도착 + 간격 1", () => {
  const declared = declaredOf("fv-c5fj");
  const otpAt3: DeliveredSmsRecord[] = [{ smsId: "institution-otp", userTurnsAtArrival: 3 }];
  assert.equal(resolveSmsGate({ purpose: "transfer", declared, delivered: otpAt3, userTurns: 5, explicit: true, explicitFloor: true }).status, "too_early");
  assert.equal(resolveSmsGate({ purpose: "transfer", declared, delivered: otpAt3, userTurns: 6, explicit: true, explicitFloor: true }).status, "allowed");
});

// ── B1 판정표 CL ──
const OTP_DELIVERED_AT_7: DeliveredSmsRecord[] = [{ smsId: "institution-otp", userTurnsAtArrival: 7 }];

test("[B1 판정표 CL] 행별 — CL2 판정 불가 · CL3 이미 도착만 · CL4 아직 안 간 목적", () => {
  const declared = declaredOf("fv-c5fj");
  // CL2 — 부재 · 빈 목록 · 배열 아님 · enum 밖 값만.
  for (const raw of [undefined, [], "identity", ["sms"], [1]]) assert.equal(claimTargetsPending(raw, declared, OTP_DELIVERED_AT_7), true, JSON.stringify(raw));
  // CL3 — 인증번호만 가리키고 인증번호는 이미 도착.
  assert.equal(claimTargetsPending(["identity"], declared, OTP_DELIVERED_AT_7), false);
  // CL4 — 아직 안 간 목적(계좌)을 하나라도 가리킨다 · 아무것도 도착 전이면 인증번호 주장도 그대로.
  assert.equal(claimTargetsPending(["identity", "transfer"], declared, OTP_DELIVERED_AT_7), true);
  assert.equal(claimTargetsPending(["transfer"], declared, OTP_DELIVERED_AT_7), true);
  assert.equal(claimTargetsPending(["identity"], declared, []), true);
  // 선언에 없는 도착 문자(다른 레그 등)는 "도착한 목적"으로 세지 않는다(보수 쪽 = 종전 주장).
  assert.equal(claimTargetsPending(["identity"], declared, [{ smsId: "other-sms", userTurnsAtArrival: 1 }]), true);
});

test("[B1 재현 b] 인증번호 도착(발화 7) 직후 '보내 드린 인증번호' 주장 — 고친 뒤 안전계좌 문자를 당기지 않는다(종전: 발화 9에 바로 발송)", () => {
  const declared = declaredOf("fv-c5fj");
  // 종전 = 주장을 그대로 믿은 판정: 남은 첫 필수 문자(안전계좌)가 간격 1로 열려 발송.
  const before = planSmsBackstop({ declared, delivered: OTP_DELIVERED_AT_7, userTurns: 9, claimed: true, explicitFloor: true });
  assert.equal(before.action, "deliver");
  assert.equal(before.action === "deliver" ? before.item.purpose : undefined, "transfer");
  // 고친 뒤 = 서버 `deliverInCallSms` 순서(주장 대상 판정 → 계획).
  const claimed = claimTargetsPending(["identity"], declared, OTP_DELIVERED_AT_7);
  assert.equal(claimed, false);
  const after = planSmsBackstop({ declared, delivered: OTP_DELIVERED_AT_7, userTurns: 9, claimed, explicitFloor: claimed });
  assert.equal(after.action, "wait");
  // 안전계좌는 자동 백스톱 일정대로(열림 max(6, 7 + 2) = 9 → 넛지 10 → 발송 11) — 참가자가 인증번호 단계에서 말할 틈이 남는다.
  assert.equal(planSmsBackstop({ declared, delivered: OTP_DELIVERED_AT_7, userTurns: 10 }).action, "nudge");
  assert.equal(planSmsBackstop({ declared, delivered: OTP_DELIVERED_AT_7, userTurns: 11 }).action, "deliver");
  // 사기범이 계좌 문자를 보냈다고 말하면(CL4) 종전대로 바로 간다.
  const transferClaim = claimTargetsPending(["transfer"], declared, OTP_DELIVERED_AT_7);
  assert.equal(planSmsBackstop({ declared, delivered: OTP_DELIVERED_AT_7, userTurns: 9, claimed: transferClaim, explicitFloor: transferClaim }).action, "deliver");
});

test("[A1 · B1 배선] deliverInCallSms — 주장 대상 판정이 계획 앞 · 명시 하한은 모델 도구 · 주장 백스톱만", () => {
  const source = readFileSync(path.join(__dirname, "../../../src/inCallSms/index.ts"), "utf8").replace(/\r\n/g, "\n");
  const claimCheck = source.indexOf("claimTargetsPending(request.data?.smsClaimedPurposes, declared, deliveredNow)");
  const plan = source.indexOf("const plan = planSmsBackstop({");
  assert.ok(claimCheck > 0 && plan > claimCheck, "주장 대상 판정이 백스톱 계획보다 먼저");
  assert.ok(source.includes("claimed: smsClaimed,\n      explicitFloor: smsClaimed,"));
  assert.ok(source.includes("userTurns, explicitFloor: true });"), "모델 도구 보정에 명시 하한");
  assert.ok(source.includes("explicitFloor: trigger !== \"backstop\" || smsClaimed,"), "발송 통로에 명시 하한");
  // 텍스트 폴백(`roleplay/index.ts`)은 명시 하한을 쓰지 않는다(판정표 F3).
  const roleplay = readFileSync(path.join(__dirname, "../../../src/roleplay/index.ts"), "utf8");
  assert.equal(roleplay.includes("explicitFloor"), false);
  // 계약 — 목적 enum 목록만(문장 원문 0).
  const types = readFileSync(path.join(__dirname, "../../../src/inCallSms/types.ts"), "utf8");
  assert.ok(types.includes("smsClaimedPurposes?: string[];"));
});
