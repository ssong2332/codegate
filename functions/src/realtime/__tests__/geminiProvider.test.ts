import { test } from "node:test";
import assert from "node:assert/strict";
import { GeminiRealtimeProvider, GEMINI_LIVE_MODEL } from "../geminiProvider";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";

/**
 * 토큰 발급 호출을 가로채기 위해 provider 내부의 GoogleGenAI 인스턴스를 대신할 수 없으므로,
 * 실제 SDK 대신 네트워크 계층(fetch)을 막고 발급 요청 본문을 검사한다. SDK가 어떤 경로로
 * 요청하든 최종적으로 fetch를 타므로, "무엇을 서버가 잠갔는가"를 이 레벨에서 검증할 수 있다.
 */
function captureTokenRequest(): {
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
    // SDK가 Headers를 순회하므로 실제 Headers 인스턴스를 돌려준다(get만 있는 가짜로는 부족).
    return new Response(JSON.stringify({ name: "auth_tokens/test-token" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
  return {
    restore: () => {
      globalThis.fetch = originalFetch;
    },
    bodies: () => bodies,
  };
}

test("GeminiRealtimeProvider: 시스템 프롬프트를 토큰에 고정해 발급한다(클라로 내려보내지 않음, ADR-0004)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key");
    const creds = await provider.createCallCredentials({
      sessionId: "sess",
      scenarioId: "tax-refund-scam",
      voiceId: "ignored-for-gemini",
    });

    // 응답 자체에는 프롬프트가 없어야 한다 — 클라가 받는 건 토큰뿐이다.
    const serialized = JSON.stringify(creds);
    assert.ok(!serialized.includes("보이스피싱"), "자격증명 응답에 페르소나 프롬프트가 실리면 안 된다");
    assert.equal(creds.provider, "gemini");
    assert.equal(creds.geminiToken, "auth_tokens/test-token");
    assert.equal(creds.geminiModel, GEMINI_LIVE_MODEL);
    assert.equal(creds.isMock, false);

    // 발급 요청 본문에는 프롬프트가 들어가야 한다(= 서버가 고정한다).
    // SDK는 `bidiGenerateContentSetup.systemInstruction.parts[].text` 형태로 보낸다(실측 확인).
    const setup = (capture.bodies()[0] as {
      bidiGenerateContentSetup?: {
        systemInstruction?: { parts?: { text?: string }[] };
        generationConfig?: { speechConfig?: { languageCode?: string } };
      };
    }).bidiGenerateContentSetup;
    const sentPrompt = setup?.systemInstruction?.parts?.[0]?.text ?? "";
    assert.equal(
      sentPrompt,
      buildSystemPrompt(SCENARIO_PROMPTS["tax-refund-scam"]),
      "토큰 발급 시 systemInstruction이 서버에서 고정되어야 한다",
    );
    // 한국어로 말하게 하는 설정도 서버가 고정한다.
    assert.equal(setup?.generationConfig?.speechConfig?.languageCode, "ko-KR");
  } finally {
    capture.restore();
  }
});

test("GeminiRealtimeProvider: 모델과 도구를 토큰에 잠근다(클라의 setup 프레임 주입 차단)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key");
    await provider.createCallCredentials({
      sessionId: "sess",
      scenarioId: "loan-refinance-scam",
      voiceId: "",
    });
    const body = JSON.stringify(capture.bodies());
    assert.ok(body.includes(GEMINI_LIVE_MODEL), "모델이 토큰에 고정되어야 한다");
    // 도구를 비워 잠그지 않으면 클라이언트가 임의 도구를 주입할 수 있다고 보고된 바 있다.
    assert.ok(body.includes("tools"), "tools를 명시적으로 잠가야 한다");
  } finally {
    capture.restore();
  }
});

test("GeminiRealtimeProvider: 고정 프리셋 음성이라 클론 voiceId를 되돌려주지 않는다(거짓 표기 방지)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key");
    const creds = await provider.createCallCredentials({
      sessionId: "sess",
      scenarioId: "institutional-impersonation",
      voiceId: "user-cloned-voice-id",
    });
    // Gemini는 클론 voice를 반영할 수 없으므로, 넘겨받았더라도 그대로 되돌려주면 화면이
    // "본인 목소리로 합성됐다"고 잘못 표기할 수 있다.
    assert.equal(creds.voiceId, "");
  } finally {
    capture.restore();
  }
});

test("GeminiRealtimeProvider: 존재하지 않는 시나리오는 명시적으로 실패한다", async () => {
  const provider = new GeminiRealtimeProvider("test-key");
  await assert.rejects(
    () => provider.createCallCredentials({ sessionId: "s", scenarioId: "nope", voiceId: "" }),
    /시나리오 프롬프트가 없습니다/,
  );
});
