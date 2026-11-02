import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import {
  buildPriorLegContext,
  legHangupAdjustments,
  legVoiceSlot,
  planLegStart,
  resolveSessionCallLeg,
  splitLegHistory,
  type RelayState,
} from "../legPlan";
import { installLandingIds, readStartCallLegRequest } from "../request";
import { findFlowVariant, sessionUsesVerifyIntercept, type FlowVariant } from "../../scenarios/flowVariants";
import { DIAL_DIRECTORY } from "../../scenarios/dialDirectory";
import { resolveDeclaredSms } from "../../inCallSms/smsGate";
import { decideAndMarkRealtimeHangup, isVerifyInterceptSession, type HangupDocSnapshot, type HangupTransaction } from "../../scammerHangup/commit";

// §142(카드사 고급 재구성 PR-3) — 다통화 레그 런타임(Architecture.md §142.3 · §142.4). 실제 카탈로그 변형(fv-k3dn R1 · fv-r8vb R2)으로 고정한다.

const SCENARIO = "card-company-impersonation";
const R1 = findFlowVariant("fv-k3dn") as FlowVariant;
const R2 = findFlowVariant("fv-r8vb") as FlowVariant;
const numberOf = (numberId: string): string => {
  const entry = DIAL_DIRECTORY[SCENARIO]?.find((e) => e.numberId === numberId);
  assert.ok(entry, `번호부에 ${numberId}가 없다`);
  return entry.number;
};
const FAKE_CALLBACK = numberOf("card-fake-callback");
const GENUINE_CENTER = numberOf("card-genuine-center");
const SUPERVISOR_OFFICIAL = numberOf("supervisor-official");
const ended = (legIndex: number, starts: number[]): RelayState => ({ legIndex, legStartUserTurns: starts, connected: false, legEnded: legIndex });

test("[§142.4] 전제 — R1 · R2는 다통화 변형이고 레그 수가 설계대로다(5 · 4)", () => {
  assert.equal(R1.multiCall, true);
  assert.equal(R2.multiCall, true);
  assert.equal(R1.legs.length, 5);
  assert.equal(R2.legs.length, 4);
});

test("[§142.4 1행] 다통화가 아닌 변형은 다음 레그를 열지 않는다", () => {
  const plain = findFlowVariant("fv-akj5") as FlowVariant;
  const plan = planLegStart({ variant: plain, relay: undefined, action: "dial", dialed: FAKE_CALLBACK, installConsented: false, userTurns: 3 });
  assert.deepEqual(plan, { status: "not_ready", reason: "not_multi_call" });
});

test("[§142.4 3행] R1 첫 레그(수신 통화)가 끝나기 전에는 다이얼이 연결되지 않는다", () => {
  const plan = planLegStart({ variant: R1, relay: undefined, action: "dial", dialed: FAKE_CALLBACK, installConsented: false, userTurns: 3 });
  assert.deepEqual(plan, { status: "not_ready", reason: "leg_in_progress" });
});

test("[§142.4 8행] R1 배송원 레그 끝 → 문자 속 가짜 대표번호로 걸면 상담원 레그 연결 · 레그 시작 발화 수 기록", () => {
  const plan = planLegStart({ variant: R1, relay: ended(0, [0]), action: "dial", dialed: FAKE_CALLBACK, installConsented: false, userTurns: 4 });
  assert.equal(plan.status, "connected");
  if (plan.status !== "connected") return;
  assert.equal(plan.legIndex, 1);
  assert.equal(plan.entry, "dial");
  assert.deepEqual(plan.relay, { legIndex: 1, legStartUserTurns: [0, 4], connected: true, entry: "dial" });
});

test("[§142.4 9행 · D3] 진짜 카드사 대표번호로 걸면 자동 안내(방어 종료) — 사기범 레그로 이어지지 않는다", () => {
  const plan = planLegStart({ variant: R1, relay: ended(0, [0]), action: "dial", dialed: GENUINE_CENTER, installConsented: false, userTurns: 4 });
  assert.equal(plan.status, "genuine");
  if (plan.status !== "genuine") return;
  assert.equal(plan.entry.numberId, "card-genuine-center");
  assert.ok((plan.entry.genuineNotice ?? []).length > 0);
});

