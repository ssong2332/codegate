// §108(2026-10-22 사용자 결정 · 메인 세션 A2안 · DECISIONS #223) — 끊기 4행 "할 일을 다 했다"(`goalActionDone`) 판정표 C-1~C-4.
// ① 판정표 ② 운영 로그 세션 1a54b807(기관 사칭 고급 · 사용자 발화 6에 goal → blocked_transfer) 재현
// ③ 확인 무력화 7종 × 고급 흐름 변형 전수 — 변형마다 "도착 전 발화 6 goal은 막힘" · "이체 · 설치를 마친 뒤 끊기 통과"
// ④ 문자 선언 0 변형(카드사 fv-akj5)의 추가 하한 ⑤ 배선(두 경로가 같은 함수 · 클라 값 0).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { SCAMMER_HANGUP_MIN_USER_TURNS, decideScammerHangup, type ScammerHangupInput } from "../decide";
import {
  GOAL_AFTER_LAST_SMS_USER_TURNS,
  GOAL_NO_SMS_MIN_USER_TURNS,
  hasCompletedGoalAction,
  type GoalActionInput,
} from "../goalAction";
import { FLOW_VARIANTS, type FlowVariantSms } from "../../scenarios/flowVariants";
import { IN_CALL_SMS } from "../../scenarios/inCallSms";
import { resolveMockScreenKind } from "../../scenarios/mockScreens";
import { VERIFY_INTERCEPT } from "../../scenarios/verifyIntercept";
import { isSmsAwaitingUser } from "../smsWait";
import type { DeliveredSmsRecord } from "../../inCallSms/smsGate";

const SRC_ROOT = path.resolve(__dirname, "../../../src");

/** 확인 무력화 고급 세션 · 호 전환 전 · 하한을 넘긴 기준 입력(4행만 남는다). */
const VERIFY_ADVANCED: ScammerHangupInput = {
  status: "active",
  channel: "voice",
  isMockTurn: false,
  verifyEnabled: true,
  transferPlaced: false,
  transferReachable: true,
  goalActionDone: false,
  userTurns: 12,
  pendingInstruction: false,
  smsAwaitingUser: false,
  limitReached: false,
  alreadyAccepted: false,
  relay: undefined,
  messengerStageAllowed: false,
};

const INSTITUTION: FlowVariantSms[] = [
  { purpose: "identity", smsId: "institution-otp", required: true, notBeforeUserTurns: 2 },
  { purpose: "transfer", smsId: "institution-safe-account", required: true, notBeforeUserTurns: 4 },
];
const BASE: GoalActionInput = { delivered: [], mockScreens: [], declared: INSTITUTION, declaredKnown: true, userTurns: 12 };

/** 판정 · 끊기를 한 번에 — 실제 경로와 같이 6행(문자 대기)도 서버 기록으로 계산한다. */
function decide(input: GoalActionInput): ReturnType<typeof decideScammerHangup> {
  return decideScammerHangup({
    ...VERIFY_ADVANCED,
    userTurns: input.userTurns,
    smsAwaitingUser: isSmsAwaitingUser(input.delivered, input.userTurns),
    goalActionDone: hasCompletedGoalAction(input),
  });
}

test("[§108 C-1 · C-2] 랜딩 제출 · 앱 설치 응낙 · 화면 제출이면 완료 — 노출 · 도착만으로는 아님", () => {
  assert.equal(hasCompletedGoalAction(BASE), false);
  assert.equal(hasCompletedGoalAction({ ...BASE, delivered: [{ smsId: "x", landingSubmitted: true }] }), true, "C-1");
  assert.equal(hasCompletedGoalAction({ ...BASE, mockScreens: [{ consented: true, submitted: false }] }), true, "C-2 응낙");
  assert.equal(hasCompletedGoalAction({ ...BASE, mockScreens: [{ consented: false, submitted: true }] }), true, "C-2 제출");
  assert.equal(hasCompletedGoalAction({ ...BASE, mockScreens: [{ consented: false, submitted: false }] }), false, "노출만");
});

