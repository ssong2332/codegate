// scenarios(공개 메타) 시딩용 미러 — 진짜 소스는 `src/content/scenarios/familyAccidentDeepvoice.ts`
// (T6, Architecture.md §2·§4가 지정한 T6 소유 폴더)다.
//
// 왜 미러가 필요한가: seed.ts는 functions/ 패키지 안에서 firebase-admin으로 실행되고,
// functions/tsconfig.json의 `include`가 `functions/src/**/*.ts`로 한정돼 있어 `src/`(Next.js
// 루트) 파일을 직접 import할 수 없다(TS6059, rootDir 밖). 새 워크스페이스/경로 별칭 설정은
// T6 범위를 넘는 결정(architect 소관)이라 이번에는 값을 그대로 미러링하는 실용적 절충을 택했다.
// **주의:** src/content/scenarios/familyAccidentDeepvoice.ts를 고치면 이 파일도 함께 고칠 것
// (functions/src/scenarios/__tests__/scenarios.test.ts가 두 파일의 텍스트를 비교해 드리프트를
// 탐지한다).
export type DeepvoiceLine = { lineId: string; text: string };
// voiceMode/callerLabel — src/content/scenarios/familyAccidentDeepvoice.ts와 동일 필드(Phase B,
// 2026-07-22). 서버 쪽은 이 값을 직접 쓰지 않지만(voiceId 해석은 클라가 마무리해서 넘김) 드리프트
// 탐지 테스트(scenarios.test.ts)가 두 파일을 나란히 검증하므로 필드는 계속 미러링한다.
export type VoiceMode = "clone" | "generic";
// 메신저피싱 확장(2026-07-23, T27) — src/content/scenarios/familyAccidentDeepvoice.ts의
// Channel/MessengerSurface/EscalationConfig와 1:1 미러(옵셔널 증분, Migration Policy).
export type Channel = "voice" | "messenger";
export type MessengerSurface = "kakao" | "sms";
export type EscalationConfig = { toChannel: "voice"; voiceMode: VoiceMode };
export type ScenarioMeta = {
  title: string;
  fraudType: string;
  estimatedDuration: string;
  difficulty: string;
  deepvoiceLines: DeepvoiceLine[];
  voiceMode?: VoiceMode;
  callerLabel: string;
  channel?: Channel;
  surface?: MessengerSurface;
  escalation?: EscalationConfig;
};

export const FAMILY_ACCIDENT_SCENARIO_ID = "family-accident-deepvoice";
export const INSTITUTIONAL_IMPERSONATION_SCENARIO_ID = "institutional-impersonation";
export const LOAN_SCAM_SCENARIO_ID = "loan-refinance-scam";
export const TAX_REFUND_SCAM_SCENARIO_ID = "tax-refund-scam";
export const GRANDCHILD_IMPERSONATION_SCENARIO_ID = "grandchild-impersonation";
export const CARD_COMPANY_IMPERSONATION_SCENARIO_ID = "card-company-impersonation";
export const COURIER_CUSTOMS_SCAM_SCENARIO_ID = "courier-customs-scam";
export const KIDNAPPING_THREAT_SCENARIO_ID = "kidnapping-threat";
export const REPUTATION_BLACKMAIL_SCAM_SCENARIO_ID = "reputation-blackmail-scam";
export const MESSENGER_CHILD_IMPERSONATION_KAKAO_SCENARIO_ID = "messenger-child-impersonation-kakao";
export const MESSENGER_FRIEND_LOAN_KAKAO_SCENARIO_ID = "messenger-friend-loan-kakao";
export const MESSENGER_PARCEL_SMISHING_SMS_SCENARIO_ID = "messenger-parcel-smishing-sms";
export const MESSENGER_SUBSIDY_SMISHING_SMS_SCENARIO_ID = "messenger-subsidy-smishing-sms";

export const familyAccidentDeepvoiceScenario: ScenarioMeta = {
  title: "가족 납치·사고 딥보이스",
  fraudType: "가족 납치/사고 사칭(딥보이스)",
  estimatedDuration: "약 5~8분",
  difficulty: "중간 — 감정적 압박이 강한 편입니다",
  deepvoiceLines: [
    {
      lineId: "line-1",
      text: "엄마, 나야... 나 사고 났어. 목소리가 이상하지? 지금 많이 다쳤어.",
    },
    {
      lineId: "line-2",
      text: "지금 병원인데... 합의금 때문에 급하게 전화했어. 지금 좀 도와줘.",
    },
    {
      lineId: "line-3",
      text: "아빠한테는 아직 말하지 말고, 지금 나랑 통화하면서 처리하자. 시간이 없어.",
    },
  ],
  voiceMode: "clone",
  callerLabel: "가족 (사칭)",
};

