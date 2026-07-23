// 시나리오 "카드사 부정결제 사칭" 공개 메타 (2026-07-23, 사용자 요청 — counterscam112.go.kr
// 사기 유형 분류 "사칭형(카드사 사칭)" 반영). voiceMode: "generic" — 카드사 상담원 사칭이라 본인
// 목소리 클론이 필요 없다(기본 합성 음성). 타입은 familyAccidentDeepvoice.ts의 ScenarioDoc와
// 1:1 미러(별도 TS 빌드 루트라 import 대신 미러링).
import type { DeepvoiceLine, ScenarioDoc } from "./familyAccidentDeepvoice";

export const CARD_COMPANY_IMPERSONATION_SCENARIO_ID = "card-company-impersonation";

// 대사는 놀람·확인 압박만 재현한다 — 실제 카드사명·계좌번호·앱 링크 등 운영 가능한 사기 정보는
// 절대 포함하지 않는다(AC-005).
const deepvoiceLines: DeepvoiceLine[] = [
  { lineId: "line-1", text: "안녕하세요, 고객님. 카드사 보안팀입니다. 방금 해외 가맹점에서 고액 결제 시도가 확인되었습니다." },
  { lineId: "line-2", text: "본인이 하신 결제가 아니시면 지금 바로 확인해 드려야 추가 승인을 막을 수 있어요." },
  { lineId: "line-3", text: "시간이 지체되면 결제가 그대로 승인될 수 있습니다. 지금 안내해 드리는 대로만 확인해 주세요." },
];

export const cardCompanyImpersonationScenario: ScenarioDoc = {
  title: "카드사 부정결제 사칭",
  fraudType: "카드사 부정결제 확인 사칭",
  estimatedDuration: "약 5~8분",
  difficulty: "쉬움~중간 — 놀람과 확인 압박을 이용합니다",
  deepvoiceLines,
  voiceMode: "generic",
  callerLabel: "카드사 보안팀 (사칭)",
};
