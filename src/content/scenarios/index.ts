// 공개 시나리오 메타 카탈로그(T6, Phase B 확장) — 이 맵이 Firestore `scenarios/{scenarioId}` seed의
// 소스다(functions/src/scenarios/seed.ts가 firebase-admin으로 주입, Database.md §Migration Policy).
export * from "./familyAccidentDeepvoice";
export * from "./institutionalImpersonation";
export * from "./loanScam";
export * from "./taxRefundScam";
export * from "./grandchildImpersonation";
export * from "./cardCompanyImpersonation";
export * from "./courierCustomsScam";
export * from "./kidnappingThreat";
export * from "./reputationBlackmailScam";
export * from "./messengerChildImpersonationKakao";
export * from "./messengerFriendLoanKakao";
export * from "./messengerParcelSmishingSms";
export * from "./messengerSubsidySmishingSms";

import { FAMILY_ACCIDENT_SCENARIO_ID, familyAccidentDeepvoiceScenario, type ScenarioDoc } from "./familyAccidentDeepvoice";
import {
  INSTITUTIONAL_IMPERSONATION_SCENARIO_ID,
  institutionalImpersonationScenario,
} from "./institutionalImpersonation";
import { LOAN_SCAM_SCENARIO_ID, loanScamScenario } from "./loanScam";
import { TAX_REFUND_SCAM_SCENARIO_ID, taxRefundScamScenario } from "./taxRefundScam";
import {
  GRANDCHILD_IMPERSONATION_SCENARIO_ID,
  grandchildImpersonationScenario,
} from "./grandchildImpersonation";
import {
  CARD_COMPANY_IMPERSONATION_SCENARIO_ID,
  cardCompanyImpersonationScenario,
} from "./cardCompanyImpersonation";
import {
  COURIER_CUSTOMS_SCAM_SCENARIO_ID,
  courierCustomsScamScenario,
} from "./courierCustomsScam";
import { KIDNAPPING_THREAT_SCENARIO_ID, kidnappingThreatScenario } from "./kidnappingThreat";
import {
  REPUTATION_BLACKMAIL_SCAM_SCENARIO_ID,
  reputationBlackmailScamScenario,
} from "./reputationBlackmailScam";
import {
  MESSENGER_CHILD_IMPERSONATION_KAKAO_SCENARIO_ID,
  messengerChildImpersonationKakaoScenario,
} from "./messengerChildImpersonationKakao";
import {
  MESSENGER_FRIEND_LOAN_KAKAO_SCENARIO_ID,
  messengerFriendLoanKakaoScenario,
} from "./messengerFriendLoanKakao";
import {
  MESSENGER_PARCEL_SMISHING_SMS_SCENARIO_ID,
  messengerParcelSmishingSmsScenario,
} from "./messengerParcelSmishingSms";
import {
  MESSENGER_SUBSIDY_SMISHING_SMS_SCENARIO_ID,
  messengerSubsidySmishingSmsScenario,
} from "./messengerSubsidySmishingSms";

export const scenarios: Record<string, ScenarioDoc> = {
  [FAMILY_ACCIDENT_SCENARIO_ID]: familyAccidentDeepvoiceScenario,
  [INSTITUTIONAL_IMPERSONATION_SCENARIO_ID]: institutionalImpersonationScenario,
  [LOAN_SCAM_SCENARIO_ID]: loanScamScenario,
  [TAX_REFUND_SCAM_SCENARIO_ID]: taxRefundScamScenario,
  [GRANDCHILD_IMPERSONATION_SCENARIO_ID]: grandchildImpersonationScenario,
  [CARD_COMPANY_IMPERSONATION_SCENARIO_ID]: cardCompanyImpersonationScenario,
  [COURIER_CUSTOMS_SCAM_SCENARIO_ID]: courierCustomsScamScenario,
  [KIDNAPPING_THREAT_SCENARIO_ID]: kidnappingThreatScenario,
  [REPUTATION_BLACKMAIL_SCAM_SCENARIO_ID]: reputationBlackmailScamScenario,
  [MESSENGER_CHILD_IMPERSONATION_KAKAO_SCENARIO_ID]: messengerChildImpersonationKakaoScenario,
  [MESSENGER_FRIEND_LOAN_KAKAO_SCENARIO_ID]: messengerFriendLoanKakaoScenario,
  [MESSENGER_PARCEL_SMISHING_SMS_SCENARIO_ID]: messengerParcelSmishingSmsScenario,
  [MESSENGER_SUBSIDY_SMISHING_SMS_SCENARIO_ID]: messengerSubsidySmishingSmsScenario,
};

// Phase B(2026-07-22 사용자 결정) — voiceMode:"generic" 시나리오는 온보딩 녹음/클론을 생략하고
// createSession/sendMessage/synthesizeDeepvoice에 이 값을 voiceId로 그대로 넘긴다. VoiceProvider가
// 현재 Mock이라 값 자체는 사용되지 않지만(음성 내용 무시), 실 ElevenLabs 전환 시에는 이 상수를
// 실제 스톡 보이스 ID로 교체해야 한다(TODO, T1/T4 후속).
export const GENERIC_VOICE_ID = "generic-default-voice";
