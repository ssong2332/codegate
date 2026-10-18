import { test } from "node:test";
import assert from "node:assert/strict";
import { GeminiRealtimeProvider, GEMINI_LIVE_MODEL, pickGeminiVoiceName } from "../geminiProvider";
import { SCENARIO_PROMPTS } from "../../scenarios";
import {
  buildSystemPrompt,
  HANGUP_RULE_NONE,
  HANGUP_RULE_TOOL,
  HANGUP_RULE_TOOL_VERIFY_SUFFIX,
  LANGUAGE_RULE,
} from "../../roleplay/promptAssembly";
import { isL3Procedural } from "../../roleplay/l3Depth";
import { verifySeriesFor, declaresOfferVerificationDesk, END_CALL_LIVE_AVAILABLE } from "../liveTools";
import { resolveSessionAccountNumber } from "../../shared/fictionalBank";
import { SCAMMER_HANGUP_FAILURE_INSTRUCTION } from "../../scammerHangup/guidance";

// T192 C3(§79.19 (5) 8) — `RealtimeCallInput`의 필수 키 2개. 기본 = 음성 통화 · 릴레이 없음(= `end_call` 선언).
// 메신저 범위는 `end_call` 거짓 입력이다 — S5b 판정과 바이트 동일해야 하는 회귀 단언에 쓴다(G556).
const VOICE_SCOPE = { channel: undefined, hangupRelay: undefined } as const;
const MESSENGER_SCOPE = { channel: "messenger", hangupRelay: undefined } as const;
// ⚠️ PR A 리뷰 M1 — 이 파일의 기존 단언은 **켬 입력**(생성자 두 번째 인자 `true`)으로 돈다. 운영값(기본 생성자 = 끔)은
// 파일 끝 [M1 운영값] 테스트가 따로 고정한다.
const ENDCALL_ON = true;

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
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    const creds = await provider.createCallCredentials({ ...VOICE_SCOPE,
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
    // §50.4.4/§50.3.3 — tax-refund-scam은 institution(identityCheckAllowed:true)·female이다.
    // §59.3 — 이 경로는 toolDrivenTiming:true를 항상 넘긴다(geminiProvider.ts:97의 유일한 호출부).
    assert.equal(
      sentPrompt,
      buildSystemPrompt(SCENARIO_PROMPTS["tax-refund-scam"], {
        // §81.6 — Live 토큰도 세션 계좌번호를 넘긴다(계좌 문자 시나리오는 문자 속 계좌).
        sessionAccountNumber: resolveSessionAccountNumber("tax-refund-scam"),
        inCallSmsEnabled: true,
        identityCheckAllowed: true,
        speakerGender: "female",
        toolDrivenTiming: true,
        // T192 C3 — 음성 통화 토큰은 `end_call`을 선언하므로 TOOL 변형(§79.6 ①).
        hangupMode: "tool",
      }),
      "토큰 발급 시 systemInstruction이 서버에서 고정되어야 한다",
    );
    assert.ok(sentPrompt.includes("[화자"), "§50.3.3 — 화자 성별 블록이 조립돼야 한다");
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

// §59.9 R1(G371) — "도구를 넣어도 초록"이던 옛 약한 단언(body.includes("tools"))을 대체한다.
// 이제 도구 자체가 조건부로 채워지므로(§59.5), "잠긴다"는 것은 **서버가 선언한 이름만 실린다**는
// 뜻으로 재정의한다 — 클라가 주입한 게 아니라 서버가 hasInCallSms/hasVerifyIntercept로 정한 이름만
// 토큰에 담긴다.
test("GeminiRealtimeProvider: 도구는 서버가 조건에 따라 선언한 이름만 토큰에 잠근다(클라의 setup 프레임 주입 차단, §59.9 R1 대체)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    await provider.createCallCredentials({ ...VOICE_SCOPE,
      sessionId: "sess",
      scenarioId: "loan-refinance-scam",
      voiceId: "",
      difficultyLevel: "advanced",
    });
    const setup = (capture.bodies()[0] as {
      bidiGenerateContentSetup?: {
        model?: string;
        tools?: { functionDeclarations?: { name?: string }[] }[];
      };
    }).bidiGenerateContentSetup;
    assert.ok(
      JSON.stringify(capture.bodies()).includes(GEMINI_LIVE_MODEL),
      "모델이 토큰에 고정되어야 한다",
    );
    const names = (setup?.tools ?? []).flatMap((t) => t.functionDeclarations ?? []).map((d) => d.name);
    // §61(OQ-A73 User 확정) — loan-refinance-scam(계열 B)도 확인 무력화 카탈로그를 가지므로
    // advanced에서 offer_verification_desk가 함께 선언된다. 순서는 send_prepared_sms → offer 다
    // (liveTools.ts의 push 순서, deepEqual이라 순서까지 맞춰야 한다).
    // T192 C3(§79.19 (5) 3) — `end_call`은 기존 두 선언 **뒤에** 붙는다.
    assert.deepEqual(
      names,
      ["send_prepared_sms", "offer_verification_desk", "end_call"],
      "loan-refinance-scam(계열 B) advanced에 선언된 이름 집합",
    );
  } finally {
    capture.restore();
  }
});

