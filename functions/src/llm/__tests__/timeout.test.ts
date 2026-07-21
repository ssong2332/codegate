import { test } from "node:test";
import assert from "node:assert/strict";
import { getLlmClient, LLM_TIMEOUT_MS, withTimeout } from "../index";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "../types";

function fakeClient(delayMs: number, text = "(fake)"): LlmClient {
  return {
    providerName: "mock",
    async complete(_input: LlmCompletionInput): Promise<LlmCompletionResult> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { text, isMock: true };
    },
  };
}

test("LLM_TIMEOUT_MS matches AC-004's documented p95 target (10s, API.md deadline-exceeded)", () => {
  assert.equal(LLM_TIMEOUT_MS, 10_000);
});

test("withTimeout(): 클라이언트가 제시간에 응답하면 그대로 통과시킨다", async () => {
  const wrapped = withTimeout(fakeClient(5), 50);
  const result = await wrapped.complete({ systemPrompt: "", messages: [] });
  assert.equal(result.text, "(fake)");
});

test("withTimeout(): 타임아웃을 초과하면 deadline-exceeded HttpsError를 던진다(AC-004, QA 지적 반영)", async () => {
  const wrapped = withTimeout(fakeClient(100), 20);

  await assert.rejects(
    () => wrapped.complete({ systemPrompt: "", messages: [] }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal((err as { code?: string }).code, "deadline-exceeded");
      return true;
    },
  );
});

test("getLlmClient()는 타임아웃 래핑이 적용된 클라이언트를 반환한다(정상 호출은 그대로 동작)", async () => {
  const client = getLlmClient();
  const result = await client.complete({ systemPrompt: "(system)", messages: [] });
  assert.equal(result.isMock, true);
});
