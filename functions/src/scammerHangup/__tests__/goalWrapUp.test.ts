// §115(DECISIONS #230 · 사용자 지적 "같은 말 반복") — ① 할 일 완료 시 마무리 지시 1회(`planGoalWrapUp` · 백스톱 응답 `wrapUpInstruction`)
// ② 후속 단계가 남아 막혔을 때 되풀이 금지 문면(`scammerHangupGuidance(..., { followUpPending })`) ③ 다른 확인 무력화 고급 6종은 종전 그대로.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { goalFollowUpFor, planGoalWrapUp } from "../goalAction";
import {
  GOAL_WRAP_UP_INSTRUCTION,
  SCAMMER_HANGUP_ACCEPTED_GUIDANCE,
  SCAMMER_HANGUP_BLOCKED_TRANSFER_GUIDANCE,
  SCAMMER_HANGUP_DECLINED_GUIDANCE,
  SCAMMER_HANGUP_FOLLOW_UP_PENDING_GUIDANCE,
  scammerHangupGuidance,
} from "../guidance";
import { SCAMMER_HANGUP_RULES } from "../decide";
import { FLOW_VARIANTS } from "../../scenarios/flowVariants";
import { VERIFY_INTERCEPT } from "../../scenarios/verifyIntercept";
import type { DeliveredSmsRecord } from "../../inCallSms/smsGate";

const SRC = path.resolve(__dirname, "../../../src");
const INSTITUTION = "institutional-impersonation";
const pgqt = FLOW_VARIANTS.find((v) => v.variantId === "fv-pgqt")!;
const BOTH: DeliveredSmsRecord[] = [
  { smsId: "institution-otp", userTurnsAtArrival: 4 },
  { smsId: "institution-safe-account", userTurnsAtArrival: 6, landingSubmitted: true },
];
const base = { delivered: BOTH, declared: pgqt.sms, declaredKnown: true, followUpUserTurns: 4, placed: false };

test("[§115 마무리 지시] 판정표 — 할 일 미완 = pending · 완료 = wrap_up(그 발화부터) · 전환 뒤 · 후속 값 없음 = none", () => {
  assert.equal(planGoalWrapUp({ ...base, userTurns: 7 }), "pending", "계좌 문자 뒤 발화 1");
  assert.equal(planGoalWrapUp({ ...base, userTurns: 9 }), "pending", "발화 3 — 아직 대출 단계 몫");
  assert.equal(planGoalWrapUp({ ...base, userTurns: 10 }), "wrap_up", "발화 4 — C-5 참");
  assert.equal(planGoalWrapUp({ ...base, userTurns: 14 }), "wrap_up", "늦게 물어도 놓치지 않는다(클라가 1회로 막는다)");
  assert.equal(planGoalWrapUp({ ...base, userTurns: 10, placed: true }), "none", "호 전환 뒤엔 원 사기범이 없다");
  assert.equal(planGoalWrapUp({ ...base, userTurns: 10, followUpUserTurns: undefined }), "none", "후속 값 없음 = 종전");
  assert.equal(planGoalWrapUp({ ...base, userTurns: 20, declaredKnown: false }), "pending", "선언 모름 = 완료로 보지 않는다(fail-closed)");
  assert.equal(planGoalWrapUp({ ...base, userTurns: 20, delivered: BOTH.slice(0, 1) }), "pending", "계좌 문자 미도착");
});

test("[§115 마무리 지시] 다른 확인 무력화 고급 변형(기관 사칭 밖)은 모두 none — 백스톱 응답이 종전 none_pending 그대로", () => {
  let n = 0;
  for (const v of FLOW_VARIANTS) {
    if (!VERIFY_INTERCEPT[v.scenarioId] || v.level !== "advanced" || v.scenarioId === INSTITUTION) continue;
    const followUpUserTurns = goalFollowUpFor(v.scenarioId, v.variantId);
    for (const userTurns of [6, 10, 20]) {
      assert.equal(planGoalWrapUp({ delivered: [], declared: v.sms, declaredKnown: true, userTurns, followUpUserTurns, placed: false }), "none", v.variantId);
    }
    n += 1;
  }
  assert.ok(n >= 6, `대상 ${n}개`);
});

