// scenarioPrompts 카탈로그(T6, ADR-0004) — Functions/admin 전용. T7(역할극 엔진)이
// `scenarioPrompts/{scenarioId}` Firestore 문서(Functions만 read)를 통해 이 콘텐츠를 소비한다.
// 이 맵 자체는 seed.ts가 firebase-admin으로 Firestore에 주입할 때의 소스로도 쓰인다.
import type { ScenarioPromptDoc } from "../shared/types";
import {
  FAMILY_ACCIDENT_SCENARIO_ID,
  familyAccidentDeepvoicePrompt,
} from "./familyAccidentDeepvoice.prompt";
import {
  INSTITUTIONAL_IMPERSONATION_SCENARIO_ID,
  institutionalImpersonationPrompt,
} from "./institutionalImpersonation.prompt";
import { LOAN_SCAM_SCENARIO_ID, loanScamPrompt } from "./loanScam.prompt";
import { TAX_REFUND_SCAM_SCENARIO_ID, taxRefundScamPrompt } from "./taxRefundScam.prompt";
import {
  GRANDCHILD_IMPERSONATION_SCENARIO_ID,
  grandchildImpersonationPrompt,
} from "./grandchildImpersonation.prompt";
import {
  CARD_COMPANY_IMPERSONATION_SCENARIO_ID,
  cardCompanyImpersonationPrompt,
} from "./cardCompanyImpersonation.prompt";
import {
  COURIER_CUSTOMS_SCAM_SCENARIO_ID,
  courierCustomsScamPrompt,
} from "./courierCustomsScam.prompt";
import { KIDNAPPING_THREAT_SCENARIO_ID, kidnappingThreatPrompt } from "./kidnappingThreat.prompt";
import {
  REPUTATION_BLACKMAIL_SCAM_SCENARIO_ID,
  reputationBlackmailScamPrompt,
} from "./reputationBlackmailScam.prompt";
import {
  MESSENGER_CHILD_IMPERSONATION_KAKAO_SCENARIO_ID,
  messengerChildImpersonationKakaoPrompt,
} from "./messengerChildImpersonationKakao.prompt";
import {
  MESSENGER_FRIEND_LOAN_KAKAO_SCENARIO_ID,
  messengerFriendLoanKakaoPrompt,
} from "./messengerFriendLoanKakao.prompt";
import {
  MESSENGER_PARCEL_SMISHING_SMS_SCENARIO_ID,
  messengerParcelSmishingSmsPrompt,
} from "./messengerParcelSmishingSms.prompt";
import {
  MESSENGER_SUBSIDY_SMISHING_SMS_SCENARIO_ID,
  messengerSubsidySmishingSmsPrompt,
} from "./messengerSubsidySmishingSms.prompt";

export { FAMILY_ACCIDENT_SCENARIO_ID, familyAccidentDeepvoicePrompt };
export { INSTITUTIONAL_IMPERSONATION_SCENARIO_ID, institutionalImpersonationPrompt };
export { LOAN_SCAM_SCENARIO_ID, loanScamPrompt };
export { TAX_REFUND_SCAM_SCENARIO_ID, taxRefundScamPrompt };
export { GRANDCHILD_IMPERSONATION_SCENARIO_ID, grandchildImpersonationPrompt };
export { CARD_COMPANY_IMPERSONATION_SCENARIO_ID, cardCompanyImpersonationPrompt };
export { COURIER_CUSTOMS_SCAM_SCENARIO_ID, courierCustomsScamPrompt };
export { KIDNAPPING_THREAT_SCENARIO_ID, kidnappingThreatPrompt };
export { REPUTATION_BLACKMAIL_SCAM_SCENARIO_ID, reputationBlackmailScamPrompt };
export {
  MESSENGER_CHILD_IMPERSONATION_KAKAO_SCENARIO_ID,
  messengerChildImpersonationKakaoPrompt,
};
export { MESSENGER_FRIEND_LOAN_KAKAO_SCENARIO_ID, messengerFriendLoanKakaoPrompt };
export { MESSENGER_PARCEL_SMISHING_SMS_SCENARIO_ID, messengerParcelSmishingSmsPrompt };
export { MESSENGER_SUBSIDY_SMISHING_SMS_SCENARIO_ID, messengerSubsidySmishingSmsPrompt };

export const SCENARIO_PROMPTS: Record<string, ScenarioPromptDoc> = {
  [FAMILY_ACCIDENT_SCENARIO_ID]: familyAccidentDeepvoicePrompt,
  [INSTITUTIONAL_IMPERSONATION_SCENARIO_ID]: institutionalImpersonationPrompt,
  [LOAN_SCAM_SCENARIO_ID]: loanScamPrompt,
  [TAX_REFUND_SCAM_SCENARIO_ID]: taxRefundScamPrompt,
  [GRANDCHILD_IMPERSONATION_SCENARIO_ID]: grandchildImpersonationPrompt,
  [CARD_COMPANY_IMPERSONATION_SCENARIO_ID]: cardCompanyImpersonationPrompt,
  [COURIER_CUSTOMS_SCAM_SCENARIO_ID]: courierCustomsScamPrompt,
  [KIDNAPPING_THREAT_SCENARIO_ID]: kidnappingThreatPrompt,
  [REPUTATION_BLACKMAIL_SCAM_SCENARIO_ID]: reputationBlackmailScamPrompt,
  [MESSENGER_CHILD_IMPERSONATION_KAKAO_SCENARIO_ID]: messengerChildImpersonationKakaoPrompt,
  [MESSENGER_FRIEND_LOAN_KAKAO_SCENARIO_ID]: messengerFriendLoanKakaoPrompt,
  [MESSENGER_PARCEL_SMISHING_SMS_SCENARIO_ID]: messengerParcelSmishingSmsPrompt,
  [MESSENGER_SUBSIDY_SMISHING_SMS_SCENARIO_ID]: messengerSubsidySmishingSmsPrompt,
};