export const institutionalImpersonationScenario: ScenarioMeta = {
  title: "기관 사칭(검찰·금융감독원)",
  fraudType: "수사기관/금융기관 사칭",
  estimatedDuration: "약 5~8분",
  difficulty: "중간 — 권위·공포 소구가 강한 편입니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "안녕하십니까, 수사관입니다. 본인 명의 계좌가 범죄에 연루되어 확인이 필요합니다." },
    { lineId: "line-2", text: "지금 이 사안은 수사 기밀이라 유선으로만 안내됩니다. 침착하게 절차에 협조해 주십시오." },
    { lineId: "line-3", text: "협조하지 않으시면 불이익이 있을 수 있습니다. 지금 통화를 끊지 말고 계속 진행해 주십시오." },
  ],
  voiceMode: "generic",
  callerLabel: "수사관 (기관 사칭)",
};

// Phase 5(2026-07-22) 신규 시나리오 미러 — 클라 src/content/scenarios/*.ts와 필드 동일.
export const loanScamScenario: ScenarioMeta = {
  title: "저금리 대환대출 빙자",
  fraudType: "대출 빙자(저금리 대환대출)",
  estimatedDuration: "약 5~8분",
  difficulty: "쉬움~중간 — 이익 유혹이 강한 편입니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "안녕하세요, 고객님. 정부 지원 저금리 대환대출 대상자로 확인되어 안내차 연락드렸습니다." },
    { lineId: "line-2", text: "오늘까지만 신청 가능하신데, 기존 대출을 먼저 정리하셔야 저금리 전환이 됩니다." },
    { lineId: "line-3", text: "지금 상담 끊으시면 대상에서 제외될 수 있어요. 바로 진행 도와드릴게요." },
  ],
  voiceMode: "generic",
  callerLabel: "○○캐피탈 상담원 (사칭)",
};

export const taxRefundScamScenario: ScenarioMeta = {
  title: "국세청 환급금 빙자",
  fraudType: "환급금 사칭(국세청/공단)",
  estimatedDuration: "약 5~8분",
  difficulty: "중간 — 이익 유혹과 권위 소구가 결합됩니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "국세청 환급 담당입니다. 고객님 앞으로 미수령 환급금이 확인되어 안내드립니다." },
    { lineId: "line-2", text: "본인 확인만 되면 오늘 바로 환급이 가능하신데, 절차상 몇 가지 확인이 필요합니다." },
    { lineId: "line-3", text: "지금 안내해 드리는 대로만 따라 하시면 됩니다. 다른 곳에 문의하시면 처리가 지연돼요." },
  ],
  voiceMode: "generic",
  callerLabel: "국세청 환급팀 (사칭)",
};

export const grandchildImpersonationScenario: ScenarioMeta = {
  title: "손주 사칭 급전 요청",
  fraudType: "가족 사칭(손주 딥보이스)",
  estimatedDuration: "약 5~8분",
  difficulty: "중간~높음 — 정서적 압박과 디지털 취약 악용이 결합됩니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "할머니, 나예요... 나 폰이 고장 나서 다른 번호로 전화했어요. 목소리 이상하죠?" },
    { lineId: "line-2", text: "급하게 낼 돈이 있는데 지금 앱이 안 돼서요. 할머니가 잠깐만 도와주시면 안 돼요?" },
    { lineId: "line-3", text: "엄마 아빠한테는 아직 말하지 마세요. 제가 나중에 다 갚을게요, 지금만 좀요." },
  ],
  voiceMode: "clone",
  callerLabel: "손주 (사칭)",
};

// Phase 6(2026-07-23, 사용자 요청) 신규 시나리오 미러 — 클라 src/content/scenarios/*.ts와 필드 동일.
export const cardCompanyImpersonationScenario: ScenarioMeta = {
  title: "카드사 부정결제 사칭",
  fraudType: "카드사 부정결제 확인 사칭",
  estimatedDuration: "약 5~8분",
  difficulty: "쉬움~중간 — 놀람과 확인 압박을 이용합니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "안녕하세요, 고객님. 카드사 보안팀입니다. 방금 해외 가맹점에서 고액 결제 시도가 확인되었습니다." },
    { lineId: "line-2", text: "본인이 하신 결제가 아니시면 지금 바로 확인해 드려야 추가 승인을 막을 수 있어요." },
    { lineId: "line-3", text: "시간이 지체되면 결제가 그대로 승인될 수 있습니다. 지금 안내해 드리는 대로만 확인해 주세요." },
  ],
  voiceMode: "generic",
  callerLabel: "카드사 보안팀 (사칭)",
};

export const courierCustomsScamScenario: ScenarioMeta = {
  title: "택배 통관 지연 사칭",
  fraudType: "택배/통관 지연 빙자",
  estimatedDuration: "약 5~8분",
  difficulty: "쉬움 — 생활 밀착형 소재라 경계심이 낮은 편입니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "안녕하세요, 고객님. 택배 고객센터입니다. 고객님 명의 국제 택배가 통관에서 보류되어 연락드렸습니다." },
    { lineId: "line-2", text: "관세 미납 건으로 확인되는데, 본인 확인만 되면 바로 통관 처리해 드릴 수 있어요." },
    { lineId: "line-3", text: "오늘 처리하지 않으시면 반송될 수 있어서요. 지금 안내해 드리는 절차만 따라와 주시면 됩니다." },
  ],
  voiceMode: "generic",
  callerLabel: "택배 고객센터 (사칭)",
};

