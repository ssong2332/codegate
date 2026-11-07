import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_REBUILD_REPORT_LESSONS, findFlowVariant, resolveSessionScenarioPrompt, type FlowVariant } from "../../scenarios/flowVariants";
import { findDialEntry, PROSECUTOR_OFFICIAL_NUMBER_ID } from "../../scenarios/dialDirectory";
import { findInCallSmsItem } from "../../scenarios/inCallSms";
import { CARD_REBUILD_TACTICS } from "../../scenarios/cardRebuildLegs.prompt";
import { extractTacticLabel } from "../../scenarios/tacticFlavor";
import { isLegDialSmsPending } from "../legHandoff";
import { planLegStart, type RelayState } from "../legPlan";

// 2026-11-07 카드사 고급 실기기 시험(서버 `[call-diag]` 세션 1d84811b) 신고 — ① 앞 대화 반영 부족(같은 말 반복 포함) ② 넘김 과다. 사용자 승인 수정 1 · 2.

const SCENARIO = "card-company-impersonation";
const R1 = () => findFlowVariant("fv-k3dn") as FlowVariant;
const R2 = () => findFlowVariant("fv-r8vb") as FlowVariant;
const ended = (legIndex: number, starts: number[]): RelayState => ({ legIndex, legStartUserTurns: starts, connected: false, legEnded: legIndex });

// 2026-11-07(R1 축소 · 사용자 "a와 이야기 한 내용을 b나 c가 알면 안되지") — 수정 1의 앞 통화 인계 블록(`buildPriorLegContext`)은 없앴다.
// 대신 다음 통화는 사건 골격(`caseBrief`)만 안다 — 단언은 `cardR1Reduce.test.ts`.

test("[수정 1] 같은 말 반복 — '신청했다' 갈래(R1 배송원 · R2 첫 상담원)에 반박 대응 · 되풀이 금지 지시", () => {
  for (const [variant, leg] of [["fv-k3dn", 0], ["fv-r8vb", 0]] as const) {
    const prompt = resolveSessionScenarioPrompt(SCENARIO, variant, leg)!.personaPrompt;
    assert.ok(prompt.includes("같은 말로 되풀이하지 않는다"), `${variant} 레그 ${leg}`);
    assert.ok(prompt.includes("두 장 신청했다"), `${variant} 레그 ${leg} 반박 예시`);
  }
  assert.ok(resolveSessionScenarioPrompt(SCENARIO, "fv-k3dn", 0)!.personaPrompt.includes("이 말은 한 번만 한다"), "배송원 페르소나");
});

test("[수정 2] 레그 수 축소 — R1 5→4통 · R2 4→3통 · 통화 중 넘김(transfer) 0 · 마지막은 검사", () => {
  assert.equal(R1().legs.length, 4);
  assert.equal(R2().legs.length, 3);
  for (const v of [R1(), R2()]) {
    assert.ok(v.legs.every((leg) => leg.entry !== "transfer" && leg.exit !== "transfer"), `${v.variantId}: transfer 0`);
    const sup = v.legs[v.legs.length - 2];
    const last = v.legs[v.legs.length - 1];
    assert.equal(sup.speakerId, "supervisor");
    assert.equal(sup.exit, "dial");
    assert.equal(last.speakerId, "prosecutor");
    assert.equal(last.entry, "dial");
    assert.equal(last.exit, undefined);
    assert.equal(last.dialTarget, PROSECUTOR_OFFICIAL_NUMBER_ID);
    assert.equal(last.callerLabel, findDialEntry(SCENARIO, PROSECUTOR_OFFICIAL_NUMBER_ID)!.contactLabel);
    // 감독기관은 한 번만 나온다.
    assert.equal(v.legs.filter((leg) => leg.speakerId === "supervisor").length, 1);
  }
});

test("[수정 2] 감독기관 → 검사 = 참가자 발신 — 앱 응낙 뒤 검찰청 대표번호로 걸면 검사 레그(가로채기) · 넘김(transfer)은 거부 · 걸지 않으면 검사가 다시 건다(callback)", () => {
  const number = findDialEntry(SCENARIO, PROSECUTOR_OFFICIAL_NUMBER_ID)!.number;
  const dial = planLegStart({ variant: R1(), relay: ended(2, [0, 4, 9]), action: "dial", dialed: number, installConsented: true, userTurns: 12 });
  assert.equal(dial.status, "connected");
  if (dial.status === "connected") assert.deepEqual([dial.legIndex, dial.entry], [3, "dial"]);
  const transfer = planLegStart({ variant: R1(), relay: ended(2, [0, 4, 9]), action: "transfer", installConsented: true, userTurns: 12 });
  assert.deepEqual(transfer, { status: "not_ready", reason: "wrong_action" });
  const callback = planLegStart({ variant: R2(), relay: ended(1, [0, 6]), action: "callback", installConsented: true, userTurns: 9 });
  assert.equal(callback.status, "connected");
  if (callback.status === "connected") assert.deepEqual([callback.legIndex, callback.entry], [2, "incoming"]);
  // 검사 레그 뒤에는 다음 레그가 없다.
  const after = planLegStart({ variant: R1(), relay: ended(3, [0, 4, 9, 12]), action: "dial", dialed: number, installConsented: true, userTurns: 18 });
  assert.deepEqual(after, { status: "not_ready", reason: "no_next_leg" });
});

