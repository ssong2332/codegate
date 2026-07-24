import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_USER_SPEECH_DEBOUNCE_STATE,
  computeRmsFromByteTimeDomain,
  nextUserSpeechDebounceState,
} from "./userSpeechLevel.ts";

test("computeRmsFromByteTimeDomain: 완전 무음(전부 128)은 RMS 0이다", () => {
  const silence = new Uint8Array([128, 128, 128, 128]);
  assert.equal(computeRmsFromByteTimeDomain(silence), 0);
});

test("computeRmsFromByteTimeDomain: 알려진 편차값의 RMS를 정확히 계산한다", () => {
  // 128 기준 +10/-10 편차 → 제곱합 평균 100 → sqrt(100) = 10.
  const data = new Uint8Array([138, 118, 138, 118]);
  assert.equal(computeRmsFromByteTimeDomain(data), 10);
});

test("computeRmsFromByteTimeDomain: 빈 배열은 0으로 처리한다(0으로 나누기 방지)", () => {
  assert.equal(computeRmsFromByteTimeDomain(new Uint8Array([])), 0);
});

test("nextUserSpeechDebounceState: 문턱값을 넘기면 즉시 말하는 중으로 전환한다", () => {
  const next = nextUserSpeechDebounceState(INITIAL_USER_SPEECH_DEBOUNCE_STATE, {
    rms: 20,
    threshold: 10,
    suppressed: false,
    nowMs: 1000,
    offDelayMs: 400,
  });
  assert.equal(next.speaking, true);
  assert.equal(next.lastLoudAt, 1000);
});

test("nextUserSpeechDebounceState: 문턱값 미만이면 꺼진 상태를 유지한다", () => {
  const next = nextUserSpeechDebounceState(INITIAL_USER_SPEECH_DEBOUNCE_STATE, {
    rms: 5,
    threshold: 10,
    suppressed: false,
    nowMs: 1000,
    offDelayMs: 400,
  });
  assert.equal(next.speaking, false);
});

test("nextUserSpeechDebounceState: suppressed면 rms가 문턱값을 넘어도 켜지지 않는다(AI 발화 중/음소거)", () => {
  const next = nextUserSpeechDebounceState(INITIAL_USER_SPEECH_DEBOUNCE_STATE, {
    rms: 999,
    threshold: 10,
    suppressed: true,
    nowMs: 1000,
    offDelayMs: 400,
  });
  assert.equal(next.speaking, false);
});

test("nextUserSpeechDebounceState: off-디바운스 — 유예 시간 안의 짧은 침묵은 켜진 상태를 유지한다", () => {
  const loud = nextUserSpeechDebounceState(INITIAL_USER_SPEECH_DEBOUNCE_STATE, {
    rms: 20,
    threshold: 10,
    suppressed: false,
    nowMs: 1000,
    offDelayMs: 400,
  });
  assert.equal(loud.speaking, true);

  // 200ms 뒤 조용해져도 400ms 유예 안이라 아직 켜진 채로 유지된다.
  const stillOn = nextUserSpeechDebounceState(loud, {
    rms: 2,
    threshold: 10,
    suppressed: false,
    nowMs: 1200,
    offDelayMs: 400,
  });
  assert.equal(stillOn.speaking, true);
  assert.equal(stillOn.lastLoudAt, 1000, "off로 넘어가지 않았으므로 마지막 발화 시각은 그대로 보존된다");
});

test("nextUserSpeechDebounceState: off-디바운스 — 유예 시간을 넘겨 계속 조용하면 꺼진다", () => {
  const loud = nextUserSpeechDebounceState(INITIAL_USER_SPEECH_DEBOUNCE_STATE, {
    rms: 20,
    threshold: 10,
    suppressed: false,
    nowMs: 1000,
    offDelayMs: 400,
  });

  const off = nextUserSpeechDebounceState(loud, {
    rms: 2,
    threshold: 10,
    suppressed: false,
    nowMs: 1401,
    offDelayMs: 400,
  });
  assert.equal(off.speaking, false);
});

test("nextUserSpeechDebounceState: 유예 시간 안에 다시 문턱값을 넘기면 off 타이밍이 리셋된다", () => {
  const loud1 = nextUserSpeechDebounceState(INITIAL_USER_SPEECH_DEBOUNCE_STATE, {
    rms: 20,
    threshold: 10,
    suppressed: false,
    nowMs: 1000,
    offDelayMs: 400,
  });
  // 300ms 뒤 다시 크게 말함 — lastLoudAt이 1300으로 갱신되어야 한다.
  const loud2 = nextUserSpeechDebounceState(loud1, {
    rms: 20,
    threshold: 10,
    suppressed: false,
    nowMs: 1300,
    offDelayMs: 400,
  });
  assert.equal(loud2.lastLoudAt, 1300);
  // 원래 기준(1000+400=1400)이었다면 1401ms 시점에 꺼졌겠지만, 리셋됐으므로 아직 켜져 있어야 한다.
  const stillOn = nextUserSpeechDebounceState(loud2, {
    rms: 2,
    threshold: 10,
    suppressed: false,
    nowMs: 1401,
    offDelayMs: 400,
  });
  assert.equal(stillOn.speaking, true);
});
