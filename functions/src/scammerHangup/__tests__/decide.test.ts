import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import {
  SCAMMER_HANGUP_MIN_USER_TURNS,
  SCAMMER_HANGUP_RULES,
  decideScammerHangup,
  normalizeScammerHangupKind,
  type ScammerHangupInput,
  type ScammerHangupRule,
  type ScammerHangupStatus,
} from "../decide";

// T192 C1 · G501 — `decideScammerHangup` 판정표(Architecture.md §79.2 + User 결정 2026-10-19 릴레이 행) 전수 ·
// 행 순서 · 역검증. T192 C3 — §79.19 (2)~(4): 하한 = 사용자 발화(G552) · 6행 = 지시 대기 ∨ 문자 대기 · 8행 위치(G553).
// 테스트는 컴파일된 lib/에서 돈다 — 소스 경로는 명시적으로 잡는다.
const SRC_DIR = path.resolve(__dirname, "../../../src/scammerHangup");
const SRC_ROOT = path.resolve(__dirname, "../../../src");

/** 모든 차단 행을 통과하는 기준 입력 — 이 입력은 `accepted`여야 한다(9행). */
const PASSING: ScammerHangupInput = {
  status: "active",
  channel: "voice",
  isMockTurn: false,
  verifyEnabled: false,
  transferPlaced: false,
  userTurns: SCAMMER_HANGUP_MIN_USER_TURNS,
  pendingInstruction: false,
  smsAwaitingUser: false,
  limitReached: false,
  alreadyAccepted: false,
  relay: undefined,
};

/** 표의 정본 사본 — 행 번호 · status · 끊기 여부 · **순서**(§79.19 (3) — 8행이 2-b 바로 뒤). */
const EXPECTED_TABLE: ReadonlyArray<readonly [string, ScammerHangupStatus, boolean]> = [
  ["1", "not_active", false],
  ["2", "wrong_channel", false],
  ["2-b", "not_last_leg", false],
  ["8", "already_accepted", true],
  ["3", "mock_turn", false],
  ["4", "blocked_transfer", false],
  ["5", "too_early", false],
  ["6", "blocked_pending", false],
  ["7", "limit_reached", false],
  ["9", "accepted", true],
];

function assertTableShape(rules: readonly ScammerHangupRule[]): void {
  assert.deepEqual(
    rules.map((r) => [r.row, r.status, r.hangup] as const),
    EXPECTED_TABLE,
    "판정표의 행 · 순서 · 끊기 여부가 §79.19 (3) 순서(1 · 2 · 2-b · 8 · 3 · 4 · 5 · 6 · 7 · 9)와 다르다",
  );
}

test("[G501 · G526 · G553] 판정표가 §79.19 (3) 순서 그대로다(10행 — 8행은 2-b 바로 뒤)", () => {
  assertTableShape(SCAMMER_HANGUP_RULES);
  assert.equal(SCAMMER_HANGUP_MIN_USER_TURNS, 3, "하한 판단값(OQ-A118 — 사용자 발화 3)이 바뀌었다 — User 확정 없이 바꾸지 말 것");
});