test("[§142.4 7행] 번호부에 없는 번호는 unknown_number · 하이픈 · 공백 차이는 같은 번호로 본다", () => {
  const unknown = planLegStart({ variant: R1, relay: ended(0, [0]), action: "dial", dialed: "010-1234-5678", installConsented: false, userTurns: 4 });
  assert.deepEqual(unknown, { status: "unknown_number" });
  const bare = planLegStart({ variant: R1, relay: ended(0, [0]), action: "dial", dialed: FAKE_CALLBACK.replace(/-/g, " "), installConsented: false, userTurns: 4 });
  assert.equal(bare.status, "connected");
});

test("[§142.4 8 · 9행] 감독기관 공식 번호 — 원격 지원 앱 응낙 전 = 진짜 안내 · 응낙 뒤 = 가로채기(사기범 레그)", () => {
  const before = planLegStart({ variant: R1, relay: ended(1, [0, 4]), action: "dial", dialed: SUPERVISOR_OFFICIAL, installConsented: false, userTurns: 9 });
  assert.equal(before.status, "genuine");
  const after = planLegStart({ variant: R1, relay: ended(1, [0, 4]), action: "dial", dialed: SUPERVISOR_OFFICIAL, installConsented: true, userTurns: 9 });
  assert.equal(after.status, "connected");
  if (after.status === "connected") assert.equal(after.legIndex, 2);
});

test("[§142.4 5 · 6행] 나가는 방식과 행동 — transfer 자리에 dial은 거부 · dial 자리의 callback(D4)은 연결(entry incoming)", () => {
  // 레그 2(감독기관 첫 통화)의 끝은 호 전환이다.
  const wrong = planLegStart({ variant: R1, relay: ended(2, [0, 4, 9]), action: "dial", dialed: FAKE_CALLBACK, installConsented: true, userTurns: 12 });
  assert.deepEqual(wrong, { status: "not_ready", reason: "wrong_action" });
  const transfer = planLegStart({ variant: R1, relay: ended(2, [0, 4, 9]), action: "transfer", installConsented: true, userTurns: 12 });
  assert.equal(transfer.status, "connected");
  if (transfer.status === "connected") assert.deepEqual([transfer.legIndex, transfer.entry], [3, "transfer"]);
  const callback = planLegStart({ variant: R1, relay: ended(0, [0]), action: "callback", installConsented: false, userTurns: 4 });
  assert.equal(callback.status, "connected");
  if (callback.status === "connected") assert.deepEqual([callback.legIndex, callback.entry], [1, "incoming"]);
});

test("[§142.4 4행] 마지막 레그 뒤에는 다음 레그가 없다", () => {
  const plan = planLegStart({ variant: R1, relay: ended(4, [0, 4, 9, 12, 15]), action: "transfer", installConsented: true, userTurns: 18 });
  assert.deepEqual(plan, { status: "not_ready", reason: "no_next_leg" });
});

test("[§142.4 2행] R2 — 세션은 발급 문자에서 시작(연결 전) · 첫 다이얼이 레그 0(상담원)을 연다 · 호 전환은 거부", () => {
  const plan = planLegStart({ variant: R2, relay: undefined, action: "dial", dialed: FAKE_CALLBACK, installConsented: false, userTurns: 0 });
  assert.equal(plan.status, "connected");
  if (plan.status === "connected") assert.deepEqual(plan.relay, { legIndex: 0, legStartUserTurns: [0], connected: true, entry: "dial" });
  const transfer = planLegStart({ variant: R2, relay: undefined, action: "transfer", installConsented: false, userTurns: 0 });
  assert.deepEqual(transfer, { status: "not_ready", reason: "wrong_action" });
});

test("[§142.3] 레그 문자 게이트 — 현재 레그 문자만 · 하한은 레그 시작 발화 수만큼 뒤로", () => {
  const leg0 = resolveDeclaredSms(SCENARIO, "fv-k3dn", { relay: undefined }).declared;
  assert.deepEqual(leg0.map((s) => s.smsId), ["card-callback-number"]);
  const leg1 = resolveDeclaredSms(SCENARIO, "fv-k3dn", { relay: { legIndex: 1, legStartUserTurns: [0, 4], connected: true } }).declared;
  assert.deepEqual(leg1.map((s) => [s.smsId, s.notBeforeUserTurns]), [["card-remote-support-link", 2 + 4]]);
  const last = resolveDeclaredSms(SCENARIO, "fv-k3dn", { relay: { legIndex: 4, legStartUserTurns: [0, 4, 9, 12, 15], connected: true } }).declared;
  assert.deepEqual(last.map((s) => [s.smsId, s.notBeforeUserTurns]), [["card-safe-account", 1 + 15]]);
  // 범위 인자 부재(도달 랜딩 · 계좌 해석 등 변형 전체를 보는 지점) = 종전(전체 선언).
  assert.equal(resolveDeclaredSms(SCENARIO, "fv-k3dn").declared.length, R1.sms.length);
});

