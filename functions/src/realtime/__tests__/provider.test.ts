import { test } from "node:test";
import assert from "node:assert/strict";
import { MockRealtimeProvider } from "../mockProvider";
import { ElevenLabsRealtimeProvider } from "../elevenLabsProvider";
import { getRealtimeProvider } from "../provider";

test("MockRealtimeProvider는 isMock:true와 provider:none을 반환한다(클라가 텍스트 폴백으로 강등)", async () => {
  const provider = new MockRealtimeProvider();
  const creds = await provider.createCallCredentials({
    sessionId: "s1",
    scenarioId: "family-accident-deepvoice",
    voiceId: "voice_1",
  });
  assert.equal(creds.isMock, true);
  assert.equal(creds.provider, "none");
  assert.equal(creds.signedUrl, "");
  assert.equal(creds.geminiToken, "");
  assert.equal(creds.language, "ko");
  // 목업이라도 voiceId는 그대로 되돌려줘 호출부 계약이 실구현과 동일하게 유지된다.
  assert.equal(creds.voiceId, "voice_1");
});

test("getRealtimeProvider: 키가 하나도 없으면 Mock으로 강등한다(현재 환경 기준 — 키 미설정)", () => {
  // 이 저장소에는 아직 ELEVENLABS_API_KEY/GEMINI_API_KEY가 없다(.env.example은 placeholder뿐).
  // 키가 실제로 설정되면 이 테스트는 해당 프로바이더를 기대하도록 함께 갱신해야 한다.
  assert.equal(getRealtimeProvider("family-accident-deepvoice").providerName, "mock");
  assert.equal(getRealtimeProvider("tax-refund-scam").providerName, "mock");
});

test("ElevenLabsRealtimeProvider: 매핑에 없는 시나리오는 명시적으로 실패한다(조용한 오연결 방지)", async () => {
  const provider = new ElevenLabsRealtimeProvider("test-key", { "known-scenario": "agent_a" });
  await assert.rejects(
    () =>
      provider.createCallCredentials({
        sessionId: "s1",
        scenarioId: "unknown-scenario",
        voiceId: "v1",
      }),
    /agentId가 없습니다/,
  );
});

test("ElevenLabsRealtimeProvider: 서명 URL 응답을 그대로 자격증명으로 옮긴다", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push(url);
    // API 키는 헤더로만 나가고 URL에 실리지 않아야 한다.
    assert.equal(init?.headers?.["xi-api-key"], "test-key");
    return {
      ok: true,
      json: async () => ({ signed_url: "wss://example.invalid/convai" }),
    };
  }) as unknown as typeof globalThis.fetch;

  try {
    const provider = new ElevenLabsRealtimeProvider("test-key", { s1: "agent_a" });
    const creds = await provider.createCallCredentials({
      sessionId: "sess",
      scenarioId: "s1",
      voiceId: "cloned_voice",
    });
    assert.equal(creds.provider, "elevenlabs");
    assert.equal(creds.signedUrl, "wss://example.invalid/convai");
    assert.equal(creds.isMock, false);
    // 클론 voiceId가 그대로 실려야 "본인 목소리로 걸려오는 전화"가 성립한다(AC-018/019).
    assert.equal(creds.voiceId, "cloned_voice");
    assert.equal(creds.language, "ko");
    assert.ok(calls[0].includes("agent_id=agent_a"));
    assert.ok(!calls[0].includes("test-key"), "API 키가 URL에 노출되면 안 된다");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// T72(§15.3.3/§15.6 G6, AC-064 "근거 없는 표기 금지") — 난이도가 실제로 반영되는 경로와 그렇지
// 않은 경로를 자격증명이 정직하게 구분해 보고해야 한다. 이 값이 뒤집히면 클라가 적용되지 않은
// 난이도를 배지로 표기하거나(근거 없는 표기), 반대로 적용된 난이도를 숨기게 된다.
test("[T72/G6] difficultyApplied: ElevenLabs 경로는 false(프롬프트 주입 지점 없음), 목업(텍스트 폴백)은 true", async () => {
  const mockCreds = await new MockRealtimeProvider().createCallCredentials({
    sessionId: "s1",
    scenarioId: "family-accident-deepvoice",
    voiceId: "voice_1",
    difficultyLevel: "advanced",
  });
  assert.equal(
    mockCreds.difficultyApplied,
    true,
    "목업은 클라를 sendMessage(서버 조립) 텍스트 폴백으로 보내므로 난이도가 실제로 반영된다",
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ signed_url: "wss://example.invalid/convai" }),
  })) as unknown as typeof globalThis.fetch;
  try {
    const creds = await new ElevenLabsRealtimeProvider("test-key", { s1: "agent_a" }).createCallCredentials({
      sessionId: "sess",
      scenarioId: "s1",
      voiceId: "cloned_voice",
      difficultyLevel: "advanced",
    });
    assert.equal(
      creds.difficultyApplied,
      false,
      "ElevenLabs는 프롬프트가 에이전트 쪽에 저장돼 있어 난이도를 주입할 수 없다 — 조용한 미적용 금지",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ElevenLabsRealtimeProvider: 실패 응답이면 throw한다(호출부가 Mock으로 강등할 수 있게)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: false, status: 401 })) as unknown as typeof globalThis.fetch;
  try {
    const provider = new ElevenLabsRealtimeProvider("bad-key", { s1: "agent_a" });
    await assert.rejects(
      () => provider.createCallCredentials({ sessionId: "x", scenarioId: "s1", voiceId: "v" }),
      /401/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
