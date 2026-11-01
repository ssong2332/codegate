// H1(2026-11-01 U1 실기 신고 — 확인 창구로 넘긴다더니 창구 담당자가 말하지 않음) — 클라 지시 큐의 결정적 재현과 수정 고정.
// 근거: docs/research/resistance-pacing-and-handoff-2026-11-01.md §2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  callerLabelForDisplay,
  enqueueInstruction,
  instructionBusyBlocks,
  shouldDrainInstructionQueue,
  takeNextInstruction,
  type PendingInstruction,
} from "./verifyIntercept.ts";

const RECONNECT: PendingInstruction = { text: "(재연결 지시)", priority: "verify", speakerSwitch: true };

/**
 * `play/page.tsx` `drainInstructionQueue`의 판정 순서(바쁨 → 참가자 턴 게이트 → 꺼내기)를 순수 함수로 재현한다.
 * `legacy`면 H1 이전 판정(넘김 지시도 바쁨 · 게이트에 묶인다)이다.
 */
function drainOnce(
  state: { queue: PendingInstruction[]; busy: boolean; gateOpen: boolean; streak: number },
  legacy = false,
): PendingInstruction | null {
  const head = state.queue[0];
  if (!head) return null;
  if (legacy ? state.busy : instructionBusyBlocks({ busy: state.busy, next: head })) return null;
  const open = shouldDrainInstructionQueue({
    userSpokeSinceLastInjection: state.gateOpen,
    suppressedBoundaryStreak: state.streak,
    ...(legacy ? {} : { nextIsSpeakerSwitch: head.speakerSwitch === true }),
  });
  if (!open) {
    state.streak += 1;
    return null;
  }
  const { item, rest } = takeNextInstruction(state.queue);
  state.queue = rest;
  state.busy = true;
  state.gateOpen = false;
  state.streak = 0;
  return item;
}

/** 확인 권유 안내가 막 나간 직후(맥락 주입 — 응답을 유발하지 않아 바쁨이 남는다) 재연결 지시가 도착한 상태. */
function afterAnnounce(): { queue: PendingInstruction[]; busy: boolean; gateOpen: boolean; streak: number } {
  const state = { queue: [] as PendingInstruction[], busy: false, gateOpen: true, streak: 0 };
  state.queue = enqueueInstruction(state.queue, { text: "(확인 권유 안내)", priority: "verify" });
  assert.equal(drainOnce(state)?.text, "(확인 권유 안내)");
  state.queue = enqueueInstruction(state.queue, RECONNECT);
  return state;
}

test("[H1 재현] 종전 판정: 안내 직후 들어온 넘김 지시는 참가자가 말할 때까지 묶인다", () => {
  const state = afterAnnounce();
  assert.equal(drainOnce(state, true), null, "바쁨에 막힌다");
  state.busy = false; // 사기범 턴 경계가 와도
  assert.equal(drainOnce(state, true), null, "참가자 턴 게이트(직전 주입 뒤 발화 0)에 또 막힌다");
  assert.equal(state.queue[0]?.speakerSwitch, true, "그동안 원래 인물이 답한다 — 넘김 지시는 큐에 남아 있다");
});

test("[H1 수정] 넘김 지시는 바쁨 · 참가자 턴 게이트를 건너뛰어 그 자리에서 나간다", () => {
  const state = afterAnnounce();
  assert.equal(drainOnce(state)?.speakerSwitch, true);
  assert.deepEqual(state.queue, []);
});

test("[H1] 넘김 지시는 대기 중인 문자 안내보다 앞에 선다(라벨이 바뀐 뒤 앞 사람이 문자 안내를 말하지 않게)", () => {
  let queue: PendingInstruction[] = [];
  queue = enqueueInstruction(queue, { text: "(문자 도착)", priority: "sms" });
  queue = enqueueInstruction(queue, { text: "(확인 지시)", priority: "verify" });
  queue = enqueueInstruction(queue, RECONNECT);
  queue = enqueueInstruction(queue, { text: "(문자 도착 2)", priority: "sms" });
  assert.deepEqual(
    queue.map((item) => item.text),
    ["(재연결 지시)", "(문자 도착)", "(문자 도착 2)", "(확인 지시)"],
    "넘김 지시 맨 앞 · 나머지는 G31(문자 먼저 · 같은 순위 도착 순)",
  );
});

test("[H1 · T-4 가드 유지] 넘김 지시가 아닌 항목은 종전대로 참가자 턴을 기다린다", () => {
  assert.equal(shouldDrainInstructionQueue({ userSpokeSinceLastInjection: false, suppressedBoundaryStreak: 0 }), false);
  assert.equal(
    shouldDrainInstructionQueue({ userSpokeSinceLastInjection: false, suppressedBoundaryStreak: 0, nextIsSpeakerSwitch: false }),
    false,
  );
  assert.equal(instructionBusyBlocks({ busy: true, next: { text: "(문자)", priority: "sms" } }), true);
  assert.equal(instructionBusyBlocks({ busy: false, next: { text: "(문자)", priority: "sms" } }), false);
  assert.equal(instructionBusyBlocks({ busy: true, next: undefined }), true);
});

test("[H1 라벨] 넘김 지시가 Live에 나가기 전에는 원래 발신자 라벨을 유지한다", () => {
  const base = { reconnectedCallerLabel: "보안확인창구", scenarioCallerLabel: "02-000-0000" };
  assert.equal(callerLabelForDisplay({ ...base, speakerSwitchPending: true }), "02-000-0000");
  assert.equal(callerLabelForDisplay({ ...base, speakerSwitchPending: false }), "보안확인창구");
  // 새로고침 뒤(대기 표시 없음) — 문서 값 그대로(T83 단일 렌더 소스).
  assert.equal(
    callerLabelForDisplay({ reconnectedCallerLabel: undefined, scenarioCallerLabel: undefined, speakerSwitchPending: false }),
    "발신번호 표시제한",
  );
});

test("[H1 배선] page.tsx는 큐 맨 앞 항목으로 바쁨 · 게이트를 판정하고, 넘김 지시 전송 시점에 라벨을 바꾼다", () => {
  const page = readFileSync(path.resolve(import.meta.dirname, "../../app/session/play/page.tsx"), "utf8");
  assert.match(page, /instructionBusyBlocks\(\{ busy: instructionBusyRef\.current, next: head \}\)/);
  assert.match(page, /nextIsSpeakerSwitch: head\?\.speakerSwitch === true/);
  assert.doesNotMatch(page, /if \(instructionBusyRef\.current\) return;/, "무조건 바쁨 차단이 남아 있으면 넘김 지시가 묶인다");
  assert.match(page, /setSpeakerSwitchPending\(true\);\s*\r?\n\s*enqueueTurnInstruction\(result\.reconnectInstruction/);
  assert.match(page, /onRelayGreetingSent=\{handleRelayGreetingSent\}/);
  const voice = readFileSync(path.resolve(import.meta.dirname, "../realtime/GeminiVoiceSession.tsx"), "utf8");
  assert.match(voice, /if \(turn\.kind === "relayGreeting"\) handlersRef\.current\.onRelayGreetingSent\?\.\(\);/);
});
