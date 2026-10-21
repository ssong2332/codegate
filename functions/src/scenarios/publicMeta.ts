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
  // T194-a(Architecture.md §84.4.1 · PRD AC-106 · AC-106 (i)) — **고급 세션에서만** 통화로 이어지는 시나리오의
  // 전이 설정. `escalation`(세 난이도 모두)이 있으면 이 필드는 쓰이지 않는다. 판정은 반드시
  // `scenarios/escalation.ts`의 (시나리오 × 난이도) 술어로만 한다 — 이 필드를 직접 읽지 않는다(G580).
  // 클라 원본(messengerParcelSmishingSms.ts)과 같은 값이어야 한다(루트 대조 테스트 escalation.test.ts).
  advancedEscalation?: EscalationConfig;
  // T191 S5(고급 전용 3종 — PRD AC-097 (b) · UX 계약 C-1) — 이 시나리오는 고급으로만 만들 수 있다.
  // **화면 표시값**(UX-017 "고급 전용" 묶음 · UX-029 고급 1장)일 뿐 수법·흐름 정보가 아니다(C-4).
  // 강제는 서버(`createSession` · `createChallenge`의 `assertDifficultyAllowed`)가 한다 — 클라
  // 가드는 충족 수단이 아니다(AC-097 (b)). 부재 = 세 난이도 모두 허용(AC-064 원문).
  advancedOnly?: true;
  // T191 S5(UX 계약 C-9 · D-106) — 세션 전 부담 고지 대상(셀프 감금 1종). 부재 = 고지 없음.
  preSessionBurdenNotice?: true;
  // §92(DECISIONS #206) — 합쳐진 시나리오의 흡수처 id. 있으면 `createSession`이 새 세션을 거부한다(`isMergedScenario`).
  // 항목은 옛 세션 · 리포트 해석용으로 남는다(프롬프트 · 변형 · 문자 · 화면 무변경).
  mergedInto?: string;
  // §92.4 — 목록 맨 뒤(화면 표시값 · 클라 원본과 같은 값).
  lowPriority?: true;
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
export const BANK_SECURITY_VERIFY_SCAM_SCENARIO_ID = "bank-security-verify-scam";

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
  fraudType: "검찰·금융감독원 직원 사칭",
  estimatedDuration: "약 3~5분",
  difficulty: "권위와 처벌 위협으로 겁을 주는 편입니다",
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
  title: "저금리 대환대출 사칭",
  fraudType: "금융회사 대출 상담원 사칭",
  estimatedDuration: "약 3~5분",
  difficulty: "낮은 이자로 바꿔 준다는 이득으로 끌어들이는 편입니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "안녕하세요, 고객님. 정부 지원 저금리 대환대출 대상자로 확인되어 안내차 연락드렸습니다." },
    { lineId: "line-2", text: "오늘까지만 신청 가능하신데, 기존 대출을 먼저 정리하셔야 저금리 전환이 됩니다." },
    { lineId: "line-3", text: "지금 상담 끊으시면 대상에서 제외될 수 있어요. 바로 진행 도와드릴게요." },
  ],
  voiceMode: "generic",
  callerLabel: "○○캐피탈 상담원 (사칭)",
};

export const taxRefundScamScenario: ScenarioMeta = {
  title: "국세청 환급금 사칭",
  fraudType: "국세청·공단 환급 담당자 사칭",
  estimatedDuration: "약 2~5분",
  difficulty: "돌려받을 돈이 있다는 말과 공공기관 이름으로 믿게 만드는 편입니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "국세청 환급 담당입니다. 고객님 앞으로 미수령 환급금이 확인되어 안내드립니다." },
    { lineId: "line-2", text: "본인 확인만 되면 오늘 바로 환급이 가능하신데, 절차상 몇 가지 확인이 필요합니다." },
    { lineId: "line-3", text: "지금 안내해 드리는 대로만 따라 하시면 됩니다. 다른 곳에 문의하시면 처리가 지연돼요." },
  ],
  voiceMode: "generic",
  callerLabel: "국세청 환급팀 (사칭)",
  // §92.4(DECISIONS #206) — 보고서 R6 "유지(우선순위 낮음)": 목록 맨 뒤.
  lowPriority: true,
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
  fraudType: "카드사 상담원 사칭(해외 결제 확인)",
  estimatedDuration: "약 2~5분",
  difficulty: "결제됐다는 말로 놀라게 한 뒤 빨리 확인하라고 재촉합니다",
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
  fraudType: "택배 고객센터 사칭(해외 택배 통관)",
  estimatedDuration: "약 3~5분",
  difficulty: "늘 받는 택배 이야기라 의심하기 어려운 편입니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "안녕하세요, 고객님. 택배 고객센터입니다. 고객님 명의 국제 택배가 통관에서 보류되어 연락드렸습니다." },
    { lineId: "line-2", text: "관세 미납 건으로 확인되는데, 본인 확인만 되면 바로 통관 처리해 드릴 수 있어요." },
    { lineId: "line-3", text: "오늘 처리하지 않으시면 반송될 수 있어서요. 지금 안내해 드리는 절차만 따라와 주시면 됩니다." },
  ],
  voiceMode: "generic",
  callerLabel: "택배 고객센터 (사칭)",
  // §92.4(DECISIONS #206) — 보고서 R6 "유지(우선순위 낮음)": 목록 맨 뒤.
  lowPriority: true,
};

