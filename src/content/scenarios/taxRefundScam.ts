// 시나리오 "국세청 환급금 빙자" 공개 메타 (Phase 5, 2026-07-22, AC-001/AC-002).
// voiceMode: "generic" — 국세청/공단 직원 사칭이라 본인 목소리 클론이 필요 없다(기본 합성 음성).
import type { DeepvoiceLine, ScenarioDoc } from "./familyAccidentDeepvoice";

export const TAX_REFUND_SCAM_SCENARIO_ID = "tax-refund-scam";

// 대사는 이익 유혹·권위·긴급성만 재현한다 — 실제 환급 절차·계좌·앱 링크 등 운영 가능한 정보는
// 절대 포함하지 않는다(AC-005).
const deepvoiceLines: DeepvoiceLine[] = [
  { lineId: "line-1", text: "국세청 환급 담당입니다. 고객님 앞으로 미수령 환급금이 확인되어 안내드립니다." },
  { lineId: "line-2", text: "본인 확인만 되면 오늘 바로 환급이 가능하신데, 절차상 몇 가지 확인이 필요합니다." },
  { lineId: "line-3", text: "지금 안내해 드리는 대로만 따라 하시면 됩니다. 다른 곳에 문의하시면 처리가 지연돼요." },
];

export const taxRefundScamScenario: ScenarioDoc = {
  title: "국세청 환급금 빙자",
  fraudType: "환급금 사칭(국세청/공단)",
  estimatedDuration: "약 5~8분",
  difficulty: "중간 — 이익 유혹과 권위 소구가 결합됩니다",
  deepvoiceLines,
  voiceMode: "generic",
  callerLabel: "국세청 환급팀 (사칭)",
};
