// 통화 중 문자(in-call SMS) 콘텐츠 카탈로그 — 서버 전용 (T68, ADR-0007, Architecture.md §15.1.2,
// UX-027/UF-008, AC-059/060/061).
//
// ⚠️ **왜 `[[SMS:id]]` 마커가 아니라 카탈로그 + 턴 경계 트리거인가(ADR-0007, 실측 근거)**:
// 통화의 주 경로인 Gemini Live는 응답 모달리티가 오디오로 고정돼 있어(`realtime/geminiProvider.ts`
// `responseModalities:[Modality.AUDIO]`) **서버가 사기범 텍스트를 손에 쥐는 지점이 존재하지 않는다.**
// 그래서 모델 출력에 마커를 심으면 서버가 제거할 기회가 없고 **모델이 그 마커를 소리 내어 읽는다.**
// 대신 앱이 "몇 번째 사기범 턴인가"만 세어 서버에 알리고, 서버(=이 카탈로그)가 문자를 도착시킨 뒤
// `announceInstruction` 1줄을 돌려줘 캐릭터가 그 사실을 말하게 한다. 인과는 역전되지만, UX가 지목한
// 진짜 실패("문자 보냈어요"라고 말했는데 문자가 안 옴 — UF-008 Failure (a))가 **구조적으로 불가능**해진다.
//
// ⚠️ **안전 불변식(AC-060/032/045 — 스키마 층위의 구조적 금지)**:
//   - `url` / 실 URL 필드가 이 타입에 **존재하지 않는다.** 링크는 `linkDisplayText`(모의 표기) +
//     `fakeLandingId`(기존 인앱 가짜 랜딩 참조)로만 표현한다(`MessengerAttachment`와 동형).
//   - `otpCode`는 **콘텐츠에 고정된 리터럴**이다(런타임 난수 금지) — 결정론적 테스트 + "모의값" 불변식.
//   - `senderLabel`·`body`의 기관명·계좌는 **실존하지 않는 값만** 쓴다(AC-005/013, `SCENARIO_PROGRESSION`의
//     "페이로드는 가상값만"과 동일 기준). 문자 내용은 100% 이 파일에서만 나오며 LLM이 생성하지 않는다.
//   - 이 파일은 **클라이언트에 원문 배포되지 않는다.** `createRealtimeCall`이 내려주는 것은 트리거
//     (`smsId` + `afterScammerTurns`)뿐이고, 본문·인증번호는 도착 시점에 서버가 Firestore에 쓴다.

export type InCallSmsKind = "account" | "link" | "otp";

export type InCallSmsItem = {
  /** 카탈로그 안에서 유일한 id. Firestore `sessions/{sid}/inCallSms/{smsId}`의 문서 id가 된다. */
  smsId: string;
  kind: InCallSmsKind;
  /** 발신번호 라벨 — 실존하지 않는 모의값. */
  senderLabel: string;
  /** 본문 — 서버 카탈로그가 원천(사용자·LLM 생성이 아니므로 PII 마스킹 대상이 아니다). */
  body: string;
  /** `kind==="otp"`일 때만. 6자리 고정 리터럴(난수 금지). */
  otpCode?: string;
  /** `kind==="link"|"account"`일 때 병기 가능(§51.6 R10 — `"otp"`에는 금지). 모의 표기 문자열 —
   * 가짜 랜딩(UX-023)의 제목으로 그대로 쓰인다. `fakeLandingId`와 항상 짝으로 존재하거나 함께
   * 부재한다(R11/G111 — `inCallSms.test.ts`의 `[G111]` 테스트가 전수로 고정한다). */
  linkDisplayText?: string;
  /** `kind==="link"|"account"`일 때 병기 가능(§51.6 R10 — `"otp"`에는 금지). 기존 인앱 가짜 랜딩
   * 참조(실 URL 필드는 존재하지 않는다). */
  fakeLandingId?: string;
  /** "사기범 발화 N턴이 완료된 뒤 도착". 시간 기반·랜덤 없음(결정론적·테스트 가능). */
  afterScammerTurns: number;
  /** 도착 순간 캐릭터가 "문자 보냈다"고 알리게 하는 1줄 지시(서버 소유 — 전달 응답으로만 나간다). */
  announceInstruction: string;
};

