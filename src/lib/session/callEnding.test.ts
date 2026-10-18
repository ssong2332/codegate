// T192 C5 · G509 · G510(순수 함수 몫) · G528 ⓒ — 통화 종료 순서의 순수 상태(Architecture.md §79.9 · §79.11 · §79.18 (2)).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HANGUP_DRAIN_CAP_MS,
  HANGUP_FINAL_TURN_CAP_MS,
  HANGUP_NO_AUDIO_READ_MS,
  HANGUP_NOTICE_MS,
  HANGUP_TAIL_MS,
  INITIAL_CALL_ENDING_STATE,
  REMOTE_HANGUP_STATUS_LINE,
  beginCallEnding,
  hangupDrainDelayMs,
  isEndLatched,
  latchHangupAccepted,
  reasonForEndedBy,
  shouldAcceptRelaySwitch,
  type CallEndedBy,
  type CallEndingState,
} from "./callEnding.ts";

const IDLE: CallEndingState = INITIAL_CALL_ENDING_STATE;
const ACCEPTED: CallEndingState = { phase: "hangup_accepted" };
const ending = (endedBy: CallEndedBy): CallEndingState => ({ phase: "ending", endedBy, reason: reasonForEndedBy(endedBy) });
const TRIGGERS: readonly CallEndedBy[] = ["scammer", "user", "limit", "remote"];

test("[G509] 초기 상태 · 사유 매핑 — scammer → scammer_ended · limit → limit_reached · user · remote → user_ended", () => {
  assert.deepEqual(IDLE, { phase: "idle" });
  assert.deepEqual(TRIGGERS.map(reasonForEndedBy), ["scammer_ended", "user_ended", "limit_reached", "user_ended"]);
});

test("[G509 · §79.8 R2] latchHangupAccepted — idle → hangup_accepted · 그 밖은 그대로(멱등 · 종료 중 승인은 아무것도 바꾸지 않는다)", () => {
  assert.deepEqual(latchHangupAccepted(IDLE), ACCEPTED);
  assert.equal(latchHangupAccepted(ACCEPTED), ACCEPTED);
  for (const by of TRIGGERS) {
    const s = ending(by);
    assert.equal(latchHangupAccepted(s), s, by);
  }
});

/** 판정표 정본 사본(callEnding.ts 머리 주석) — 구현을 보지 않고 옮겼다. */
const TABLE: ReadonlyArray<readonly [string, CallEndingState, CallEndedBy, CallEndingState, boolean, boolean]> = [
  ["idle + scammer(폴백 신호)", IDLE, "scammer", ending("scammer"), true, false],
  ["idle + user", IDLE, "user", ending("user"), true, true],
  ["idle + limit", IDLE, "limit", ending("limit"), true, true],
  ["idle + remote", IDLE, "remote", ending("remote"), true, true],
  ["승인 + scammer(R5 완료)", ACCEPTED, "scammer", ending("scammer"), true, true],
  ["승인 + user — 사유 유지 · 대기 건너뜀(§79.11 1행)", ACCEPTED, "user", ending("scammer"), true, true],
  ["승인 + limit — 무시(§79.11 2행)", ACCEPTED, "limit", ACCEPTED, false, false],
  ["승인 + remote — 무시(§79.11 3행)", ACCEPTED, "remote", ACCEPTED, false, false],
  ["끊기 종료 중 + user — 대기만 끊는다", ending("scammer"), "user", ending("scammer"), false, true],
  ["끊기 종료 중 + limit", ending("scammer"), "limit", ending("scammer"), false, false],
  ["끊기 종료 중 + remote", ending("scammer"), "remote", ending("scammer"), false, false],
  ["끊기 종료 중 + scammer(재호출)", ending("scammer"), "scammer", ending("scammer"), false, false],
  ["사용자 종료 중 + user(이중 탭)", ending("user"), "user", ending("user"), false, true],
  ["사용자 종료 중 + scammer(늦은 R5)", ending("user"), "scammer", ending("user"), false, false],
  ["한도 종료 중 + user", ending("limit"), "user", ending("limit"), false, true],
  ["서버 close 뒤 + scammer", ending("remote"), "scammer", ending("remote"), false, false],
];

