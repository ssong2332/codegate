// Gemini Live API 실시간 음성 대화 구현체 (2026-07-22, 무료 티어 경로).
//
// ElevenLabs와 달리 **무료 티어로 쓸 수 있는** speech-to-speech 경로다. 대신 고정 프리셋 음성만
// 지원하므로 "본인 목소리 클론"(AC-018/019, clone 시나리오)은 만족하지 못한다 — 그래서
// provider.ts가 generic 시나리오에만 이 구현체를 붙인다.
//
// ⚠️ 보안(중요): 브라우저가 직접 Live API에 붙어야 해서 자격증명을 클라로 내려보내야 하는데,
// API 키를 그대로 주면 안 된다. 대신 **단기 토큰(ephemeral token)**을 발급하고, 발급 시점에
// `liveConnectConstraints`로 모델·시스템 프롬프트·도구를 **서버에서 고정**한다. 이유 두 가지:
//   1. ADR-0004 — 페르소나 프롬프트가 클라 번들/네트워크에 실리지 않는다(토큰에 박혀 나가고,
//      클라는 그 값을 읽을 수도 바꿀 수도 없다).
//   2. 제약 없이 발급한 토큰은 클라이언트가 setup 프레임을 임의로 주입해 모델·프롬프트·도구를
//      바꿔치기할 수 있다고 보고된 바 있다. 도구는 빈 배열로 명시적으로 잠근다.
import { GoogleGenAI, Modality } from "@google/genai";
import { buildSystemPrompt } from "../roleplay/promptAssembly";
import { SCENARIO_PROMPTS } from "../scenarios";
import type { RealtimeCallCredentials, RealtimeCallInput, RealtimeVoiceProvider } from "./types";

/** 무료 티어에서 쓸 수 있는 네이티브 오디오 모델(공식 가격 페이지 기준, 2026-07 확인). */
export const GEMINI_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

/** 한국어 프리셋 음성. 클론이 아니라 고정 음성이라 시나리오와 무관하게 동일하다. */
const GEMINI_VOICE_NAME = "Aoede";

/** 토큰 수명 — 통화 1건에만 쓰이므로 짧게 잡는다(유출 시 노출 창 최소화). */
const TOKEN_EXPIRE_MINUTES = 30;
const NEW_SESSION_EXPIRE_MINUTES = 2;

export class GeminiRealtimeProvider implements RealtimeVoiceProvider {
  readonly providerName = "gemini" as const;

  constructor(private readonly apiKey: string) {}

  async createCallCredentials(input: RealtimeCallInput): Promise<RealtimeCallCredentials> {
    const scenarioPrompt = SCENARIO_PROMPTS[input.scenarioId];
    if (!scenarioPrompt) {
      throw new Error(`시나리오 프롬프트가 없습니다: ${input.scenarioId}`);
    }
    // sendMessage/generateOpeningLine과 **같은 조립 함수**를 쓴다 — 프롬프트를 두 곳에 손으로
    // 옮겨 적어 드리프트가 나는 것을 막는다.
    const systemPrompt = buildSystemPrompt(scenarioPrompt);

    const client = new GoogleGenAI({ apiKey: this.apiKey });
    const now = Date.now();
    const token = await client.authTokens.create({
      config: {
        // uses는 "세션 시작 가능 횟수"다. 이상적으론 1이지만, dev(React Strict Mode)의 이중 mount나
        // 사용자의 재시도로 두어 번 연결을 시작할 수 있어 소폭 여유(2)를 둔다. 토큰은 여전히 단명
        // (30분)이고 이 세션에만 묶여 있어 보안 노출은 최소다.
        uses: 2,
        expireTime: new Date(now + TOKEN_EXPIRE_MINUTES * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + NEW_SESSION_EXPIRE_MINUTES * 60_000).toISOString(),
        liveConnectConstraints: {
          model: GEMINI_LIVE_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: systemPrompt,
            speechConfig: {
              languageCode: "ko-KR",
              voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE_NAME } },
            },
            // 양쪽 발화의 텍스트 전사를 켠다(finding #1) — 실시간 음성 대화도 리포트가 분석할 수
            // 있도록 클라가 이 전사를 모아 종료 시 서버에 제출한다(submitRealtimeTranscript).
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            // 도구를 명시적으로 비운다 — 이걸 잠그지 않으면 클라가 임의 도구를 주입할 수 있다.
            tools: [],
          },
        },
        httpOptions: { apiVersion: "v1alpha" },
      },
    });

    const tokenName = token.name;
    if (!tokenName) {
      throw new Error("Gemini 단기 토큰 발급 응답에 name이 없습니다.");
    }

    return {
      provider: "gemini",
      signedUrl: "",
      geminiToken: tokenName,
      geminiModel: GEMINI_LIVE_MODEL,
      // Gemini는 고정 프리셋 음성만 쓴다 — 클론 voiceId를 넘겨도 반영되지 않으므로 빈 값으로 둔다
      // (호출부가 "본인 목소리로 합성됐다"고 잘못 표기하지 않게 하려는 의도, 근거 없는 표기 금지).
      voiceId: "",
      language: "ko",
      isMock: false,
    };
  }
}
