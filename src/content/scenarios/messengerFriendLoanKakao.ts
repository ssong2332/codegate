// 시나리오 "지인 사칭 급전 요청(카카오톡)" 공개 메타 (2026-07-23, T27 메신저피싱 확장, OQ-19
// 표면 넓게). channel="messenger", surface="kakao". 이 시나리오는 에스컬레이션 대상이 아니다
// (escalation 필드 부재) — 순수 채팅형 사기 체험으로, T30 검증 시 "에스컬레이션 없는 메신저
// 세션" 케이스를 커버한다.
import type { DeepvoiceLine, ScenarioDoc } from "./familyAccidentDeepvoice";

export const MESSENGER_FRIEND_LOAN_KAKAO_SCENARIO_ID = "messenger-friend-loan-kakao";

const deepvoiceLines: DeepvoiceLine[] = [
  { lineId: "line-1", text: "야 오랜만이다ㅋㅋ 잘 지내지? 근데 미안한데 부탁이 있어서 톡 했어." },
];

export const messengerFriendLoanKakaoScenario: ScenarioDoc = {
  title: "지인 사칭 급전 요청(카카오톡)",
  fraudType: "지인 사칭(메신저 급전)",
  estimatedDuration: "약 5~8분",
  difficulty: "쉬움~중간 — 친분을 이용한 부탁 형태라 경계심이 낮은 편입니다",
  deepvoiceLines,
  callerLabel: "지인 (사칭)",
  channel: "messenger",
  surface: "kakao",
};