// ⚠️ T192 C3(§79.3 ⚠️ · G556) — 옛 제목 "오늘과 동일하게 tools가 빈 배열"은 **음성 통화에서 거짓이 됐다**(`end_call`).
// 빈 배열 단언은 `end_call` 거짓 입력(메신저)으로 옮겨 S5b 판정과의 바이트 동일을 그대로 지키고, 음성은 `end_call` 1개를 본다.
test("GeminiRealtimeProvider: 카탈로그·게이트 둘 다 없는 시나리오 — 메신저 범위는 tools 빈 배열(S5b 그대로) · 음성은 end_call 1개(T192 C3)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    await provider.createCallCredentials({ ...MESSENGER_SCOPE,
      sessionId: "sess",
      scenarioId: "kidnapping-threat",
      voiceId: "",
      difficultyLevel: "advanced",
    });
    const setup = (capture.bodies()[0] as {
      bidiGenerateContentSetup?: { tools?: unknown[] };
    }).bidiGenerateContentSetup;
    assert.deepEqual(setup?.tools, [], "end_call 거짓 입력 + 카탈로그·게이트 없음 = tools 빈 배열(G388 · G556)");
    await provider.createCallCredentials({ ...VOICE_SCOPE,
      sessionId: "sess",
      scenarioId: "kidnapping-threat",
      voiceId: "",
      difficultyLevel: "advanced",
    });
    const voiceSetup = (capture.bodies()[1] as {
      bidiGenerateContentSetup?: { tools?: { functionDeclarations?: { name?: string }[] }[] };
    }).bidiGenerateContentSetup;
    const voiceNames = (voiceSetup?.tools ?? []).flatMap((t) => t.functionDeclarations ?? []).map((d) => d.name);
    assert.deepEqual(voiceNames, ["end_call"], "음성 통화는 문자 · 확인 도구가 없어도 end_call만 선언된다(§79.3)");
  } finally {
    capture.restore();
  }
});

test("GeminiRealtimeProvider: 고정 프리셋 음성이라 클론 voiceId를 되돌려주지 않는다(거짓 표기 방지)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    const creds = await provider.createCallCredentials({ ...VOICE_SCOPE,
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
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    await provider.createCallCredentials({ ...VOICE_SCOPE,
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

test("GeminiRealtimeProvider: 신고 ④ 대응 — 발화 시작 민감도(startOfSpeechSensitivity)를 LOW로, prefixPaddingMs를 300ms로 토큰에 고정한다(§50.8.5)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    await provider.createCallCredentials({ ...VOICE_SCOPE,
      sessionId: "sess",
      scenarioId: "tax-refund-scam",
      voiceId: "",
    });
    const setup = (capture.bodies()[0] as {
      bidiGenerateContentSetup?: {
        realtimeInputConfig?: {
          automaticActivityDetection?: {
            startOfSpeechSensitivity?: string;
            prefixPaddingMs?: number;
          };
        };
      };
    }).bidiGenerateContentSetup;
    const aad = setup?.realtimeInputConfig?.automaticActivityDetection;
    // 미설정 시 SDK 기본값이 Gemini Live에서 START_SENSITIVITY_HIGH라 스피커 잔향도 발화 시작으로
    // 오판되기 쉬웠다(자기-끊김의 원인, §50.8.1 창②③). LOW로 낮추고 prefixPaddingMs로 시작
    // 판정에 여유를 둔다.
    assert.equal(aad?.startOfSpeechSensitivity, "START_SENSITIVITY_LOW");
    assert.equal(aad?.prefixPaddingMs, 300);
  } finally {
    capture.restore();
  }
});

