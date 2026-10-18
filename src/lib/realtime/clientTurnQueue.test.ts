import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AWAIT_RESPONSE_TIMEOUT_MS,
  INITIAL_CLIENT_TURN_QUEUE_STATE,
  stepClientTurnQueue,
  type ClientTurn,
  type ClientTurnEvent,
  type ClientTurnQueueState,
} from "./clientTurnQueue.ts";

const opening: ClientTurn = { kind: "opening", text: "(오프닝)" };
const typed: ClientTurn = { kind: "text", text: "잠깐만요" };
// §78.4.2(G491) — 문자 안내는 이제 이 큐를 타지 않는다(맥락 주입). 큐 전이는 종류와 무관하므로 남은
// `turnComplete:true` 종류 중 하나(침묵 넛지)로 같은 시나리오를 그대로 검사한다(단언 무변경).
const instr: ClientTurn = { kind: "silence", text: "(침묵 넛지)" };

function run(events: ClientTurnEvent[], start: ClientTurnQueueState = INITIAL_CLIENT_TURN_QUEUE_STATE) {
  let state = start;
  const sent: { at: number; turn: ClientTurn }[] = [];
  for (const e of events) {
    const step = stepClientTurnQueue(state, e);
    state = step.state;
    if (step.send) sent.push({ at: e.nowMs, turn: step.send });
  }
  return { state, sent };
}

test("[§71.5 G431] 유휴 상태의 요청은 그 자리에서 보내고 응답 대기로 들어간다", () => {
  const { state, sent } = run([{ type: "request", turn: opening, nowMs: 10 }]);
  assert.deepEqual(sent, [{ at: 10, turn: opening }]);
  assert.equal(state.awaitingSince, 10);
});

test("[§71.5 G431] 모델 턴 진행 중(오디오 수신 후) 요청은 보류했다가 turnComplete에서 보낸다(2.5 서버 보류 재현)", () => {
  const { state, sent } = run([
    { type: "modelAudio", nowMs: 100 },
    { type: "request", turn: typed, nowMs: 200 },
    { type: "modelAudio", nowMs: 300 },
    { type: "turnComplete", nowMs: 900 },
  ]);
  assert.deepEqual(sent, [{ at: 900, turn: typed }]);
  assert.equal(state.awaitingSince, 900);
  assert.equal(state.modelTurnActive, false);
});

test("[§71.5] 우리가 보낸 턴의 응답을 기다리는 중(첫 오디오 전)의 요청도 보류한다 — 연속 전송이 막 시작한 생성을 끊지 않게", () => {
  const { sent } = run([
    { type: "request", turn: opening, nowMs: 0 },
    { type: "request", turn: typed, nowMs: 50 },
  ]);
  assert.deepEqual(sent, [{ at: 0, turn: opening }]);
});

test("[§71.5] 보류분은 한 번에 1건씩, 앞 건의 응답이 끝난 turnComplete마다 나간다(FIFO)", () => {
  const { sent, state } = run([
    { type: "modelAudio", nowMs: 0 },
    { type: "request", turn: typed, nowMs: 10 },
    { type: "request", turn: instr, nowMs: 20 },
    { type: "turnComplete", nowMs: 100 },
    { type: "modelAudio", nowMs: 150 },
    { type: "turnComplete", nowMs: 400 },
  ]);
  assert.deepEqual(
    sent.map((s) => [s.at, s.turn.kind]),
    [
      [100, "text"],
      [400, "silence"],
    ],
  );
  assert.equal(state.pending.length, 0);
});

test("[§71.5] interrupted에서는 보내지 않는다 — 참가자 발화 응답의 turnComplete에서 보낸다", () => {
  const { sent } = run([
    { type: "modelAudio", nowMs: 0 },
    { type: "request", turn: instr, nowMs: 10 },
    { type: "interrupted", nowMs: 20 },
    { type: "tick", nowMs: 1020 },
    { type: "modelAudio", nowMs: 1500 },
    { type: "turnComplete", nowMs: 3000 },
  ]);
  assert.deepEqual(sent, [{ at: 3000, turn: instr }]);
});

test("[§71.5] stall(서버가 turnComplete를 안 보냄)도 턴 끝으로 보고 보류분을 내보낸다", () => {
  const { sent } = run([
    { type: "modelAudio", nowMs: 0 },
    { type: "request", turn: typed, nowMs: 10 },
    { type: "stall", nowMs: 4500 },
  ]);
  assert.deepEqual(sent, [{ at: 4500, turn: typed }]);
});

