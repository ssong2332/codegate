// 첫 턴 시간 제한 상수 + getLlmClient 기본값 + 예비 요청 제거(2026-10-18, 사용자 결정 A·C).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import * as llm from "../index";
import { LLM_FIRST_TURN_TIMEOUT_MS, LLM_TIMEOUT_MS } from "../index";

const LLM_SRC_DIR = path.resolve(__dirname, "../../../src/llm");
const INDEX_SRC = path.join(LLM_SRC_DIR, "index.ts");

test("[C] LLM_FIRST_TURN_TIMEOUT_MS === 20초이고 LLM_TIMEOUT_MS(10초)는 그대로다", () => {
  assert.equal(LLM_FIRST_TURN_TIMEOUT_MS, 20_000);
  assert.equal(LLM_TIMEOUT_MS, 10_000);
});

test("[C] getLlmClient()의 기본 시간 제한은 LLM_TIMEOUT_MS이고 그 값이 withTimeout에 그대로 들어간다(소스 스캔)", () => {
  const src = readFileSync(INDEX_SRC, "utf8");
  assert.match(src, /export function getLlmClient\(timeoutMs: number = LLM_TIMEOUT_MS\): LlmClient \{/);
  const body = src.slice(src.indexOf("export function getLlmClient("), src.indexOf("export async function completeWithFallback("));
  assert.match(body, /return withTimeout\(routed, timeoutMs\);/, "인자로 받은 timeoutMs가 withTimeout에 쓰여야 한다");
  assert.doesNotMatch(body, /withTimeout\([^)]*LLM_FIRST_TURN_TIMEOUT_MS/, "팩토리 안에서 20초를 고정하면 모든 호출부가 20초가 된다");
});

test("[A] 예비 요청(withHedge)이 제거됐다 — 파일·상수·팩토리 배선 모두 없다", () => {
  assert.equal(existsSync(path.join(LLM_SRC_DIR, "hedgedClient.ts")), false, "llm/hedgedClient.ts가 남아 있다");
  assert.equal("LLM_HEDGE_DELAY_MS" in llm, false, "LLM_HEDGE_DELAY_MS export가 남아 있다");
  const src = readFileSync(INDEX_SRC, "utf8");
  assert.doesNotMatch(src, /import \{ withHedge \}|withHedge\(/, "getLlmClient가 아직 withHedge를 쓴다");
});
