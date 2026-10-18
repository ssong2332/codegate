import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  SCAMMER_HANGUP_MIN_SCAMMER_TURNS,
  SCAMMER_HANGUP_RULES,
  decideScammerHangup,
  normalizeScammerHangupKind,
  type ScammerHangupInput,
  type ScammerHangupRule,
  type ScammerHangupStatus,
} from "../decide";

// T192 C1 · G501 — `decideScammerHangup` 판정표(Architecture.md §79.2 + User 결정 2026-10-19 릴레이 행) 전수 ·
// 행 순서 · 역검증. 테스트는 컴파일된 lib/에서 돈다 — 소스 경로는 명시적으로 잡는다.
const SRC_DIR = path.resolve(__dirname, "../../../src/scammerHangup");

/** 모든 차단 행을 통과하는 기준 입력 — 이 입력은 `accepted`여야 한다(9행). */
const PASSING: ScammerHangupInput = {
  status: "active",
  channel: "voice",
  isMockTurn: false,
  verifyEnabled: false,
  transferPlaced: false,
  scammerTurns: SCAMMER_HANGUP_MIN_SCAMMER_TURNS,
  pendingInstruction: false,
  limitReached: false,
  alreadyAccepted: false,
  relay: undefined,
};

/** 표의 정본 사본 — 행 번호 · status · 끊기 여부 · **순서**. */
const EXPECTED_TABLE: ReadonlyArray<readonly [string, ScammerHangupStatus, boolean]> = [
  ["1", "not_active", false],
  ["2", "wrong_channel", false],
  ["2-b", "not_last_leg", false],
  ["3", "mock_turn", false],
  ["4", "blocked_transfer", false],
  ["5", "too_early", false],
  ["6", "blocked_pending", false],
  ["7", "limit_reached", false],
  ["8", "already_accepted", true],
  ["9", "accepted", true],
];

function assertTableShape(rules: readonly ScammerHangupRule[]): void {
  assert.deepEqual(
    rules.map((r) => [r.row, r.status, r.hangup] as const),
    EXPECTED_TABLE,
    "판정표의 행 · 순서 · 끊기 여부가 §79.18 (1) 최종형과 다르다",
  );
}

test("[G501 · G526] 판정표가 §79.18 (1) 최종형 순서 그대로다(10행 — 릴레이 2-b는 순서 3)", () => {
  assertTableShape(SCAMMER_HANGUP_RULES);
  assert.equal(SCAMMER_HANGUP_MIN_SCAMMER_TURNS, 4, "하한 판단값(OQ-A118)이 바뀌었다 — User 확정 없이 바꾸지 말 것");
});

test("[G501 역검증] 행 두 개의 순서를 바꾼 사본은 표 모양 단언에 걸린다", () => {
  const swapped = [...SCAMMER_HANGUP_RULES];
  [swapped[4], swapped[5]] = [swapped[5]!, swapped[4]!];
  assert.throws(() => assertTableShape(swapped), "순서가 바뀐 표가 통과했다 — 순서 단언이 죽었다");
  const dropped = SCAMMER_HANGUP_RULES.filter((r) => r.row !== "2-b");
  assert.throws(() => assertTableShape(dropped), "릴레이 행이 빠진 표가 통과했다");
});

test("[G501] 기준 입력은 accepted(9행) — 아래 역검증의 출발점", () => {
  assert.deepEqual(decideScammerHangup(PASSING), { status: "accepted", hangup: true, row: "9" });
  // channel 부재 = voice(하위호환).
  assert.equal(decideScammerHangup({ ...PASSING, channel: undefined }).status, "accepted");
});

