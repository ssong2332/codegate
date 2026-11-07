import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { findFlowVariant, type FlowVariant } from "../../scenarios/flowVariants";
import {
  buildLegRejoinContext,
  legCounterpartNumber,
  planLegHangup,
  planLegStart,
  type LegStartPlan,
  type RelayState,
} from "../legPlan";
import { readStartCallLegRequest } from "../request";

// 2026-11-07 메인 승인 계약(전화 앱 세션 제안) — 참가자가 통화를 먼저 끊는다(`startCallLeg({action:"hangup"})`) · 끊은 레그의 재연결.

const SCENARIO = "card-company-impersonation";
const R1 = () => findFlowVariant("fv-k3dn") as FlowVariant;
const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");
const connected = (legIndex: number, starts: number[]): RelayState => ({ legIndex, legStartUserTurns: starts, connected: true, entry: "dial" });
const hungUp = (legIndex: number, starts: number[]): RelayState => {
  const plan = planLegHangup(R1(), connected(legIndex, starts));
  assert.equal(plan.status, "ended");
  return (plan as { relay: RelayState }).relay;
};
const start = (relay: RelayState | undefined, action: "dial" | "callback" | "transfer", dialed?: string, installConsented = true): LegStartPlan =>
  planLegStart({ variant: R1(), relay, action, dialed, installConsented, userTurns: 11 });

test("[참가자 끊기] 요청 — action hangup을 받는다(dialed 불필요) · 모르는 행동은 invalid-argument", () => {
  assert.deepEqual(readStartCallLegRequest({ sessionId: "s1", action: "hangup" }), { sessionId: "s1", action: "hangup" });
  assert.throws(() => readStartCallLegRequest({ sessionId: "s1", action: "end" }), (e: { code?: string }) => e.code === "invalid-argument");
});

test("[참가자 끊기 H1~H4] 연결 중 = 레그 끝 + hungUpBy · 이미 끝난 레그 = 쓰기 0 · 연결 전 = wrong_action · 다통화 아님", () => {
  const plan = planLegHangup(R1(), connected(1, [0, 4]));
  assert.deepEqual(plan, {
    status: "ended",
    legIndex: 1,
    relay: { legIndex: 1, legStartUserTurns: [0, 4], connected: false, legEnded: 1, hungUpBy: "participant", entry: "dial" },
  });
  // 첫 수신 레그(relay 부재 = 세션 시작 통화)도 끊을 수 있다.
  const first = planLegHangup(R1(), undefined);
  assert.equal(first.status, "ended");
  assert.deepEqual((first as { relay: RelayState }).relay, { legIndex: 0, legStartUserTurns: [0], connected: false, legEnded: 0, hungUpBy: "participant" });
  // 사기범이 먼저 끝낸 레그 — 기록을 덮지 않는다(relay 0).
  assert.deepEqual(planLegHangup(R1(), { legIndex: 1, legStartUserTurns: [0, 4], connected: false, legEnded: 1 }), { status: "ended", legIndex: 1 });
  // R2 시작 문자 화면(첫 레그 연결 전).
  const r2 = findFlowVariant("fv-r8vb") as FlowVariant;
  assert.deepEqual(planLegHangup(r2, { legIndex: 0, legStartUserTurns: [], connected: false }), { status: "not_ready", reason: "wrong_action" });
  assert.deepEqual(planLegHangup(findFlowVariant("fv-akj5") as FlowVariant, undefined), { status: "not_ready", reason: "not_multi_call" });
  // 재연결 표식은 끊기에서 지운다.
  const after = planLegHangup(R1(), { ...connected(1, [0, 4]), rejoin: { kind: "redial", atUserTurns: 6 } });
  assert.equal((after as { relay: RelayState }).relay.rejoin, undefined);
});

test("[계약 2] 끊은 뒤 그 레그 상대 번호로 다시 걸면 같은 레그 재연결 — 상담원 02-0762-5513 · 배송원 010-0794-2261 · 레그 시작 발화 수 유지", () => {
  const agent = start(hungUp(1, [0, 4]), "dial", "02-0762-5513");
  assert.equal(agent.status, "connected");
  if (agent.status === "connected") {
    assert.deepEqual([agent.legIndex, agent.entry, agent.rejoin], [1, "dial", "redial"]);
    assert.deepEqual(agent.relay, { legIndex: 1, legStartUserTurns: [0, 4], connected: true, entry: "dial", rejoin: { kind: "redial", atUserTurns: 11 } });
  }
  const courierRelay = (planLegHangup(R1(), undefined) as { relay: RelayState }).relay;
  const courier = start(courierRelay, "dial", "01007942261");
  assert.equal(courier.status, "connected");
  if (courier.status === "connected") assert.deepEqual([courier.legIndex, courier.entry, courier.rejoin], [0, "dial", "redial"]);
  assert.equal(legCounterpartNumber(SCENARIO, R1().legs[0]), "010-0794-2261");
  assert.equal(legCounterpartNumber(SCENARIO, R1().legs[2]), "02-0700-3324");
});