export const kidnappingThreatScenario: ScenarioMeta = {
  title: "자녀 납치 협박",
  fraudType: "납치·감금 협박(공포 소구)",
  estimatedDuration: "약 5~8분",
  difficulty: "높음 — 공포·협박이 강한 편이라 심리적 부담이 클 수 있습니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "묻지 말고 들어요. 자녀분, 지금 우리 쪽에 있습니다." },
    { lineId: "line-2", text: "울거나 소리 지르지 마세요. 그런다고 달라지는 거 없습니다. 신고할 생각도 하지 마세요." },
    { lineId: "line-3", text: "한 번만 말합니다. 묻지 말고, 시키는 대로만 하세요. 시간 없습니다." },
  ],
  voiceMode: "generic",
  callerLabel: "신원 불상 (협박범)",
};

export const reputationBlackmailScamScenario: ScenarioMeta = {
  title: "불법업소 방문 사실 유포 협박",
  fraudType: "사생활 유포 협박(신용·평판 훼손 위협)",
  estimatedDuration: "약 5~8분",
  difficulty: "높음 — 수치심과 공포를 이용한 협박이라 심리적 부담이 클 수 있습니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "고객님 명의로 불법 업소 출입 기록이 확인됐습니다. 설명은 됐고, 예 아니오로만 답하세요." },
    { lineId: "line-2", text: "믿고 안 믿고는 그쪽 사정이고요. 가족분들이나 회사에 알려지길 원치 않으시면 지금 확인 절차에 협조하세요." },
    { lineId: "line-3", text: "지금 결정 안 하시면 저도 더 못 도와드립니다. 시간 끌지 마세요." },
  ],
  voiceMode: "generic",
  callerLabel: "신원 불상 (협박범)",
};

// 메신저피싱 확장(2026-07-23, T27) — src/content/scenarios/*.ts와 필드 동일(channel/surface/
// escalation은 옵셔널 증분, Architecture.md §13.4).
export const messengerChildImpersonationKakaoScenario: ScenarioMeta = {
  title: "자녀 사칭 급전 요청(카카오톡)",
  fraudType: "가족 사칭(메신저)",
  estimatedDuration: "약 5~8분",
  difficulty: "중간 — 정서적 압박과 채널 전환이 결합됩니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "엄마, 나야. 폰 액정 깨져서 친구 폰으로 톡 보내." },
  ],
  callerLabel: "자녀 (사칭)",
  channel: "messenger",
  surface: "kakao",
  escalation: { toChannel: "voice", voiceMode: "clone" },
};

export const messengerFriendLoanKakaoScenario: ScenarioMeta = {
  title: "지인 사칭 급전 요청(카카오톡)",
  fraudType: "지인 사칭(메신저 급전)",
  estimatedDuration: "약 5~8분",
  difficulty: "쉬움~중간 — 친분을 이용한 부탁 형태라 경계심이 낮은 편입니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "야 오랜만이다ㅋㅋ 잘 지내지? 근데 미안한데 부탁이 있어서 톡 했어." },
  ],
  callerLabel: "지인 (사칭)",
  channel: "messenger",
  surface: "kakao",
};

export const messengerParcelSmishingSmsScenario: ScenarioMeta = {
  title: "택배 배송 실패 스미싱(문자)",
  fraudType: "택배 사칭 스미싱(링크형)",
  estimatedDuration: "약 3~5분",
  difficulty: "쉬움 — 생활 밀착형 소재라 경계심이 낮은 편입니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "[국제택배] 고객님 물품이 주소지 오류로 배송이 보류되었습니다. 아래에서 주소를 확인해 주세요." },
  ],
  callerLabel: "택배 배송 안내",
  channel: "messenger",
  surface: "sms",
};

export const messengerSubsidySmishingSmsScenario: ScenarioMeta = {
  title: "정부지원금 안내 스미싱(문자)",
  fraudType: "지원금 사칭 스미싱(링크형)",
  estimatedDuration: "약 5~8분",
  difficulty: "중간 — 이익 유혹과 채널 전환이 결합됩니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "[지원금 안내] 고객님은 정부 지원금 대상자로 확인되었습니다. 아래에서 신청 여부를 확인해 주세요." },
  ],
  callerLabel: "지원금 안내센터 (사칭)",
  channel: "messenger",
  surface: "sms",
  escalation: { toChannel: "voice", voiceMode: "generic" },
};

export const PUBLIC_SCENARIOS: Record<string, ScenarioMeta> = {
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