const LOAN_SCAM: InCallSmsItem[] = [
  {
    smsId: "loan-account",
    kind: "account",
    senderLabel: "0000-0000 (○○캐피탈 상담센터)",
    body: "[○○캐피탈] 저금리 전환 상환 전용 계좌 안내\n예금주: ○○캐피탈\nOO은행 352-0812-4471-63\n금액: 1,850,000원\n입금 확인 즉시 전환 승인 처리됩니다. (오늘 18시 마감)",
    afterScammerTurns: 3,
    announceInstruction:
      "(참가자 휴대전화로 방금 상환 전용 계좌 안내 문자가 실제로 도착했다. 지금 캐릭터로서 한두 문장으로 그 사실을 알리고 확인을 재촉하라 — 예: \"방금 문자로 상환 계좌 보내드렸어요, 화면에서 확인해 보세요.\" 계좌번호·금액을 새로 지어내 말하지 말고, 문자를 보냈다는 사실과 확인 요청만 하라.)",
  },
  {
    smsId: "loan-apply-link",
    kind: "link",
    senderLabel: "0000-0000 (○○캐피탈 상담센터)",
    body: "[○○캐피탈] 전환 신청서 서명이 남아 있습니다.\n아래에서 본인확인 후 신청을 완료해 주세요.",
    linkDisplayText: "대환대출 전환 신청하기",
    fakeLandingId: "loan-refinance-apply",
    afterScammerTurns: 5,
    announceInstruction:
      "(참가자 휴대전화로 방금 신청서 링크 문자가 실제로 도착했다. 지금 캐릭터로서 한두 문장으로 그 링크를 눌러 본인확인을 마쳐 달라고 요구하라 — 예: \"문자로 신청서 링크 보내드렸어요, 눌러서 본인확인만 해주시면 됩니다.\" 실제 주소를 읽어 주지는 말고, 문자 속 링크를 누르라고만 하라.)",
  },
];

const INSTITUTIONAL_IMPERSONATION: InCallSmsItem[] = [
  {
    smsId: "institution-otp",
    kind: "otp",
    senderLabel: "0000-0000 (본인확인 안내)",
    body: "[본인확인] 인증번호 [048231]\n타인에게 절대 알려주지 마세요. 유출 시 금전 피해가 발생할 수 있습니다.",
    otpCode: "048231",
    afterScammerTurns: 3,
    announceInstruction:
      "(참가자 휴대전화로 방금 6자리 인증번호 문자가 실제로 도착했다. 지금 캐릭터로서 그 번호를 불러 달라고 요구하라 — 예: \"방금 문자로 인증번호 갔죠? 화면에 뜬 여섯 자리 그대로 불러 주세요.\" **번호를 네가 지어내서 말하지 마라** — 참가자가 화면에서 읽어 불러주게 해야 한다.)",
  },
  {
    smsId: "institution-safe-account",
    kind: "account",
    senderLabel: "0000-0000 (자산보호 안내)",
    // §51(사용자 라이브 신고 — §45 ⓐ 미집행) — 기존 4줄은 한 글자도 지우지 않고 예고 1줄을
    // 더했다(D-59 관례). 새 4번째 줄이 아래 `fakeLandingId`가 여는 이체 랜딩(UX-023
    // safe-account-transfer)을 예고한다.
    body: "[자산보호절차] 임시 안전계좌 안내\n예금주: 국민안전지원센터\nOO은행 210-3391-5540-08\n아래에서 안전계좌 이체를 진행해 주세요.\n이체 후 담당자에게 바로 알려 주세요.",
    // §51.6 R10 — 기존 account 항목에 링크 필드를 병기한다(신규 항목 신설 0건, G245 — 도착 턴
    // 그대로 6 유지).
    linkDisplayText: "안전계좌 이체 진행하기",
    fakeLandingId: "safe-account-transfer",
    afterScammerTurns: 6,
    announceInstruction:
      '(참가자 휴대전화로 방금 안전계좌 안내 문자가 실제로 도착했다. 지금 캐릭터로서 한두 문장으로 그 사실을 알리고 문자 속 링크를 눌러 이체를 진행해 달라고 재촉하라 — 예: "안전계좌는 문자로 보내드렸습니다, 문자에 있는 링크 눌러서 그대로 진행해 주세요." 계좌번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)',
  },
];