test("[§142.3] 끊기 보정 — 마지막이 아닌 레그만 nonLastLeg · 5행 하한은 레그 시작 뒤 발화 수", () => {
  assert.deepEqual(legHangupAdjustments(R1, { legIndex: 1, legStartUserTurns: [0, 4] }, 7), { nonLastLeg: true, turnsSinceLegStart: 3 });
  assert.deepEqual(legHangupAdjustments(R1, { legIndex: 4, legStartUserTurns: [0, 4, 9, 12, 15] }, 20), { nonLastLeg: false, turnsSinceLegStart: 5 });
  assert.equal(legHangupAdjustments(findFlowVariant("fv-akj5") as FlowVariant, undefined, 7), undefined);
});

test("[§142.3 D5] 레그 목소리 — 같은 인물(감독기관 레그 2 · 4)은 같은 자리 · 남성 인물 셋은 서로 다른 자리 · 상담원은 여성", () => {
  const slots = R1.legs.map((_, i) => legVoiceSlot(R1, i));
  assert.deepEqual(slots[2], slots[4]);
  const male = [slots[0], slots[2], slots[3]].map((s) => s.slot);
  assert.equal(new Set(male).size, 3);
  assert.equal(slots[1]!.gender, "female");
  const leg = resolveSessionCallLeg(R1, { scenarioId: SCENARIO, relay: { legIndex: 3, legStartUserTurns: [0, 4, 9, 12], connected: true } });
  assert.equal(leg?.callerLabel, R1.legs[3]!.callerLabel);
  assert.equal(resolveSessionCallLeg(findFlowVariant("fv-akj5"), { scenarioId: SCENARIO }), undefined);
});

test("[§142.3] 폴백 이력 분할 — 레그 시작 = 앞 레그 마지막 사용자 발화와 그 답 뒤 · 앞 통화는 인계 블록", () => {
  const history = [
    { role: "scammer" as const, textMasked: "a0" },
    { role: "user" as const, textMasked: "u1" },
    { role: "scammer" as const, textMasked: "a1" },
    { role: "user" as const, textMasked: "u2" },
    { role: "scammer" as const, textMasked: "a2" },
    { role: "user" as const, textMasked: "u3" },
  ];
  const { prior, current } = splitLegHistory(history, 2);
  assert.deepEqual(prior.map((m) => m.textMasked), ["a0", "u1", "a1", "u2", "a2"]);
  assert.deepEqual(current.map((m) => m.textMasked), ["u3"]);
  assert.deepEqual(splitLegHistory(history, 0).current.length, history.length);
  const block = buildPriorLegContext(prior.map((m) => ({ role: m.role, text: m.textMasked })));
  assert.ok(block?.startsWith("[앞선 통화 기록]"));
  assert.ok(block?.includes("참가자: u2"));
  assert.equal(buildPriorLegContext([]), undefined);
});

test("[§142 R7] 다통화 변형은 확인 창구 세션이 아니다 — 끊기 4행(호 전환 전 금지)이 열릴 길이 없다 · 종전 변형은 그대로", () => {
  assert.equal(sessionUsesVerifyIntercept(SCENARIO, true, "fv-k3dn"), false);
  assert.equal(sessionUsesVerifyIntercept(SCENARIO, true, "fv-r8vb"), false);
  assert.equal(sessionUsesVerifyIntercept(SCENARIO, true, "fv-x7ue"), true);
  assert.equal(isVerifyInterceptSession({ scenarioId: SCENARIO, difficultyLevel: "advanced", flowVariantId: "fv-k3dn" }), false);
});

type FakeRef = string;
function makeTx(session: Record<string, unknown>) {
  const updates: Array<{ ref: FakeRef; data: Record<string, unknown> }> = [];
  const tx: HangupTransaction<FakeRef> = {
    async get(ref): Promise<HangupDocSnapshot> {
      return ref === "sessions/s1" ? { exists: true, data: () => session } : { exists: false, data: () => undefined };
    },
    update(ref, data) {
      updates.push({ ref, data: data as Record<string, unknown> });
    },
  };
  return { tx, updates };
}
const REFS = { session: "sessions/s1", verifyOffer: () => "sessions/s1/verifyIntercept/offer" };
const NOW = Timestamp.fromMillis(1_700_000_000_000);

