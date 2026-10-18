import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";
import { MAX_CLAIMED_TURNS } from "../../inCallSms/smsGate";
import { readScammerHangupRequest } from "../readRequest";

// T192 C3 · G558 — `requestScammerHangup` 요청 판독 무효값 표(Architecture.md §79.19 (6) ② ③ · (8) G558).
// 핸들러에서 판독이 세션 read보다 앞이라는 소스 순서는 `commit.test.ts` [G558 · §79.19 (4) 배선]이 본다.

const VALID = { sessionId: "sess-1", userTurns: 3, pendingInstruction: false, kind: "goal" };

function expectInvalid(data: unknown, label: string): void {
  assert.throws(
    () => readScammerHangupRequest(data),
    (err: unknown) => err instanceof HttpsError && err.code === "invalid-argument",
    `${label}: invalid-argument여야 한다`,
  );
}

test("[G558] 정상 요청 — 판독값 그대로 · kind 정규화", () => {
  assert.deepEqual(readScammerHangupRequest(VALID), { sessionId: "sess-1", userTurns: 3, pendingInstruction: false, kind: "goal" });
  assert.equal(readScammerHangupRequest({ ...VALID, kind: "give_up" }).kind, "give_up");
  for (const kind of [undefined, null, "", "GOAL", 1, {}]) {
    assert.equal(readScammerHangupRequest({ ...VALID, kind }).kind, "unspecified", `kind=${String(kind)} — 거절 0`);
  }
  // 경계 — 0 · MAX_CLAIMED_TURNS는 통과(S5b `readClaimedTurns`와 같은 범위).
  assert.equal(readScammerHangupRequest({ ...VALID, userTurns: 0 }).userTurns, 0);
  assert.equal(readScammerHangupRequest({ ...VALID, userTurns: MAX_CLAIMED_TURNS }).userTurns, MAX_CLAIMED_TURNS);
  assert.equal(readScammerHangupRequest({ ...VALID, pendingInstruction: true }).pendingInstruction, true);
});

test("[G558] 무효값 표 — 필드 하나만 바꾼 사본은 전부 invalid-argument", () => {
  const rows: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ["sessionId 숫자(C1 Minor ②)", { sessionId: 123 }],
    ["sessionId 객체", { sessionId: { id: "x" } }],
    ["sessionId 빈 문자열", { sessionId: "" }],
    ["sessionId 누락", { sessionId: undefined }],
    ["userTurns 소수", { userTurns: 2.5 }],
    ["userTurns 음수", { userTurns: -1 }],
    [`userTurns ${MAX_CLAIMED_TURNS + 1}`, { userTurns: MAX_CLAIMED_TURNS + 1 }],
    ["userTurns NaN", { userTurns: Number.NaN }],
    ["userTurns 문자열", { userTurns: "3" }],
    ["userTurns 누락", { userTurns: undefined }],
    ["pendingInstruction 문자열", { pendingInstruction: "false" }],
    ["pendingInstruction 숫자", { pendingInstruction: 0 }],
    ["pendingInstruction 누락", { pendingInstruction: undefined }],
  ];
  for (const [label, patch] of rows) {
    expectInvalid({ ...VALID, ...patch }, label);
    // 역검증 — 같은 필드만 정상값으로 되돌리면 통과한다(다른 필드가 몰래 막고 있지 않다).
    const key = Object.keys(patch)[0] as keyof typeof VALID;
    assert.doesNotThrow(() => readScammerHangupRequest({ ...VALID, ...patch, [key]: VALID[key] }), `${label}: 되돌린 사본`);
  }
  for (const data of [undefined, null, "x", 1]) expectInvalid(data, `data=${String(data)}`);
});