test("[G501 역검증] 행 두 개의 순서를 바꾼 사본은 표 모양 단언에 걸린다", () => {
  const swapped = [...SCAMMER_HANGUP_RULES];
  [swapped[5], swapped[6]] = [swapped[6]!, swapped[5]!];
  assert.throws(() => assertTableShape(swapped), "순서가 바뀐 표가 통과했다 — 순서 단언이 죽었다");
  const dropped = SCAMMER_HANGUP_RULES.filter((r) => r.row !== "2-b");
  assert.throws(() => assertTableShape(dropped), "릴레이 행이 빠진 표가 통과했다");
  // C1 순서(8행이 7행 뒤)로 되돌린 사본도 걸린다 — G553의 형태 쪽 역검증.
  const legacy = SCAMMER_HANGUP_RULES.filter((r) => r.row !== "8");
  legacy.splice(legacy.length - 1, 0, SCAMMER_HANGUP_RULES.find((r) => r.row === "8")!);
  assert.throws(() => assertTableShape(legacy), "8행을 옛 자리(7행 뒤)로 되돌린 표가 통과했다");
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
  ["8 · 이미 승인", { alreadyAccepted: true }, "already_accepted", true],
  ["3 · Mock 턴", { isMockTurn: true }, "mock_turn", false],
  ["4 · 확인 무력화 세션 · 전환 전", { verifyEnabled: true }, "blocked_transfer", false],
  ["5 · 사용자 발화 2", { userTurns: SCAMMER_HANGUP_MIN_USER_TURNS - 1 }, "too_early", false],
  ["6 · 지시 대기(클라 항)", { pendingInstruction: true }, "blocked_pending", false],
  ["6 · 문자 대기(서버 항)", { smsAwaitingUser: true }, "blocked_pending", false],
  ["7 · 한도 도달", { limitReached: true }, "limit_reached", false],
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
    (restored as Record<string, unknown>)[key] = PASSING[key];
    assert.deepEqual(Object.keys(restored).sort(), passingKeys, `${label}: 되돌린 사본의 키`);
    assert.equal(decideScammerHangup(restored).status, "accepted", `${label}: 되돌리면 accepted여야 한다`);
  }
});

test("[G501] 4행 — 확인 무력화 세션이라도 전환(placedAt) 뒤에는 막지 않는다 · 일반 세션은 전환과 무관", () => {
  assert.equal(decideScammerHangup({ ...PASSING, verifyEnabled: true, transferPlaced: true }).status, "accepted");
  assert.equal(decideScammerHangup({ ...PASSING, verifyEnabled: false, transferPlaced: true }).status, "accepted");
});

test("[G552 ⓐ] 5행 경계 — 사용자 발화 2 too_early · 3 다음 행(accepted) · 0 · 비유한값은 too_early(fail-closed)", () => {
  assert.equal(decideScammerHangup({ ...PASSING, userTurns: 2 }).status, "too_early");
  assert.equal(decideScammerHangup({ ...PASSING, userTurns: 3 }).status, "accepted");
  assert.equal(decideScammerHangup({ ...PASSING, userTurns: 0 }).status, "too_early");
  assert.equal(decideScammerHangup({ ...PASSING, userTurns: Number.NaN }).status, "too_early");
});