test("[§108 C-3] 필수 문자 전부 도착 ∧ 마지막 도착 뒤 발화 ≥ 2(판단값)일 때만 · 하나라도 미도착이면 아님", () => {
  assert.equal(GOAL_AFTER_LAST_SMS_USER_TURNS, 2);
  const both: DeliveredSmsRecord[] = [
    { smsId: "institution-otp", userTurnsAtArrival: 4 },
    { smsId: "institution-safe-account", userTurnsAtArrival: 10 },
  ];
  assert.equal(hasCompletedGoalAction({ ...BASE, delivered: both, userTurns: 11 }), false, "도착 뒤 1발화");
  assert.equal(hasCompletedGoalAction({ ...BASE, delivered: both, userTurns: 12 }), true, "도착 뒤 2발화");
  assert.equal(hasCompletedGoalAction({ ...BASE, delivered: both.slice(0, 1), userTurns: 30 }), false, "필수 1건 미도착");
  // 선택 문자는 세지 않는다 · 선언을 해석할 수 없으면 C-3 · C-4를 보지 않는다(fail-closed).
  const optional: FlowVariantSms[] = [{ ...INSTITUTION[0]!, required: false }, INSTITUTION[1]!];
  assert.equal(hasCompletedGoalAction({ ...BASE, declared: optional, delivered: both.slice(1), userTurns: 12 }), true);
  assert.equal(hasCompletedGoalAction({ ...BASE, delivered: both, userTurns: 30, declaredKnown: false }), false);
});

test("[§108 C-4] 문자 선언 0 변형 — 발화 8(판단값) 전에는 아님 · 그 뒤 완료(하한 3만 남지 않게)", () => {
  assert.equal(GOAL_NO_SMS_MIN_USER_TURNS, 8);
  const none: GoalActionInput = { ...BASE, declared: [] };
  // 추가 하한이 없다면(C-3을 그대로) 발화 3부터 4행이 꺼진다 — 그것을 막는 값이다.
  assert.ok(GOAL_NO_SMS_MIN_USER_TURNS > SCAMMER_HANGUP_MIN_USER_TURNS);
  for (const userTurns of [3, 6, 7]) assert.equal(decide({ ...none, userTurns }).status, "blocked_transfer", String(userTurns));
  assert.equal(decide({ ...none, userTurns: 8 }).status, "accepted");
});

test("[§108 4행] goalActionDone이면 4행만 비켜선다 — 하한 5 · 6 · 7행은 그대로", () => {
  const done = { ...VERIFY_ADVANCED, goalActionDone: true };
  assert.deepEqual(decideScammerHangup(VERIFY_ADVANCED), { status: "blocked_transfer", hangup: false, row: "4" });
  assert.deepEqual(decideScammerHangup(done), { status: "accepted", hangup: true, row: "9" });
  assert.equal(decideScammerHangup({ ...done, userTurns: SCAMMER_HANGUP_MIN_USER_TURNS - 1 }).status, "too_early");
  assert.equal(decideScammerHangup({ ...done, smsAwaitingUser: true }).status, "blocked_pending");
  assert.equal(decideScammerHangup({ ...done, pendingInstruction: true }).status, "blocked_pending");
  assert.equal(decideScammerHangup({ ...done, limitReached: true }).status, "limit_reached");
});

test("[§108 로그 재현] 1a54b807 — 기관 사칭 고급 · 인증번호 도착(발화 4) 뒤 발화 6의 goal은 계속 blocked_transfer", () => {
  const delivered: DeliveredSmsRecord[] = [{ smsId: "institution-otp", userTurnsAtArrival: 4 }];
  assert.deepEqual(decide({ ...BASE, delivered, userTurns: 6 }), { status: "blocked_transfer", hangup: false, row: "4" });
  // 같은 세션: 이체 문자 발화 10 도착 → 화면 제출이면 다음 발화(11)에서 · 제출 기록이 없어도 발화 12에서 통과.
  const withTransfer = [...delivered, { smsId: "institution-safe-account", userTurnsAtArrival: 10 }];
  assert.equal(decide({ ...BASE, delivered: withTransfer, userTurns: 11 }).status, "blocked_transfer");
  assert.equal(
    decide({ ...BASE, delivered: [delivered[0]!, { ...withTransfer[1]!, landingSubmitted: true }], userTurns: 11 }).status,
    "accepted",
  );
  assert.equal(decide({ ...BASE, delivered: withTransfer, userTurns: 12 }).status, "accepted");
});

/** 문자가 여는 랜딩의 종류. */
function landingKind(scenarioId: string, smsId: string): "form" | "install" | undefined {
  const landing = (IN_CALL_SMS[scenarioId] ?? []).find((it) => it.smsId === smsId)?.fakeLandingId;
  if (!landing) return undefined;
  return resolveMockScreenKind(scenarioId, landing) === "app-install" ? "install" : "form";
}