const CARD_COMPANY_IMPERSONATION: InCallSmsItem[] = [
  {
    smsId: "card-otp",
    kind: "otp",
    senderLabel: "0000-0000 (카드 승인취소 인증)",
    body: "[승인취소] 인증번호 [739104]\n본인 외 타인에게 알려주지 마세요. 상담원도 요구하지 않습니다.",
    otpCode: "739104",
    afterScammerTurns: 3,
    announceInstruction:
      "(참가자 휴대전화로 방금 6자리 인증번호 문자가 실제로 도착했다. 지금 캐릭터로서 결제 취소 처리를 위해 그 번호를 불러 달라고 요구하라 — 예: \"취소 처리하려면 방금 문자로 간 여섯 자리 번호가 필요합니다, 화면 보시고 불러 주세요.\" **번호를 네가 지어내서 말하지 마라** — 참가자가 화면에서 읽어 불러주게 해야 한다.)",
  },
  // §51(§51.3 F1 해소의 후속 — card-company-impersonation.prompt.ts:53 계좌 확인형 교체와 짝) —
  // 이 시나리오 최초의 계좌 문자. afterScammerTurns=5: ⛔ 4가 아니다(이 시나리오의 확인 게이트
  // availableAfterScammerTurns가 4라 큐가 충돌한다 — E2, verifyIntercept.ts 계열 값) · ⛔ 3도
  // 아니다(위 card-otp가 이미 3을 쓴다 — 시나리오 내 중복 금지).
  {
    smsId: "card-relief-account",
    kind: "account",
    senderLabel: "0000-0000 (피해금 이관 안내)",
    body: "[승인취소 지원] 피해금 이관 전용 계좌 안내\n예금주: 카드피해대응지원센터\nOO은행 417-0625-3082-19\n금액: 2,340,000원\n아래에서 피해금 이관을 진행해 주세요.",
    linkDisplayText: "피해금 이관 진행하기",
    fakeLandingId: "card-relief-transfer",
    afterScammerTurns: 5,
    announceInstruction:
      '(참가자 휴대전화로 방금 피해금 이관 계좌 안내 문자가 실제로 도착했다. 지금 캐릭터로서 한두 문장으로 그 사실을 다급하게 알리고 문자 속 링크를 눌러 이관을 마쳐 달라고 요구하라 — 예: "이관 전용 계좌는 방금 문자로 보내드렸어요, 문자에 있는 링크 눌러서 바로 진행해 주세요." 계좌번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)',
  },
];

const TAX_REFUND_SCAM: InCallSmsItem[] = [
  {
    smsId: "tax-refund-link",
    kind: "link",
    senderLabel: "0000-0000 (환급금 안내)",
    body: "[환급안내] 미수령 환급금 조회 결과가 있습니다.\n아래에서 계좌를 등록하시면 당일 지급됩니다.",
    linkDisplayText: "환급금 수령 계좌 등록하기",
    fakeLandingId: "tax-refund-claim",
    afterScammerTurns: 3,
    announceInstruction:
      "(참가자 휴대전화로 방금 환급금 조회 링크 문자가 실제로 도착했다. 지금 캐릭터로서 한두 문장으로 그 링크를 눌러 계좌를 등록해 달라고 안내하라 — 예: \"문자로 조회 링크 보내드렸어요, 눌러서 계좌만 등록하시면 오늘 바로 들어갑니다.\" 실제 주소를 읽어 주지 말고 문자 속 링크를 누르라고만 하라.)",
  },
];