export const kidnappingThreatScenario: ScenarioMeta = {
  title: "자녀 납치 협박",
  fraudType: "자녀를 데리고 있다는 협박",
  estimatedDuration: "약 2~4분",
  difficulty: "겁을 주는 말이 강해 마음의 부담이 클 수 있습니다",
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
  fraudType: "불법업소 출입 기록을 퍼뜨리겠다는 협박",
  estimatedDuration: "약 2~4분",
  difficulty: "부끄러움과 두려움을 건드리는 협박이라 마음의 부담이 클 수 있습니다",
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
  fraudType: "자녀 사칭(카카오톡)",
  estimatedDuration: "약 5~8분",
  difficulty: "가족 걱정을 건드리고, 채팅하다가 전화로 이어집니다",
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
  fraudType: "지인 사칭(카카오톡 급전 부탁)",
  estimatedDuration: "약 5~8분",
  difficulty: "친한 사이의 부탁처럼 다가와 의심하기 어려운 편입니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "야 오랜만이다ㅋㅋ 잘 지내지? 근데 미안한데 부탁이 있어서 톡 했어." },
  ],
  callerLabel: "지인 (사칭)",
  channel: "messenger",
  surface: "kakao",
};

export const messengerParcelSmishingSmsScenario: ScenarioMeta = {
  title: "택배 배송 실패 스미싱(문자)",
  fraudType: "택배사 사칭 문자(링크 누르기 유도)",
  estimatedDuration: "약 3~5분",
  difficulty: "늘 받는 택배 문자라 의심하기 어렵고, 고급에서는 상담원 전화로 이어집니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "[국제택배] 고객님 물품이 주소지 오류로 배송이 보류되었습니다. 아래에서 주소를 확인해 주세요." },
  ],
  callerLabel: "택배 배송 안내",
  channel: "messenger",
  surface: "sms",
  // T194-a(§84.4.1 · AC-106) — 고급만 문자 → 설치 → 상담원 전화 3단계(초급 · 중급은 현행 — AC-106 (f)).
  advancedEscalation: { toChannel: "voice", voiceMode: "generic" },
};

export const messengerSubsidySmishingSmsScenario: ScenarioMeta = {
  title: "정부지원금 안내 스미싱(문자)",
  fraudType: "정부지원금 안내 사칭 문자(링크 누르기 유도)",
  estimatedDuration: "약 5~8분",
  difficulty: "받을 돈이 있다는 말로 끌어들이고, 문자하다가 전화로 이어집니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "[지원금 안내] 고객님은 정부 지원금 대상자로 확인되었습니다. 아래에서 신청 여부를 확인해 주세요." },
  ],
  callerLabel: "지원금 안내센터 (사칭)",
  channel: "messenger",
  surface: "sms",
  escalation: { toChannel: "voice", voiceMode: "generic" },
};

// T95(2026-07-26, MVP #29 잔여 — OQ-41 "전용 1종") 확인 시도 무력화(D3) 전용 시나리오 미러.
// ⚠️ **이 미러는 `callerLabel`까지 원본과 글자 그대로 같다.** 기존 13종은 T75에서 클라 쪽
// callerLabel만 번호 표기로 바꾸면서 이 파일과 13/13 어긋난 상태다(§15.10.9 G38) — 새 시나리오에서
// 같은 드리프트를 반복하지 않는다. 원본은 src/content/scenarios/bankSecurityVerifyScam.ts다.
export const bankSecurityVerifyScamScenario: ScenarioMeta = {
  title: "직접 확인해 보라는 은행 사칭",
  fraudType: "은행 직원 사칭(직접 확인을 권함)",
  estimatedDuration: "약 3~5분",
  difficulty: "상대가 먼저 확인해 보라고 해서 의심이 풀리기 쉽습니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "안녕하세요, 고객님. ○○은행 금융사고대응팀입니다. 고객님 계좌에서 비정상 출금 시도가 확인되어 연락드렸습니다." },
    { lineId: "line-2", text: "의심스러우신 게 당연합니다. 직접 확인해 보셔도 됩니다. 저는 끊지 않고 기다리겠습니다." },
    { lineId: "line-3", text: "확인되시는 대로 이어서 진행하시죠. 그 사이에 출금이 나가지 않도록 저희가 붙잡아 두겠습니다." },
  ],
  voiceMode: "generic",
  callerLabel: "070-4133-2085",
};

