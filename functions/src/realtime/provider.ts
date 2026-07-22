// 실시간 음성 대화 프로바이더 교체점(단일화) — voice/provider.ts·llm/index.ts와 동일 패턴.
//
// 선택 순서와 근거(2026-07-22):
//   ① ElevenLabs — `ELEVENLABS_API_KEY` + 해당 시나리오의 `ELEVENLABS_AGENT_IDS` 매핑이 둘 다
//      있을 때. 유료지만 **런타임에 임의 클론 voice를 지정할 수 있는 유일한 경로**라, 이 앱의
//      1번 차별점인 "본인 목소리로 걸려오는 전화"(AC-018/019)를 만족한다. clone 시나리오는
//      사실상 이 경로에서만 제대로 성립한다.
//   ② Gemini Live — `GEMINI_API_KEY`가 있고 **generic 시나리오일 때만**. 무료 티어로 쓸 수 있는
//      speech-to-speech지만 고정 프리셋 음성만 지원한다. clone 시나리오에 붙이면 "본인 목소리로
//      합성됐다"는 화면 표기가 사실과 달라지므로(근거 없는 표기 금지) 의도적으로 제외한다.
//   ③ Mock — 위 조건이 안 맞으면 텍스트 폴백으로 강등하고 `isMock:true`로 클라에 알린다.
//
// "키는 있는데 이 시나리오만 설정이 없는" 경우도 강등 대상이라, 시나리오를 새로 추가하고 설정을
// 빠뜨렸을 때 조용히 엉뚱한 에이전트로 연결되는 사고가 나지 않는다.
import { ELEVENLABS_API_KEY, GEMINI_API_KEY, getElevenLabsAgentIds } from "../shared/config";
import { PUBLIC_SCENARIOS } from "../scenarios/publicMeta";
import { parseAgentMap } from "./agentMap";
import { ElevenLabsRealtimeProvider } from "./elevenLabsProvider";
import { GeminiRealtimeProvider } from "./geminiProvider";
import { MockRealtimeProvider } from "./mockProvider";
import type { RealtimeVoiceProvider } from "./types";

/** defineSecret은 바인딩되지 않은 컨텍스트(단위 테스트 등)에서 throw하므로 안전하게 감싼다. */
function readSecret(param: { value: () => string }): string {
  try {
    const value = param.value();
    // .env.example의 placeholder가 그대로 들어온 경우도 "미설정"으로 본다.
    return !value || value.startsWith("YOUR_") ? "" : value;
  } catch {
    return "";
  }
}

export function getRealtimeProvider(scenarioId: string): RealtimeVoiceProvider {
  // ① ElevenLabs — 클론 가능 경로 우선.
  const elevenLabsKey = readSecret(ELEVENLABS_API_KEY);
  if (elevenLabsKey) {
    const agentMap = parseAgentMap(getElevenLabsAgentIds());
    if (agentMap[scenarioId]) {
      return new ElevenLabsRealtimeProvider(elevenLabsKey, agentMap);
    }
  }

  // ② Gemini Live — 무료 경로. 고정 음성만 되므로 generic 시나리오에만 붙인다.
  const geminiKey = readSecret(GEMINI_API_KEY);
  if (geminiKey && PUBLIC_SCENARIOS[scenarioId]?.voiceMode === "generic") {
    return new GeminiRealtimeProvider(geminiKey);
  }

  // ③ 텍스트 폴백.
  return new MockRealtimeProvider();
}