test("[§71.5] 응답이 끝내 안 오면 AWAIT_RESPONSE_TIMEOUT_MS 뒤 tick에서 풀려 다음 보류분이 나간다", () => {
  const { sent } = run([
    { type: "request", turn: instr, nowMs: 0 },
    { type: "request", turn: typed, nowMs: 100 },
    { type: "tick", nowMs: AWAIT_RESPONSE_TIMEOUT_MS - 1 },
    { type: "tick", nowMs: AWAIT_RESPONSE_TIMEOUT_MS },
  ]);
  assert.deepEqual(
    sent.map((s) => [s.at, s.turn.kind]),
    [
      [0, "silence"],
      [AWAIT_RESPONSE_TIMEOUT_MS, "text"],
    ],
  );
});

test("[§71.5] 모델 턴 진행 중에는 타임아웃이 지나도 tick이 보내지 않는다", () => {
  const { sent } = run([
    { type: "modelAudio", nowMs: 0 },
    { type: "request", turn: typed, nowMs: 10 },
    { type: "tick", nowMs: AWAIT_RESPONSE_TIMEOUT_MS * 3 },
  ]);
  assert.deepEqual(sent, []);
});

test("[§71.5] 첫 오디오가 오면 응답 대기가 풀리고 모델 턴 진행 중으로 바뀐다", () => {
  const { state } = run([
    { type: "request", turn: opening, nowMs: 0 },
    { type: "modelAudio", nowMs: 900 },
  ]);
  assert.equal(state.awaitingSince, null);
  assert.equal(state.modelTurnActive, true);
});

test("[§71.5] 입력 상태를 변경하지 않는다(순수 함수)", () => {
  const before: ClientTurnQueueState = {
    modelTurnActive: true,
    awaitingSince: null,
    pending: [typed],
    afterInterrupt: false,
    toolPending: false,
  };
  const snapshot = JSON.stringify(before);
  stepClientTurnQueue(before, { type: "turnComplete", nowMs: 1 });
  stepClientTurnQueue(before, { type: "request", turn: instr, nowMs: 2 });
  assert.equal(JSON.stringify(before), snapshot);
});

test("[§71.5 reviewer M1] interrupted 직후 오디오 없는 turnComplete(3.8의 끊긴 턴 마감)로는 보류분을 풀지 않는다", () => {
  const { sent, state } = run([
    { type: "modelAudio", nowMs: 0 },
    { type: "request", turn: instr, nowMs: 10 },
    { type: "interrupted", nowMs: 2000 },
    { type: "turnComplete", nowMs: 2077 },
  ]);
  assert.deepEqual(sent, []);
  assert.equal(state.awaitingSince, 2077, "참가자 발화 응답을 계속 기다린다");
  const after = run(
    [
      { type: "modelAudio", nowMs: 3000 },
      { type: "turnComplete", nowMs: 6000 },
    ],
    state,
  );
  assert.deepEqual(after.sent, [{ at: 6000, turn: instr }]);
});

test("[§71.5 reviewer M1] 끊긴 뒤 응답이 끝내 없으면 tick 타임아웃으로 풀린다", () => {
  const { sent } = run([
    { type: "modelAudio", nowMs: 0 },
    { type: "request", turn: instr, nowMs: 10 },
    { type: "interrupted", nowMs: 2000 },
    { type: "turnComplete", nowMs: 2077 },
    { type: "tick", nowMs: 2077 + AWAIT_RESPONSE_TIMEOUT_MS },
  ]);
  assert.deepEqual(sent, [{ at: 2077 + AWAIT_RESPONSE_TIMEOUT_MS, turn: instr }]);
});

test("[§71.5 reviewer M2] BLOCKING 도구 대기 중(toolCall → toolResponse)에는 요청을 보류하고 stall로도 풀지 않는다", () => {
  const { sent } = run([
    { type: "toolCall", nowMs: 0 },
    { type: "request", turn: typed, nowMs: 100 },
    { type: "stall", nowMs: 4500 },
    { type: "tick", nowMs: AWAIT_RESPONSE_TIMEOUT_MS * 2 },
    { type: "toolResponseSent", nowMs: 5000 },
    { type: "modelAudio", nowMs: 5600 },
    { type: "turnComplete", nowMs: 9000 },
  ]);
  assert.deepEqual(sent, [{ at: 9000, turn: typed }]);
});

test("[§71.5 reviewer M2] 도구 결과를 보낸 뒤의 stall은 다시 턴 끝으로 본다", () => {
  const { sent } = run([
    { type: "toolCall", nowMs: 0 },
    { type: "request", turn: typed, nowMs: 100 },
    { type: "toolResponseSent", nowMs: 2000 },
    { type: "stall", nowMs: 6500 },
  ]);
  assert.deepEqual(sent, [{ at: 6500, turn: typed }]);
});
