// §127(DECISIONS #243 · 2026-10-24 사용자 실기 — 운영 세션 243a51df) — 다중 루트 1차 새 루트 13벌 전수: "결말을 마치면 끊기 통과" ·
// 할 일을 마친 뒤 6행(지시 · 문자 대기)에 막히면 "다시 끊으라"는 문면.
// 재현(로그): 인증번호 문자 발화 4 도착(모델 도구) → 발화 7 끊기 4행 blocked_transfer(후속 몫 전) · 같은 발화에 마무리 지시 →
// 발화 8 끊기 6행 blocked_pending(할 일 완료 참) → 종전 문면 "아직 통화를 끝낼 때가 아니다 … 그대로 이어가라" → 재시도 0 · 같은 안내 되풀이.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideScammerHangup, type ScammerHangupInput } from "../decide";
import { goalFollowUpFor, hasCompletedGoalAction, GOAL_AFTER_LAST_SMS_USER_TURNS, GOAL_NO_SMS_MIN_USER_TURNS } from "../goalAction";
import {
  SCAMMER_HANGUP_DECLINED_GUIDANCE,
  SCAMMER_HANGUP_RETRY_AFTER_GOAL_GUIDANCE,
  scammerHangupGuidance,
} from "../guidance";
import { findFlowVariant } from "../../scenarios/flowVariants";
import { hasVerifyIntercept } from "../../scenarios/verifyIntercept";
import type { DeliveredSmsRecord } from "../../inCallSms/smsGate";

/** 1a 7 + 1b 6. */
const NEW_ROUTES = ["fv-q7cn", "fv-g2ld", "fv-d8pw", "fv-r4hc", "fv-y3ks", "fv-e5mv", "fv-u9fz", "fv-w7tb", "fv-h5sz", "fv-p3jx", "fv-t8ga", "fv-v2mk", "fv-a6lq"];

function input(over: Partial<ScammerHangupInput>): ScammerHangupInput {
  return {
    status: "active",
    channel: "voice",
    isMockTurn: false,
    verifyEnabled: false,
    transferPlaced: false,
    transferReachable: true,
    goalActionDone: false,
    userTurns: 3,
    pendingInstruction: false,
    smsAwaitingUser: false,
    limitReached: false,
    alreadyAccepted: false,
    relay: undefined,
    messengerStageAllowed: false,
    ...over,
  };
}

/** 결말을 마친 시점 = 필수 문자가 모두 도착(발화 4 · 6 …)하고 그 뒤 결말 몫(후속 값 · C-3 · C-4)만큼 발화가 지났다. 화면 행동은 하지 않은 것으로 본다(말로 끝나는 결말). */
function endingDone(variantId: string): { delivered: DeliveredSmsRecord[]; userTurns: number } {
  const v = findFlowVariant(variantId)!;
  const required = v.sms.filter((s) => s.required);
  const delivered = required.map((s, k) => ({ smsId: s.smsId, userTurnsAtArrival: 4 + 2 * k }));
  const last = delivered.length ? Math.max(...delivered.map((d) => d.userTurnsAtArrival ?? 0)) : 0;
  const followUp = goalFollowUpFor(v.scenarioId, v.variantId);
  const userTurns = v.sms.length === 0 ? GOAL_NO_SMS_MIN_USER_TURNS : last + (followUp ?? GOAL_AFTER_LAST_SMS_USER_TURNS);
  return { delivered, userTurns };
}

