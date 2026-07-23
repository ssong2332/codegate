// 시나리오 "택배 통관 지연 사칭" 공개 메타 (2026-07-23, 사용자 요청 — counterscam112.go.kr 사기
// 유형 분류 "사칭형" 반영, 생활 밀착형 소재). voiceMode: "generic" — 택배사 고객센터 사칭이라 본인
// 목소리 클론이 필요 없다(기본 합성 음성). 타입은 familyAccidentDeepvoice.ts의 ScenarioDoc와
// 1:1 미러(별도 TS 빌드 루트라 import 대신 미러링).
import type { DeepvoiceLine, ScenarioDoc } from "./familyAccidentDeepvoice";

export const COURIER_CUSTOMS_SCAM_SCENARIO_ID = "courier-customs-scam";

// 대사는 생활 밀착형 긴급성만 재현한다 — 실제 택배사명·계좌번호·앱 링크 등 운영 가능한 사기 정보는
// 절대 포함하지 않는다(AC-005).
const deepvoiceLines: DeepvoiceLine[] = [
  { lineId: "line-1", text: "안녕하세요, 고객님. 택배 고객센터입니다. 고객님 명의 국제 택배가 통관에서 보류되어 연락드렸습니다." },
  { lineId: "line-2", text: "관세 미납 건으로 확인되는데, 본인 확인만 되면 바로 통관 처리해 드릴 수 있어요." },
  { lineId: "line-3", text: "오늘 처리하지 않으시면 반송될 수 있어서요. 지금 안내해 드리는 절차만 따라와 주시면 됩니다." },
];

export const courierCustomsScamScenario: ScenarioDoc = {
  title: "택배 통관 지연 사칭",
  fraudType: "택배/통관 지연 빙자",
  estimatedDuration: "약 5~8분",
  difficulty: "쉬움 — 생활 밀착형 소재라 경계심이 낮은 편입니다",
  deepvoiceLines,
  voiceMode: "generic",
  callerLabel: "택배 고객센터 (사칭)",
};
