// 2026-11-24 브라우저 A 라이브 A2(검찰 고급 fv-a6lq · 적대 참가자) — 본인 확인을 모두 거부한 참가자에게 사기범이 "사건 조회 링크에서 본인 확인"이라고 말한
// 턴에 대출 안내 문자가 도착했다. 원인(추정 — 확인: 운영 로그 `[T191] deliverInCallSms 판정`의 trigger = model_tool): 같은 목적(link) 문자가 둘이라
// 게이트 1-b가 사건 조회 링크를 다시 가리키려던 도구 호출을 아직 안 간 대출 안내로 바꿨다. 판정표 1-b′(`smsGate.ts`).
//
// | # | 고정하는 것 |
// |---|---|
// | LM1 | 재현 — 사건 조회 문자 도착 · 화면 미제출 ∧ 모델 도구 link → 대출 안내 아님(already_delivered → P-2a 다시 가리키기) · 발송 통로도 같은 판정 |
// | LM2 | 앞 화면 제출 뒤 모델 도구 link → 대출 안내(종전 1-b) |
// | LM3 | 자동 백스톱 · 모델 도구 아님 → 종전 1-b 그대로 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { correctModelSmsPurpose, resolveDeclaredSms, resolveSmsGate } from "../smsGate";
import { deliverSmsThroughGate } from "../smsDelivery";

const SCENARIO = "prosecution-cooperation-call";
const VARIANT = "fv-a6lq";
const CASE = "prosecution-case-link";
const GUIDE = "prosecution-loan-guide";

function declared() {
  const { declared: items } = resolveDeclaredSms(SCENARIO, VARIANT);
  assert.deepEqual(items.filter((d) => d.purpose === "link").map((d) => d.smsId), [CASE, GUIDE], "전제 — link 문자 둘");
  return items;
}

test("[LM1 재현] 사건 조회 화면 미제출 · 모델 도구 link → 대출 안내를 보내지 않고 사건 조회 문자를 다시 가리킨다", async () => {
  const items = declared();
  const delivered = [{ smsId: CASE, userTurnsAtArrival: 2 }];
  const gate = resolveSmsGate({ purpose: "link", declared: items, delivered, userTurns: 6, explicit: true, explicitFloor: true, modelTool: true });
  assert.equal(gate.status, "already_delivered");
  assert.equal(gate.item?.smsId, CASE);
  const corrected = correctModelSmsPurpose({ purpose: "link", declared: items, delivered, userTurns: 6, explicitFloor: true });
  assert.ok(corrected.alreadyDeliveredInstruction, "P-2a 지시");
  // 발송 통로(트랜잭션 안 재판정)도 같은 값 — 쓰기 0.
  let writes = 0;
  const store = {
    transact: <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({ listDelivered: async () => delivered, create: async () => { writes += 1; } }),
  };
  const result = await deliverSmsThroughGate(store as never, {
    scenarioId: SCENARIO, declared: items, purpose: "link", userTurns: 6, trigger: "model_tool", explicit: true, explicitFloor: true,
  } as never);
  assert.equal(result.status, "already_delivered");
  assert.equal(writes, 0);
});

test("[LM2] 사건 조회 화면 제출 뒤 모델 도구 link → 대출 안내(종전 1-b)", () => {
  const gate = resolveSmsGate({
    purpose: "link", declared: declared(), delivered: [{ smsId: CASE, userTurnsAtArrival: 2, landingSubmitted: true }],
    userTurns: 6, explicit: true, explicitFloor: true, modelTool: true,
  });
  assert.equal(gate.status, "allowed");
  assert.equal(gate.item?.smsId, GUIDE);
});

test("[LM3] 모델 도구가 아니면(자동 백스톱 · 주장) 종전 1-b 그대로", () => {
  const gate = resolveSmsGate({ purpose: "link", declared: declared(), delivered: [{ smsId: CASE, userTurnsAtArrival: 2 }], userTurns: 8 });
  assert.equal(gate.status, "allowed");
  assert.equal(gate.item?.smsId, GUIDE);
});
