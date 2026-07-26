import { test } from "node:test";
import assert from "node:assert/strict";
import { GeminiRealtimeProvider, GEMINI_LIVE_MODEL, pickGeminiVoiceName } from "../geminiProvider";
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
    // T68(§15.6 G1/G5) — tax-refund-scam은 통화 중 문자 카탈로그가 있는 시나리오라, 이 경로도
    // `inCallSmsEnabled:true`로 조립해야 한다. 이걸 빼면 "텍스트 경로에서는 사기범이 문자를
    // 요구하는데 실시간 통화에서는 안 하는" 비대칭이 생겨 기능이 통화에서만 발동하지 않는다.
    assert.equal(
      sentPrompt,
      buildSystemPrompt(SCENARIO_PROMPTS["tax-refund-scam"], { inCallSmsEnabled: true }),
      "토큰 발급 시 systemInstruction이 서버에서 고정되어야 한다",
    );
    assert.ok(
      sentPrompt.includes("문자로 도착한 것은 예외"),
      "문자 카탈로그가 있는 시나리오는 조건형 문구가 켜져야 한다(G1)",
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

test("GeminiRealtimeProvider: 응답 지연 튜닝 — 발화 종료 침묵 대기(silenceDurationMs)를 400ms로 토큰에 고정한다(2026-07-24 재조정)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key");
    await provider.createCallCredentials({
      sessionId: "sess",
      scenarioId: "tax-refund-scam",
      voiceId: "",
    });
    const setup = (capture.bodies()[0] as {
      bidiGenerateContentSetup?: {
        realtimeInputConfig?: {
          automaticActivityDetection?: {
            silenceDurationMs?: number;
            endOfSpeechSensitivity?: string;
          };
        };
      };
    }).bidiGenerateContentSetup;
    const aad = setup?.realtimeInputConfig?.automaticActivityDetection;
    // 사용자 신고(지연이 길다) 대응 재조정값 — Google 공식 문서 실측(서버 내부 기본값 약 800ms,
    // 100~200ms 이하는 문서가 명시하는 위험 구간)을 근거로 500ms→400ms로 낮췄다. 이 값이 실제로
    // 토큰 발급 요청에 실려 서버에 고정되는지를 검증해, 향후 되돌아가는 회귀를 잡는다.
    assert.equal(aad?.silenceDurationMs, 400);
    assert.equal(aad?.endOfSpeechSensitivity, "END_SENSITIVITY_HIGH");
  } finally {
    capture.restore();
  }
});

test("GeminiRealtimeProvider: 성별 다양화 — sessionId별로 다른 프리셋 음성이 토큰에 실릴 수 있다(2026-07-25)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key");
    // 서로 다른 sessionId 여러 개를 태워 남/여 두 값이 모두 관측되는지 확인한다(고정 단일 음성으로
    // 되돌아가는 회귀를 잡는다). 진짜 무작위가 아니라 sessionId 해시 기반이라 실행마다 흔들리지
    // 않는 결정론적 테스트다.
    const seenVoices = new Set<string>();
    for (let i = 0; i < 20; i++) {
      await provider.createCallCredentials({
        sessionId: `sess-${i}`,
        scenarioId: "tax-refund-scam",
        voiceId: "",
      });
      const bodies = capture.bodies();
      const setup = (bodies[bodies.length - 1] as {
        bidiGenerateContentSetup?: {
          generationConfig?: {
            speechConfig?: { voiceConfig?: { prebuiltVoiceConfig?: { voiceName?: string } } };
          };
        };
      }).bidiGenerateContentSetup;
      const voiceName = setup?.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName;
      if (voiceName) seenVoices.add(voiceName);
    }
    assert.ok(seenVoices.size >= 2, `20개 세션 중 음성이 1종류만 관측됨: ${[...seenVoices]}`);
  } finally {
    capture.restore();
  }
});