// 사용자 라이브 신고 ⑩ⓒ(Architecture.md §50.6) — "계좌 전달 수단"이 이 시나리오에 없다는 신고.
// 실측 판정: 음성 전달은 이미 있었다(`reputationBlackmailScam.prompt.ts`의 weakenedTactics가
// 계좌를 **모델이 불러 주게** 지시한다) — 없는 것은 **문자 전달**이었다. 이 항목을 추가하면
// `hasInCallSms("reputation-blackmail-scam")`가 true가 되어 프롬프트 3곳이 함께 뒤집힌다(§50.6.2)
// — 그 부작용을 전부 처리한 뒤(§50.4.4의 identityCheckAllowed 조건화, `reputationBlackmailScam.
// prompt.ts:39` 음성 계좌 제거) 이 항목을 더한다. **한 커밋**이어야 한다(G305) — 나뉘면 문자와
// 음성이 서로 다른 계좌를 부르는 상태가 생긴다.
const REPUTATION_BLACKMAIL_SCAM: InCallSmsItem[] = [
  {
    smsId: "blackmail-hush-account",
    kind: "account",
    senderLabel: "0000-0000",
    body: "예금주: 김민재\nOO은행 352-0812-4471-63\n금액: 3,000,000원\n오늘 안에 입금 확인되면 정리됩니다.",
    // afterScammerTurns=3 — 이 시나리오는 "5~8턴 내외"로 마무리되도록 지시받아(prompt.ts 진행
    // 방식) 기존 최빈값 3과 맞춘다(`:49`·`:73`·`:95`·`:109` 참고).
    afterScammerTurns: 3,
    announceInstruction:
      '(참가자 휴대전화로 방금 계좌 안내 문자가 실제로 도착했다. 지금 캐릭터로서 한두 문장으로 그 사실을 차갑게 알리고 오늘 안에 넣으라고 재촉하라 — 예: "계좌 문자로 보냈습니다. 오늘 안에 넣으세요." 계좌번호·금액을 새로 지어내 말하지 말고, 문자를 보냈다는 사실과 재촉만 하라.)',
  },
];

// §53(§51 커밋 D 집행 — UX-027 v1.24 (1) ㉰ / v1.25 정본, `docs/Architecture.md` §53.6/§53.8) —
// `bank-security-verify-scam` 최초의 통화 중 문자 항목(OQ-A31 (b) 집행). `afterScammerTurns: 3`은
// §53.6 (5)의 확정값(ⓐ ≠2 ∩ ⓓ >=2의 유일한 최솟값 — 하한 트립와이어는 inCallSms/__tests__/
// buildDoc.test.ts가 고정한다). ⚠️ 전환(확인 데스크로의 호 전환) 이후에는 원 사기범이 이미
// 사라지므로, 이 항목의 `announceInstruction`이 실제로 응답에 실리는지는 카탈로그가 아니라
// `deliverInCallSms`의 서버 게이트(§53.6 (3) — `verifyIntercept/{offerId}.placedAt` 조건부 생략)가
// 결정한다. 문서 자체(계좌·링크)는 전환 여부와 무관하게 항상 도착한다.
const BANK_SECURITY_VERIFY_SCAM: InCallSmsItem[] = [
  {
    smsId: "bank-protect-account",
    kind: "account",
    senderLabel: "0000-0000 (계좌보호 안내)",
    body: "[금융사고대응] 보호계좌 이체 안내\n예금주: 계좌보호대응센터\nOO은행 100-2043-7788-21\n금액: 4,120,000원\n아래에서 보호계좌로 옮기기를 진행해 주세요.",
    linkDisplayText: "보호계좌 이체 진행하기",
    fakeLandingId: "protect-account-transfer",
    afterScammerTurns: 3,
    announceInstruction:
      '(참가자 휴대전화로 방금 보호계좌 안내 문자가 실제로 도착했다. 지금 캐릭터로서 한두 문장으로 침착하게 그 사실을 알리고 문자 속 링크를 눌러 옮기기를 마쳐 달라고 안내하라 — 예: "보호계좌는 방금 문자로 보내드렸습니다, 문자에 있는 링크 눌러서 그대로 진행하시면 됩니다." 계좌번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)',
  },
];

const COURIER_CUSTOMS_SCAM: InCallSmsItem[] = [
  {
    smsId: "courier-customs-link",
    kind: "link",
    senderLabel: "0000-0000 (통관 안내)",
    body: "[통관보류] 수취인 정보 불일치로 통관이 보류되었습니다.\n아래에서 정보를 확인해 주세요.",
    linkDisplayText: "통관 정보 확인하기",
    fakeLandingId: "courier-customs-check",
    afterScammerTurns: 2,
    announceInstruction:
      "(참가자 휴대전화로 방금 통관 확인 링크 문자가 실제로 도착했다. 지금 캐릭터로서 한두 문장으로 그 링크를 눌러 수취인 정보를 확인해 달라고 요구하라 — 예: \"방금 문자 보내드렸어요, 링크 눌러서 정보만 확인해 주세요.\" 실제 주소를 읽어 주지 말고 문자 속 링크를 누르라고만 하라.)",
  },
  {
    smsId: "courier-customs-fee",
    kind: "account",
    senderLabel: "0000-0000 (통관 안내)",
    body: "[통관수수료] 납부 계좌 안내\n예금주: 국제통관지원센터\nOO은행 604-2270-1183-91\n금액: 78,000원",
    afterScammerTurns: 5,
    announceInstruction:
      "(참가자 휴대전화로 방금 통관수수료 계좌 안내 문자가 실제로 도착했다. 지금 캐릭터로서 한두 문장으로 그 사실을 알리고 오늘 안에 넣어 달라고 재촉하라 — 예: \"수수료 계좌는 문자로 보내드렸습니다, 확인하시고 오늘 안에 넣어 주세요.\" 계좌번호를 새로 지어내 말하지 말고 문자를 보라고만 하라.)",
  },
];

