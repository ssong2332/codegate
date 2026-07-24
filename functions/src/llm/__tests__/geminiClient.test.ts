import { test } from "node:test";
import assert from "node:assert/strict";
import { GeminiLlmClient } from "../geminiClient";

/** realtime/__tests__/geminiProvider.test.ts와 동일한 방식 — SDK 내부를 가로챌 수 없으므로
 * fetch 계층에서 요청 본문을 캡처하고 실제 API 응답 형태를 흉내낸 응답을 돌려준다. */
function captureGenerateContentRequest(replyText: string): {
  restore: () => void;
  bodies: () => unknown[];
} {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    if (init?.body) {
      try {
        bodies.push(JSON.parse(init.body));
      } catch {
        bodies.push(init.body);
      }
    }
    return new Response(
      JSON.stringify({
        candidates: [{ content: { role: "model", parts: [{ text: replyText }] } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof globalThis.fetch;
  return {
    restore: () => {
      globalThis.fetch = originalFetch;
    },
    bodies: () => bodies,
  };
}

test("GeminiLlmClient: systemPrompt를 systemInstruction으로, 대화 이력을 user/model role로 그대로 전달한다", async () => {
  const capture = captureGenerateContentRequest("네, 알겠습니다.");
  try {
    const client = new GeminiLlmClient("test-key");
    const result = await client.complete({
      systemPrompt: "너는 훈련용 사기범 캐릭터다.",
      messages: [
        { role: "assistant", content: "여보세요?" },
        { role: "user", content: "[훈련참가자입력:데이터시작]\n누구세요\n[훈련참가자입력:데이터끝]" },
      ],
    });

    assert.equal(result.text, "네, 알겠습니다.");
    assert.equal(result.isMock, false);

    const body = capture.bodies()[0] as {
      systemInstruction?: { parts?: { text?: string }[] };
      contents?: { role?: string; parts?: { text?: string }[] }[];
    };
    assert.equal(body.systemInstruction?.parts?.[0]?.text, "너는 훈련용 사기범 캐릭터다.");
    assert.equal(body.contents?.[0]?.role, "model", "assistant는 Gemini의 'model' role로 매핑돼야 한다");
    assert.equal(body.contents?.[0]?.parts?.[0]?.text, "여보세요?");
    assert.equal(body.contents?.[1]?.role, "user");
    assert.ok(body.contents?.[1]?.parts?.[0]?.text?.includes("누구세요"));
  } finally {
    capture.restore();
  }
});

test("GeminiLlmClient: 대화 이력이 비어 있으면(오프닝 대사) 화면에 노출되지 않는 내부 트리거 턴을 합성해 보낸다", async () => {
  const capture = captureGenerateContentRequest("여보세요...? 확인하실 게 있어서 연락드렸습니다.");
  try {
    const client = new GeminiLlmClient("test-key");
    const result = await client.complete({ systemPrompt: "(system)", messages: [] });

    assert.equal(result.text, "여보세요...? 확인하실 게 있어서 연락드렸습니다.");
    const body = capture.bodies()[0] as { contents?: { role?: string; parts?: { text?: string }[] }[] };
    assert.equal(body.contents?.length, 1, "빈 이력이면 트리거 턴 1개만 보내야 한다");
    assert.equal(body.contents?.[0]?.role, "user");
  } finally {
    capture.restore();
  }
});

test("GeminiLlmClient: 응답에 텍스트 파트가 없으면(candidates 비어있음/안전차단 등) 조용히 넘어가지 않고 명시적으로 실패한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ candidates: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof globalThis.fetch;
  try {
    const client = new GeminiLlmClient("test-key");
    await assert.rejects(() => client.complete({ systemPrompt: "(system)", messages: [] }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GeminiLlmClient: providerName은 'gemini'이고 응답의 isMock은 항상 false다(PRD Risks 식별 표식)", async () => {
  const capture = captureGenerateContentRequest("(dummy)");
  try {
    const client = new GeminiLlmClient("test-key");
    assert.equal(client.providerName, "gemini");
    const result = await client.complete({ systemPrompt: "(system)", messages: [] });
    assert.equal(result.isMock, false);
  } finally {
    capture.restore();
  }
});

// reviewer 리뷰 Minor(2026-07-24) — llm/types.ts의 LlmCompletionInput 계약이 문서로만 약속하던
// "실 어댑터는 mockTacticHints를 무시한다"를 직접 증명한다(추론에 맡기지 않음).
test("GeminiLlmClient: mockTacticHints가 있어도 없어도 요청 본문이 완전히 동일하다(Mock 전용 필드 무시 증명)", async () => {
  const input = { systemPrompt: "(system)", messages: [{ role: "user" as const, content: "안녕" }] };

  const withHints = captureGenerateContentRequest("응답1");
  await new GeminiLlmClient("test-key").complete({ ...input, mockTacticHints: ["절대 이 문구가 보이면 안 됨"] });
  const bodyWithHints = withHints.bodies()[0];
  withHints.restore();

  const withoutHints = captureGenerateContentRequest("응답1");
  await new GeminiLlmClient("test-key").complete(input);
  const bodyWithoutHints = withoutHints.bodies()[0];
  withoutHints.restore();

  assert.deepEqual(bodyWithHints, bodyWithoutHints, "mockTacticHints 유무가 실 Gemini 요청 본문에 어떤 영향도 주면 안 된다");
});
