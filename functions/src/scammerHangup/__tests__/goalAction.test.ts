// §108(2026-10-22 사용자 결정 · 메인 세션 A안 · DECISIONS #223) — 끊기 4행 "목표 화면 행동 완료"(`goalActionDone`).
// ① 판정표 C-1 · C-2 ② 운영 로그 세션 1a54b807(기관 사칭 고급 · 사용자 발화 6에 goal → blocked_transfer) 재현 — 이체 전 이른 끊기는 계속 막힌다
// ③ 확인 무력화 7종 × 고급 흐름 변형 전수 — 목표 화면 행동을 마친 뒤에는 4행을 지나 끊기가 승인된다 ④ 배선(두 경로가 같은 함수).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { SCAMMER_HANGUP_MIN_USER_TURNS, decideScammerHangup, type ScammerHangupInput } from "../decide";
import { hasCompletedGoalAction } from "../goalAction";
import { FLOW_VARIANTS } from "../../scenarios/flowVariants";
import { IN_CALL_SMS } from "../../scenarios/inCallSms";
import { resolveMockScreenKind } from "../../scenarios/mockScreens";
import { VERIFY_INTERCEPT } from "../../scenarios/verifyIntercept";
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

test("[§108 C-1 · C-2] 랜딩 제출 · 앱 설치 응낙 · 화면 제출 중 하나면 완료 — 도착 · 열람만으로는 미완료", () => {
  assert.equal(hasCompletedGoalAction({ delivered: [], mockScreens: [] }), false);
  assert.equal(hasCompletedGoalAction({ delivered: [{ smsId: "a", userTurnsAtArrival: 4 }], mockScreens: [] }), false, "도착만");
  assert.equal(hasCompletedGoalAction({ delivered: [{ smsId: "a", landingSubmitted: true }], mockScreens: [] }), true, "C-1");
  assert.equal(hasCompletedGoalAction({ delivered: [], mockScreens: [{ consented: true, submitted: false }] }), true, "C-2 응낙");
  assert.equal(hasCompletedGoalAction({ delivered: [], mockScreens: [{ consented: false, submitted: true }] }), true, "C-2 제출");
  assert.equal(hasCompletedGoalAction({ delivered: [], mockScreens: [{ consented: false, submitted: false }] }), false, "화면 노출만");
});

test("[§108 4행] goalActionDone이면 4행만 비켜선다 — 하한 5 · 6 · 7행은 그대로 막는다", () => {
  assert.deepEqual(decideScammerHangup(VERIFY_ADVANCED), { status: "blocked_transfer", hangup: false, row: "4" });
  const done = { ...VERIFY_ADVANCED, goalActionDone: true };
  assert.deepEqual(decideScammerHangup(done), { status: "accepted", hangup: true, row: "9" });
  assert.equal(decideScammerHangup({ ...done, userTurns: SCAMMER_HANGUP_MIN_USER_TURNS - 1 }).status, "too_early");
  assert.equal(decideScammerHangup({ ...done, smsAwaitingUser: true }).status, "blocked_pending");
  assert.equal(decideScammerHangup({ ...done, pendingInstruction: true }).status, "blocked_pending");
  assert.equal(decideScammerHangup({ ...done, limitReached: true }).status, "limit_reached");
  // 확인 무력화 세션이 아니면 값과 무관(종전).
  assert.equal(decideScammerHangup({ ...VERIFY_ADVANCED, verifyEnabled: false }).status, "accepted");
});

test("[§108 로그 재현] 1a54b807 — 기관 사칭 고급 · 인증번호 문자 도착(발화 4) 뒤 발화 6의 goal은 이체 전이라 계속 blocked_transfer", () => {
  const delivered: DeliveredSmsRecord[] = [{ smsId: "institution-otp", userTurnsAtArrival: 4 }];
  const goalActionDone = hasCompletedGoalAction({ delivered, mockScreens: [] });
  assert.equal(goalActionDone, false);
  assert.deepEqual(decideScammerHangup({ ...VERIFY_ADVANCED, userTurns: 6, goalActionDone }), {
    status: "blocked_transfer",
    hangup: false,
    row: "4",
  });
  // 같은 세션이 이체 문자(발화 10 도착) 뒤 이체 화면을 제출했다면 — 다음 발화(11)에서 끊기가 승인된다.
  const afterTransfer: DeliveredSmsRecord[] = [
    ...delivered,
    { smsId: "institution-safe-account", userTurnsAtArrival: 10, landingSubmitted: true },
  ];
  const done = hasCompletedGoalAction({ delivered: afterTransfer, mockScreens: [] });
  assert.equal(decideScammerHangup({ ...VERIFY_ADVANCED, userTurns: 11, goalActionDone: done }).status, "accepted");
});

