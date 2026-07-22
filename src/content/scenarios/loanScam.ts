// 시나리오 "저금리 대환대출 빙자" 공개 메타 (Phase 5, 2026-07-22, AC-001/AC-002).
// voiceMode: "generic" — 캐피탈/은행 상담원 사칭이라 본인 목소리 클론이 필요 없다(기본 합성 음성).
// 타입은 familyAccidentDeepvoice.ts의 ScenarioDoc와 1:1 미러(별도 TS 빌드 루트라 import 대신 미러링).
import type { DeepvoiceLine, ScenarioDoc } from "./familyAccidentDeepvoice";

export const LOAN_SCAM_SCENARIO_ID = "loan-refinance-scam";

// 대사는 이익 유혹·긴급성만 재현한다 — 실제 상품명·금리 수치를 가장한 계좌번호·앱 링크 등 운영
// 가능한 사기 정보는 절대 포함하지 않는다(AC-005).
const deepvoiceLines: DeepvoiceLine[] = [
  { lineId: "line-1", text: "안녕하세요, 고객님. 정부 지원 저금리 대환대출 대상자로 확인되어 안내차 연락드렸습니다." },
  { lineId: "line-2", text: "오늘까지만 신청 가능하신데, 기존 대출을 먼저 정리하셔야 저금리 전환이 됩니다." },
  { lineId: "line-3", text: "지금 상담 끊으시면 대상에서 제외될 수 있어요. 바로 진행 도와드릴게요." },
];

export const loanScamScenario: ScenarioDoc = {
  title: "저금리 대환대출 빙자",
  fraudType: "대출 빙자(저금리 대환대출)",
  estimatedDuration: "약 5~8분",
  difficulty: "쉬움~중간 — 이익 유혹이 강한 편입니다",
  deepvoiceLines,
  voiceMode: "generic",
  callerLabel: "○○캐피탈 상담원 (사칭)",
};
