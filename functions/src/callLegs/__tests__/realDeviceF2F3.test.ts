import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { findFlowVariant, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { LEG_DIAL_SMS_PENDING_GUIDANCE, isLegDialSmsPending } from "../legHandoff";
import type { RelayState } from "../legPlan";
import { decideAndMarkRealtimeHangup, type HangupDocSnapshot } from "../../scammerHangup/commit";

// 실기기 신고(2026-11-02 · 카드사 고급) F2 · F3 — 배송원이 번호 문자 없이 끊어 참가자가 번호 없는 빈 다이얼에 남았다 · "카드를 신청했다"는 답에 끝났다.

const SCENARIO = "card-company-impersonation";
const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");
const r1 = () => findFlowVariant("fv-k3dn")!;
const r2 = () => findFlowVariant("fv-r8vb")!;
const relayAt = (legIndex: number): RelayState => ({ legIndex, legStartUserTurns: Array(legIndex + 1).fill(0), connected: true });

test("[F2 판정표] 번호 문자 대기 = 나감 dial ∧ 이 레그 필수 번호 문자(dialNumberId) 미도착", () => {
  // 1행 — 배송원 레그(R1 레그 0): 번호 문자 전 = 대기 · 도착 뒤 = 아님.
  assert.equal(isLegDialSmsPending(r1(), undefined, []), true);
  assert.equal(isLegDialSmsPending(r1(), undefined, ["card-callback-number"]), false);
  // 3행 — 상담원 레그(R1 레그 1 · R2 레그 0): 필수 문자는 링크(설치)라 번호 문자가 아니다 — 다음 번호는 연락처에 있다.
  assert.equal(isLegDialSmsPending(r1(), relayAt(1), []), false);
  assert.equal(isLegDialSmsPending(r2(), relayAt(0), []), false);
  // 1행 — 나감 transfer · 마지막 레그 · 다통화 아님.
  assert.equal(isLegDialSmsPending(r1(), relayAt(2), []), false);
  assert.equal(isLegDialSmsPending(r1(), relayAt(4), []), false);
  assert.equal(isLegDialSmsPending(findFlowVariant("fv-akj5"), undefined, []), false);
  assert.equal(isLegDialSmsPending(undefined, undefined, []), false);
  assert.ok(!/\d{3,}/.test(LEG_DIAL_SMS_PENDING_GUIDANCE), "지시에 번호 0");
});

const fakeTx = (session: Record<string, unknown>) => {
  const updates: unknown[] = [];
  return {
    updates,
    tx: {
      get: async (): Promise<HangupDocSnapshot> => ({ exists: true, data: () => session }),
      update: (_ref: string, data: unknown) => updates.push(data),
    },
  };
};

test("[F2 끊기] 배송원 레그 · 번호 문자 전 = 4-b 거부(포기 끊기 포함) · 문자 뒤 = 승인(레그 끝)", async () => {
  const session = { status: "active", scenarioId: SCENARIO, difficultyLevel: "advanced", flowVariantId: "fv-k3dn" };
  for (const kind of ["goal", "give_up"] as const) {
    const { tx, updates } = fakeTx(session);
    const decision = await decideAndMarkRealtimeHangup(
      tx,
      { session: "s", verifyOffer: () => undefined, legScope: { nonLastLeg: true, legIndex: 0, turnsSinceLegStart: 5, dialSmsPending: true } },
      { userTurns: 5, pendingInstruction: false, kind },
      [],
      {} as FirebaseFirestore.Timestamp,
      false,
      false,
      false,
    );
    assert.deepEqual([decision.status, decision.row, updates.length], ["blocked_follow_up", "4-b", 0], kind);
  }
  const { tx, updates } = fakeTx(session);
  const decision = await decideAndMarkRealtimeHangup(
    tx,
    { session: "s", verifyOffer: () => undefined, legScope: { nonLastLeg: true, legIndex: 0, turnsSinceLegStart: 5, dialSmsPending: false } },
    { userTurns: 5, pendingInstruction: false, kind: "goal" },
    [{ smsId: "card-callback-number", userTurnsAtArrival: 2 }],
    {} as FirebaseFirestore.Timestamp,
    false,
    false,
    false,
  );
  assert.equal(decision.status, "accepted");
  assert.equal((updates[0] as { relay: RelayState }).relay.legEnded, 0);
});

test("[F2 배선] 실시간 · 폴백 두 경로가 같은 판정을 쓴다", () => {
  const realtime = read("scammerHangup/index.ts");
  assert.ok(realtime.includes("dialSmsPending: isLegDialSmsPending(variant, session.relay, delivered.map((d) => d.smsId)),"));
  assert.ok(realtime.includes("legScope?.dialSmsPending && decision.status === \"blocked_follow_up\""));
  assert.ok(read("scammerHangup/commit.ts").includes("followUpPending: legScope ? legScope.dialSmsPending === true : followUpPending,"));
  assert.ok(read("roleplay/index.ts").includes("followUpPending: isLegDialSmsPending(legVariant, session.relay, smsDelivered.map((d) => d.smsId)),"));
});

test("[F3] '신청했다'는 답에도 이어 간다 — 배송원(R1 레그 0) · R2 첫 상담원(레그 0)에만 · R1 상담원(레그 1)은 종전", () => {
  const courier = resolveSessionScenarioPrompt(SCENARIO, "fv-k3dn", 0)!.personaPrompt;
  assert.ok(courier.includes("상대가 카드를 신청했다고 하면 끝내지 말고"));
  assert.ok(courier.includes("상대가 카드를 신청했다고 하면 통화를 끝내지 말고"));
  const r2Agent = resolveSessionScenarioPrompt(SCENARIO, "fv-r8vb", 0)!.personaPrompt;
  assert.ok(r2Agent.includes("상대가 카드를 직접 신청했다고 하면 끝내지 말고"));
  const r1Agent = resolveSessionScenarioPrompt(SCENARIO, "fv-k3dn", 1)!.personaPrompt;
  assert.ok(!r1Agent.includes("직접 신청했다고 하면"));
  // R2 첫 상담원도 단계 수 · 순서 그대로(첫 단계만 늘었다).
  assert.equal(r2().legs[0].stages?.length, r1().legs[1].stages?.length);
  assert.deepEqual(r2().legs[0].stages?.slice(1), r1().legs[1].stages?.slice(1));
});
