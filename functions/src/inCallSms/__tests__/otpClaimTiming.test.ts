// ⭐ 2026-11-12 라이브 재시험 23 관찰 ⑫(기관 사칭 고급 `fv-c5fj` M3 · M2 현금 `fv-q7cn`도 같은 꼴) — 인증번호 문자가 사기범 요구보다 늦게 왔다.
//
// 0:57 사기범 "문자로 발송해 드린 인증 번호를 불러 주시겠습니까?" → 1:09 문자함 비어 있음 → 1:32 인증번호 문자 · 사기범 다음 대사 "인증번호는 금방 도착할 테니".
// 다음 대사는 서버 정정 문면(`SMS_CLAIM_NOT_YET` — "곧 도착한다고만")과 같다 ⇒ 주장 백스톱이 `wait`였다. 인증번호 문자(`INSTITUTION_OTP_V2`)는 명시 하한 3 ·
// 앞선 문자 0통 ⇒ 남는 원인 = 사용자 발화 2(흐름 4단계가 두 번 답한 사이에 압축). FE는 앞 화면이 있는 문자에만 · CL은 이미 도착한 문자를 가리킬 때만이라 둘 다 무관.
// 판정표 OC(`smsGate.ts`): 그 문자를 가리킨 주장만 `claimNotBeforeUserTurns`(2)로 연다. 도구(3) · 자동(5)은 그대로. CL5: 선언 밖 목적만 가리키는 주장은 무시.
// ⚠️ 새 필드는 객체 변수로 넘긴다(리터럴 초과 속성 검사 없이 — 수정 전 코드로도 컴파일돼 런타임에서 fail한다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { claimTargetsPending, planSmsBackstop, resolveDeclaredSms, resolveSmsGate } from "../smsGate";
import { SMS_OTP_DEMAND } from "../../roleplay/smsClaim";

const SCENARIO = "institutional-impersonation";
const OTP_ROUTES = ["fv-c5fj", "fv-q7cn", "fv-g2ld"] as const;
const declaredOf = (variant: string) => resolveDeclaredSms(SCENARIO, variant, { relay: undefined }).declared;
const SRC = path.resolve(__dirname, "../../../src");

test("[재시험 23 ⑫ 재현] 발화 2의 '발송해 드린 인증번호를 불러 달라' 주장 → 그 턴에 인증번호 문자(종전 wait + 정정)", () => {
  for (const variant of OTP_ROUTES) {
    const declared = declaredOf(variant);
    const input = { declared, delivered: [], userTurns: 2, claimed: true, explicitFloor: true, claimedPurposes: ["identity" as const] };
    const plan = planSmsBackstop(input);
    assert.equal(plan.action, "deliver", variant);
    assert.equal(plan.action === "deliver" && plan.item.smsId, "institution-otp", variant);
    // 발송 통로의 재판정(주장 백스톱 = explicit · explicitFloor · 같은 대상 목적)도 같은 결론.
    const gate = { purpose: "identity", declared, delivered: [], userTurns: 2, explicit: true, explicitFloor: true, claimedPurposes: ["identity" as const] };
    assert.equal(resolveSmsGate(gate).status, "allowed", variant);
  }
});

test("[판정표 OC] 주장 대상 · 도구 · 자동 백스톱 — 인증번호 문자의 하한", () => {
  for (const variant of OTP_ROUTES) {
    const declared = declaredOf(variant);
    const otp = declared.find((d) => d.smsId === "institution-otp") as (typeof declared)[number] & { claimNotBeforeUserTurns?: number };
    assert.equal(otp.claimNotBeforeUserTurns, 2, `${variant} 선언`);
    // OC2 · 첫 문자 하한(2) 아래로는 열지 않는다.
    const early = { declared, delivered: [], userTurns: 1, claimed: true, explicitFloor: true, claimedPurposes: ["identity" as const] };
    assert.equal(planSmsBackstop(early).action, "wait", `${variant} 발화 1`);
    // OC3 — 대상 목록 없음 · 다른 목적만 = 종전(명시 하한 3).
    for (const claimedPurposes of [undefined, [] as const, ["transfer" as const]]) {
      const input = { declared, delivered: [], userTurns: 2, claimed: true, explicitFloor: true, ...(claimedPurposes ? { claimedPurposes } : {}) };
      assert.equal(planSmsBackstop(input).action, "wait", `${variant} OC3 ${JSON.stringify(claimedPurposes)}`);
      const at3 = { ...input, userTurns: 3 };
      assert.equal(planSmsBackstop(at3).action, "deliver", `${variant} OC3 발화 3`);
    }
    // OC4 — 모델 도구(주장 아님) = 명시 하한 3(§115 압축 방지 그대로).
    assert.equal(resolveSmsGate({ purpose: "identity", declared, delivered: [], userTurns: 2, explicit: true, explicitFloor: true }).status, "too_early");
    assert.equal(resolveSmsGate({ purpose: "identity", declared, delivered: [], userTurns: 3, explicit: true, explicitFloor: true }).status, "allowed");
    // OC5 — 자동 백스톱 · 폴백(explicitFloor 아님) = 하한 5. 대상 목적이 실려도 explicitFloor 없이는 주장 하한을 쓰지 않는다.
    const auto = { declared, delivered: [], userTurns: 4, claimedPurposes: ["identity" as const] };
    assert.notEqual(planSmsBackstop(auto).action, "deliver", `${variant} 자동 발화 4`);
    assert.equal(resolveSmsGate({ purpose: "identity", declared, delivered: [], userTurns: 4, claimedPurposes: ["identity"] } as Parameters<typeof resolveSmsGate>[0]).status, "too_early");
  }
});

