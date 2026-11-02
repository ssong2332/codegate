import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { findFlowVariant, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import {
  LEG_LATER_SMS_DECLINE,
  LEG_TRANSFER_HANDOFF_INSTRUCTION,
  isLaterLegSmsPurpose,
  planLegHandoff,
} from "../legHandoff";
import { planLegStart, resolveLegEntry, resolveSessionCallLeg, type RelayState } from "../legPlan";
import { lookupDialedNumber } from "../../scenarios/dialDirectory";

// §142 D1 · D2(확인 실측 2026-11-02 — `docs/research/card-rebuild-probe-2026-11-02.md`) — 감독기관 첫 레그 넘김 · 참가자가 건 통화의 첫마디.

const SCENARIO = "card-company-impersonation";
const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");
const r1 = () => findFlowVariant("fv-k3dn")!;
const r2 = () => findFlowVariant("fv-r8vb")!;
const relayAt = (legIndex: number, start: number, entry?: RelayState["entry"]): RelayState => ({
  legIndex,
  legStartUserTurns: [...Array(legIndex).fill(0), start],
  connected: true,
  ...(entry ? { entry } : {}),
});

test("[§142 D1 페르소나] 감독기관 첫 레그 프롬프트에 마지막 레그의 일(980만 원 · 가족 사업 자금 · 안전계좌)이 없다 · 마지막 레그에는 있다", () => {
  for (const [variantId, firstSupervisor, lastSupervisor] of [["fv-k3dn", 2, 4], ["fv-r8vb", 1, 3]] as const) {
    const first = resolveSessionScenarioPrompt(SCENARIO, variantId, firstSupervisor)!.personaPrompt;
    const last = resolveSessionScenarioPrompt(SCENARIO, variantId, lastSupervisor)!.personaPrompt;
    for (const phrase of ["980만 원", "가족 사업 자금", "안전계좌"]) {
      assert.ok(!first.includes(phrase), `${variantId} 첫 감독기관 레그에 "${phrase}"`);
      assert.ok(last.includes(phrase), `${variantId} 마지막 레그에 "${phrase}" 없음`);
    }
  }
  // 같은 인물 · 같은 목소리(speakerId)는 그대로.
  assert.equal(r1().legs[2].speakerId, r1().legs[4].speakerId);
});

test("[§142 D1 끝 규칙] 나감이 transfer인 레그 = 넘김은 이 통화를 끝내는 것(끊기 규칙) · '잠시만' 뒤 이어가기 금지", () => {
  for (const legIndex of [2, 3]) {
    const prompt = resolveSessionScenarioPrompt(SCENARIO, "fv-k3dn", legIndex)!.personaPrompt;
    assert.ok(prompt.includes("통화를 넘기는 것은 네 쪽에서 이 통화를 끝내는 것이다"), `레그 ${legIndex}`);
    assert.ok(prompt.includes("[진행 강제]의 끊기 규칙대로"), `레그 ${legIndex}`);
  }
});

test("[§142 D1 넘김 판정표] transfer 레그 · 문자 0 · 레그 시작 뒤 발화 = minUserTurns + 1부터 넘김 · 그 전 wait · 그 밖 undefined", () => {
  const v = r1();
  const min = v.legs[2].minUserTurns ?? 0;
  assert.equal(planLegHandoff(v, relayAt(2, 13), 13 + min), "wait");
  assert.equal(planLegHandoff(v, relayAt(2, 13), 13 + min + 1), "handoff");
  assert.equal(planLegHandoff(v, relayAt(3, 20), 20 + (v.legs[3].minUserTurns ?? 0) + 1), "handoff");
  // 1행 — dial 레그(상담원) · 마지막 레그 · 다통화 아님.
  assert.equal(planLegHandoff(v, relayAt(1, 7), 30), undefined);
  assert.equal(planLegHandoff(v, relayAt(4, 25), 40), undefined);
  assert.equal(planLegHandoff(findFlowVariant("fv-akj5"), undefined, 30), undefined);
  assert.equal(planLegHandoff(undefined, undefined, 30), undefined);
  // R2 감독기관 첫 레그 = 1번.
  assert.equal(planLegHandoff(r2(), relayAt(1, 6), 6 + (r2().legs[1].minUserTurns ?? 0) + 1), "handoff");
});

test("[§142 D1 뒤 레그 문자] 감독기관 첫 레그의 transfer 요청 = 뒤 레그 문자(넘김 거절 문면) · 지금 레그 · 다통화 아님 = false", () => {
  assert.equal(isLaterLegSmsPurpose(r1(), relayAt(2, 13), "transfer"), true);
  assert.equal(isLaterLegSmsPurpose(r1(), relayAt(4, 25), "transfer"), false);
  assert.equal(isLaterLegSmsPurpose(r1(), relayAt(1, 7), "link"), false);
  assert.equal(isLaterLegSmsPurpose(r1(), relayAt(2, 13), undefined), false);
  assert.equal(isLaterLegSmsPurpose(findFlowVariant("fv-akj5"), undefined, "transfer"), false);
  for (const text of [LEG_LATER_SMS_DECLINE, LEG_TRANSFER_HANDOFF_INSTRUCTION]) {
    assert.ok(!/\d{3,}/.test(text), "숫자 · 번호 0");
  }
  assert.ok(LEG_TRANSFER_HANDOFF_INSTRUCTION.includes("`end_call`"));
});

test("[§142 D1 배선] 문자 콜러블 — none_pending 앞 넘김 판정(wait = goal_pending · handoff = wrapUpInstruction) · not_allowed 뒤 레그 거절 문면", () => {
  const src = read("inCallSms/index.ts");
  assert.ok(src.includes("const handoff = planLegHandoff(legVariant, session.relay, userTurns);"));
  assert.ok(src.includes('if (handoff === "wait") return withScreenStatus({ status: "goal_pending" });'));
  assert.ok(src.includes('return { status: "none_pending", wrapUpInstruction: LEG_TRANSFER_HANDOFF_INSTRUCTION };'));
  assert.ok(src.includes('result.status === "not_allowed" && isLaterLegSmsPurpose(legVariant, session.relay, purpose)'));
  assert.ok(src.indexOf("const handoff = planLegHandoff(") < src.indexOf("const followUpUserTurns = goalFollowUpFor("));
});

test("[§142 D2 레그 진입] startCallLeg 판정이 relay.entry를 쓴다(dial · transfer · 재발신 incoming) · 토큰 callLeg에 실린다", () => {
  const v = r2();
  const dialed = lookupDialedNumber(SCENARIO, "02-0762-5513")!.number;
  const dial = planLegStart({ variant: v, relay: undefined, action: "dial", dialed, installConsented: false, userTurns: 0 });
  assert.equal(dial.status === "connected" && dial.relay.entry, "dial");
  const callback = planLegStart({ variant: v, relay: undefined, action: "callback", installConsented: false, userTurns: 0 });
  assert.equal(callback.status === "connected" && callback.relay.entry, "incoming");
  assert.equal(resolveSessionCallLeg(v, { scenarioId: SCENARIO, relay: callback.status === "connected" ? callback.relay : undefined })?.entry, "incoming");
  // relay.entry 부재(옛 relay) = 변형 정의 · 다른 레그의 entry는 쓰지 않는다.
  assert.equal(resolveLegEntry(r1(), undefined, 0), "incoming");
  assert.equal(resolveLegEntry(r1(), { legIndex: 1, legStartUserTurns: [0, 7], entry: "dial" }, 2), "dial");
  assert.equal(resolveLegEntry(r1(), { legIndex: 3, legStartUserTurns: [0, 7, 13, 20], entry: "transfer" }, 3), "transfer");
  assert.ok(read("realtime/index.ts").includes("callLeg: { legIndex: callLeg.legIndex, callerLabel: callLeg.callerLabel, entry: callLeg.entry }"));
});
