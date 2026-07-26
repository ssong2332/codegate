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

// T87 라이브 검증(2026-07-26) — 실 LLM 호출 18건 중 12건이 LLM_TIMEOUT_MS(10초)를 넘겨 Mock으로
// 강등됐고, 원인이 추론 토큰(출력의 4.6배)임을 실측으로 좁혔다(geminiClient.ts 상단 주석 근거).
// 이 단언이 없으면 thinkingConfig가 조용히 빠져도 유닛 테스트는 전부 통과하고, 회귀는 오직
// 라이브에서 "첫 마디가 가끔 이상하다"로만 드러난다 — 그게 원래 이 버그가 오래 안 잡힌 이유다.
test("GeminiLlmClient: 모든 요청에 thinkingBudget=0을 실어 보낸다(AC-004 지연 회귀 방지)", async () => {
  const capture = captureGenerateContentRequest("(dummy)");
  try {
    const client = new GeminiLlmClient("test-key");
    // 오프닝 대사(messages: [])와 일반 턴 둘 다 확인한다 — 실측에서 강등이 가장 잦았던 쪽이
    // 오프닝(14건 중 9건)이라 그 경로가 빠지면 수정의 의미가 없다.
    await client.complete({ systemPrompt: "(system)", messages: [] });
    await client.complete({ systemPrompt: "(system)", messages: [{ role: "user", content: "안녕" }] });

    const bodies = capture.bodies() as { generationConfig?: { thinkingConfig?: { thinkingBudget?: number } } }[];
    assert.equal(bodies.length, 2);
    for (const [i, body] of bodies.entries()) {
      assert.equal(
        body.generationConfig?.thinkingConfig?.thinkingBudget,
        0,
        `요청 ${i}(${i === 0 ? "오프닝" : "일반 턴"})에 thinkingBudget=0이 실려야 한다`,
      );
    }
  } finally {
    capture.restore();
  }
});

// reviewer Major #1(2026-07-26) — GEMINI_TEXT_MODEL이 `"-latest"` 부동 별칭이고 thinkingBudget은
// 벤더 타입 정의가 폐기를 예고한 필드다(genai.d.ts:11227, :8810-8813). 별칭이 재매핑돼 400이 나면
// completeWithFallback이 전부 Mock으로 강등해 **66%가 100%로 악화**된다. 그래서 거부당하면 추론
// 설정 없이 한 번 재시도한다. `thinkingBudget:0`의 API 수용 여부 자체가 429로 미검증이므로, 이
// 안전장치가 없으면 미검증 설정을 무방비로 넣는 셈이 된다.
test("GeminiLlmClient: thinkingConfig가 거부되면 추론 설정 없이 1회 재시도한다(부동 별칭 재매핑 대비)", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: { generationConfig?: { thinkingConfig?: unknown } }[] = [];
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    bodies.push(body);
    // 1차: thinkingConfig가 실려 있으면 모델이 거부하는 상황을 흉내낸다.
    if (body?.generationConfig?.thinkingConfig) {
      return new Response(
        JSON.stringify({
          error: { code: 400, status: "INVALID_ARGUMENT", message: "Unable to submit request because thinking_budget is not supported by this model." },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "재시도 성공" }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof globalThis.fetch;

  try {
    const result = await new GeminiLlmClient("test-key").complete({ systemPrompt: "(system)", messages: [] });
    assert.equal(result.text, "재시도 성공", "거부 후 재시도 결과가 반환돼야 한다(Mock 강등 아님)");
    assert.equal(result.isMock, false, "재시도로 얻은 응답도 실 LLM이므로 isMock은 false여야 한다");
    assert.equal(bodies.length, 2, "정확히 1회만 재시도해야 한다(무한 재시도 금지)");
    assert.ok(bodies[0].generationConfig?.thinkingConfig, "1차 요청에는 thinkingConfig가 있어야 한다");
    assert.equal(bodies[1].generationConfig?.thinkingConfig, undefined, "재시도 요청에는 thinkingConfig가 없어야 한다");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// 위 재시도가 "아무 실패에나 재시도하는" 넓은 그물이 되면, 안전차단·인증오류까지 두 번씩 때려
// 할당량만 태운다. 추론과 무관한 실패는 그대로 던져야 한다.
test("GeminiLlmClient: 추론과 무관한 실패는 재시도하지 않고 그대로 던진다", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "You exceeded your current quota." } }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof globalThis.fetch;

  try {
    await assert.rejects(() => new GeminiLlmClient("test-key").complete({ systemPrompt: "(system)", messages: [] }));
    assert.equal(calls, 1, "할당량 초과 같은 무관한 실패에 재시도하면 안 된다");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