test("[판정표 OC1] 주장 하한이 없는 문자는 대상 목적이 실려도 종전 — 계좌 문자 · 다른 시나리오", () => {
  const declared = declaredOf("fv-c5fj");
  // 인증번호 도착(발화 2) 뒤 계좌 주장 — 계좌 문자는 하한 6 그대로.
  const delivered = [{ smsId: "institution-otp", userTurnsAtArrival: 2 }];
  const input = { declared, delivered, userTurns: 4, claimed: true, explicitFloor: true, claimedPurposes: ["transfer" as const] };
  assert.equal(planSmsBackstop(input).action, "wait");
  const at6 = { ...input, userTurns: 6 };
  assert.equal(planSmsBackstop(at6).action, "deliver");
});

test("[판정표 CL5] 선언 밖 목적만 가리키는 주장은 주장이 아니다 — 인증번호 요구가 다른 문자를 당기지 않는다", () => {
  // 인증번호 문자가 없는 루트(자산 보호 고급) — 인증번호 요구 주장.
  const noOtp = resolveDeclaredSms("asset-protection-notice-call", "fv-k9ra", { relay: undefined }).declared;
  assert.ok(!noOtp.some((d) => d.purpose === "identity"));
  assert.equal(claimTargetsPending(["identity"], noOtp, []), false);
  // 선언 안 목적이 섞이면 종전(CL4).
  assert.equal(claimTargetsPending(["identity", "transfer"], noOtp, []), noOtp.some((d) => d.purpose === "transfer"));
  // 인증번호 문자가 있는 루트 = 종전(CL4 · CL3).
  const declared = declaredOf("fv-c5fj");
  assert.equal(claimTargetsPending(["identity"], declared, []), true);
  assert.equal(claimTargetsPending(["identity"], declared, [{ smsId: "institution-otp", userTurnsAtArrival: 2 }]), false);
  // CL2 — 목록 없음 · 빈 목록 = 주장(종전).
  assert.equal(claimTargetsPending(undefined, noOtp, []), true);
  assert.equal(claimTargetsPending([], noOtp, []), true);
});

test("[배선] 콜러블이 CL 뒤의 주장 대상 목적을 백스톱 계획 · 발송 통로 둘 다에 싣는다 · 화면 요구 꼴 = 폴백과 같은 글자", () => {
  const handler = readFileSync(path.join(SRC, "inCallSms/index.ts"), "utf8");
  const plan = handler.slice(handler.indexOf("const plan = planSmsBackstop({"), handler.indexOf("const plan = planSmsBackstop({") + 400);
  assert.match(plan, /claimedPurposes/);
  const gate = handler.slice(handler.indexOf("deliverSmsThroughGate(firestoreSmsStore"), handler.indexOf("deliverSmsThroughGate(firestoreSmsStore") + 1200);
  assert.match(gate, /claimedPurposes/);
  // CL 판정(무시)이 대상 목적 결정보다 앞이다 — 무시된 주장은 대상 목적이 없다.
  assert.ok(handler.indexOf("claimTargetsPending(request.data?.smsClaimedPurposes") < handler.indexOf("claimedPurposes = [...new Set(purposes)]"));
  const delivery = readFileSync(path.join(SRC, "inCallSms/smsDelivery.ts"), "utf8");
  assert.match(delivery.slice(delivery.indexOf("const gate = resolveSmsGate({")), /claimedPurposes/);
  // 화면(`toolWindow.ts`)의 인증번호 요구 꼴이 폴백(§132.17 O1)과 글자까지 같다.
  const client = readFileSync(path.resolve(SRC, "../../src/lib/realtime/toolWindow.ts"), "utf8");
  const line = client.split(/\r?\n/).find((l) => l.startsWith("export const SMS_OTP_DEMAND = "));
  assert.equal(line?.trim(), `export const SMS_OTP_DEMAND = /${SMS_OTP_DEMAND.source}/;`);
});
