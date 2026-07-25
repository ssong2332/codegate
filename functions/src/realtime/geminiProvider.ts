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
import { GoogleGenAI, Modality, EndSensitivity } from "@google/genai";
import { buildSystemPrompt } from "../roleplay/promptAssembly";
import { SCENARIO_PROMPTS } from "../scenarios";
import { hasInCallSms } from "../scenarios/inCallSms";
import type { RealtimeCallCredentials, RealtimeCallInput, RealtimeVoiceProvider } from "./types";

/** 무료 티어에서 쓸 수 있는 네이티브 오디오 모델(공식 가격 페이지 기준, 2026-07 확인). */
export const GEMINI_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

// 한국어 프리셋 음성 풀 — 성별 다양화(2026-07-25, 사용자 신고: generic 보이스피싱이 항상 여성
// 음성으로만 나옴). Live API는 TTS 모델과 동일한 프리셋 음성을 그대로 쓸 수 있다(ai.google.dev/
// gemini-api/docs/live-guide 실측: "Native audio output models support any of the voices available
// for our Text-to-Speech models"). ⚠️ 성별 라벨은 추정이다 — 공식 문서(ai.google.dev/gemini-api/
// docs/speech-generation)는 각 음성을 "Firm"/"Upbeat" 같은 톤 특성으로만 설명하며 남/여를 명시하지
// 않는다. 아래 분류는 다수의 데모/튜토리얼에서 통용되는 청감 기준 추정치이며, 실제 청감은 라이브
// 통화로 사용자가 재확인 필요(끊김·오분류 발견 시 후보만 교체하면 됨).
const GEMINI_VOICE_POOL = ["Aoede", "Puck"] as const; // Aoede=기존 값(여성 성향 추정), Puck=남성 성향 추정 추가

/**
 * sessionId로부터 결정론적으로 음성을 고른다(진짜 Math.random이 아님) — 같은 통화는 dev Strict
 * Mode 이중 mount나 재연결로 이 함수가 여러 번 불려도 항상 같은 성별 음성을 유지해야 한다(통화
 * 중간에 상대 목소리가 바뀌면 몰입이 깨진다). sessionId는 세션마다 새로 발급되는 Firestore 문서
 * ID라 세션 간에는 사실상 무작위로 분산된다.
 */