test("[G509] beginCallEnding 판정표 전수 — next · started · skipWait", () => {
  for (const [label, s, by, next, started, skipWait] of TABLE) {
    assert.deepEqual(beginCallEnding(s, by), { next, started, skipWait }, label);
  }
});

test("[G509] 재진입 1회 — 어느 순서로 트리거가 겹쳐도 started는 정확히 1번 · 먼저 래치된 사유가 남는다", () => {
  const sequences: CallEndedBy[][] = [
    ["scammer", "user", "limit", "remote"],
    ["user", "scammer", "user"],
    ["limit", "remote", "scammer", "user"],
    ["remote", "user", "scammer"],
  ];
  for (const seq of sequences) {
    let s: CallEndingState = IDLE;
    let starts = 0;
    for (const by of seq) {
      const r = beginCallEnding(s, by);
      if (r.started) starts += 1;
      s = r.next;
    }
    assert.equal(starts, 1, seq.join(" → "));
    assert.deepEqual(s, ending(seq[0]!), `${seq.join(" → ")}: 첫 트리거의 사유가 남아야 한다`);
  }
  // 승인 뒤에 무엇이 와도 사유는 scammer(첫 래치)다 — 참가자 탭 포함.
  let s = latchHangupAccepted(IDLE);
  for (const by of ["limit", "remote", "user", "scammer"] as const) s = beginCallEnding(s, by).next;
  assert.deepEqual(s, ending("scammer"));
});

test("[G509 · G309 재지정] 상시 종료 경로의 대기 0 — 참가자 탭은 어느 상태에서든 skipWait", () => {
  for (const s of [IDLE, ACCEPTED, ...TRIGGERS.map(ending)]) {
    assert.equal(beginCallEnding(s, "user").skipWait, true, JSON.stringify(s));
  }
  // 대조군 — 폴백 끊기 신호만 대기한다(같은 판정식이 대기를 실제로 가른다).
  assert.equal(beginCallEnding(IDLE, "scammer").skipWait, false);
});

test("[G528 ⓒ · G510] 래치 판정 — idle만 교대 허용 · 나머지는 래치", () => {
  assert.equal(isEndLatched(IDLE), false);
  assert.equal(shouldAcceptRelaySwitch(IDLE), true);
  for (const s of [ACCEPTED, ...TRIGGERS.map(ending)]) {
    assert.equal(isEndLatched(s), true, JSON.stringify(s));
    assert.equal(shouldAcceptRelaySwitch(s), false, JSON.stringify(s));
  }
});

test("[G510 · §79.8 R4 · R5] 대기 상수(정본 판단값) · hangupDrainDelayMs = 잔여 재생 + 꼬리 · 0 이상 · 전체 상한 이하", () => {
  assert.deepEqual(
    [HANGUP_FINAL_TURN_CAP_MS, HANGUP_TAIL_MS, HANGUP_DRAIN_CAP_MS, HANGUP_NOTICE_MS, HANGUP_NO_AUDIO_READ_MS],
    [8000, 300, 15000, 2500, 1500],
  );
  assert.equal(hangupDrainDelayMs(0), 300);
  assert.equal(hangupDrainDelayMs(1200), 1500);
  assert.equal(hangupDrainDelayMs(-500), 300, "이미 끝난 재생(음수)은 0으로 본다");
  assert.equal(hangupDrainDelayMs(Number.NaN), 300, "비유한값은 0으로 본다");
  assert.equal(hangupDrainDelayMs(60_000), HANGUP_DRAIN_CAP_MS, "전체 상한");
});

test("[UX-014 v1.35 (1) · D-110] 끊김 표시 정본 문구 — 그대로 · 마침표 없음 · AC-086 (b) 낱말 0 · 판정 낱말 0", () => {
  assert.equal(REMOTE_HANGUP_STATUS_LINE, "상대방이 통화를 종료했습니다");
  assert.equal(/[.。]$/.test(REMOTE_HANGUP_STATUS_LINE), false);
  for (const word of ["모의", "훈련용", "가상", "재현", "목적", "포기", "속으"]) {
    assert.equal(REMOTE_HANGUP_STATUS_LINE.includes(word), false, word);
  }
});