test("[계약 3 · 4] 끊은 뒤 다음 레그 번호 = 종전 가로채기 판정 · 그 밖 번호부 번호 = 진짜 안내 · 없는 번호", () => {
  const relay = hungUp(1, [0, 4]);
  const next = start(relay, "dial", "02-0700-3324", true);
  assert.equal(next.status, "connected");
  if (next.status === "connected") assert.deepEqual([next.legIndex, next.rejoin], [2, undefined]);
  assert.equal(start(relay, "dial", "02-0700-3324", false).status, "genuine", "앱 응낙 전 = 진짜 안내");
  assert.equal(start(relay, "dial", "02-0715-8800").status, "genuine");
  assert.equal(start(relay, "dial", "02-1234-5678").status, "unknown_number");
});

test("[계약 5] 끊은 뒤 callback = 같은 레그 상대가 다시 걸어 온다(entry incoming · 같은 인물)", () => {
  const plan = start(hungUp(2, [0, 4, 9]), "callback");
  assert.equal(plan.status, "connected");
  if (plan.status === "connected") {
    assert.deepEqual([plan.legIndex, plan.entry, plan.rejoin, plan.leg.speakerId], [2, "incoming", "callback", "supervisor"]);
    assert.equal(plan.relay.hungUpBy, undefined);
    assert.equal(plan.relay.legEnded, undefined);
  }
});

test("[계약 6] 마지막 레그(검사)도 같다 — 끊기 · callback · 그 번호 재다이얼 = 재연결 · 그 밖 번호 = 진짜 안내 / 없는 번호", () => {
  const relay = hungUp(3, [0, 4, 9, 12]);
  assert.equal(start(relay, "callback").status, "connected");
  const redial = start(relay, "dial", "02-0746-2108");
  assert.equal(redial.status, "connected");
  if (redial.status === "connected") assert.deepEqual([redial.legIndex, redial.rejoin], [3, "redial"]);
  assert.equal(start(relay, "dial", "02-0700-3324").status, "genuine");
  assert.equal(start(relay, "dial", "02-0762-5513").status, "unknown_number");
  // 재연결 뒤 다시 끊을 수 있다.
  if (redial.status === "connected") assert.equal(planLegHangup(R1(), redial.relay).status, "ended");
});

test("[종전 유지] 사기범이 끝낸 레그(hungUpBy 없음) — callback = 다음 레그 · 같은 상대 번호 = 없는 번호", () => {
  const ended: RelayState = { legIndex: 0, legStartUserTurns: [0], connected: false, legEnded: 0 };
  const cb = start(ended, "callback");
  assert.equal(cb.status, "connected");
  if (cb.status === "connected") assert.deepEqual([cb.legIndex, cb.rejoin], [1, undefined]);
  assert.equal(start(ended, "dial", "010-0794-2261").status, "unknown_number");
});

test("[재연결 맥락] 같은 사람 · 이 통화 말만(앞 통화 0) · 본인 확인 반복 금지 · 재다이얼 / 재발신 문면", () => {
  const messages = [
    { role: "scammer", text: "배송원 말", legIndex: 0 },
    { role: "user", text: "배송원에게 한 말", legIndex: 0 },
    { role: "scammer", text: "상담원 질문", legIndex: 1 },
    { role: "user", text: "상담원에게 한 답", legIndex: 1 },
    { role: "scammer", text: "도달 안 함", legIndex: 1, notSpoken: true },
  ];
  const block = buildLegRejoinContext("redial", 1, messages);
  assert.ok(block.includes("너: 상담원 질문") && block.includes("상대: 상담원에게 한 답"));
  assert.ok(!block.includes("배송원"), "앞 통화 대화 0");
  assert.ok(!block.includes("도달 안 함"));
  assert.ok(block.includes("다시 전화를 걸어 왔다") && block.includes("처음부터 다시 하지 않는다"));
  assert.ok(buildLegRejoinContext("callback", 1).includes("네가 같은 번호로 상대에게 다시 전화를 걸었다"));
  assert.ok(!buildLegRejoinContext("callback", 1).includes("오간 말"), "메시지 없음 = 상황 문장만(폴백)");
  // legIndex 부재 줄은 레그 0으로 본다(첫 수신 통화의 오프닝 등).
  assert.ok(buildLegRejoinContext("callback", 0, [{ role: "user", text: "첫 통화 답" }]).includes("상대: 첫 통화 답"));
});

test("[배선] 콜러블 hangup = 트랜잭션 relay만 · Live 재연결 맥락 · 폴백 첫 턴 상황 문장", () => {
  const callable = read("callLegs/index.ts");
  const hang = callable.slice(callable.indexOf('if (action === "hangup") {'), callable.indexOf("// 트랜잭션 밖 읽기"));
  assert.ok(hang.includes("planLegHangup(variant, session.relay)") && hang.includes('return hung.status === "ended"'));
  assert.ok(!hang.includes("mockScreens"), "끊기는 외부 읽기 0");
  const realtime = read("realtime/index.ts");
  assert.ok(realtime.includes("if (callLeg && rejoin) {") && realtime.includes("buildLegRejoinContext("));
  const fallback = read("roleplay/index.ts");
  assert.ok(fallback.includes("turnCount === rejoin.atUserTurns + 1") && fallback.includes("[legRejoinNotice, promptTurnInstruction,"));
});
