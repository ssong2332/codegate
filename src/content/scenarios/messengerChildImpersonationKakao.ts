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
  fraudType: "자녀 사칭(카카오톡)",
  estimatedDuration: "약 5~8분",
  difficulty: "가족 걱정을 건드리고, 폰이 고장 났다며 채팅으로 송금을 재촉합니다",
  deepvoiceLines,
  callerLabel: "010-4471-2298",
  channel: "messenger",
  surface: "kakao",
  // §95(UX D-138 · 실기 신고 11) — 카톡형 대화방에 번호 대신 보이는 상대 이름. "친구 폰을 빌려 보낸다"는 첫 말과 맞게
  // 빌린 폰 주인의 이름처럼 보이는 평범한 이름(성별 단서 없음 — 이 시나리오는 아들/딸이 정해지지 않는다). 실존 인물 아님.
  chatDisplayName: "이지수",
  chatNonFriend: true,
  escalation: { toChannel: "voice", voiceMode: "clone" },
  // A2 ㉢(2026-11-01) — 서버 `publicMeta.ts`와 같은 값(목소리 복제 세션에서만 짧은 통화 1회 · 참가자 보이스톡은 받지 않음).
  escalationCloneOnly: true,
};
