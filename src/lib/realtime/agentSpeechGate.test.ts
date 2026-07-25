import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeGateCloseDelayMs,
  STALL_GRACE_MS,
  TAIL_GRACE_MS,
} from "./agentSpeechGate.ts";

// 회귀 1(사용자 신고 2026-07-25 "말을 하다가 마는 현상") — 모델이 문장 중간에 잠깐 생성을 멈추면
// 예약 재생이 비는데, 이때 곧바로 마이크를 열면 방 소음이 VAD에 잡혀 모델이 자기 문장을 끊는다.
// 전사까지 함께 잘린 것이 "재생만 끊긴 게 아니라 생성이 중단됐다"는 근거였다.
test("턴 진행 중에는 재생이 비어도 stall 여유만큼 기다린다(문장 중간 생성 정지)", () => {
  const delay = computeGateCloseDelayMs({
    remainingPlaybackMs: 0,
    turnInProgress: true,
  });

  assert.equal(delay, STALL_GRACE_MS);
  // 수정 전 동작(잔여 + 250ms)이었다면 250이 나왔다 — 그 값이 나오면 회귀다.
  assert.ok(
    delay > TAIL_GRACE_MS,
    `턴이 진행 중인데 꼬리 여유(${TAIL_GRACE_MS}ms)만 주면 문장 중간 정지에서 마이크가 열려 ` +
      `모델이 자기 말을 끊는다(실측 회귀).`,
  );
});

// 회귀 2 — Gemini는 오디오를 실시간보다 빠르게 보낸다. turnComplete(생성 완료) 시점에도 아직
// 재생되지 않은 오디오가 남아 있을 수 있는데, 거기서 즉시 마이크를 열면 스피커 꼬리 소리가
// 되돌아가 다음 턴을 오염시킨다.
test("turnComplete 뒤에도 잔여 재생이 끝날 때까지 기다린다(꼬리 재생 보호)", () => {
  const delay = computeGateCloseDelayMs({
    remainingPlaybackMs: 3000,
    turnInProgress: false,
  });

  assert.equal(delay, 3000 + TAIL_GRACE_MS);
  assert.ok(
    delay >= 3000,
    "turnComplete에서 즉시 열면 아직 재생 중인 꼬리 오디오가 마이크로 되돌아간다.",
  );
});

test("턴이 끝나고 재생도 비면 꼬리 여유만 기다린다(정상 종료 경로)", () => {
  assert.equal(
    computeGateCloseDelayMs({ remainingPlaybackMs: 0, turnInProgress: false }),
    TAIL_GRACE_MS,
  );
});

// 서버가 turnComplete를 끝내 보내지 않아도 마이크가 영구히 닫히면 안 된다 — 사용자가 말을 못 하게
// 되는 건 원래 증상보다 나쁜 고장이다. 진행 중 턴에도 반드시 유한한 상한이 있어야 한다.
test("턴 진행 중이어도 대기 시간은 유한하다(turnComplete 누락 대비 안전장치)", () => {
  const delay = computeGateCloseDelayMs({
    remainingPlaybackMs: 0,
    turnInProgress: true,
  });

  assert.ok(Number.isFinite(delay), "무한 대기는 마이크를 영구히 닫아 사용자를 가둔다.");
  assert.ok(
    delay <= 10_000,
    `stall 상한이 ${delay}ms면 서버가 turnComplete를 빠뜨렸을 때 사용자가 너무 오래 갇힌다.`,
  );
});

test("음수 잔여 재생(시계 오차)은 0으로 눌러 과거 시각이 대기를 깎지 않게 한다", () => {
  assert.equal(
    computeGateCloseDelayMs({ remainingPlaybackMs: -5000, turnInProgress: false }),
    TAIL_GRACE_MS,
  );
});

test("여유값은 주입 가능하다(상수 조정이 테스트를 깨지 않게)", () => {
  assert.equal(
    computeGateCloseDelayMs({
      remainingPlaybackMs: 100,
      turnInProgress: true,
      stallGraceMs: 1000,
    }),
    1100,
  );
});