// ⚠️ **구현 중 발견 — §50.3.3 도입 후 이 테스트의 원래 형태(같은 scenarioId·다른 sessionId)는
// 구조적으로 항상 실패한다(architect가 지목한 2건 :238·:244 외의 세 번째 파손, 반드시 보고할
// 것).** 음성은 이제 시나리오의 성별 배정표로 먼저 고정되고(`tax-refund-scam` = female = 풀
// 크기 1), 그 풀 안에서만 sessionId 해시가 돈다 — 그래서 같은 시나리오는 sessionId를 아무리
// 바꿔도 **항상 같은 음성 하나**만 나온다(이것이 §50.3의 의도된 동작이다: 목소리와 캐릭터가
// 어긋나지 않게 하는 것이 이번 신고의 요구사항이었다). 원 테스트의 취지(고정 단일 음성 전체
// 회귀 방지)는 시나리오 축으로 옮겨 그대로 보존한다.
test("GeminiRealtimeProvider: 성별 다양화 — 시나리오별로 다른 프리셋 음성이 토큰에 실릴 수 있다(2026-07-25, §50.3.3 갱신)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    // female 배정(tax-refund-scam)과 male 배정(kidnapping-threat)을 같은 sessionId로 태워도
    // 다른 음성이 나오는지 확인한다 — "앱 전체가 고정 단일 음성으로 되돌아가는 회귀"를 이제
    // 시나리오 축으로 잡는다.
    const seenVoices = new Set<string>();
    for (const scenarioId of ["tax-refund-scam", "kidnapping-threat"]) {
      await provider.createCallCredentials({ ...VOICE_SCOPE, sessionId: "sess-fixed", scenarioId, voiceId: "" });
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
    assert.ok(
      seenVoices.size >= 2,
      `female 배정(tax-refund-scam)·male 배정(kidnapping-threat) 2개 시나리오 중 음성이 1종류만 관측됨: ${[...seenVoices]}`,
    );
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
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    const readLastPrompt = (): string => {
      const bodies = capture.bodies();
      const setup = (bodies[bodies.length - 1] as {
        bidiGenerateContentSetup?: { systemInstruction?: { parts?: { text?: string }[] } };
      }).bidiGenerateContentSetup;
      return setup?.systemInstruction?.parts?.[0]?.text ?? "";
    };

    // procedural(d3_and_d4) — 기관·금융 사칭 계열
    await provider.createCallCredentials({ ...VOICE_SCOPE,
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
    await provider.createCallCredentials({ ...VOICE_SCOPE,
      sessionId: "sess",
      scenarioId: "family-accident-deepvoice",
      voiceId: "",
      difficultyLevel: "advanced",
    });
    assert.equal(readLastPrompt().includes(D4_BLOCK_HEADER), false);

    // 초급 — L3는 고급 전용이다(상한 규칙).
    await provider.createCallCredentials({ ...VOICE_SCOPE,
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

// G295 — 시그니처 변경(scenarioId 인자 추가, §50.3.3)으로 깨지는 기존 2건. `notApplicable`
// 시나리오(family-accident-deepvoice, voiceMode:"clone")로 넘겨 통과시킨다 — 이 분기는 두 풀의
// 합집합을 쓰므로 단언의 의미(결정론·두 후보 산출)가 그대로 성립한다(architect 지시).
test("pickGeminiVoiceName: 같은 sessionId는 항상 같은 음성을 반환한다(재연결 중 목소리가 바뀌면 안 됨)", () => {
  const a = pickGeminiVoiceName("family-accident-deepvoice", "session-abc-123");
  const b = pickGeminiVoiceName("family-accident-deepvoice", "session-abc-123");
  assert.equal(a, b);
});

test("pickGeminiVoiceName: notApplicable 시나리오는 서로 다른 sessionId에서 남/여 두 후보 모두를 산출할 수 있다(오늘 동작 보존)", () => {
  const results = new Set<string>();
  for (let i = 0; i < 50; i++) {
    results.add(pickGeminiVoiceName("family-accident-deepvoice", `id-${i}`));
  }
  assert.ok(results.size >= 2, `50개 id 중 음성이 1종류만 산출됨: ${[...results]}`);
});

// ── [P-5] §50.10 프로브 — 라이브 0회, 순수 함수만으로 완료 증거를 만든다 ──────────────────────
test("[P-5] pickGeminiVoiceName: 남성 배정 시나리오는 sessionId 100개 전부 같은 음성이다(§50.10 P-5)", () => {
  const results = new Set<string>();
  for (let i = 0; i < 100; i++) {
    results.add(pickGeminiVoiceName("kidnapping-threat", `p5-${i}`));
  }
  assert.deepEqual([...results], ["Puck"], `100개 세션 중 Puck 아닌 값이 섞였다: ${[...results]}`);
});

test("[P-5] pickGeminiVoiceName: 여성 배정 시나리오는 sessionId 100개 전부 같은 음성이다(§50.10 P-5)", () => {
  const results = new Set<string>();
  for (let i = 0; i < 100; i++) {
    results.add(pickGeminiVoiceName("tax-refund-scam", `p5-${i}`));
  }
  assert.deepEqual([...results], ["Aoede"], `100개 세션 중 Aoede 아닌 값이 섞였다: ${[...results]}`);
});

test("[P-5] pickGeminiVoiceName: notApplicable 시나리오는 sessionId 100개에서 두 후보가 모두 나온다(§50.10 P-5, 오늘 동작 보존)", () => {
  const results = new Set<string>();
  for (let i = 0; i < 100; i++) {
    results.add(pickGeminiVoiceName("family-accident-deepvoice", `p5-na-${i}`));
  }
  assert.deepEqual([...results].sort(), ["Aoede", "Puck"]);
});

// §59.6 — createRealtimeCall 응답 liveTools 필드(도구 이름의 하향 전달, G385/G386).
test("GeminiRealtimeProvider: 도구가 선언되면 credentials.liveTools에 이름이 실린다(§59.6 ②, G385)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    const creds = await provider.createCallCredentials({ ...VOICE_SCOPE,
      sessionId: "sess",
      scenarioId: "bank-security-verify-scam",
      voiceId: "",
      difficultyLevel: "advanced",
    });
    assert.deepEqual(creds.liveTools, {
      sendPreparedSms: "send_prepared_sms",
      offerVerificationDesk: "offer_verification_desk",
      // §59.6 갱신 2(G394) — offerVerificationDesk와 1:1로 붙는 클레임 실패 조기 응답용 문자열.
      verifyAlreadyAnnouncedInstruction:
        "(그 안내는 이미 전달했다. 새로 안내하지 말고, 연결해 드리겠다는 말도 다시 하지 말고, 지금 하던 이야기를 그대로 이어가라.)",
      // T192 C3(§79.19 (5) 6) — `endCall` ⇔ `endCallFailureInstruction` 쌍.
      endCall: "end_call",
      endCallFailureInstruction: SCAMMER_HANGUP_FAILURE_INSTRUCTION,
      failureInstruction: "(지금은 문자를 보낼 수 없다. 문자를 보냈다고 말하지 말고 하던 이야기를 그대로 이어가라.)",
    });
  } finally {
    capture.restore();
  }
});

// ⚠️ T192 C3 — "도구 0 = liveTools 없음"은 이제 `end_call` 거짓 입력(메신저 · 중간 leg)에서만 성립한다.
test("GeminiRealtimeProvider: 도구가 하나도 선언되지 않으면 credentials.liveTools 필드 자체가 없다(메신저 범위) · 음성은 endCall 쌍만 실린다", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    const creds = await provider.createCallCredentials({ ...MESSENGER_SCOPE,
      sessionId: "sess",
      scenarioId: "kidnapping-threat",
      voiceId: "",
      difficultyLevel: "advanced",
    });
    assert.equal("liveTools" in creds, false, "도구 미선언 세션은 liveTools 필드가 없어야 한다");
    const voice = await provider.createCallCredentials({ ...VOICE_SCOPE,
      sessionId: "sess",
      scenarioId: "kidnapping-threat",
      voiceId: "",
      difficultyLevel: "advanced",
    });
    assert.deepEqual(voice.liveTools, {
      endCall: "end_call",
      endCallFailureInstruction: SCAMMER_HANGUP_FAILURE_INSTRUCTION,
      failureInstruction: "(지금은 문자를 보낼 수 없다. 문자를 보냈다고 말하지 말고 하던 이야기를 그대로 이어가라.)",
    });
  } finally {
    capture.restore();
  }
});