/** 각 차단 행 — 기준 입력에서 **필드 하나만** 바꾼 사본. */
const SINGLE_FIELD_BLOCKS: ReadonlyArray<readonly [string, Partial<ScammerHangupInput>, ScammerHangupStatus, boolean]> = [
  ["1 · status=ended", { status: "ended" }, "not_active", false],
  ["1 · status=created", { status: "created" }, "not_active", false],
  ["2 · channel=messenger", { channel: "messenger" }, "wrong_channel", false],
  ["2-b · relay leg 0/2", { relay: { legIndex: 0, legCount: 2 } }, "not_last_leg", false],
  ["3 · Mock 턴", { isMockTurn: true }, "mock_turn", false],
  ["4 · 확인 무력화 세션 · 전환 전", { verifyEnabled: true }, "blocked_transfer", false],
  ["5 · 사기범 턴 3", { scammerTurns: SCAMMER_HANGUP_MIN_SCAMMER_TURNS - 1 }, "too_early", false],
  ["6 · 문자 대기", { pendingInstruction: true }, "blocked_pending", false],
  ["7 · 한도 도달", { limitReached: true }, "limit_reached", false],
  ["8 · 이미 승인", { alreadyAccepted: true }, "already_accepted", true],
];

test("[G501] 각 행 — 필드 하나만 바꾼 사본이 그 행으로 판정되고, 그 필드만 되돌리면 accepted다(역검증)", () => {
  const passingKeys = Object.keys(PASSING).sort();
  for (const [label, patch, status, hangup] of SINGLE_FIELD_BLOCKS) {
    const patchedKeys = Object.keys(patch);
    assert.equal(patchedKeys.length, 1, `${label}: 필드 하나만 바꿔야 한다`);
    const blocked = { ...PASSING, ...patch };
    const decision = decideScammerHangup(blocked);
    assert.equal(decision.status, status, `${label}: status`);
    assert.equal(decision.hangup, hangup, `${label}: 끊기 여부`);
    // 역검증 — 바꾼 필드 하나만 기준값으로 되돌리면 9행으로 떨어진다(다른 행이 몰래 막고 있지 않다).
    const restored: ScammerHangupInput = { ...blocked };
    const key = patchedKeys[0] as keyof ScammerHangupInput;
    if (key in PASSING) {
      (restored as Record<string, unknown>)[key] = PASSING[key];
    } else {
      delete (restored as Record<string, unknown>)[key];
    }
    assert.deepEqual(Object.keys(restored).sort(), passingKeys, `${label}: 되돌린 사본의 키`);
    assert.equal(decideScammerHangup(restored).status, "accepted", `${label}: 되돌리면 accepted여야 한다`);
  }
});

test("[G501] 4행 — 확인 무력화 세션이라도 전환(placedAt) 뒤에는 막지 않는다 · 일반 세션은 전환과 무관", () => {
  assert.equal(decideScammerHangup({ ...PASSING, verifyEnabled: true, transferPlaced: true }).status, "accepted");
  assert.equal(decideScammerHangup({ ...PASSING, verifyEnabled: false, transferPlaced: true }).status, "accepted");
});

test("[G501] 5행 경계 — 3턴 too_early · 4턴 accepted · 비유한값은 too_early(fail-closed)", () => {
  assert.equal(decideScammerHangup({ ...PASSING, scammerTurns: 3 }).status, "too_early");
  assert.equal(decideScammerHangup({ ...PASSING, scammerTurns: 4 }).status, "accepted");
  assert.equal(decideScammerHangup({ ...PASSING, scammerTurns: 0 }).status, "too_early");
  assert.equal(decideScammerHangup({ ...PASSING, scammerTurns: Number.NaN }).status, "too_early");
});