test("[§108 7종] 확인 무력화 시나리오 × 고급 흐름 변형 전수 — 도착 전 발화 6 goal은 막힘 · 이체 · 설치를 마친 뒤 통과", () => {
  const scenarioIds = Object.keys(VERIFY_INTERCEPT).sort();
  assert.equal(scenarioIds.length, 7, "확인 무력화 시나리오 수가 바뀌었다 — 이 표를 다시 본다");
  const covered = new Set<string>();
  let variants = 0;
  for (const variant of FLOW_VARIANTS) {
    if (!VERIFY_INTERCEPT[variant.scenarioId] || variant.level !== "advanced") continue;
    variants += 1;
    const declared = variant.sms;
    const label = `${variant.scenarioId} ${variant.variantId}`;
    const base: GoalActionInput = { delivered: [], mockScreens: [], declared, declaredKnown: true, userTurns: 6 };

    // ⓐ 도착 전 발화 6 goal — 필수 문자 마지막 1건이 아직 안 왔다(선언 0이면 C-4 하한 전).
    const required = declared.filter((s) => s.required);
    const early = required.slice(0, -1).map((s, k) => ({ smsId: s.smsId, userTurnsAtArrival: 2 + k }));
    assert.deepEqual(decide({ ...base, delivered: early }), { status: "blocked_transfer", hangup: false, row: "4" }, `${label} 도착 전 6`);

    // ⓑ 이체 · 설치를 마친 뒤 — 필수 문자 전부 도착(발화 4 · 6 …) 후, 화면이 있으면 그 화면 행동 · 없으면 보고 발화.
    const arrivals = required.map((s, k) => ({ smsId: s.smsId, userTurnsAtArrival: 4 + 2 * k }));
    const last = arrivals.length ? Math.max(...arrivals.map((a) => a.userTurnsAtArrival)) : 0;
    const screenSms = declared.find((s) => landingKind(variant.scenarioId, s.smsId) !== undefined);
    let done: GoalActionInput;
    if (screenSms && landingKind(variant.scenarioId, screenSms.smsId) === "form") {
      const delivered = arrivals.some((a) => a.smsId === screenSms.smsId)
        ? arrivals.map((a) => (a.smsId === screenSms.smsId ? { ...a, landingSubmitted: true as const } : a))
        : [...arrivals, { smsId: screenSms.smsId, userTurnsAtArrival: last, landingSubmitted: true as const }];
      done = { ...base, delivered, userTurns: last + 1 }; // 제출 직후 다음 발화
    } else if (screenSms) {
      done = { ...base, delivered: arrivals, mockScreens: [{ consented: true, submitted: false }], userTurns: last + 1 };
    } else if (declared.length > 0) {
      done = { ...base, delivered: arrivals, userTurns: last + GOAL_AFTER_LAST_SMS_USER_TURNS }; // C-3
    } else {
      done = { ...base, userTurns: GOAL_NO_SMS_MIN_USER_TURNS }; // C-4
    }
    assert.deepEqual(decide(done), { status: "accepted", hangup: true, row: "9" }, `${label} 마친 뒤`);
    covered.add(variant.scenarioId);
  }
  assert.ok(variants >= 7);
  assert.deepEqual([...covered].sort(), scenarioIds, "고급 변형이 없는 확인 무력화 시나리오가 있다");
});

test("[§108 배선] 실시간 콜러블 · 텍스트 폴백이 같은 함수로 4행 입력을 만든다 · 클라 값 0 · 실패 = 미완료", () => {
  const realtime = readFileSync(path.join(SRC_ROOT, "scammerHangup/index.ts"), "utf8");
  const fallback = readFileSync(path.join(SRC_ROOT, "roleplay/index.ts"), "utf8");
  for (const [name, src] of [["realtime", realtime], ["fallback", fallback]] as const) {
    assert.ok(src.includes("goalActionDone = hasCompletedGoalAction({"), `${name}: 판정 함수 호출 0`);
    assert.ok(src.includes("readMockScreenCompletion(sessionRef)"), `${name}: 서버 기록 읽기 0`);
    assert.ok(/catch \{\s+goalActionDone = false;/.test(src), `${name}: 읽기 실패 fail-closed 0`);
  }
  assert.ok(!/request\.data[^;]*goalAction/.test(realtime), "클라 요청에서 완료 사실을 받는다");
  const delivery = readFileSync(path.join(SRC_ROOT, "inCallSms/smsDelivery.ts"), "utf8");
  assert.ok(delivery.includes('...(doc.get("landingSubmittedAt") ? { landingSubmitted: true as const } : {}),'));
});