export function pickGeminiVoiceName(sessionId: string): (typeof GEMINI_VOICE_POOL)[number] {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) | 0;
  }
  return GEMINI_VOICE_POOL[Math.abs(hash) % GEMINI_VOICE_POOL.length];
}

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
    // T72(§15.3.3 호출부 3곳 중 "Gemini Live 토큰") — 난이도를 여기서도 넘겨야 "텍스트는 난이도가
    // 먹는데 통화는 안 먹는" 비대칭이 생기지 않는다(§15.6 G5). 조립 순서 불변식(가드레일 최후미)은
    // buildSystemPrompt 안에서 강제되므로 이 호출부는 문자열을 이어 붙이지 않는다(§15.5).
    // T68(§15.1.4/§15.6 G1) — 문자 카탈로그가 있는 시나리오면 "화면에 없는 것을 가리키지 않는다"
    // 항목이 조건형으로 대체돼 인증번호·계좌·링크를 **요구해도 되는** 문구가 된다. 이걸 빼면
    // 오버레이를 다 만들어도 사기범이 인증번호를 요구하지 않아 기능이 발동하지 않는다.
    const systemPrompt = buildSystemPrompt(scenarioPrompt, {
      difficultyLevel: input.difficultyLevel,
      inCallSmsEnabled: hasInCallSms(input.scenarioId),
    });

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
              voiceConfig: { prebuiltVoiceConfig: { voiceName: pickGeminiVoiceName(input.sessionId) } },
            },
            // 양쪽 발화의 텍스트 전사를 켠다(finding #1) — 실시간 음성 대화도 리포트가 분석할 수
            // 있도록 클라가 이 전사를 모아 종료 시 서버에 제출한다(submitRealtimeTranscript).
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            // 응답 지연 튜닝(2026-07-23, 재검토 2026-07-24 — 사용자 신고 "지연이 길다") — 기본
            // 침묵 대기가 길어 "말하고 한참 뒤에야 응답"해서 실시간 느낌이 안 났다. 발화 종료를
            // 더 민감하게 감지하고(END_SENSITIVITY_HIGH), 침묵 대기를 줄여 사용자가 말을 멈추면
            // 곧 응답하게 한다.
            //
            // 2026-07-24 재조정 근거(Google 공식 문서 실측 확인, ai.google.dev/gemini-api/docs/
            // live-api/capabilities): 서버 내부 기본값은 **약 800ms**다. 문서는 수동 VAD를 쓸 때
            // "적어도 500ms 이상"의 발화종료 침묵 문턱값을 명시적으로 권장하며(500ms 미만은
            // "종종 전사가 조각나 품질이 저하된다"고 별도로 못박는다), 위험 구간은 "100~200ms
            // 이하 = 자연스러운 말 사이 정지에도 발화가 끊김", "너무 김(과도한 대기) = 사용자가
            // 말을 멈춘 뒤에도 응답이 한참 늦어짐"이다.
            //
            // **정정(reviewer 지적, 2026-07-24 재검토)**: 이전 버전 주석은 "200~2000ms 사이는
            // 문서상 안전 구간"이라고 적어, 아래에서 고른 400ms가 마치 문서가 직접 보증하는 값처럼
            // 읽히게 했다 — 사실이 아니다. 문서가 실제로 명시하는 권장값은 "최소 500ms"(및 기본값
            // 800ms)뿐이고, **400ms는 이 권장 하한(500ms)에 못 미친다.** 그럼에도 400ms를 택한
            // 근거는 "문서가 안전하다고 보증해서"가 아니라, 문서가 명시적으로 위험하다고 못박는
            // 100~200ms 구간과는 여전히 2배 이상 떨어져 있어 그 정도로 심각한 조각남까지는 아닐
            // 것이라는 별개의 판단이다 — 이 판단 자체는 라이브로 검증하지 못한 추정이다.
            //
            // ⚠️ 받아들이는 트레이드오프: 400ms는 문서의 명시적 권장 하한(500ms)보다 낮으므로,
            // 500ms 대비 "말 사이 짧은 정지"를 발화 종료로 오판해 전사가 조각날 위험이 문서 기준
            // 명목상 더 크다. 다만 문서가 실제로 위험 구간으로 못박는 100~200ms와는 여전히 2배
            // 차이가 있어 그 정도로 심각하지는 않을 것이라 보되, 실제 한국어(특히 어르신) 발화
            // 패턴에서 체감 끊김이 늘었는지는 이 환경(마이크 하드웨어 없음)에서 라이브로 검증할
            // 수 없다 — 사용자의 실제 브라우저+마이크 테스트로 확인 필요(끊김이 늘면 500ms로
            // 되돌릴 것 — 되돌리면 문서의 명시적 권장 구간 안으로 복귀한다).
            // endOfSpeechSensitivity=HIGH는 Live API 기본값과 동일(SDK 타입 주석 "The default is
            // ... END_SENSITIVITY_HIGH for Gemini Live")이라 이 설정만으로는 추가 지연 단축 효과가
            // 없다 — 명시적으로 남겨 향후 기본값이 바뀌어도 이 앱의 의도(민감 감지)가 고정되게 한다.
            realtimeInputConfig: {
              automaticActivityDetection: {
                endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
                silenceDurationMs: 400,
              },
            },
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
      // T72(§15.3.3) — 이 경로는 서버가 시스템 프롬프트를 토큰에 고정하므로 난이도가 실제로 반영된다.
      difficultyApplied: true,
    };
  }
}
