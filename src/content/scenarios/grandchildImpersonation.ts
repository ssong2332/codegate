// 시나리오 "손주 사칭 급전 요청(딥보이스)" 공개 메타 (Phase 5, 2026-07-22, AC-001/AC-002).
// voiceMode: "clone" — 조부모를 노려 '손주'를 사칭하는 딥보이스 시나리오라 본인(참가자) 목소리
// 클론이 필요하다. 가족 납치/사고와 구분되는 정서(노년층 대상·디지털 취약 악용)를 다룬다.
import type { DeepvoiceLine, ScenarioDoc } from "./familyAccidentDeepvoice";

export const GRANDCHILD_IMPERSONATION_SCENARIO_ID = "grandchild-impersonation";

// 대사는 정서적 압박(다급함·애정·미안함)만 재현한다 — 실제 계좌·상품권 코드·앱 링크 등 운영
// 가능한 정보는 절대 포함하지 않는다(AC-005).
const deepvoiceLines: DeepvoiceLine[] = [
  { lineId: "line-1", text: "할머니, 나예요... 나 폰이 고장 나서 다른 번호로 전화했어요. 목소리 이상하죠?" },
  { lineId: "line-2", text: "급하게 낼 돈이 있는데 지금 앱이 안 돼서요. 할머니가 잠깐만 도와주시면 안 돼요?" },
  { lineId: "line-3", text: "엄마 아빠한테는 아직 말하지 마세요. 제가 나중에 다 갚을게요, 지금만 좀요." },
];

export const grandchildImpersonationScenario: ScenarioDoc = {
  title: "손주 사칭 급전 요청",
  fraudType: "가족 사칭(손주 딥보이스)",
  estimatedDuration: "약 5~8분",
  difficulty: "중간~높음 — 정서적 압박과 디지털 취약 악용이 결합됩니다",
  deepvoiceLines,
  voiceMode: "clone",
  callerLabel: "손주 (사칭)",
};