/** 흐름 변형의 문자가 여는 랜딩(카탈로그) — 종류별로. */
function landingsOf(scenarioId: string, smsIds: readonly string[]): { form: string[]; install: string[] } {
  const items = IN_CALL_SMS[scenarioId] ?? [];
  const out = { form: [] as string[], install: [] as string[] };
  for (const smsId of smsIds) {
    const landing = items.find((it) => it.smsId === smsId)?.fakeLandingId;
    if (!landing) continue;
    (resolveMockScreenKind(scenarioId, landing) === "app-install" ? out.install : out.form).push(landing);
  }
  return out;
}

test("[§108 7종] 확인 무력화 시나리오 × 고급 흐름 변형 — 목표 화면 행동(제출 · 설치 응낙) 뒤에는 4행을 지나 승인", () => {
  const scenarioIds = Object.keys(VERIFY_INTERCEPT).sort();
  assert.equal(scenarioIds.length, 7, "확인 무력화 시나리오 수가 바뀌었다 — 이 표를 다시 본다");
  const covered = new Set<string>();
  const noScreen: string[] = [];
  for (const variant of FLOW_VARIANTS) {
    if (!VERIFY_INTERCEPT[variant.scenarioId] || variant.level !== "advanced") continue;
    const smsIds = variant.sms.map((s) => s.smsId);
    const { form, install } = landingsOf(variant.scenarioId, smsIds);
    const label = `${variant.scenarioId} ${smsIds.join(",") || "(문자 0)"}`;
    if (form.length === 0 && install.length === 0) {
      noScreen.push(label);
      continue;
    }
    // 모든 문자 도착(발화 4 · 6) 뒤 발화 9 — 문자 대기 · 하한은 이미 통과.
    const arrivals = smsIds.map((smsId, k) => ({ smsId, userTurnsAtArrival: 4 + 2 * k }));
    const before = hasCompletedGoalAction({ delivered: arrivals, mockScreens: [] });
    assert.equal(decideScammerHangup({ ...VERIFY_ADVANCED, userTurns: 9, goalActionDone: before }).status, "blocked_transfer", `${label} 행동 전`);
    const formSms = smsIds.find((id) => form.includes((IN_CALL_SMS[variant.scenarioId] ?? []).find((it) => it.smsId === id)?.fakeLandingId ?? ""));
    const delivered = arrivals.map((a) => (a.smsId === formSms ? { ...a, landingSubmitted: true as const } : a));
    const mockScreens = formSms ? [] : [{ consented: true, submitted: false }];
    const after = hasCompletedGoalAction({ delivered, mockScreens });
    assert.deepEqual(
      decideScammerHangup({ ...VERIFY_ADVANCED, userTurns: 9, goalActionDone: after }),
      { status: "accepted", hangup: true, row: "9" },
      `${label} 행동 뒤`,
    );
    covered.add(variant.scenarioId);
  }
  assert.deepEqual([...covered].sort(), scenarioIds, "목표 화면이 있는 고급 변형이 하나도 없는 시나리오가 있다");
  // 화면 없는 변형(계좌 문자만 · 문자 0)은 서버가 이체 완료를 알 수 없다 — §108.2 잔여(이 목록이 바뀌면 문서도 고친다).
  assert.ok(noScreen.length >= 0);
});

test("[§108 배선] 실시간 콜러블 · 텍스트 폴백이 같은 함수(`hasCompletedGoalAction`)로 4행 입력을 만든다 · 클라 값 0", () => {
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
