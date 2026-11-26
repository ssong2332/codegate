import type { VoiceMode } from "../scenarios/publicMeta";
import type { VoiceSelectionSource } from "../shared/types";

/**
 * 에스컬레이션된 세션(§13.6 통합 버그 수정)의 "유효 voiceMode" 유추 — session.voiceSelectionSource가
 * 있으면(메신저→보이스 전이 세션) 그 값으로부터 유추하고, 없으면(기존 순수 보이스 세션) undefined를
 * 반환해 getRealtimeProvider가 PUBLIC_SCENARIOS[scenarioId]?.voiceMode를 그대로 쓰게 한다.
 */
export function resolveEffectiveVoiceMode(
  voiceSelectionSource: VoiceSelectionSource | undefined,
): VoiceMode | undefined {
  if (!voiceSelectionSource) return undefined;
  if (voiceSelectionSource === "recorded" || voiceSelectionSource === "reused") return "clone";
  return "generic"; // fallback_male | fallback_female
}
