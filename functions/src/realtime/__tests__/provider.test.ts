import { test } from "node:test";
import assert from "node:assert/strict";
import { MockRealtimeProvider } from "../mockProvider";
import { ElevenLabsRealtimeProvider } from "../elevenLabsProvider";
import { getRealtimeProvider } from "../provider";

test("MockRealtimeProvider는 isMock:true와 빈 signedUrl을 반환한다(클라가 텍스트 폴백으로 강등)", async () => {
  const provider = new MockRealtimeProvider();
  const creds = await provider.createCallCredentials({
    sessionId: "s1",
    scenarioId: "family-accident-deepvoice",
    voiceId: "voice_1",
  });
  assert.equal(creds.isMock, true);
  assert.equal(creds.signedUrl, "");
  assert.equal(creds.language, "ko");
  // 목업이라도 voiceId는 그대로 되돌려줘 호출부 계약이 실구현과 동일하게 유지된다.
  assert.equal(creds.voiceId, "voice_1");
});

test("getRealtimeProvider: 키가 없으면 Mock으로 강등한다(현재 환경 기준 — 키 미설정)", () => {
  // 이 저장소에는 아직 ELEVENLABS_API_KEY가 없다(functions/.env.example은 placeholder뿐).
  // 키가 실제로 설정되면 이 테스트는 elevenlabs를 기대하도록 함께 갱신해야 한다.
  const provider = getRealtimeProvider("family-accident-deepvoice");
  assert.equal(provider.providerName, "mock");
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
    assert.equal(creds.signedUrl, "wss://example.invalid/convai");
    assert.equal(creds.isMock, false);
    assert.equal(creds.voiceId, "cloned_voice");
    assert.equal(creds.language, "ko");
    assert.ok(calls[0].includes("agent_id=agent_a"));
    assert.ok(!calls[0].includes("test-key"), "API 키가 URL에 노출되면 안 된다");
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