// §59.3 — 이 경로가 toolDrivenTiming:true를 유일하게 넘기는 호출부다. 실제로 토큰에 실리는
// systemInstruction이 buildSystemPrompt(..., {toolDrivenTiming:true})와 일치하는지 확인한다.
test("GeminiRealtimeProvider: 토큰 발급 시 systemInstruction이 toolDrivenTiming:true로 조립된다(§59.3)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    await provider.createCallCredentials({ ...VOICE_SCOPE,
      sessionId: "sess",
      scenarioId: "bank-security-verify-scam",
      voiceId: "",
      difficultyLevel: "advanced",
    });
    const setup = (capture.bodies()[0] as {
      bidiGenerateContentSetup?: { systemInstruction?: { parts?: { text?: string }[] } };
    }).bidiGenerateContentSetup;
    const sentPrompt = setup?.systemInstruction?.parts?.[0]?.text ?? "";
    assert.equal(
      sentPrompt,
      buildSystemPrompt(SCENARIO_PROMPTS["bank-security-verify-scam"], {
        // §81.6 — Live 토큰도 세션 계좌번호를 넘긴다(계좌 문자 시나리오는 문자 속 계좌).
        sessionAccountNumber: resolveSessionAccountNumber("bank-security-verify-scam"),
        difficultyLevel: "advanced",
        inCallSmsEnabled: true,
        verifyInterceptEnabled: true,
        l3Procedural: isL3Procedural("bank-security-verify-scam"),
        identityCheckAllowed: true,
        speakerGender: "male",
        toolDrivenTiming: true,
        // §61(OQ-A73 User 확정) — bank-security-verify-scam은 도구가 선언되므로(advanced)
        // offerToolDeclared:true라 TOOL_DRIVEN 문구가 실린다.
        offerToolDeclared: declaresOfferVerificationDesk("bank-security-verify-scam", "advanced"),
        // T192 C3 — `end_call` 선언 토큰 = TOOL 변형(확인 무력화 세션이라 1문장이 붙는다).
        hangupMode: "tool",
      }),
    );
    assert.ok(sentPrompt.includes("send_prepared_sms"), "도구 이름이 토큰에 실린 프롬프트에 있어야 한다");
    assert.ok(
      sentPrompt.includes("offer_verification_desk"),
      "계열 A는 offer_verification_desk 도구 이름도 프롬프트에 있어야 한다",
    );
  } finally {
    capture.restore();
  }
});

