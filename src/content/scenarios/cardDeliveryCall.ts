// 고급 전용 시나리오 "카드 배송 안내 전화" 공개 메타 (T191 S5 — PRD AC-097 (a) ① · UX D-104).
// 타입은 familyAccidentDeepvoice.ts의 ScenarioDoc와 1:1 미러이고, functions/src/scenarios/publicMeta.ts의
// 같은 항목과 **callerLabel까지 글자 그대로 같다**(T95 G38 관례 — scenarios.test.ts가 대조한다).
// ⚠️ 카드 문면 규칙(D-104 (4)): 제목·유형·성향은 사칭 주체와 첫 상황까지만 — 흐름·수법 이름 0.
// ⚠️ 전부 가상 번호·가상 표기다(AC-005 · AC-102).
import type { ScenarioDoc } from "./familyAccidentDeepvoice";

export const CARD_DELIVERY_CALL_SCENARIO_ID = "card-delivery-call";

export const cardDeliveryCallScenario: ScenarioDoc = {
  title: "카드 배송 안내 전화",
  fraudType: "카드 배송 담당자 사칭",
  estimatedDuration: "약 2~5분",
  difficulty: "친절한 배송 안내처럼 시작해서 의심이 풀리기 쉽습니다",
  deepvoiceLines: [{ lineId: "line-1", text: "안녕하세요, 고객님. 카드 배송 안내 드리려고 연락드렸습니다. 오늘 받으실 수 있으세요?" }],
  voiceMode: "generic",
  callerLabel: "070-5217-3364",
  advancedOnly: true,
};
