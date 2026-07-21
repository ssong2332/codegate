// 공개 시나리오 메타 카탈로그(T6) — 이 맵이 Firestore `scenarios/{scenarioId}` seed의 소스다
// (functions/src/scenarios/seed.ts가 firebase-admin으로 주입, Database.md §Migration Policy).
export * from "./familyAccidentDeepvoice";

import { FAMILY_ACCIDENT_SCENARIO_ID, familyAccidentDeepvoiceScenario, type ScenarioDoc } from "./familyAccidentDeepvoice";

export const scenarios: Record<string, ScenarioDoc> = {
  [FAMILY_ACCIDENT_SCENARIO_ID]: familyAccidentDeepvoiceScenario,
};