test("[§115 되풀이 금지] 후속 단계가 남아 막힌 blocked_transfer만 새 문면 · 그 밖 status · 세션은 종전 문면 그대로", () => {
  assert.equal(scammerHangupGuidance("blocked_transfer", { followUpPending: true }), SCAMMER_HANGUP_FOLLOW_UP_PENDING_GUIDANCE);
  assert.equal(scammerHangupGuidance("blocked_transfer", { followUpPending: false }), SCAMMER_HANGUP_BLOCKED_TRANSFER_GUIDANCE);
  assert.equal(scammerHangupGuidance("blocked_transfer"), SCAMMER_HANGUP_BLOCKED_TRANSFER_GUIDANCE, "옵션 없음 = 종전(다른 6종)");
  for (const rule of SCAMMER_HANGUP_RULES) {
    if (rule.status === "blocked_transfer") continue;
    // 다른 status는 후속 표시가 있어도 문면이 바뀌지 않는다.
    assert.equal(scammerHangupGuidance(rule.status, { followUpPending: true }), scammerHangupGuidance(rule.status), rule.status);
  }
  assert.equal(scammerHangupGuidance("accepted", { followUpPending: true }), SCAMMER_HANGUP_ACCEPTED_GUIDANCE);
  assert.equal(scammerHangupGuidance("too_early" as never), SCAMMER_HANGUP_DECLINED_GUIDANCE);
});

test("[§115 문면] 되풀이 금지 · 다음 단계 또는 한 번 묻고 대기 · 마무리 지시는 end_call · 둘 다 숫자 0(G130) · 끝낸다는 말 금지 유지", () => {
  assert.match(SCAMMER_HANGUP_FOLLOW_UP_PENDING_GUIDANCE, /같은 말로 되풀이하지 마라/);
  assert.match(SCAMMER_HANGUP_FOLLOW_UP_PENDING_GUIDANCE, /그 단계로 넘어가고/);
  assert.match(SCAMMER_HANGUP_FOLLOW_UP_PENDING_GUIDANCE, /한 번만 묻고 답을 기다려라/);
  assert.match(SCAMMER_HANGUP_FOLLOW_UP_PENDING_GUIDANCE, /끝내겠다는 말을 하지 말고/);
  assert.ok(!SCAMMER_HANGUP_FOLLOW_UP_PENDING_GUIDANCE.includes("그대로 이어가라"), "종전 '그대로 이어가라'(되풀이 원인) 0");
  assert.match(GOAL_WRAP_UP_INSTRUCTION, /되풀이하지 말고/);
  assert.match(GOAL_WRAP_UP_INSTRUCTION, /`end_call` 도구를 불러/);
  for (const text of [SCAMMER_HANGUP_FOLLOW_UP_PENDING_GUIDANCE, GOAL_WRAP_UP_INSTRUCTION]) assert.ok(!/\d/.test(text), text);
});

test("[§115 배선] 백스톱 응답 · 끊기 응답 · 클라 주입 1회", () => {
  const sms = readFileSync(path.join(SRC, "inCallSms/index.ts"), "utf8");
  assert.ok(sms.includes('if (wrap === "pending") return { status: "goal_pending" };'));
  assert.ok(sms.includes('return { status: "none_pending", wrapUpInstruction: GOAL_WRAP_UP_INSTRUCTION };'));
  assert.ok(sms.includes('if (followUpUserTurns === undefined) return { status: "none_pending" };'), "후속 값 없는 변형은 종전 응답");
  const hangup = readFileSync(path.join(SRC, "scammerHangup/index.ts"), "utf8");
  assert.ok(hangup.includes("const followUpPending = followUpUserTurns !== undefined && !goalActionDone;"));
  assert.ok(hangup.includes("scammerHangupGuidance(decision.status, { followUpPending })"));
  const page = readFileSync(path.resolve(SRC, "../../src/app/session/play/page.tsx"), "utf8");
  assert.ok(page.includes('if (result.status === "none_pending" && result.wrapUpInstruction && !state.wrapUpSent) {'), "클라 1회 가드");
  assert.ok(page.includes('enqueueTurnInstruction(result.wrapUpInstruction, "sms", { smsNudge: true });'), "맥락 주입(전사 0)");
  assert.ok(page.includes("wrapUpSent: false"), "ref 초기값");
});
