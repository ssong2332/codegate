import { test } from "node:test";
import assert from "node:assert/strict";
import { GeminiLlmClient, GEMINI_TEXT_MODEL } from "../geminiClient";

/** realtime/__tests__/geminiProvider.test.ts와 동일한 방식 — SDK 내부를 가로챌 수 없으므로
 * fetch 계층에서 요청 본문을 캡처하고 실제 API 응답 형태를 흉내낸 응답을 돌려준다. */
function captureGenerateContentRequest(replyText: string): {
  restore: () => void;
  bodies: () => unknown[];
  urls: () => string[];
} {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  const urls: string[] = [];
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    urls.push(String(_url));
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
    urls: () => urls,
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

// T98 회귀 수정(2026-07-27) — 이 단언은 **이전 버전의 정반대**다. T98은 "모든 요청에
// thinkingBudget=0이 실려야 한다"를 단언했는데, 재매핑된 현재 모델(gemini-3.6-flash)이 그 설정을
// HTTP 400/INVALID_ARGUMENT로 거부해 텍스트 LLM 경로가 100% Mock 강등됐다(라이브 실측).
// 추론을 켠 채로도 2,959ms라 AC-004 컷오프(10초) 안에 든다 — 그래서 설정을 아예 보내지 않는다.
test("GeminiLlmClient: 어떤 요청에도 thinkingConfig를 싣지 않는다(400 INVALID_ARGUMENT 회귀 방지)", async () => {
  const capture = captureGenerateContentRequest("(dummy)");
  try {
    const client = new GeminiLlmClient("test-key");
    // 오프닝 대사(messages: [])와 일반 턴 둘 다 확인한다 — 강등이 가장 눈에 띄는 쪽이 오프닝이라
    // 그 경로가 빠지면 수정의 의미가 없다.
    await client.complete({ systemPrompt: "(system)", messages: [] });
    await client.complete({ systemPrompt: "(system)", messages: [{ role: "user", content: "안녕" }] });

    const bodies = capture.bodies() as { generationConfig?: { thinkingConfig?: unknown } }[];
    assert.equal(bodies.length, 2, "재시도 없이 요청 1건당 1회만 호출해야 한다");
    for (const [i, body] of bodies.entries()) {
      assert.equal(
        body.generationConfig?.thinkingConfig,
        undefined,
        `요청 ${i}(${i === 0 ? "오프닝" : "일반 턴"})에 thinkingConfig가 실리면 400으로 거부된다`,
      );
    }
  } finally {
    capture.restore();
  }
});

// T98 회귀의 진짜 방아쇠는 `"-latest"` 부동 별칭이었다 — 코드는 그대로인데 별칭이 가리키는 실체가
// 아무 신호 없이 gemini-3.6-flash로 바뀌어 설정이 거부됐다. 고정 버전으로 못박아, 모델 변경이
// 반드시 커밋으로 드러나게 한다. (`"gemini-2.5-flash"`는 이 계정에서 404라 되돌릴 수 없다.)
test("GeminiLlmClient: 고정 버전 모델을 쓰고 '-latest' 부동 별칭을 쓰지 않는다(조용한 재매핑 차단)", async () => {
  assert.equal(GEMINI_TEXT_MODEL, "gemini-3.6-flash");
  assert.ok(!GEMINI_TEXT_MODEL.includes("latest"), "부동 별칭은 재매핑을 조용히 삼켜 라이브 장애를 만든다");

  const capture = captureGenerateContentRequest("(dummy)");
  try {
    await new GeminiLlmClient("test-key").complete({ systemPrompt: "(system)", messages: [] });
    assert.ok(
      capture.urls()[0]?.includes(GEMINI_TEXT_MODEL),
      `실제 요청 URL에 ${GEMINI_TEXT_MODEL}이 들어가야 한다(실제 URL: ${capture.urls()[0]})`,
    );
  } finally {
    capture.restore();
  }
});

// 실패 시 재시도하지 않는다 — 재시도는 무료 티어 할당량(일 20건/분 5건)만 태우고, 실패는
// completeWithFallback이 Mock 강등으로 이미 흡수한다(llm/index.ts:110).
test("GeminiLlmClient: 실패는 재시도하지 않고 그대로 던진다", async () => {
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