// ── T85(§17.3 G63) — 이 경로가 실제로 L3를 싣는다는 **행동 단언** ──────────────
//
// ⚠️ 세 호출부(sendMessage·오프닝·이 토큰 경로) 중 조립 결과를 밖에서 관측할 수 있는 것은 여기뿐이라
// (systemInstruction이 발급 요청 본문에 그대로 실린다), G63 방어의 행동 증거를 여기에 둔다. 나머지
// 두 경로는 `roleplay/__tests__/l3Depth.test.ts`의 소스 게이트가 함께 막는다.
// ⚠️ 아래 시나리오 선택은 **프롬프트 조립**에 대한 것이지 "이 시나리오가 이 경로로 라우팅된다"는
// 주장이 아니다(clone 2종은 ElevenLabs 경로다 — §15.3.3/G65).
test("[T85/G63] 통화 토큰 경로도 고급에서 D4(절차 정당화) 블록을 싣는다 — procedural/reduced가 1:1로 갈린다", async () => {
  const capture = captureTokenRequest();
  const D4_BLOCK_HEADER = "[난이도 — 고급(심화): 절차로 정당화한다]";
  try {
    const provider = new GeminiRealtimeProvider("test-key");
    const readLastPrompt = (): string => {
      const bodies = capture.bodies();
      const setup = (bodies[bodies.length - 1] as {
        bidiGenerateContentSetup?: { systemInstruction?: { parts?: { text?: string }[] } };
      }).bidiGenerateContentSetup;
      return setup?.systemInstruction?.parts?.[0]?.text ?? "";
    };

    // procedural(d3_and_d4) — 기관·금융 사칭 계열
    await provider.createCallCredentials({
      sessionId: "sess",
      scenarioId: "loan-refinance-scam",
      voiceId: "",
      difficultyLevel: "advanced",
    });
    assert.ok(
      readLastPrompt().includes(D4_BLOCK_HEADER),
      "이 경로에 l3Procedural을 안 넘기면 통화에서만 고급이 조용히 축소된다(G63)",
    );

    // reduced — 가족 사칭(접수번호를 부르면 페르소나가 무너진다)
    await provider.createCallCredentials({
      sessionId: "sess",
      scenarioId: "family-accident-deepvoice",
      voiceId: "",
      difficultyLevel: "advanced",
    });
    assert.equal(readLastPrompt().includes(D4_BLOCK_HEADER), false);

    // 초급 — L3는 고급 전용이다(상한 규칙).
    await provider.createCallCredentials({
      sessionId: "sess",
      scenarioId: "loan-refinance-scam",
      voiceId: "",
      difficultyLevel: "beginner",
    });
    const beginner = readLastPrompt();
    assert.equal(beginner.includes(D4_BLOCK_HEADER), false);
    assert.ok(beginner.includes("상대가 빠져나가려 하면 붙잡지 않는다"), "초급 이탈 차단 억제(L3 상한)");
  } finally {
    capture.restore();
  }
});

test("pickGeminiVoiceName: 같은 sessionId는 항상 같은 음성을 반환한다(재연결 중 목소리가 바뀌면 안 됨)", () => {
  const a = pickGeminiVoiceName("session-abc-123");
  const b = pickGeminiVoiceName("session-abc-123");
  assert.equal(a, b);
});

test("pickGeminiVoiceName: 서로 다른 sessionId는 남/여 두 후보 모두를 산출할 수 있다", () => {
  const results = new Set<string>();
  for (let i = 0; i < 50; i++) {
    results.add(pickGeminiVoiceName(`id-${i}`));
  }
  assert.ok(results.size >= 2, `50개 id 중 음성이 1종류만 산출됨: ${[...results]}`);
});

test("GeminiRealtimeProvider: 존재하지 않는 시나리오는 명시적으로 실패한다", async () => {
  const provider = new GeminiRealtimeProvider("test-key");
  await assert.rejects(
    () => provider.createCallCredentials({ sessionId: "s", scenarioId: "nope", voiceId: "" }),
    /시나리오 프롬프트가 없습니다/,
  );
});