test("[수정 2] 검찰청 대표번호 = 연락처 · 공식 번호 가로채기(감독기관 번호와 같은 장치) · 앱 응낙 전 = 진짜 안내 · 문자는 그대로 3통 · 2통", () => {
  const entry = findDialEntry(SCENARIO, PROSECUTOR_OFFICIAL_NUMBER_ID)!;
  assert.equal(entry.contactLabel, "한빛지방검찰청 대표번호");
  assert.ok((entry.genuineNotice ?? []).some((line) => line.includes("요구하지 않습니다")));
  const before = planLegStart({ variant: R1(), relay: ended(2, [0, 4, 9]), action: "dial", dialed: entry.number, installConsented: false, userTurns: 12 });
  assert.equal(before.status, "genuine");
  for (const v of [R1(), R2()]) {
    assert.equal(v.legs[v.legs.length - 1].interceptRequires, "install");
    // 감독기관 레그는 문자 선언 0 — 다음 번호는 연락처에 있다(번호 문자 대기 0 · F2).
    const supLeg = v.legs.length - 2;
    assert.equal(v.sms.filter((s) => s.leg === supLeg).length, 0, v.variantId);
    const relay: RelayState = { legIndex: supLeg, legStartUserTurns: Array(supLeg + 1).fill(0), connected: true };
    assert.equal(isLegDialSmsPending(v, relay, []), false, v.variantId);
    // 안전계좌 문자는 검사(마지막) 레그 · 하한 4(2026-11-07 — 본인 확인 단계로 3 → 4).
    const safe = v.sms.find((s) => s.smsId === "card-safe-account");
    assert.deepEqual([safe?.leg, safe?.notBeforeUserTurns], [v.legs.length - 1, 4], v.variantId);
  }
  assert.deepEqual([R1().sms.length, R2().sms.length], [3, 2], "고급 문자 범위(AC-096 (b) 0~3) 안");
  // 2026-11-07 — 발신 표시는 번호만(R1 문자 발신처 분리 · `CARD_R1_SMS_SENDER`).
  assert.equal(findInCallSmsItem(SCENARIO, "card-safe-account")!.senderLabel, "070-0462-1593", "안전계좌 문자 발신 = 자산보호 안내 번호");
});

test("[수정 2] 레그 프롬프트 — 감독기관은 돈 · 넘김 0 · 검사가 안전계좌 · 은행 답변 코칭까지 · 마지막 통화 규칙", () => {
  for (const v of [R1(), R2()]) {
    const supIndex = v.legs.length - 2;
    const sup = resolveSessionScenarioPrompt(SCENARIO, v.variantId, supIndex)!;
    assert.ok(!sup.personaPrompt.includes("980만"), `${v.variantId} 감독기관 금액 0`);
    assert.ok(sup.personaPrompt.includes("한빛지방검찰청 대표번호로 **직접** 전화"), `${v.variantId} 감독기관 — 검찰청에 직접 걸게 함`);
    assert.ok(!/통화를 넘긴다|연결해 드리겠습니다/.test(sup.personaPrompt), `${v.variantId} 감독기관 넘김 문구 0`);
    const pro = resolveSessionScenarioPrompt(SCENARIO, v.variantId, supIndex + 1)!;
    assert.ok(pro.personaPrompt.includes("980만 원"), `${v.variantId} 검사 금액`);
    assert.ok(pro.personaPrompt.includes("가족 사업 자금"), `${v.variantId} 검사 은행 답변 코칭`);
    assert.ok(pro.personaPrompt.includes("이번 흐름의 마지막 통화"), `${v.variantId} 마지막 통화 규칙`);
    const labels = pro.weakenedTactics.map((t) => extractTacticLabel(t));
    for (const t of [CARD_REBUILD_TACTICS.safeAccount, CARD_REBUILD_TACTICS.bankCoaching, CARD_REBUILD_TACTICS.arrestThreat, CARD_REBUILD_TACTICS.secrecy]) {
      assert.ok(labels.includes(extractTacticLabel(t)), `${v.variantId} 검사 수법 ${extractTacticLabel(t)}`);
    }
  }
});

test("[수정 2] 리포트 교육점 · 수법 — 교육점 4개 그대로 · 변형 수법은 레그들이 쓰는 라벨만", () => {
  assert.equal(CARD_REBUILD_REPORT_LESSONS.length, 4);
  for (const v of [R1(), R2()]) {
    const legLabels = new Set(v.legs.flatMap((leg) => leg.tacticLabels ?? []));
    const variantLabels = new Set(v.tactics.map((t) => extractTacticLabel(t)));
    assert.deepEqual([...variantLabels].sort(), [...legLabels].sort(), v.variantId);
  }
});
