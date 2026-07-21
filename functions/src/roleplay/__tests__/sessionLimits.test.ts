import { test } from "node:test";
import assert from "node:assert/strict";
import { isSessionLimitReached } from "../sessionLimits";
import { MAX_SESSION_MS, MAX_USER_TURNS } from "../../shared/constants";

test("isSessionLimitReached(): turnCount이 MAX_USER_TURNS(10)에 도달하면 true (DECISIONS #10)", () => {
  assert.equal(
    isSessionLimitReached({
      turnCount: MAX_USER_TURNS,
      maxUserTurns: MAX_USER_TURNS,
      elapsedMs: 1000,
      maxSessionMs: MAX_SESSION_MS,
    }),
    true,
  );
});

test("isSessionLimitReached(): 경과시간이 MAX_SESSION_MS(6분)에 도달하면 true (DECISIONS #10)", () => {
  assert.equal(
    isSessionLimitReached({
      turnCount: 3,
      maxUserTurns: MAX_USER_TURNS,
      elapsedMs: MAX_SESSION_MS,
      maxSessionMs: MAX_SESSION_MS,
    }),
    true,
  );
});

test("isSessionLimitReached(): 턴/시간 모두 한도 미만이면 false", () => {
  assert.equal(
    isSessionLimitReached({
      turnCount: 3,
      maxUserTurns: MAX_USER_TURNS,
      elapsedMs: 30_000,
      maxSessionMs: MAX_SESSION_MS,
    }),
    false,
  );
});
