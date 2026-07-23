// 시나리오 "자녀 납치 협박" 공개 메타 (2026-07-23, 사용자 요청 — counterscam112.go.kr 사기 유형
// 분류 "협박형(자녀납치 협박)" 반영). 기존 가족사고 딥보이스(공감·죄책감 유도)와 달리 공포·위협을
// 이용하는 유형이라 사용자가 명시적으로 추가를 요청했다. voiceMode: "generic" — 협박범 본인의
// 목소리이며 가족을 사칭하지 않으므로 클론이 필요 없다. 타입은 familyAccidentDeepvoice.ts의
// ScenarioDoc와 1:1 미러(별도 TS 빌드 루트라 import 대신 미러링).
import type { DeepvoiceLine, ScenarioDoc } from "./familyAccidentDeepvoice";

export const KIDNAPPING_THREAT_SCENARIO_ID = "kidnapping-threat";

// 2026-07-23(사용자 요청) 어조 강화 — 묘사 강도가 아니라 압박 강도를 올린다: 문장을 더 짧고
// 명령조로 끊고, 상대의 감정 반응에 냉담하게 대응한다. 구체적 폭력·신체 손상 묘사, 실제 계좌번호·
// 앱 링크 등 운영 가능한 사기 정보는 여전히 절대 포함하지 않는다(AC-005).
const deepvoiceLines: DeepvoiceLine[] = [
  { lineId: "line-1", text: "묻지 말고 들어요. 자녀분, 지금 우리 쪽에 있습니다." },
  { lineId: "line-2", text: "울거나 소리 지르지 마세요. 그런다고 달라지는 거 없습니다. 신고할 생각도 하지 마세요." },
  { lineId: "line-3", text: "한 번만 말합니다. 묻지 말고, 시키는 대로만 하세요. 시간 없습니다." },
];

export const kidnappingThreatScenario: ScenarioDoc = {
  title: "자녀 납치 협박",
  fraudType: "납치·감금 협박(공포 소구)",
  estimatedDuration: "약 5~8분",
  difficulty: "높음 — 공포·협박이 강한 편이라 심리적 부담이 클 수 있습니다",
  deepvoiceLines,
  voiceMode: "generic",
  callerLabel: "신원 불상 (협박범)",
};
