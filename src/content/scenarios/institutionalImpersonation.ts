// 시나리오 "기관 사칭(검찰·금융감독원)" 공개 메타 (Phase B, 2026-07-22 사용자 결정, AC-001/AC-002).
// PRD Out of Scope였던 "다국어·다수 시나리오"의 "여유 시 기관사칭 1종" 제안을 이번에 채택했다 —
// familyAccidentDeepvoice.ts와 동일한 구조·주석 관례를 따른다.
//
// voiceMode: "generic" — 수사관/금감원 직원은 특정 인물(가족)을 사칭하지 않으므로 본인 목소리
// 클론이 필요 없다(온보딩 녹음 단계 자체를 생략, scenarios/page.tsx가 이 필드로 분기).
import type { DeepvoiceLine, ScenarioDoc } from "./familyAccidentDeepvoice";

export const INSTITUTIONAL_IMPERSONATION_SCENARIO_ID = "institutional-impersonation";

// 대사는 권위·긴급성 압박만 재현한다 — 실제 기관명·사건번호·계좌번호·URL 등 운영 가능한 사기
// 정보는 절대 포함하지 않는다(AC-005, PRD Constraints "법적/윤리").
export const institutionalImpersonationScenario: ScenarioDoc = {
  title: "기관 사칭(검찰·금융감독원)",
  fraudType: "수사기관/금융기관 사칭",
  estimatedDuration: "약 5~8분",
  difficulty: "중간 — 권위·공포 소구가 강한 편입니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "안녕하십니까, 수사관입니다. 본인 명의 계좌가 범죄에 연루되어 확인이 필요합니다." },
    { lineId: "line-2", text: "지금 이 사안은 수사 기밀이라 유선으로만 안내됩니다. 침착하게 절차에 협조해 주십시오." },
    { lineId: "line-3", text: "협조하지 않으시면 불이익이 있을 수 있습니다. 지금 통화를 끊지 말고 계속 진행해 주십시오." },
  ] satisfies DeepvoiceLine[],
  voiceMode: "generic",
  callerLabel: "수사관 (기관 사칭)",
};