test("[§142 R7] 끝까지 설치를 거절한 give_up — 종전 fv-x7ue는 4행에 막히고 · 다통화 마지막 레그는 승인된다", async () => {
  const claims = { userTurns: 20, pendingInstruction: false, kind: "give_up" as const };
  const old = makeTx({ status: "active", channel: "voice", scenarioId: SCENARIO, difficultyLevel: "advanced", flowVariantId: "fv-x7ue" });
  const before = await decideAndMarkRealtimeHangup(old.tx, REFS, claims, [], NOW, false, false, false);
  assert.equal(before.status, "blocked_transfer");
  const rebuilt = makeTx({
    status: "active",
    channel: "voice",
    scenarioId: SCENARIO,
    difficultyLevel: "advanced",
    flowVariantId: "fv-k3dn",
    relay: { legIndex: 4, legStartUserTurns: [0, 4, 9, 12, 15], connected: true },
  });
  const after = await decideAndMarkRealtimeHangup(rebuilt.tx, REFS, claims, [], NOW, false, false, false);
  assert.equal(after.status, "accepted");
});

test("[§142.3] 마지막이 아닌 레그 끊기 승인 = 레그 끝 기록(relay.legEnded) · 세션 끝 표식 0 · 같은 레그 두 번째는 already_accepted", async () => {
  const relay = { legIndex: 1, legStartUserTurns: [0, 4], connected: true };
  const session = { status: "active", channel: "voice", scenarioId: SCENARIO, difficultyLevel: "advanced", flowVariantId: "fv-k3dn", relay };
  const claims = { userTurns: 8, pendingInstruction: false, kind: "goal" as const };
  const { tx, updates } = makeTx(session);
  const legRefs = { ...REFS, legScope: { nonLastLeg: true as const, legIndex: 1, turnsSinceLegStart: 4 } };
  const decision = await decideAndMarkRealtimeHangup(tx, legRefs, claims, [], NOW, false, false, false);
  assert.equal(decision.status, "accepted");
  assert.equal(updates.length, 1);
  assert.deepEqual(Object.keys(updates[0]!.data), ["relay"]);
  assert.deepEqual(updates[0]!.data.relay, { legIndex: 1, legStartUserTurns: [0, 4], connected: false, legEnded: 1 });
  const again = makeTx({ ...session, relay: { ...relay, connected: false, legEnded: 1 } });
  const second = await decideAndMarkRealtimeHangup(again.tx, legRefs, claims, [], NOW, false, false, false);
  assert.equal(second.status, "already_accepted");
  assert.equal(again.updates.length, 0);
});

test("[§142.3] 레그 시작 5행 하한 — 레그 시작 뒤 발화가 하한 미만이면 too_early(세션 누적이 커도)", async () => {
  const session = {
    status: "active",
    channel: "voice",
    scenarioId: SCENARIO,
    difficultyLevel: "advanced",
    flowVariantId: "fv-k3dn",
    relay: { legIndex: 1, legStartUserTurns: [0, 4], connected: true },
  };
  const { tx } = makeTx(session);
  const legRefs = { ...REFS, legScope: { nonLastLeg: true as const, legIndex: 1, turnsSinceLegStart: 0 } };
  const decision = await decideAndMarkRealtimeHangup(tx, legRefs, { userTurns: 4, pendingInstruction: false, kind: "goal" }, [], NOW, false, false, false);
  assert.equal(decision.status, "too_early");
});

test("[§142 startCallLeg] 요청 판독 — 행동 3종 · dial만 번호 필수 · 그 밖 invalid-argument", () => {
  assert.deepEqual(readStartCallLegRequest({ sessionId: "s1", action: "transfer" }), { sessionId: "s1", action: "transfer" });
  assert.deepEqual(readStartCallLegRequest({ sessionId: "s1", action: "dial", dialed: FAKE_CALLBACK }), {
    sessionId: "s1",
    action: "dial",
    dialed: FAKE_CALLBACK,
  });
  assert.throws(() => readStartCallLegRequest({ sessionId: "s1", action: "dial" }));
  assert.throws(() => readStartCallLegRequest({ sessionId: "s1", action: "hangup" }));
  assert.throws(() => readStartCallLegRequest({ action: "dial", dialed: FAKE_CALLBACK }));
});

test("[§142 startCallLeg] 가로채기 조건 화면 = 변형 문자가 여는 설치 화면(원격 지원 도우미)", () => {
  assert.deepEqual(installLandingIds(R1), ["card-remote-support-install"]);
  assert.deepEqual(installLandingIds(R2), ["card-remote-support-install"]);
});
