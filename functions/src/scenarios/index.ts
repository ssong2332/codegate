// scenarioPrompts 카탈로그(T6, ADR-0004) — Functions/admin 전용. T7(역할극 엔진)이
// `scenarioPrompts/{scenarioId}` Firestore 문서(Functions만 read)를 통해 이 콘텐츠를 소비한다.
// 이 맵 자체는 seed.ts가 firebase-admin으로 Firestore에 주입할 때의 소스로도 쓰인다.
import type { ScenarioPromptDoc } from "../shared/types";
import {
  FAMILY_ACCIDENT_SCENARIO_ID,
  familyAccidentDeepvoicePrompt,
} from "./familyAccidentDeepvoice.prompt";
import {
  INSTITUTIONAL_IMPERSONATION_SCENARIO_ID,
  institutionalImpersonationPrompt,
} from "./institutionalImpersonation.prompt";

export { FAMILY_ACCIDENT_SCENARIO_ID, familyAccidentDeepvoicePrompt };
export { INSTITUTIONAL_IMPERSONATION_SCENARIO_ID, institutionalImpersonationPrompt };

export const SCENARIO_PROMPTS: Record<string, ScenarioPromptDoc> = {
  [FAMILY_ACCIDENT_SCENARIO_ID]: familyAccidentDeepvoicePrompt,
  [INSTITUTIONAL_IMPERSONATION_SCENARIO_ID]: institutionalImpersonationPrompt,
};