test("[§127] 새 루트 13벌 — 결말을 마치면 끊기 통과(확인 무력화 고급은 4행 할 일 완료 참 · 그 밖은 하한만) · 결말 전에는 4행이 막는다", () => {
  for (const id of NEW_ROUTES) {
    const v = findFlowVariant(id)!;
    assert.ok(v && v.level === "advanced" && v.retired !== true, id);
    const verify = hasVerifyIntercept(v.scenarioId);
    const { delivered, userTurns } = endingDone(id);
    const done = hasCompletedGoalAction({
      delivered,
      mockScreens: [],
      declared: v.sms,
      declaredKnown: true,
      userTurns,
      followUpUserTurns: goalFollowUpFor(v.scenarioId, v.variantId),
    });
    if (verify) assert.equal(done, true, `${id}: 결말 뒤 할 일 완료`);
    assert.deepEqual(
      decideScammerHangup(input({ verifyEnabled: verify, goalActionDone: verify ? done : false, userTurns })),
      { status: "accepted", hangup: true, row: "9" },
      `${id}: 결말 뒤 끊기`,
    );
    if (verify) {
      // 결말 전(마지막 필수 문자 도착 직후) — 확인 무력화 고급은 4행이 막는다(이른 끊기 방지는 그대로).
      const early = hasCompletedGoalAction({
        delivered,
        mockScreens: [],
        declared: v.sms,
        declaredKnown: true,
        userTurns: Math.max(...delivered.map((d) => d.userTurnsAtArrival ?? 0), 0) + 1,
        followUpUserTurns: goalFollowUpFor(v.scenarioId, v.variantId),
      });
      if (goalFollowUpFor(v.scenarioId, v.variantId) !== undefined) assert.equal(early, false, `${id}: 결말 전`);
    }
  }
});

test("[§127 로그 재현] 243a51df — 할 일을 마친 뒤 6행에 막히면 '다시 end_call' 문면 · 할 일 전 6행 · 다른 status는 종전 문면", () => {
  const v = findFlowVariant("fv-q7cn")!;
  const delivered: DeliveredSmsRecord[] = [{ smsId: "institution-otp", userTurnsAtArrival: 4 }];
  const at = (userTurns: number) =>
    hasCompletedGoalAction({ delivered, mockScreens: [], declared: v.sms, declaredKnown: true, userTurns, followUpUserTurns: goalFollowUpFor(v.scenarioId, v.variantId) });
  // 발화 7 — 후속 몫 전(4행) · 발화 8 — 할 일 완료 참 · 지시 대기면 6행.
  assert.equal(at(7), false);
  assert.equal(decideScammerHangup(input({ verifyEnabled: true, goalActionDone: at(7), userTurns: 7 })).row, "4");
  assert.equal(at(8), true);
  const blocked = decideScammerHangup(input({ verifyEnabled: true, goalActionDone: at(8), userTurns: 8, pendingInstruction: true }));
  assert.deepEqual(blocked, { status: "blocked_pending", hangup: false, row: "6" });
  assert.equal(scammerHangupGuidance(blocked.status, { goalActionDone: true }), SCAMMER_HANGUP_RETRY_AFTER_GOAL_GUIDANCE);
  assert.match(SCAMMER_HANGUP_RETRY_AFTER_GOAL_GUIDANCE, /다시 `end_call` 도구를 불러/);
  assert.ok(!/\d/.test(SCAMMER_HANGUP_RETRY_AFTER_GOAL_GUIDANCE), "숫자 0(G130)");
  // 역방향 — 종전 문면(할 일 완료 표시 없음)은 "그대로 이어가라"라 재시도를 부르지 않는다.
  assert.equal(scammerHangupGuidance("blocked_pending"), SCAMMER_HANGUP_DECLINED_GUIDANCE);
  assert.equal(scammerHangupGuidance("blocked_pending", { goalActionDone: false }), SCAMMER_HANGUP_DECLINED_GUIDANCE);
  for (const status of ["too_early", "limit_reached", "mock_turn"] as const) {
    assert.equal(scammerHangupGuidance(status, { goalActionDone: true }), SCAMMER_HANGUP_DECLINED_GUIDANCE, status);
  }
  // 다음 발화(지시 대기 해소) — 통과.
  assert.equal(decideScammerHangup(input({ verifyEnabled: true, goalActionDone: at(9), userTurns: 9 })).status, "accepted");
});

test("[§127] 말로 끝나는 결말 8벌(1a 4 + 1b 4) — 약속하면 되풀이 없이 마무리 · 통화를 끝낸다 줄을 갖는다", () => {
  for (const id of ["fv-q7cn", "fv-g2ld", "fv-r4hc", "fv-e5mv", "fv-v2mk", "fv-a6lq", "fv-t8ga", "fv-p3jx"]) {
    const v = findFlowVariant(id)!;
    const hits = v.stages.filter((s) => /같은 요구를 말만 바꿔 되풀이하지 말고 짧게 마무리한 뒤 통화를 끝낸다/.test(s.summary));
    assert.equal(hits.length, 1, `${id}: 마무리 줄 1번`);
  }
});
