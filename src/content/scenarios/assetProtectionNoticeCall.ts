// 고급 전용 시나리오 "금융감독원 자산 보호 안내" 공개 메타 (T191 S5 — PRD AC-097 (a) ② · UX D-104).
// 타입은 familyAccidentDeepvoice.ts의 ScenarioDoc와 1:1 미러이고, functions/src/scenarios/publicMeta.ts의
// 같은 항목과 **callerLabel까지 글자 그대로 같다**(T95 G38 관례 — scenarios.test.ts가 대조한다).
// ⚠️ 카드 문면 규칙(D-104 (4)): 제목·유형·성향은 사칭 주체와 첫 상황까지만 — 흐름·수법 이름 0.
// ⚠️ 전부 가상 번호·가상 표기다(AC-005 · AC-102).
import type { ScenarioDoc } from "./familyAccidentDeepvoice";

export const ASSET_PROTECTION_NOTICE_CALL_SCENARIO_ID = "asset-protection-notice-call";

export const assetProtectionNoticeCallScenario: ScenarioDoc = {
  title: "금융감독원 자산 보호 안내",
  fraudType: "금융감독기관 사칭(자산 보호 명목)",
  estimatedDuration: "약 5~8분",
  difficulty: "높음 — 도와주겠다는 말로 신뢰를 얻어 의심이 풀리기 쉽습니다",
  deepvoiceLines: [{ lineId: "line-1", text: "안녕하십니까, 금융감독원입니다. 고객님 명의 계좌 관련해서 안내드릴 사항이 있어 연락드렸습니다." }],
  voiceMode: "generic",
  callerLabel: "070-8842-1907",
  advancedOnly: true,
};