// ⭐ §61(OQ-A73 User 확정) — 계열 B(advanced)도 이제 도구가 선언되므로 toolDrivenTiming:true면
// TOOL_DRIVEN 확인 안내가 실려야 한다(확대가 문면까지 실제로 켰다는 유일한 기계 증거 — 이 테스트를
// 지우지 않고 뒤집는다, §61.6 T-7).
test("GeminiRealtimeProvider: 계열 B(advanced)는 toolDrivenTiming:true면 TOOL_DRIVEN 확인 안내로 조립된다(§61)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    await provider.createCallCredentials({ ...VOICE_SCOPE,
      sessionId: "sess",
      scenarioId: "tax-refund-scam",
      voiceId: "",
      difficultyLevel: "advanced",
    });
    const setup = (capture.bodies()[0] as {
      bidiGenerateContentSetup?: { systemInstruction?: { parts?: { text?: string }[] } };
    }).bidiGenerateContentSetup;
    const sentPrompt = setup?.systemInstruction?.parts?.[0]?.text ?? "";
    assert.equal(verifySeriesFor("tax-refund-scam"), "B", "이 테스트의 전제(계열 B)가 깨졌다 — 분류 자체는 §61 이후에도 무변경(G399)");
    assert.equal(
      sentPrompt.includes("앱의 안내 지시가 오기 전에는 확인 창구 이름을 먼저 꺼내지 않는다"),
      false,
      "계열 B도 §61 이후에는 DEFAULT 문구가 남아 있으면 안 된다(도구가 선언되므로 TOOL_DRIVEN이어야 한다)",
    );
    assert.ok(
      sentPrompt.includes("offer_verification_desk"),
      "계열 B도 §61 이후에는 도구 이름이 프롬프트에 등장해야 한다",
    );
  } finally {
    capture.restore();
  }
});