test("[G526 ⓑ] 릴레이 2-b — legIndex < legCount-1이면 not_last_leg · 마지막 leg · 범위 밖은 다음 행으로(정본 조건 그대로)", () => {
  const cases: ReadonlyArray<readonly [string, ScammerHangupInput["relay"], ScammerHangupStatus]> = [
    ["부재", undefined, "accepted"],
    ["단일 leg 0/1", { legIndex: 0, legCount: 1 }, "accepted"],
    ["마지막 leg 1/2", { legIndex: 1, legCount: 2 }, "accepted"],
    ["마지막 leg 2/3", { legIndex: 2, legCount: 3 }, "accepted"],
    ["첫 leg 0/2", { legIndex: 0, legCount: 2 }, "not_last_leg"],
    ["가운데 leg 1/3", { legIndex: 1, legCount: 3 }, "not_last_leg"],
    // §79.2 끝 — 범위 밖 `legIndex ≥ legCount`는 마지막으로 본다(이 함수는 보정하지 않는다).
    ["범위 밖 2/2", { legIndex: 2, legCount: 2 }, "accepted"],
    ["범위 밖 5/3", { legIndex: 5, legCount: 3 }, "accepted"],
  ];
  for (const [label, relay, status] of cases) {
    assert.equal(decideScammerHangup({ ...PASSING, relay }).status, status, label);
  }
});

test("[G526 ⓒ 역검증] not_last_leg 입력에서 legIndex만 마지막으로 바꾼 사본은 accepted", () => {
  for (const legCount of [2, 3, 4]) {
    for (let legIndex = 0; legIndex < legCount - 1; legIndex += 1) {
      const blocked = { ...PASSING, relay: { legIndex, legCount } };
      assert.equal(decideScammerHangup(blocked).status, "not_last_leg", `${legIndex}/${legCount}`);
      const last = { ...blocked, relay: { legIndex: legCount - 1, legCount } };
      assert.equal(decideScammerHangup(last).status, "accepted", `${legCount - 1}/${legCount}`);
    }
  }
});

/** 릴레이 행 도입 전 9행 판정(§79.2 원문) — G526 ⓐ 회귀 기준. */
function legacyNineRowStatus(i: ScammerHangupInput): ScammerHangupStatus {
  if (i.status !== "active") return "not_active";
  if (i.channel === "messenger") return "wrong_channel";
  if (i.isMockTurn) return "mock_turn";
  if (i.verifyEnabled && !i.transferPlaced) return "blocked_transfer";
  if (i.scammerTurns < SCAMMER_HANGUP_MIN_SCAMMER_TURNS) return "too_early";
  if (i.pendingInstruction) return "blocked_pending";
  if (i.limitReached) return "limit_reached";
  if (i.alreadyAccepted) return "already_accepted";
  return "accepted";
}

function* allInputs(relay: ScammerHangupInput["relay"]): Generator<ScammerHangupInput> {
  const bools = [false, true];
  for (const status of ["active", "ended", "created"] as const)
    for (const channel of [undefined, "voice", "messenger"] as const)
      for (const isMockTurn of bools)
        for (const verifyEnabled of bools)
          for (const transferPlaced of bools)
            for (const scammerTurns of [0, 3, 4, 9])
              for (const pendingInstruction of bools)
                for (const limitReached of bools)
                  for (const alreadyAccepted of bools)
                    yield {
                      status, channel, isMockTurn, verifyEnabled, transferPlaced,
                      scammerTurns, pendingInstruction, limitReached, alreadyAccepted, relay,
                    };
}

test("[G526 ⓐ] relay 부재 · 마지막 leg — 전 입력 조합에서 기존 9행 판정과 같다(회귀 0)", () => {
  let n = 0;
  for (const relay of [undefined, { legIndex: 1, legCount: 2 }]) {
    for (const input of allInputs(relay)) {
      assert.equal(decideScammerHangup(input).status, legacyNineRowStatus(input), JSON.stringify(input));
      n += 1;
    }
  }
  assert.equal(n, 2 * 3 * 3 * 2 * 2 * 2 * 4 * 2 * 2 * 2, "조합 수가 바뀌었다 — 열거가 깨졌다");
});

test("[G526 ⓐ 역검증] 중간 leg를 넣으면 기존 판정과 갈리는 조합이 실제로 있다(위 단언이 공허하지 않다)", () => {
  let diverged = 0;
  for (const input of allInputs({ legIndex: 0, legCount: 2 })) {
    if (decideScammerHangup(input).status !== legacyNineRowStatus(input)) diverged += 1;
  }
  assert.ok(diverged > 0, "중간 leg가 판정을 하나도 바꾸지 않는다 — 2-b 행이 죽었다");
});

