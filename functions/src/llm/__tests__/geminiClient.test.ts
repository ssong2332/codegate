import { test } from "node:test";
import assert from "node:assert/strict";
import { logger } from "firebase-functions";
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
// ⭐ 갱신(2026-09-05, §56) — 위 `2,959ms`는 **그 시점 모델의 수치**이고 지금은 성립하지 않는다
// (라이브 재측정: 같은 모델이 3토큰 요청에 47,554ms). 다만 **이 단언의 근거는 안 바뀐다** —
// `thinkingBudget:0`이 400을 내는 것은 2026-09-05 프로브(P-2, 488ms)로 재확인됐고, 추론을 0으로
// 만들어도(P-3 `thinkingLevel:"MINIMAL"`) 62,384ms라 **추론은 지연의 원인이 아니었다**.
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
// 반드시 커밋으로 드러나게 한다. (`"gemini-2.5-flash"`는 404("no longer available to new users")라
// 되돌릴 수 없다.)
// ⭐ 2026-09-05(§56) — 값이 `gemini-3.6-flash` → `gemini-3.1-flash-lite`로 바뀌었다. 그 모델 자체의
// 서빙 지연(최소 요청 47,554ms)이 텍스트 경로 100% Mock 강등의 확정 원인이었다. `-preview` 금지를
// 이 트립와이어에 **추가**한다 — `gemini-3.1-flash-lite-preview`도 목록에 존재하지만 프로브는
// 비-preview로 했고, preview 태그는 `latest`와 같은 부류의 조용한 변경 위험을 진다.
test("GeminiLlmClient: 고정 버전 모델을 쓰고 '-latest'·'-preview' 부동 태그를 쓰지 않는다(조용한 재매핑 차단)", async () => {
  assert.equal(GEMINI_TEXT_MODEL, "gemini-3.1-flash-lite");
  assert.ok(!GEMINI_TEXT_MODEL.includes("latest"), "부동 별칭은 재매핑을 조용히 삼켜 라이브 장애를 만든다");
  assert.ok(!GEMINI_TEXT_MODEL.includes("preview"), "preview 태그는 검증하지 않은 서빙 변경을 조용히 들여온다");

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

// ══════════════════════════════════════════════════════════════════════════════
// §56.8 A안 ① — **성공 경로 관측**(2026-09-05)
// 이전에는 성공이 로그를 한 줄도 남기지 않아, **"정상 100%인 날"과 "100% Mock 강등된 날"의 로그
// 관측값이 똑같이 0줄**이었다(§56.5). 그 착시가 3주 가까이 100% 강등을 가렸다. 이 두 테스트가
// 강등율의 **분모**(성공 1줄)와 그 줄에 실리는 수치를 고정한다.
// ══════════════════════════════════════════════════════════════════════════════
function captureLogger(): { restore: () => void; payloads: () => { message: unknown; data: unknown }[] } {
  const original = { warn: logger.warn, info: logger.info, error: logger.error, debug: logger.debug };
  const payloads: { message: unknown; data: unknown }[] = [];
  const record = (message: unknown, data: unknown) => {
    payloads.push({ message, data });
  };
  logger.warn = record as typeof logger.warn;
  logger.info = record as typeof logger.info;
  logger.error = record as typeof logger.error;
  logger.debug = record as typeof logger.debug;
  return {
    restore: () => {
      logger.warn = original.warn;
      logger.info = original.info;
      logger.error = original.error;
      logger.debug = original.debug;
    },
    payloads: () => payloads,
  };
}

/** 실제 응답 형태(`usageMetadata` 포함)를 흉내내는 fetch 스텁 — 위 캡처 하네스는 usageMetadata를
 * 넣지 않으므로 "필드가 없을 때"의 동작까지 따로 볼 수 있게 분리했다. */
function stubFetch(payload: unknown, delayMs = 0): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("GeminiLlmClient: 성공 시 소요 ms·추론 토큰·모델명을 로그로 남긴다(강등율의 분모, §56.8 A안 ①)", async () => {
  const restoreFetch = stubFetch(
    {
      candidates: [{ content: { role: "model", parts: [{ text: "네." }] } }],
      usageMetadata: { thoughtsTokenCount: 0, totalTokenCount: 4936, promptTokenCount: 4775 },
    },
    60,
  );
  const captured = captureLogger();
  try {
    const result = await new GeminiLlmClient("test-key").complete({ systemPrompt: "(system)", messages: [] });
    assert.equal(result.text, "네.");
  } finally {
    captured.restore();
    restoreFetch();
  }

  const success = captured.payloads().filter((p) => String(p.message).includes("Gemini 텍스트 생성 성공"));
  assert.equal(success.length, 1, "성공은 정확히 한 줄로 기록돼야 한다(0줄이면 §56.5의 착시가 그대로 남는다)");
  const data = success[0].data as { model?: unknown; elapsedMs?: unknown; thoughtsTokenCount?: unknown; totalTokenCount?: unknown };
  assert.equal(data.model, GEMINI_TEXT_MODEL, "어느 모델이 그 시간을 썼는지가 §56에서 가장 중요한 판별자였다");
  assert.equal(typeof data.elapsedMs, "number");
  assert.ok(
    (data.elapsedMs as number) >= 50,
    `실제로 잰 값이어야 한다(0이나 상수가 아니라) — 60ms 지연 후 관측값: ${String(data.elapsedMs)}`,
  );
  assert.equal(data.thoughtsTokenCount, 0, "0은 '정보 없음'이 아니라 '추론 안 함'이라 반드시 실려야 한다");
  assert.equal(data.totalTokenCount, 4936);
});

test("GeminiLlmClient: 성공 로그에 프롬프트·응답 본문·API 키를 싣지 않는다(G170/ADR-0004 계승)", async () => {
  const SENTINEL_PROMPT = "SENTINEL_SYSTEM_PROMPT_비밀지시";
  const SENTINEL_USER = "SENTINEL_참가자입력_010-1234-5678";
  const SENTINEL_REPLY = "SENTINEL_모델응답본문";
  const SENTINEL_KEY = "SENTINEL_API_KEY_VALUE";
  const restoreFetch = stubFetch({
    candidates: [{ content: { role: "model", parts: [{ text: SENTINEL_REPLY }] } }],
    usageMetadata: { thoughtsTokenCount: 12, totalTokenCount: 99 },
  });
  const captured = captureLogger();
  try {
    await new GeminiLlmClient(SENTINEL_KEY).complete({
      systemPrompt: SENTINEL_PROMPT,
      messages: [{ role: "user", content: SENTINEL_USER }],
    });
  } finally {
    captured.restore();
    restoreFetch();
  }

  const serialized = JSON.stringify(captured.payloads());
  for (const sentinel of [SENTINEL_PROMPT, SENTINEL_USER, SENTINEL_REPLY, SENTINEL_KEY]) {
    assert.ok(!serialized.includes(sentinel), `로그에 '${sentinel}'가 새면 안 된다(수치와 모델명만 허용)`);
  }
});

test("GeminiLlmClient: usageMetadata가 없으면 토큰 필드를 0으로 채우지 않고 아예 생략한다('추론 안 함'과 '정보 없음' 구분)", async () => {
  const restoreFetch = stubFetch({ candidates: [{ content: { role: "model", parts: [{ text: "네." }] } }] });
  const captured = captureLogger();
  try {
    await new GeminiLlmClient("test-key").complete({ systemPrompt: "(system)", messages: [] });
  } finally {
    captured.restore();
    restoreFetch();
  }

  const data = captured.payloads()[0].data as Record<string, unknown>;
  assert.ok(!("thoughtsTokenCount" in data), "필드를 0으로 채우면 §56.5와 같은 종류의 구분 불가 상태를 하나 더 만든다");
  assert.ok(!("totalTokenCount" in data), "같은 이유");
  assert.equal(typeof data.elapsedMs, "number", "토큰 정보가 없어도 소요 ms는 항상 남아야 한다");
});