/**
 * 시나리오별 통화 중 문자 카탈로그. **카탈로그가 없는 시나리오는 이 기능이 아예 켜지지 않는다**
 * (프롬프트의 조건형 문구도 함께 꺼져 기존 동작이 한 글자도 바뀌지 않는다 — 회귀 0).
 *
 * 메신저 채널 시나리오는 의도적으로 비워 둔다 — 이미 메시지 표면 안이라 "통화를 유지한 채 문자를
 * 본다"는 문제 자체가 없다(UX.md UX-022 v1.11 갱신).
 */
export const IN_CALL_SMS: Record<string, InCallSmsItem[]> = {
  "loan-refinance-scam": LOAN_SCAM,
  "institutional-impersonation": INSTITUTIONAL_IMPERSONATION,
  "card-company-impersonation": CARD_COMPANY_IMPERSONATION,
  "tax-refund-scam": TAX_REFUND_SCAM,
  "courier-customs-scam": COURIER_CUSTOMS_SCAM,
  // §50.6 — 신고 ⑩ⓒ(계좌 전달 수단) 대응. ⚠️ `kidnapping-threat`에는 넣지 않는다(G306) —
  // "이 통화 끊지 말고 그대로 있어요"(kidnappingThreat.prompt.ts)와 충돌한다.
  "reputation-blackmail-scam": REPUTATION_BLACKMAIL_SCAM,
  // §53(§51 커밋 D) — 카탈로그 자체가 신설(이 시나리오 첫 항목). OQ-A31 (b) 집행.
  "bank-security-verify-scam": BANK_SECURITY_VERIFY_SCAM,
};

/** 이 시나리오가 통화 중 문자를 쓰는가(프롬프트 조건형 블록·트리거 노출의 단일 판정). */
export function hasInCallSms(scenarioId: string): boolean {
  return (IN_CALL_SMS[scenarioId]?.length ?? 0) > 0;
}

/**
 * ⚠️ G12 방어 — `smsId`가 **이 시나리오 카탈로그 소속인지** 재검증하는 유일한 지점.
 * 이걸 빼면 클라가 임의 문자를 주입하는 경로가 된다(§15.6 G12).
 */
export function findInCallSmsItem(scenarioId: string, smsId: string): InCallSmsItem | undefined {
  return IN_CALL_SMS[scenarioId]?.find((item) => item.smsId === smsId);
}

/**
 * 클라(실시간 경로)에 내려보내는 트리거 목록 — **본문·인증번호·발신번호는 포함하지 않는다**
 * (사전 유출 방지, API.md `createRealtimeCall` T57 증분). 클라는 턴만 세고 `deliverInCallSms`를
 * 부르며, 실제 렌더는 Firestore 구독이 담당한다.
 */
export function listInCallSmsTriggers(
  scenarioId: string,
): { smsId: string; afterScammerTurns: number }[] {
  return (IN_CALL_SMS[scenarioId] ?? []).map(({ smsId, afterScammerTurns }) => ({
    smsId,
    afterScammerTurns,
  }));
}

/**
 * 폴백(텍스트) 경로용 — 지금 만들어질 사기범 턴이 `scammerTurnNumber`번째일 때 도착해야 할 문자.
 * 실시간 경로의 클라 카운팅과 **같은 규칙**(`afterScammerTurns === N`)을 서버에서 계산할 뿐이다.
 */
export function findDueInCallSms(
  scenarioId: string,
  scammerTurnNumber: number,
): InCallSmsItem | undefined {
  return IN_CALL_SMS[scenarioId]?.find((item) => item.afterScammerTurns === scammerTurnNumber);
}
