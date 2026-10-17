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
const instr: ClientTurn = { kind: "instruction", text: "(문자 도착)" };

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

test("[§70.5 G431] 유휴 상태의 요청은 그 자리에서 보내고 응답 대기로 들어간다", () => {
  const { state, sent } = run([{ type: "request", turn: opening, nowMs: 10 }]);
  assert.deepEqual(sent, [{ at: 10, turn: opening }]);
  assert.equal(state.awaitingSince, 10);
});

test("[§70.5 G431] 모델 턴 진행 중(오디오 수신 후) 요청은 보류했다가 turnComplete에서 보낸다(2.5 서버 보류 재현)", () => {
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

test("[§70.5] 우리가 보낸 턴의 응답을 기다리는 중(첫 오디오 전)의 요청도 보류한다 — 연속 전송이 막 시작한 생성을 끊지 않게", () => {
  const { sent } = run([
    { type: "request", turn: opening, nowMs: 0 },
    { type: "request", turn: typed, nowMs: 50 },
  ]);
  assert.deepEqual(sent, [{ at: 0, turn: opening }]);
});

test("[§70.5] 보류분은 한 번에 1건씩, 앞 건의 응답이 끝난 turnComplete마다 나간다(FIFO)", () => {
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
      [400, "instruction"],
    ],
  );
  assert.equal(state.pending.length, 0);
});

test("[§70.5] interrupted에서는 보내지 않는다 — 참가자 발화 응답의 turnComplete에서 보낸다", () => {
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

test("[§70.5] stall(서버가 turnComplete를 안 보냄)도 턴 끝으로 보고 보류분을 내보낸다", () => {
  const { sent } = run([
    { type: "modelAudio", nowMs: 0 },
    { type: "request", turn: typed, nowMs: 10 },
    { type: "stall", nowMs: 4500 },
  ]);
  assert.deepEqual(sent, [{ at: 4500, turn: typed }]);
});

test("[§70.5] 응답이 끝내 안 오면 AWAIT_RESPONSE_TIMEOUT_MS 뒤 tick에서 풀려 다음 보류분이 나간다", () => {
  const { sent } = run([
    { type: "request", turn: instr, nowMs: 0 },
    { type: "request", turn: typed, nowMs: 100 },
    { type: "tick", nowMs: AWAIT_RESPONSE_TIMEOUT_MS - 1 },
    { type: "tick", nowMs: AWAIT_RESPONSE_TIMEOUT_MS },
  ]);
  assert.deepEqual(
    sent.map((s) => [s.at, s.turn.kind]),
    [
      [0, "instruction"],
      [AWAIT_RESPONSE_TIMEOUT_MS, "text"],
    ],
  );
});

test("[§70.5] 모델 턴 진행 중에는 타임아웃이 지나도 tick이 보내지 않는다", () => {
  const { sent } = run([
    { type: "modelAudio", nowMs: 0 },
    { type: "request", turn: typed, nowMs: 10 },
    { type: "tick", nowMs: AWAIT_RESPONSE_TIMEOUT_MS * 3 },
  ]);
  assert.deepEqual(sent, []);
});

test("[§70.5] 첫 오디오가 오면 응답 대기가 풀리고 모델 턴 진행 중으로 바뀐다", () => {
  const { state } = run([
    { type: "request", turn: opening, nowMs: 0 },
    { type: "modelAudio", nowMs: 900 },
  ]);
  assert.equal(state.awaitingSince, null);
  assert.equal(state.modelTurnActive, true);
});

test("[§70.5] 입력 상태를 변경하지 않는다(순수 함수)", () => {
  const before: ClientTurnQueueState = { modelTurnActive: true, awaitingSince: null, pending: [typed] };
  const snapshot = JSON.stringify(before);
  stepClientTurnQueue(before, { type: "turnComplete", nowMs: 1 });
  stepClientTurnQueue(before, { type: "request", turn: instr, nowMs: 2 });
  assert.equal(JSON.stringify(before), snapshot);
});
