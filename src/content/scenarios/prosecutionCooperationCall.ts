// 고급 전용 시나리오 "검찰 수사 협조 요청" 공개 메타 (T191 S5 — PRD AC-097 (a) ③ · UX D-104).
// 타입은 familyAccidentDeepvoice.ts의 ScenarioDoc와 1:1 미러이고, functions/src/scenarios/publicMeta.ts의
// 같은 항목과 **callerLabel까지 글자 그대로 같다**(T95 G38 관례 — scenarios.test.ts가 대조한다).
// ⚠️ 카드 문면 규칙(D-104 (4)): 제목·유형·성향은 사칭 주체와 첫 상황까지만 — 흐름·수법 이름 0.
// ⚠️ 전부 가상 번호·가상 표기다(AC-005 · AC-102).
import type { ScenarioDoc } from "./familyAccidentDeepvoice";

export const PROSECUTION_COOPERATION_CALL_SCENARIO_ID = "prosecution-cooperation-call";

export const prosecutionCooperationCallScenario: ScenarioDoc = {
  title: "검찰 수사 협조 요청",
  fraudType: "검찰 수사관 사칭(수사 협조 요청)",
  estimatedDuration: "약 3~5분",
  difficulty: "처벌을 앞세운 압박이 이어져 마음의 부담이 큰 편입니다",
  deepvoiceLines: [{ lineId: "line-1", text: "검찰 수사관입니다. 본인 명의 계좌 관련 사건으로 확인할 것이 있어 연락드렸습니다." }],
  voiceMode: "generic",
  callerLabel: "070-3359-6610",
  advancedOnly: true,
  preSessionBurdenNotice: true,
};