test("GeminiRealtimeProvider: 존재하지 않는 시나리오는 명시적으로 실패한다", async () => {
  const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
  await assert.rejects(
    () => provider.createCallCredentials({ ...VOICE_SCOPE, sessionId: "s", scenarioId: "nope", voiceId: "" }),
    /시나리오 프롬프트가 없습니다/,
  );
});

// ⭐ §71(ADR-0017) — 실시간 모델 전환 트립와이어. 직전 값 gemini-2.5-flash-native-audio-preview-12-2025는
// 2026-11-17 종료 예정이다. 다른 값으로 바꾸려면 §71.3 호환성 표(도구 기본 동작 · turnComplete 끊김)를 다시 본다.
test("[§71 D1] 실시간 모델은 gemini-3.8-live이고 토큰과 자격증명에 같은 값이 실린다", async () => {
  assert.equal(GEMINI_LIVE_MODEL, "gemini-3.8-live");
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    const creds = await provider.createCallCredentials({ ...VOICE_SCOPE, sessionId: "sess", scenarioId: "tax-refund-scam", voiceId: "" });
    const setup = (capture.bodies()[0] as { bidiGenerateContentSetup?: { model?: string } }).bidiGenerateContentSetup;
    assert.equal(setup?.model, "models/gemini-3.8-live");
    assert.equal(creds.geminiModel, "gemini-3.8-live");
  } finally {
    capture.restore();
  }
});

test("[§71 D2/G430] 토큰에 잠기는 모든 도구 선언은 behavior: BLOCKING이다(3.8 기본 NON_BLOCKING 차단)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    await provider.createCallCredentials({ ...VOICE_SCOPE,
      sessionId: "sess",
      scenarioId: "loan-refinance-scam",
      voiceId: "",
      difficultyLevel: "advanced",
    });
    const setup = (capture.bodies()[0] as {
      bidiGenerateContentSetup?: { tools?: { functionDeclarations?: { name?: string; behavior?: string }[] }[] };
    }).bidiGenerateContentSetup;
    const decls = (setup?.tools ?? []).flatMap((t) => t.functionDeclarations ?? []);
    // T192 C3 — `end_call`도 BLOCKING(G503 — 이 전수 단언에 자동 포함된다).
    assert.equal(decls.length, 3);
    for (const d of decls) assert.equal(d.behavior, "BLOCKING", `${d.name}의 behavior`);
  } finally {
    capture.restore();
  }
});

