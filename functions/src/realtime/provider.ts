// 실시간 음성 대화 프로바이더 교체점(단일화) — voice/provider.ts·llm/index.ts와 동일 패턴.
//
// 실 ElevenLabs를 쓰려면 **둘 다** 필요하다:
//   1. ELEVENLABS_API_KEY   — 서명 URL 발급용 시크릿
//   2. ELEVENLABS_AGENT_IDS — scenarioId:agentId 매핑(해당 시나리오 항목이 있어야 함)
// 하나라도 없으면 MockRealtimeProvider로 강등한다. "키는 있는데 이 시나리오만 에이전트가 없는"
// 경우도 강등 대상이라, 시나리오를 새로 추가하고 에이전트를 안 만들었을 때 조용히 엉뚱한
// 에이전트로 연결되는 사고가 나지 않는다.
import { ELEVENLABS_API_KEY, getElevenLabsAgentIds } from "../shared/config";
import { parseAgentMap } from "./agentMap";
import { ElevenLabsRealtimeProvider } from "./elevenLabsProvider";
import { MockRealtimeProvider } from "./mockProvider";
import type { RealtimeVoiceProvider } from "./types";

export function getRealtimeProvider(scenarioId: string): RealtimeVoiceProvider {
  // defineSecret/defineString은 배포 환경에서만 값이 채워지고 로컬 에뮬레이터에서는 .env를 읽는다.
  // 값이 없으면 빈 문자열이 오므로 falsy 체크로 충분하다.
  let apiKey = "";
  try {
    apiKey = ELEVENLABS_API_KEY.value();
  } catch {
    // 파라미터가 바인딩되지 않은 컨텍스트(단위 테스트 등)에서는 목업으로 진행한다.
    return new MockRealtimeProvider();
  }
  const agentIdsRaw = getElevenLabsAgentIds();

  if (!apiKey || apiKey.startsWith("YOUR_")) return new MockRealtimeProvider();

  const agentMap = parseAgentMap(agentIdsRaw);
  if (!agentMap[scenarioId]) return new MockRealtimeProvider();

  return new ElevenLabsRealtimeProvider(apiKey, agentMap);
}