test("[G501] 첫 번째로 맞는 행이 이긴다 — 두 행이 동시에 맞을 때", () => {
  const nonLast = { legIndex: 0, legCount: 2 };
  const pairs: ReadonlyArray<readonly [string, Partial<ScammerHangupInput>, ScammerHangupStatus]> = [
    ["1 > 2", { status: "ended", channel: "messenger" }, "not_active"],
    ["2 > 2-b", { channel: "messenger", relay: nonLast }, "wrong_channel"],
    ["2-b > 3", { relay: nonLast, isMockTurn: true }, "not_last_leg"],
    ["2-b > 4", { relay: nonLast, verifyEnabled: true }, "not_last_leg"],
    ["3 > 4", { isMockTurn: true, verifyEnabled: true }, "mock_turn"],
    ["4 > 5", { verifyEnabled: true, scammerTurns: 1 }, "blocked_transfer"],
    ["5 > 6", { scammerTurns: 1, pendingInstruction: true }, "too_early"],
    ["6 > 7", { pendingInstruction: true, limitReached: true }, "blocked_pending"],
    ["7 > 8 — 한도가 이긴다", { limitReached: true, alreadyAccepted: true }, "limit_reached"],
    ["1 > 8 — 끝난 세션은 표식이 있어도 not_active", { status: "ended", alreadyAccepted: true }, "not_active"],
  ];
  for (const [label, patch, status] of pairs) {
    assert.equal(decideScammerHangup({ ...PASSING, ...patch }).status, status, label);
  }
});

test("[G501] kind는 판정 입력이 아니다 · 누락 · 오기입은 unspecified(거절 0)", () => {
  assert.equal(normalizeScammerHangupKind("goal"), "goal");
  assert.equal(normalizeScammerHangupKind("give_up"), "give_up");
  for (const raw of [undefined, null, "", "GOAL", "giveup", 1, {}]) {
    assert.equal(normalizeScammerHangupKind(raw), "unspecified", String(raw));
  }
  // 입력 타입에 kind가 없다 — 판정에 끼어들 자리가 구조적으로 없다.
  assert.ok(!("kind" in PASSING));
});

test("[G501 배선] decide.ts는 잎 모듈이다 — 값 import 0(타입 import만)", () => {
  const src = readFileSync(path.join(SRC_DIR, "decide.ts"), "utf8");
  const importLines = src.split(/\r?\n/).filter((line) => /^import\b/.test(line));
  assert.ok(importLines.length >= 1, "import 줄을 하나도 찾지 못했다 — 스캔이 깨졌다");
  const valueImports = importLines.filter((line) => !/^import type\b/.test(line));
  assert.deepEqual(valueImports, [], "decide.ts에 값 import가 생겼다 — Firestore · LLM 의존을 들이지 말 것");
});

test("[G501 배선] 실시간 콜러블은 decideScammerHangup 하나로 판정한다(commit.ts 경유) · 다른 판정 경로 0", () => {
  const index = readFileSync(path.join(SRC_DIR, "index.ts"), "utf8");
  const commit = readFileSync(path.join(SRC_DIR, "commit.ts"), "utf8");
  assert.ok(index.includes("decideAndMarkRealtimeHangup<"), "콜러블이 commit.ts의 판정 함수를 부르지 않는다");
  assert.ok(commit.includes("decideScammerHangup({"), "commit.ts가 decideScammerHangup을 부르지 않는다");
  // 판정 status 리터럴을 콜러블이 직접 만들면 표를 우회하는 두 번째 경로가 된다.
  for (const status of ["\"accepted\"", "\"too_early\"", "\"blocked_transfer\""]) {
    assert.ok(!index.includes(status), `index.ts가 status ${status}를 직접 쓴다 — 판정은 표에서만`);
  }
  // ⚠️ 폴백(`roleplay/index.ts`)이 같은 함수를 부르는지는 C3 배선 뒤에 이 테스트에 더한다(C1 범위 밖).
});