// 2026-10-18 사용자 신고(통화 중 외국어 발화) — Live 네이티브 오디오는 언어 코드 지정을 지원하지 않아
// 시스템 지시가 유일한 손잡이다(roleplay/promptAssembly.ts LANGUAGE_RULE 주석). 발급 요청 본문으로 확인한다.
test("GeminiRealtimeProvider: 토큰에 고정되는 systemInstruction에 한국어 고정 규칙이 실린다(languageCode만으로는 부족)", async () => {
  const capture = captureTokenRequest();
  try {
    for (const scenarioId of Object.keys(SCENARIO_PROMPTS)) {
      await new GeminiRealtimeProvider("test-key", ENDCALL_ON).createCallCredentials({ ...VOICE_SCOPE,
        sessionId: "sess",
        scenarioId,
        voiceId: "ignored-for-gemini",
        difficultyLevel: "advanced",
      });
    }
    const prompts = capture.bodies().map(
      (b) =>
        (b as { bidiGenerateContentSetup?: { systemInstruction?: { parts?: { text?: string }[] } } })
          .bidiGenerateContentSetup?.systemInstruction?.parts?.[0]?.text ?? "",
    );
    assert.equal(prompts.length, Object.keys(SCENARIO_PROMPTS).length);
    for (const prompt of prompts) assert.ok(prompt.includes(LANGUAGE_RULE), "Live 시스템 지시에 언어 규칙이 없다");
  } finally {
    capture.restore();
  }
});

// ── T192 C3 — G502 · G527: `end_call` 선언 · 이름 하향 · TOOL 문면이 `declaresEndCall` 하나를 따른다 ──────────────
function sentSystemPrompt(body: unknown): string {
  const setup = (body as { bidiGenerateContentSetup?: { systemInstruction?: { parts?: { text?: string }[] } } })
    .bidiGenerateContentSetup;
  return setup?.systemInstruction?.parts?.[0]?.text ?? "";
}
function sentToolNames(body: unknown): (string | undefined)[] {
  const setup = (body as { bidiGenerateContentSetup?: { tools?: { functionDeclarations?: { name?: string }[] }[] } })
    .bidiGenerateContentSetup;
  return (setup?.tools ?? []).flatMap((t) => t.functionDeclarations ?? []).map((d) => d.name);
}

test("[T192/C3 G502 · G527] 선언 · liveTools · TOOL 문면 세 자리가 같이 켜지고 같이 꺼진다(음성 · 메신저 · 중간 leg · 마지막 leg)", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    const cases = [
      ["음성 · 릴레이 없음", VOICE_SCOPE, true],
      ["메신저", MESSENGER_SCOPE, false],
      ["중간 leg 0/2", { channel: undefined, hangupRelay: { legIndex: 0, legCount: 2 } }, false],
      ["마지막 leg 1/2", { channel: undefined, hangupRelay: { legIndex: 1, legCount: 2 } }, true],
    ] as const;
    for (const [label, scope, expected] of cases) {
      const creds = await provider.createCallCredentials({
        ...scope,
        sessionId: "sess",
        scenarioId: "kidnapping-threat",
        voiceId: "",
        difficultyLevel: "advanced",
      });
      const bodies = capture.bodies();
      const body = bodies[bodies.length - 1];
      const prompt = sentSystemPrompt(body);
      assert.equal(sentToolNames(body).includes("end_call"), expected, `${label}: 선언`);
      assert.equal(creds.liveTools?.endCall === "end_call", expected, `${label}: 이름 하향`);
      assert.equal(creds.liveTools?.endCallFailureInstruction !== undefined, expected, `${label}: 실패 문면 쌍`);
      assert.equal(prompt.includes(HANGUP_RULE_TOOL), expected, `${label}: TOOL 문면`);
      assert.equal(prompt.includes(HANGUP_RULE_NONE), !expected, `${label}: NONE 문면(정확히 하나만 실린다)`);
    }
  } finally {
    capture.restore();
  }
});

test("[T192/C3 §79.6 ①] 확인 무력화 고급 세션의 TOOL 문면에만 '확인 부서로 넘기기 전에는 끊지 않는다' 1문장이 붙는다", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key", ENDCALL_ON);
    await provider.createCallCredentials({ ...VOICE_SCOPE, sessionId: "s", scenarioId: "bank-security-verify-scam", voiceId: "", difficultyLevel: "advanced" });
    await provider.createCallCredentials({ ...VOICE_SCOPE, sessionId: "s", scenarioId: "bank-security-verify-scam", voiceId: "", difficultyLevel: "intermediate" });
    const [advanced, intermediate] = capture.bodies().map(sentSystemPrompt);
    assert.ok(advanced.includes(`${HANGUP_RULE_TOOL} ${HANGUP_RULE_TOOL_VERIFY_SUFFIX}`), "고급(확인 무력화) = TOOL + 1문장");
    assert.ok(intermediate.includes(HANGUP_RULE_TOOL), "중급 = TOOL");
    assert.equal(intermediate.includes(HANGUP_RULE_TOOL_VERIFY_SUFFIX), false, "중급(확인 무력화 아님)에는 1문장 0");
  } finally {
    capture.restore();
  }
});

