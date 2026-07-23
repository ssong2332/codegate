// 시나리오 "자녀 사칭 급전 요청(카카오톡)" 공개 메타 (2026-07-23, T27 메신저피싱 확장, OQ-19
// 표면 넓게). channel="messenger", surface="kakao". 사용자가 채팅 중 의심을 표하면 사기범이
// "전화로 확인시켜 주겠다"며 보이스로 에스컬레이션한다(escalation.voiceMode="clone" — 자녀를
// 사칭하는 채팅이므로 통화도 본인 목소리 복제를 그대로 이어 쓴다, AC-046).
import type { DeepvoiceLine, ScenarioDoc } from "./familyAccidentDeepvoice";

export const MESSENGER_CHILD_IMPERSONATION_KAKAO_SCENARIO_ID = "messenger-child-impersonation-kakao";

// 대사는 다급함·죄책감 유도만 재현한다 — 실제 계좌번호·앱 링크 등 운영 가능한 사기 정보는
// 절대 포함하지 않는다(AC-005).
const deepvoiceLines: DeepvoiceLine[] = [
  { lineId: "line-1", text: "엄마, 나야. 폰 액정 깨져서 친구 폰으로 톡 보내." },
];

export const messengerChildImpersonationKakaoScenario: ScenarioDoc = {
  title: "자녀 사칭 급전 요청(카카오톡)",
  fraudType: "가족 사칭(메신저)",
  estimatedDuration: "약 5~8분",
  difficulty: "중간 — 정서적 압박과 채널 전환이 결합됩니다",
  deepvoiceLines,
  callerLabel: "자녀 (사칭)",
  channel: "messenger",
  surface: "kakao",
  escalation: { toChannel: "voice", voiceMode: "clone" },
};
