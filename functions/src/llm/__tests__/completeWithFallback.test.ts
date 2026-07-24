import { test } from "node:test";
import assert from "node:assert/strict";
import { completeWithFallback } from "../index";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "../types";

// reviewer 리뷰 Major #1 회귀 방지(2026-07-24) — 실 LLM 호출이 실패(안전필터 차단·타임아웃·
// 네트워크 등)해도 completeWithFallback은 절대 throw하지 않고 Mock으로 강등해야 한다. sendMessage가
// 이미 사용자 턴을 원자적으로 커밋한 뒤 이 함수를 호출하므로, 여기서 던지면 "답 없는 사용자 턴"이
// 영구히 남는다(대화 이력 오염) — 이게 바로 이 테스트가 막는 회귀다.

function alwaysFailingClient(): LlmClient {
  return {
    providerName: "gemini",
    async complete(_input: LlmCompletionInput): Promise<LlmCompletionResult> {
      throw new Error("simulated Gemini failure (safety filter / timeout / network)");
    },
  };
}

function alwaysSucceedingClient(text: string): LlmClient {
  return {
    providerName: "gemini",
    async complete(_input: LlmCompletionInput): Promise<LlmCompletionResult> {
      return { text, isMock: false };
    },
  };
}

test("completeWithFallback(): 1차 클라이언트가 성공하면 그 결과를 그대로 반환한다(폴백 미발동)", async () => {
  const result = await completeWithFallback(alwaysSucceedingClient("실 Gemini 응답"), {
    systemPrompt: "(system)",
    messages: [],
  });
  assert.equal(result.text, "실 Gemini 응답");
  assert.equal(result.isMock, false);
});

test("completeWithFallback(): 1차 클라이언트가 실패해도 절대 throw하지 않고 Mock으로 강등한다(사용자 턴이 답 없이 남는 것 방지)", async () => {
  const result = await completeWithFallback(alwaysFailingClient(), {
    systemPrompt: "(system)",
    messages: [],
    mockTacticHints: ["테스트 수법 — '테스트 대사'"],
  });
  assert.equal(result.isMock, true, "폴백 결과는 정직하게 isMock:true여야 한다");
  assert.ok(result.text.length > 0, "폴백이어도 빈 텍스트를 반환하면 안 된다(사용자에게 답 없는 턴 노출 방지)");
});

test("completeWithFallback(): 폴백 시에도 mockTacticHints가 실제로 Mock 생성에 반영된다(폴백이 진짜 Mock 경로를 탐)", async () => {
  const result = await completeWithFallback(alwaysFailingClient(), {
    systemPrompt: "(system)",
    messages: [],
    mockTacticHints: ["친분 이용 — '오랜만이다' 처럼 기존 친분을 근거로 신뢰를 유도한다."],
  });
  assert.ok(result.text.includes("오랜만이다"), "MockLlmClient의 extractTacticFlavor가 정상 동작해야 한다");
});