// ── T192 C5 — 운영값(기본 생성자 = 켬): 음성 세션 setup · 프롬프트 · liveTools에 end_call이 실린다 ─────────────────────
// ⚠️ PR A 리뷰 M1의 "끔 운영값" 단언을 C5에서 켬으로 바꿨다(상수와 함께). 메신저 범위는 여전히 end_call 0이다(아래 대조).
test("[C5 운영값] 기본 생성자(운영) — 음성 세션의 tools · systemInstruction · liveTools가 켬 입력과 바이트 동일 · end_call · TOOL 문면", async () => {
  assert.equal(END_CALL_LIVE_AVAILABLE, true, "⚠️ 끄면 이 테스트를 함께 바꾼다");
  const capture = captureTokenRequest();
  try {
    let checked = 0;
    for (const scenarioId of Object.keys(SCENARIO_PROMPTS)) {
      for (const difficultyLevel of [undefined, "beginner", "intermediate", "advanced"] as const) {
        const input = { sessionId: "sess", scenarioId, voiceId: "", ...(difficultyLevel ? { difficultyLevel } : {}) };
        const operational = await new GeminiRealtimeProvider("test-key").createCallCredentials({ ...VOICE_SCOPE, ...input });
        const baseline = await new GeminiRealtimeProvider("test-key", ENDCALL_ON).createCallCredentials({ ...VOICE_SCOPE, ...input });
        const bodies = capture.bodies();
        const [opBody, baseBody] = [bodies[bodies.length - 2], bodies[bodies.length - 1]];
        const tag = `${scenarioId}/${difficultyLevel}`;
        // 만료 시각(Date.now)은 호출마다 다르다 — 모델 · 도구 · 프롬프트가 실리는 setup 전체를 대조한다.
        const setupOf = (body: unknown) => JSON.stringify((body as { bidiGenerateContentSetup?: unknown }).bidiGenerateContentSetup);
        assert.ok(setupOf(opBody) !== undefined && setupOf(opBody).length > 2, `${tag}: setup이 비었다`);
        assert.equal(setupOf(opBody), setupOf(baseBody), `${tag}: 운영 setup(tools · systemInstruction 포함)이 켬 판정과 다르다`);
        assert.equal(JSON.stringify(operational.liveTools), JSON.stringify(baseline.liveTools), `${tag}: liveTools`);
        assert.equal(operational.liveTools?.endCall, "end_call", `${tag}: 운영 liveTools에 endCall이 없다`);
        const prompt = sentSystemPrompt(opBody);
        assert.ok(prompt.includes(HANGUP_RULE_TOOL) && !prompt.includes(HANGUP_RULE_NONE), `${tag}: 운영 프롬프트가 TOOL이 아니다`);
        assert.equal(sentToolNames(opBody).includes("end_call"), true, `${tag}: 운영 선언에 end_call이 없다`);
        // 대조군 — 같은 운영 생성자라도 메신저 범위는 end_call 0 · NONE(위 단언이 공허하지 않다).
        await new GeminiRealtimeProvider("test-key").createCallCredentials({ ...MESSENGER_SCOPE, ...input });
        const messengerBody = capture.bodies()[capture.bodies().length - 1];
        assert.equal(sentToolNames(messengerBody).includes("end_call"), false, `${tag}: 메신저 범위에 end_call`);
        assert.ok(sentSystemPrompt(messengerBody).includes(HANGUP_RULE_NONE), `${tag}: 메신저 범위가 NONE이 아니다`);
        checked += 1;
      }
    }
    assert.ok(checked > 0);
  } finally {
    capture.restore();
  }
});
