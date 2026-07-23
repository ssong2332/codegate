// 시나리오 "정부지원금 안내 스미싱(문자)" 공개 메타 (2026-07-23, T27 메신저피싱 확장, OQ-19
// 표면 넓게). channel="messenger", surface="sms". 링크 클릭 유도 + 사용자가 의심하면 "상담원이
// 직접 안내"하겠다며 보이스로 에스컬레이션한다(escalation.voiceMode="generic" — 상담원 사칭이라
// 본인 목소리 클론이 필요 없음, 기존 기관사칭 패턴과 정합).
import type { DeepvoiceLine, ScenarioDoc } from "./familyAccidentDeepvoice";

export const MESSENGER_SUBSIDY_SMISHING_SMS_SCENARIO_ID = "messenger-subsidy-smishing-sms";

const deepvoiceLines: DeepvoiceLine[] = [
  { lineId: "line-1", text: "[지원금 안내] 고객님은 정부 지원금 대상자로 확인되었습니다. 아래에서 신청 여부를 확인해 주세요." },
];

export const messengerSubsidySmishingSmsScenario: ScenarioDoc = {
  title: "정부지원금 안내 스미싱(문자)",
  fraudType: "지원금 사칭 스미싱(링크형)",
  estimatedDuration: "약 5~8분",
  difficulty: "중간 — 이익 유혹과 채널 전환이 결합됩니다",
  deepvoiceLines,
  callerLabel: "지원금 안내센터 (사칭)",
  channel: "messenger",
  surface: "sms",
  escalation: { toChannel: "voice", voiceMode: "generic" },
};