test("[G552 ⓑ] 폴백 교대 엄격 표(k = 0~10) — 옛 `사기범 턴 번호 ≥ 4` ⇔ 새 `userTurns ≥ 3`", () => {
  // 폴백은 매 요청이 사용자 1 + 사기범 1(오프닝 사기범 문서 포함) — 사용자 k번째 발화에 답하는 턴의 사기범 턴 번호 =
  // 저장된 사기범 문서(k) + 1 = k + 1(`roleplay/index.ts` `scammerTurnNumber` 정의) · 사용자 발화 수 = k(`userTurnsNow`).
  const OLD_MIN_SCAMMER_TURN_NUMBER = 4;
  for (let k = 0; k <= 10; k += 1) {
    const oldOpens = k + 1 >= OLD_MIN_SCAMMER_TURN_NUMBER;
    const newOpens = decideScammerHangup({ ...PASSING, userTurns: k }).status !== "too_early";
    assert.equal(newOpens, oldOpens, `k=${k}: 옛 하한과 새 하한이 갈렸다 — 폴백 동작이 바뀐다`);
  }
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

/**
 * 릴레이 행을 뺀 **새 순서** 9행 판정(§79.19 (6) ① — G526 ⓐ는 옛 9행이 아니라 새 순서 9행과 대비한다).
 * 구현을 보지 않고 정본(1 · 2 · 8 · 3 · 4 · 5 · 6 · 7 · 9)을 그대로 옮긴 사본이다.
 */
function nineRowStatusNewOrder(i: ScammerHangupInput): ScammerHangupStatus {
  if (i.status !== "active") return "not_active";
  if (i.channel === "messenger") return "wrong_channel";
  if (i.alreadyAccepted) return "already_accepted";
  if (i.isMockTurn) return "mock_turn";
  if (i.verifyEnabled && !i.transferPlaced) return "blocked_transfer";
  if (i.userTurns < SCAMMER_HANGUP_MIN_USER_TURNS) return "too_early";
  if (i.pendingInstruction || i.smsAwaitingUser) return "blocked_pending";
  if (i.limitReached) return "limit_reached";
  return "accepted";
}

function* allInputs(relay: ScammerHangupInput["relay"]): Generator<ScammerHangupInput> {
  const bools = [false, true];
  for (const status of ["active", "ended", "created"] as const)
    for (const channel of [undefined, "voice", "messenger"] as const)
      for (const isMockTurn of bools)
        for (const verifyEnabled of bools)
          for (const transferPlaced of bools)
            for (const userTurns of [0, 2, 3, 9])
              for (const pendingInstruction of bools)
                for (const smsAwaitingUser of bools)
                  for (const limitReached of bools)
                    for (const alreadyAccepted of bools)
                      yield {
                        status, channel, isMockTurn, verifyEnabled, transferPlaced, userTurns,
                        pendingInstruction, smsAwaitingUser, limitReached, alreadyAccepted, relay,
                      };
}

const INPUT_COMBOS = 3 * 3 * 2 * 2 * 2 * 4 * 2 * 2 * 2 * 2;

test("[G526 ⓐ] relay 부재 · 마지막 leg — 전 입력 조합에서 새 순서 9행 판정과 같다(회귀 0)", () => {
  let n = 0;
  for (const relay of [undefined, { legIndex: 1, legCount: 2 }]) {
    for (const input of allInputs(relay)) {
      assert.equal(decideScammerHangup(input).status, nineRowStatusNewOrder(input), JSON.stringify(input));
      n += 1;
    }
  }
  assert.equal(n, 2 * INPUT_COMBOS, "조합 수가 바뀌었다 — 열거가 깨졌다");
});

test("[G526 ⓐ 역검증] 중간 leg를 넣으면 9행 판정과 갈리는 조합이 실제로 있다(위 단언이 공허하지 않다)", () => {
  let diverged = 0;
  for (const input of allInputs({ legIndex: 0, legCount: 2 })) {
    if (decideScammerHangup(input).status !== nineRowStatusNewOrder(input)) diverged += 1;
  }
  assert.ok(diverged > 0, "중간 leg가 판정을 하나도 바꾸지 않는다 — 2-b 행이 죽었다");
});

test("[G553] 표식 있는 입력은 3 · 4 · 5 · 6 · 7행 조건을 무엇을 켜도 already_accepted · 1 · 2 · 2-b는 여전히 이긴다", () => {
  const laterRowPatches: ReadonlyArray<readonly [string, Partial<ScammerHangupInput>, ScammerHangupStatus]> = [
    ["3 Mock", { isMockTurn: true }, "mock_turn"],
    ["4 전환 전", { verifyEnabled: true }, "blocked_transfer"],
    ["5 하한 미달", { userTurns: 0 }, "too_early"],
    ["6 지시 대기", { pendingInstruction: true }, "blocked_pending"],
    ["6 문자 대기", { smsAwaitingUser: true }, "blocked_pending"],
    ["7 한도", { limitReached: true }, "limit_reached"],
  ];
  for (const [label, patch, unmarkedStatus] of laterRowPatches) {
    const marked = { ...PASSING, ...patch, alreadyAccepted: true };
    assert.deepEqual(decideScammerHangup(marked), { status: "already_accepted", hangup: true, row: "8" }, label);
    // 역검증 — 표식만 지운 사본은 그 행으로 떨어진다(8행이 실제로 앞에서 막고 있었다).
    assert.equal(decideScammerHangup({ ...marked, alreadyAccepted: false }).status, unmarkedStatus, `${label}: 표식만 지운 사본`);
  }
  // 3~7행 조건을 한꺼번에 켜도 같다(C1 Minor-1 — 승인 뒤 재호출에서 지시 큐가 생겨도 판정이 뒤집히지 않는다).
  const allOn = {
    ...PASSING, alreadyAccepted: true, isMockTurn: true, verifyEnabled: true, userTurns: 0,
    pendingInstruction: true, smsAwaitingUser: true, limitReached: true,
  };
  assert.equal(decideScammerHangup(allOn).status, "already_accepted");
  // 1 · 2 · 2-b는 표식보다 앞이다(끝난 세션 · 메신저 단계 · 다른 leg에서 승인 유지는 틀린 답).
  assert.equal(decideScammerHangup({ ...PASSING, alreadyAccepted: true, status: "ended" }).status, "not_active");
  assert.equal(decideScammerHangup({ ...PASSING, alreadyAccepted: true, channel: "messenger" }).status, "wrong_channel");
  assert.equal(
    decideScammerHangup({ ...PASSING, alreadyAccepted: true, relay: { legIndex: 0, legCount: 2 } }).status,
    "not_last_leg",
  );
});

test("[G501] 첫 번째로 맞는 행이 이긴다 — 두 행이 동시에 맞을 때", () => {
  const nonLast = { legIndex: 0, legCount: 2 };
  const pairs: ReadonlyArray<readonly [string, Partial<ScammerHangupInput>, ScammerHangupStatus]> = [
    ["1 > 2", { status: "ended", channel: "messenger" }, "not_active"],
    ["2 > 2-b", { channel: "messenger", relay: nonLast }, "wrong_channel"],
    ["2-b > 8", { relay: nonLast, alreadyAccepted: true }, "not_last_leg"],
    ["2-b > 3", { relay: nonLast, isMockTurn: true }, "not_last_leg"],
    ["8 > 3", { alreadyAccepted: true, isMockTurn: true }, "already_accepted"],
    ["3 > 4", { isMockTurn: true, verifyEnabled: true }, "mock_turn"],
    ["4 > 5", { verifyEnabled: true, userTurns: 1 }, "blocked_transfer"],
    ["5 > 6", { userTurns: 1, pendingInstruction: true }, "too_early"],
    ["5 > 6(문자)", { userTurns: 1, smsAwaitingUser: true }, "too_early"],
    ["6 > 7", { pendingInstruction: true, limitReached: true }, "blocked_pending"],
    ["6(문자) > 7", { smsAwaitingUser: true, limitReached: true }, "blocked_pending"],
    ["8 > 7 — 표식이 이긴다(이미 끊는 중)", { limitReached: true, alreadyAccepted: true }, "already_accepted"],
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

// C1 Minor ⑥ — 옛 제목(*"… · 다른 판정 경로 0"*)은 본문(콜러블의 status 리터럴 3개 검사)보다 넓었다 ⇒ 본문 범위로 줄였다.
test("[G501 배선] 실시간 콜러블은 commit.ts 경유로 판정한다 · 콜러블이 판정 status 리터럴을 직접 만들지 않는다", () => {
  const index = readFileSync(path.join(SRC_DIR, "index.ts"), "utf8");
  const commit = readFileSync(path.join(SRC_DIR, "commit.ts"), "utf8");
  assert.ok(index.includes("decideAndMarkRealtimeHangup<"), "콜러블이 commit.ts의 판정 함수를 부르지 않는다");
  assert.ok(commit.includes("decideScammerHangup({"), "commit.ts가 decideScammerHangup을 부르지 않는다");
  // 판정 status 리터럴을 콜러블이 직접 만들면 표를 우회하는 두 번째 경로가 된다.
  for (const status of ["\"accepted\"", "\"too_early\"", "\"blocked_transfer\""]) {
    assert.ok(!index.includes(status), `index.ts가 status ${status}를 직접 쓴다 — 판정은 표에서만`);
  }
});

// C1 Minor ⑥ ⑦ — C1이 *"C3 배선 뒤에 더한다"* 로 인계한 폴백 쪽 단언(G501 · G526 ⓓ · G554).
test("[G501 · G526 ⓓ · G554 배선] 폴백 sendMessage도 같은 판정 함수 · isSmsAwaitingUser · resolveHangupRelay를 부른다", () => {
  const roleplay = readFileSync(path.join(SRC_ROOT, "roleplay/index.ts"), "utf8");
  const fallback = readFileSync(path.join(SRC_DIR, "fallback.ts"), "utf8");
  const commit = readFileSync(path.join(SRC_DIR, "commit.ts"), "utf8");
  // 폴백 핸들러 → fallback.ts → decideScammerHangup(실시간 commit.ts와 같은 함수).
  assert.equal(roleplay.split("decideFallbackHangup(").length - 1, 2, "폴백 사전 · 사후 판정이 각 1회여야 한다");
  assert.ok(fallback.includes("decideScammerHangup({"), "fallback.ts가 decideScammerHangup을 부르지 않는다");
  assert.ok(roleplay.includes("relay: resolveHangupRelay(session)"), "폴백 판정 입력의 릴레이가 resolveHangupRelay에서 오지 않는다");
  // 문자 대기 판정 지점 하나(G554) — 폴백 · 콜러블 모두 isSmsAwaitingUser. 조건식 복사(직접 비교) 0.
  assert.ok(fallback.includes("isSmsAwaitingUser("), "폴백이 isSmsAwaitingUser를 부르지 않는다");
  assert.ok(commit.includes("isSmsAwaitingUser("), "콜러블 판정이 isSmsAwaitingUser를 부르지 않는다");
  for (const [label, src] of [["roleplay/index.ts", roleplay], ["fallback.ts", fallback], ["commit.ts", commit]] as const) {
    assert.equal(src.includes("lastArrivalUserTurns("), false, `${label}가 문자 대기 조건을 직접 계산한다 — isSmsAwaitingUser 하나로`);
  }
  // 폴백 핸들러가 판정 status 리터럴을 직접 만들지 않는다(사후 판정 효과는 fallback.ts의 순수 함수).
  for (const status of ["\"accepted\"", "\"too_early\"", "\"blocked_pending\""]) {
    assert.ok(!roleplay.includes(status), `roleplay/index.ts가 status ${status}를 직접 쓴다`);
  }
});

/** `functions/src/scammerHangup/**`의 .ts 파일 전부. */
function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTs(full));
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

// ⚠️ 바늘을 쪼개 둔다 — 이 파일 자신도 스캔 대상이다(자기 주석 · 자기 리터럴 함정).
const OLD_TURN_FIELD = ["scammer", "Turns"].join("");

/** 요청 타입 블록(`export type RequestScammerHangupRequest = { … };`)만 잘라낸다. */
function requestTypeBlock(src: string): string {
  const start = src.indexOf("export type RequestScammerHangupRequest = {");
  assert.ok(start >= 0, "요청 타입을 찾지 못했다 — 스캔이 깨졌다");
  return src.slice(start, src.indexOf("};", start) + 2);
}

test("[G552 ⓓ] scammerHangup/** · 서버 · 클라 요청 타입에 옛 사기범 턴 식별자 0", () => {
  const files = listTs(SRC_DIR);
  assert.ok(files.length >= 8, `스캔 파일이 너무 적다(${files.length}) — 경로가 깨졌다`);
  const hits = files.filter((f) => readFileSync(f, "utf8").includes(OLD_TURN_FIELD)).map((f) => path.relative(SRC_DIR, f));
  assert.deepEqual(hits, [], "옛 하한 입력 식별자가 남았다 — 하한은 사용자 발화(userTurns)다(§79.19 (2))");
  const serverBlock = requestTypeBlock(readFileSync(path.join(SRC_DIR, "types.ts"), "utf8"));
  const clientBlock = requestTypeBlock(readFileSync(path.resolve(SRC_ROOT, "../../src/lib/api/types.ts"), "utf8"));
  for (const [label, block] of [["서버", serverBlock], ["클라", clientBlock]] as const) {
    assert.equal(block.includes(OLD_TURN_FIELD), false, `${label} 요청 타입에 옛 식별자`);
    assert.ok(/\buserTurns: number;/.test(block), `${label} 요청 타입에 userTurns가 없다`);
  }
});

test("[G552 ⓓ 역검증] 옛 식별자를 끼운 요청 타입 사본은 같은 스캔에 걸린다", () => {
  const block = requestTypeBlock(readFileSync(path.join(SRC_DIR, "types.ts"), "utf8"));
  const poisoned = block.replace("userTurns: number;", `${OLD_TURN_FIELD}: number;`);
  assert.notEqual(poisoned, block, "주입 앵커가 맞지 않는다");
  assert.equal(poisoned.includes(OLD_TURN_FIELD), true);
  assert.equal(/\buserTurns: number;/.test(poisoned), false);
});
