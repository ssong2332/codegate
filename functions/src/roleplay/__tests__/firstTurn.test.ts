// 첫 사용자 턴 판정 + sendMessage 배선(2026-10-18, 사용자 결정 C — 첫 턴만 LLM 시간 제한 20초).
//
// sendMessage는 Firestore·시크릿에 의존하는 onCall 핸들러라 유닛 계층에서 직접 실행할 수 없다
// (sendMessageLengthGate.test.ts와 같은 판단). 그래서 ① 판정 순수 함수를 전수로, ② 배선을 소스 스캔으로
// 고정하고, ③ 스캔이 실제로 잘못된 배선을 잡는지 오염본으로 역검증한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { isFirstUserTurn } from "../firstTurn";

const SRC = path.resolve(__dirname, "../../../src/roleplay/index.ts");

test("[C] isFirstUserTurn: 이력이 비어 있으면 첫 사용자 턴이다", () => {
  assert.equal(isFirstUserTurn([]), true);
});

test("[C] isFirstUserTurn: 사기범 메시지만 있으면(오프닝 대사 뒤) 첫 사용자 턴이다", () => {
  assert.equal(isFirstUserTurn([{ role: "scammer" }]), true);
  assert.equal(isFirstUserTurn([{ role: "scammer" }, { role: "scammer" }]), true);
});

test("[C] isFirstUserTurn: 사용자 메시지가 1건 이상 있으면 첫 사용자 턴이 아니다", () => {
  assert.equal(isFirstUserTurn([{ role: "user" }]), false);
  assert.equal(isFirstUserTurn([{ role: "scammer" }, { role: "user" }]), false);
  assert.equal(isFirstUserTurn([{ role: "scammer" }, { role: "user" }, { role: "scammer" }, { role: "user" }]), false);
});

/** 배선 불변식 — 위반 목록을 돌려준다(빈 배열이면 통과). 오염본 역검증에 같은 함수를 쓴다. */
function wiringViolations(src: string): string[] {
  const violations: string[] = [];
  const decl =
    /const llmClient = isFirstUserTurn\(storedHistory\)\s*\?\s*getLlmClient\(LLM_FIRST_TURN_TIMEOUT_MS\)\s*:\s*getLlmClient\(\);/;
  if (!decl.test(src)) {
    violations.push("첫 턴(isFirstUserTurn(storedHistory))에서만 LLM_FIRST_TURN_TIMEOUT_MS, 아니면 기본값이어야 한다");
  }
  const firstTurnCalls = src.split("getLlmClient(LLM_FIRST_TURN_TIMEOUT_MS)").length - 1;
  if (firstTurnCalls !== 1) {
    violations.push(`getLlmClient(LLM_FIRST_TURN_TIMEOUT_MS)는 정확히 1곳이어야 한다(실제 ${firstTurnCalls})`);
  }
  if (!src.includes("completeWithFallback(llmClient, {")) {
    violations.push("completeWithFallback이 위에서 고른 llmClient를 써야 한다");
  }
  if (/completeWithFallback\(getLlmClient\(/.test(src)) {
    violations.push("completeWithFallback이 판정을 건너뛰고 getLlmClient()를 직접 부른다");
  }
  return violations;
}

test("[C] 소스 스캔 — sendMessage가 첫 사용자 턴에서만 LLM_FIRST_TURN_TIMEOUT_MS를 넘긴다", () => {
  const src = readFileSync(SRC, "utf8");
  assert.deepEqual(wiringViolations(src), []);
  // 판정 입력은 이번 사용자 메시지를 쓰기 **전** 이력(트랜잭션이 읽은 history)이어야 한다.
  assert.ok(src.includes("const storedHistory = claim.history;"), "storedHistory가 트랜잭션 이력이 아니다");
});

test("[C] 역검증 — 잘못된 배선 오염본은 소스 스캔이 잡는다", () => {
  const src = readFileSync(SRC, "utf8");
  const correct =
    "const llmClient = isFirstUserTurn(storedHistory) ? getLlmClient(LLM_FIRST_TURN_TIMEOUT_MS) : getLlmClient();";
  assert.ok(src.includes(correct), "정본 배선 문자열이 바뀌었다 — 오염본 생성 기준을 갱신하라");
  const polluted: Record<string, string> = {
    "항상 20초": src.replace(correct, "const llmClient = getLlmClient(LLM_FIRST_TURN_TIMEOUT_MS);"),
    "조건 반전": src.replace(correct, correct.replace("isFirstUserTurn(", "!isFirstUserTurn(")),
    "분기 뒤바뀜": src.replace(
      correct,
      "const llmClient = isFirstUserTurn(storedHistory) ? getLlmClient() : getLlmClient(LLM_FIRST_TURN_TIMEOUT_MS);",
    ),
    "항상 기본값": src.replace(correct, "const llmClient = getLlmClient();"),
    "판정 우회": src.replace("completeWithFallback(llmClient, {", "completeWithFallback(getLlmClient(), {"),
  };
  for (const [name, variant] of Object.entries(polluted)) {
    assert.notEqual(variant, src, `오염본 '${name}'이 만들어지지 않았다`);
    assert.ok(wiringViolations(variant).length > 0, `오염본 '${name}'을 소스 스캔이 못 잡았다`);
  }
});
