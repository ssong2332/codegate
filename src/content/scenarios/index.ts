// 공개 시나리오 메타 카탈로그(T6, Phase B 확장) — 이 맵이 Firestore `scenarios/{scenarioId}` seed의
// 소스다(functions/src/scenarios/seed.ts가 firebase-admin으로 주입, Database.md §Migration Policy).
export * from "./familyAccidentDeepvoice";
export * from "./institutionalImpersonation";

import { FAMILY_ACCIDENT_SCENARIO_ID, familyAccidentDeepvoiceScenario, type ScenarioDoc } from "./familyAccidentDeepvoice";
import {
  INSTITUTIONAL_IMPERSONATION_SCENARIO_ID,
  institutionalImpersonationScenario,
} from "./institutionalImpersonation";

export const scenarios: Record<string, ScenarioDoc> = {
  [FAMILY_ACCIDENT_SCENARIO_ID]: familyAccidentDeepvoiceScenario,
  [INSTITUTIONAL_IMPERSONATION_SCENARIO_ID]: institutionalImpersonationScenario,
};

// Phase B(2026-07-22 사용자 결정) — voiceMode:"generic" 시나리오는 온보딩 녹음/클론을 생략하고
// createSession/sendMessage/synthesizeDeepvoice에 이 값을 voiceId로 그대로 넘긴다. VoiceProvider가
// 현재 Mock이라 값 자체는 사용되지 않지만(음성 내용 무시), 실 ElevenLabs 전환 시에는 이 상수를
// 실제 스톡 보이스 ID로 교체해야 한다(TODO, T1/T4 후속).
export const GENERIC_VOICE_ID = "generic-default-voice";