// ── T191 S5 — 고급 전용 3종(PRD AC-097 (a) · D2) ─────────────────────────────
// 원본은 src/content/scenarios/{cardDeliveryCall,assetProtectionNoticeCall,prosecutionCooperationCall}.ts
// 이며 **callerLabel까지 글자 그대로 같다**(T95 G38 관례 — scenarios.test.ts가 전 필드를 대조한다).
// ⚠️ 카드 문면 규칙(UX D-104 (4)): 제목·유형·성향 문자열은 사칭 주체와 첫 상황까지만 쓴다 — 흐름·
// 수법 이름 0(flowVariants.test.ts의 D-104 금지 낱말 게이트).
export const CARD_DELIVERY_CALL_SCENARIO_ID = "card-delivery-call";
export const ASSET_PROTECTION_NOTICE_CALL_SCENARIO_ID = "asset-protection-notice-call";
export const PROSECUTION_COOPERATION_CALL_SCENARIO_ID = "prosecution-cooperation-call";

export const cardDeliveryCallScenario: ScenarioMeta = {
  title: "카드 배송 안내 전화",
  fraudType: "카드 배송 담당자 사칭",
  estimatedDuration: "약 2~5분",
  difficulty: "친절한 배송 안내처럼 시작해서 의심이 풀리기 쉽습니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "안녕하세요, 고객님. 카드 배송 안내 드리려고 연락드렸습니다. 오늘 받으실 수 있으세요?" },
  ],
  voiceMode: "generic",
  callerLabel: "070-5217-3364",
  advancedOnly: true,
  // §92(DECISIONS #206) — 카드사 부정결제 고급의 흐름 변형으로 흡수됐다(목록 제외 · 새 세션 거부 · 재훈련은 흡수처로).
  mergedInto: "card-company-impersonation",
};

export const assetProtectionNoticeCallScenario: ScenarioMeta = {
  title: "금융감독원 자산 보호 안내",
  fraudType: "금융감독원 직원 사칭(자산 보호 안내)",
  estimatedDuration: "약 3~5분",
  difficulty: "도와주겠다는 말로 믿음을 얻어 의심이 풀리기 쉽습니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "안녕하십니까, 금융감독원입니다. 고객님 명의 계좌 관련해서 안내드릴 사항이 있어 연락드렸습니다." },
  ],
  voiceMode: "generic",
  callerLabel: "070-8842-1907",
  advancedOnly: true,
};

export const prosecutionCooperationCallScenario: ScenarioMeta = {
  title: "검찰 수사 협조 요청",
  fraudType: "검찰 수사관 사칭(수사 협조 요청)",
  estimatedDuration: "약 3~5분",
  difficulty: "처벌을 앞세운 압박이 이어져 마음의 부담이 큰 편입니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "검찰 수사관입니다. 본인 명의 계좌 관련 사건으로 확인할 것이 있어 연락드렸습니다." },
  ],
  voiceMode: "generic",
  callerLabel: "070-3359-6610",
  advancedOnly: true,
  preSessionBurdenNotice: true,
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
  [BANK_SECURITY_VERIFY_SCAM_SCENARIO_ID]: bankSecurityVerifyScamScenario,
  [CARD_DELIVERY_CALL_SCENARIO_ID]: cardDeliveryCallScenario,
  [ASSET_PROTECTION_NOTICE_CALL_SCENARIO_ID]: assetProtectionNoticeCallScenario,
  [PROSECUTION_COOPERATION_CALL_SCENARIO_ID]: prosecutionCooperationCallScenario,
};

// T191 S5 — 고급 전용 시나리오인가(PRD AC-097 (b) · UX 계약 C-1/C-2). 서버 거부 술어
// (`session/difficultyAllowance.ts`)와 챌린지 생성 거부가 이 함수 하나를 쓴다.
// ⚠️ 이 파일에는 블록 주석을 쓰지 않는다 — 위쪽 기존 주석의 `src/content/scenarios/*.ts` 표기가 블록 주석
// 시작(`/` + `*`)으로 읽혀, 루트 소스 스캔(startNoticeGate.test.ts의 codeOnly)이 그 사이 코드를 통째로 지운다.
export function isAdvancedOnlyScenario(scenarioId: string): boolean {
  return PUBLIC_SCENARIOS[scenarioId]?.advancedOnly === true;
}

// §92(DECISIONS #206) — 다른 시나리오로 합쳐져 새 세션을 만들 수 없는 시나리오인가(`session/mergedScenario.ts`가 쓴다).
export function isMergedScenario(scenarioId: string): boolean {
  return PUBLIC_SCENARIOS[scenarioId]?.mergedInto !== undefined;
}
