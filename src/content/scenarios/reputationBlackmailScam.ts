// 시나리오 "불법업소 방문 사실 유포 협박" 공개 메타 (2026-07-23, 사용자 요청 — counterscam112.go.kr
// 사기 유형 분류 "협박형(사생활 유포 협박)" 반영). 수치심·평판 훼손 위협을 이용하는 유형이며,
// 구체적 성적 내용·업소명·상황 묘사는 넣지 않고 "협박·확인 압박"이라는 수법 구조만 재현한다.
// voiceMode: "generic" — 협박범 본인의 목소리이며 가족을 사칭하지 않으므로 클론이 필요 없다.
// 타입은 familyAccidentDeepvoice.ts의 ScenarioDoc와 1:1 미러(별도 TS 빌드 루트라 import 대신 미러링).
import type { DeepvoiceLine, ScenarioDoc } from "./familyAccidentDeepvoice";

export const REPUTATION_BLACKMAIL_SCAM_SCENARIO_ID = "reputation-blackmail-scam";

// 2026-07-23(사용자 요청) 어조 강화 — 묘사 강도가 아니라 압박 강도를 올린다: 더 차갑고 사무적으로
// 끊어 말하고, 반박에 비웃듯 무시하는 태도를 더한다. 구체적 성적 내용·업소명·상황 묘사, 실제
// 계좌번호·앱 링크 등 운영 가능한 사기 정보는 여전히 절대 포함하지 않는다(AC-005).
const deepvoiceLines: DeepvoiceLine[] = [
  { lineId: "line-1", text: "고객님 명의로 불법 업소 출입 기록이 확인됐습니다. 설명은 됐고, 예 아니오로만 답하세요." },
  { lineId: "line-2", text: "믿고 안 믿고는 그쪽 사정이고요. 가족분들이나 회사에 알려지길 원치 않으시면 지금 확인 절차에 협조하세요." },
  { lineId: "line-3", text: "지금 결정 안 하시면 저도 더 못 도와드립니다. 시간 끌지 마세요." },
];

export const reputationBlackmailScamScenario: ScenarioDoc = {
  title: "불법업소 방문 사실 유포 협박",
  fraudType: "사생활 유포 협박(신용·평판 훼손 위협)",
  estimatedDuration: "약 5~8분",
  difficulty: "높음 — 수치심과 공포를 이용한 협박이라 심리적 부담이 클 수 있습니다",
  deepvoiceLines,
  voiceMode: "generic",
  callerLabel: "신원 불상 (협박범)",
};
