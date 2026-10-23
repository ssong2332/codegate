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
//     ⭐ §114 — 참가자가 보는 번호는 이 리터럴을 세션 id 해시로 바꾼 값이다(`sessionOtp.ts` `withSessionOtp` · 난수 아님).
//   - `senderLabel`·`body`의 기관명·계좌는 **실존하지 않는 값만** 쓴다(AC-005/013, `SCENARIO_PROGRESSION`의
//     "페이로드는 가상값만"과 동일 기준). 문자 내용은 100% 이 파일에서만 나오며 LLM이 생성하지 않는다.
//   - 이 파일은 **클라이언트에 원문 배포되지 않는다.** 본문·인증번호는 도착 시점에 서버가 Firestore에 쓴다.
//     T191(문자 도달 조건) 이후로는 트리거(`smsId` + `afterScammerTurns`)도 클라에 내려가지 않는다 — 발송 여부는
//     세션 흐름 변형의 `sms` 선언 + `inCallSms/smsGate.ts`가 정한다.

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
  /**
   * T190-2(docs/Architecture.md §74.9 · UX D-101 · PRD AC-094) — 문자 말풍선 링크 줄에 보일 **가짜 주소**
   * (`{그 랜딩의 mockHost}{경로}` — 스킴 0 · `www.` 0 · 연속 숫자 3자리 이하). `linkDisplayText`·`fakeLandingId`와
   * **3자 쌍**으로만 존재/부재한다(G111 확장). 반드시 그 `fakeLandingId` 랜딩의 `mockHost + "/"`로 시작한다
   * (G453 — `__tests__/mockAddress.test.ts`). ⛔ 실 URL 필드가 아니다 — 탭해도 인앱 랜딩만 열린다(AC-060 읽기 고지).
   * `linkDisplayText`는 지우지 않는다(리포트·리플레이·랜딩 aria 이름이 계속 쓴다 — §74.9 ①).
   */
  linkAddress?: string;
  /** `kind==="link"|"account"`일 때 병기 가능(§51.6 R10 — `"otp"`에는 금지). 기존 인앱 가짜 랜딩
   * 참조(실 URL 필드는 존재하지 않는다). */
  fakeLandingId?: string;
  /**
   * ⚠️ T191(문자 도달 조건) 이후 **발송 판정 입력이 아니다** — 발송 시점은 흐름 변형의 `notBeforeUserTurns` +
   * `inCallSms/smsGate.ts`가 정한다(이 값만으로 자동 발송하는 경로 0 — 소스 스캔이 고정). 남아 있는 쓰임은 폴백
   * 인증번호 대조(`roleplay/otpCheck.ts` — 그 구조는 이번 범위에서 유지)의 "이른 턴" 판정뿐이다.
   */
  afterScammerTurns: number;
  /** 도착 순간 캐릭터가 "문자 보냈다"고 알리게 하는 1줄 지시(서버 소유 — 전달 응답으로만 나간다). */
  announceInstruction: string;
};

// ⭐ §104.10(2026-10-22 사용자 결정 "지금 전체 변경" — DECISIONS #219 · UX W-11 갱신) — 발신번호 자리표시 "0000-0000"을 시나리오별 **고정**
// 가상 번호로 바꿨다(무작위 0 · 같은 시나리오의 문자는 같은 발신번호). 규칙 = **지역번호 · 070 뒤 국번 첫 자리가 0**: 국내 시내전화 국번은 2~9로
// 시작하고 0 · 1로 시작하는 번호는 국번이 아니라 식별 · 특수번호로 쓰인다(⚠️ **추정** — 2차 자료(위키백과 "대한민국의 전화번호 체계")만 확인,
// 전기통신번호관리세칙 원문 미확인. 확인 방법: 국가법령정보센터 세칙 별표 번호체계). 대표번호(15XX · 16XX · 18XX)는 실존과 겹칠 위험이 커 쓰지 않는다.
// 기관 · 수사 = 서울 02 · 국세 = 세종 044 · 통관 = 인천 032 · 협박범 = 인터넷전화 070. 테스트 `smsSenderNumber.test.ts`가 국번 첫 자리 0을 고정한다.
export const SMS_SENDER_NUMBER: Readonly<Record<string, string>> = {
  "loan-refinance-scam": "02-0785-6043",
  "card-delivery-call": "02-0768-1954",
  "asset-protection-notice-call": "02-0748-2915",
  "prosecution-cooperation-call": "02-0714-3826",
  "institutional-impersonation": "02-0731-5402",
  "card-company-impersonation": "02-0762-4180",
  "tax-refund-scam": "044-0821-6390",
  "reputation-blackmail-scam": "070-0438-9172",
  "bank-security-verify-scam": "02-0753-8264",
  "courier-customs-scam": "032-0617-4429",
};

const LOAN_SCAM: InCallSmsItem[] = [
  {
    smsId: "loan-account",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["loan-refinance-scam"]} (○○캐피탈 상담센터)`,
    // A-1 ③(2026-10-19 · audit-A R1 ②) — 마지막 줄 "입금 확인 즉시 전환 승인 처리됩니다. (오늘 18시 마감)"이 "입금 확인을
    // 기다리는" 구도를 깔아 사기범이 "확인 중·기다려 주세요"로 버티는 재료가 됐다 → 마감만 남긴 요구 문장으로 바꿨다(계좌·금액 무변경).
    body: "[○○캐피탈] 저금리 전환 상환 전용 계좌 안내\n예금주: ○○캐피탈\nOO은행 352-0812-4471-63\n금액: 1,850,000원\n오늘 18시까지 입금해 주세요.",
    afterScammerTurns: 3,
    announceInstruction:
      "(참가자 휴대전화로 방금 상환 전용 계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호·금액을 새로 지어내 말하지 말고, 문자를 보냈다는 사실과 확인 요청만 하라.)",
  },
  {
    smsId: "loan-apply-link",
    kind: "link",
    senderLabel: `${SMS_SENDER_NUMBER["loan-refinance-scam"]} (○○캐피탈 상담센터)`,
    body: "[○○캐피탈] 전환 신청서 서명이 남아 있습니다.\n아래에서 본인확인 후 신청을 완료해 주세요.",
    linkDisplayText: "대환대출 전환 신청하기",
    fakeLandingId: "loan-refinance-apply",
    linkAddress: "loan-switch-center.invalid/apply/Lm2w",
    afterScammerTurns: 5,
    announceInstruction:
      "(참가자 휴대전화로 방금 신청서 링크 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 그 링크를 눌러 본인확인을 마쳐 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 실제 주소를 읽어 주지는 말고, 문자 속 링크를 누르라고만 하라.)",
  },
  // ⭐ T194-c-1(docs/Architecture.md §84.5.2 · §84.16.2 · DECISIONS #191) — **자가 훈련 고급** loan의 `link` 슬롯 문자(Q2 — 통화 중 문자
  // → 모의 설치). 위 `loan-apply-link`는 삭제하지 않는다(챌린지 고급 `fv-6s5p`가 계속 선언한다). afterScammerTurns=2: 이 시나리오의
  // 3 · 5와 겹치지 않는 값(시나리오 내 중복 금지 — `inCallSms.test.ts`). 발송 시점은 변형 선언(`notBeforeUserTurns`)이 정한다.
  {
    smsId: "loan-check-app-link",
    kind: "link",
    senderLabel: `${SMS_SENDER_NUMBER["loan-refinance-scam"]} (○○캐피탈 상담센터)`,
    body: "[○○캐피탈] 저금리 전환 심사 전 보안 점검 안내\n아래에서 심사용 보안 점검 앱을 설치해 주세요.",
    linkDisplayText: "심사용 보안 점검 앱 설치하기",
    fakeLandingId: "loan-check-app-install",
    linkAddress: "loan-check-app.invalid/setup/Vr7c",
    afterScammerTurns: 2,
    announceInstruction:
      "(참가자 휴대전화로 방금 보안 점검 앱 설치 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 앱 설치를 진행해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 실제 주소를 읽어 주지 말고, 설치 방법·권한 설정은 설명하지 마라.)",
  },
];

// ⭐ T194-c-1(docs/Architecture.md §84.5.2 · §84.15.4) — `card-delivery-call`(고급 전용 · 챌린지 불가) 최초의 통화 중 문자. 고급 변형
// `fv-tvnj`의 `link` 슬롯이 선언한다(Q2 — 통화 중 문자 → 모의 설치). ⚠️ 이 키가 생기면 `hasInCallSms("card-delivery-call")`가 참이 되어
// **변형 없는 세션**(옛 세션)의 조립 산출물이 바뀐다(`sessionDeclaresInCallSms`의 무소급 분기 — §84.16.5 단계 4 · 의도된 변경).
const CARD_DELIVERY_CALL: InCallSmsItem[] = [
  {
    smsId: "card-delivery-app-link",
    kind: "link",
    senderLabel: `${SMS_SENDER_NUMBER["card-delivery-call"]} (카드 사고접수 안내)`,
    body: "[명의도용 사고접수] 휴대폰 보안 점검이 필요합니다.\n아래에서 보안 점검 앱을 설치해 주세요.",
    linkDisplayText: "보안 점검 앱 설치하기",
    fakeLandingId: "card-delivery-app-install",
    linkAddress: "card-safe-check.invalid/app/Ns4k",
    afterScammerTurns: 2,
    announceInstruction:
      "(참가자 휴대전화로 방금 보안 점검 앱 설치 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 앱 설치를 진행해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 실제 주소를 읽어 주지 말고, 설치 방법·권한 설정은 설명하지 마라.)",
  },
];

// ⭐ §92.3(docs/Architecture.md · DECISIONS #206) — 고급 전용 2종의 첫 통화 중 문자(보고서 R2 "장치 0개 — 보강"). 기관 사칭 고급
// (인증번호 → 안전계좌 이체 화면)과 겹치지 않게 각 시나리오의 **고유 요구**(E4 현금 인출 · 전달 / 셀프 감금의 가짜 사건 조회)를 화면으로 만든다.
// 둘 다 `link` → `credential-form`(입력만 · 서버 미전송 — 새 kind 0). 발신 표기 · 본문에 실존 기관명 0(§81 · `mockSurface`).
const ASSET_PROTECTION_NOTICE_CALL: InCallSmsItem[] = [
  {
    smsId: "asset-custody-link",
    kind: "link",
    senderLabel: `${SMS_SENDER_NUMBER["asset-protection-notice-call"]} (자산보호 접수 안내)`,
    body: "[자산보호] 보관 조치 접수 안내\n수사 종료 시까지 자산 보관 신청이 필요합니다.\n아래에서 보관 신청서를 작성해 주세요.",
    linkDisplayText: "자산 보관 신청서 작성하기",
    fakeLandingId: "asset-custody-apply",
    linkAddress: "asset-custody-desk.invalid/apply/Hc3v",
    afterScammerTurns: 3,
    announceInstruction:
      "(참가자 휴대전화로 방금 자산 보관 신청 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크에서 보관 신청서를 작성해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 실제 주소를 읽어 주지 말고, 만날 장소·시간은 정하지도 묻지도 마라.)",
  },
];

const PROSECUTION_COOPERATION_CALL: InCallSmsItem[] = [
  {
    smsId: "prosecution-case-link",
    kind: "link",
    senderLabel: `${SMS_SENDER_NUMBER["prosecution-cooperation-call"]} (사건조회 안내)`,
    body: "[사건조회] 본인 관련 사건이 접수되어 있습니다.\n아래에서 본인 확인 후 사건 기록을 열람해 주세요.\n열람 내용은 외부에 알리지 마십시오.",
    linkDisplayText: "사건 기록 열람하기",
    fakeLandingId: "case-record-view",
    linkAddress: "case-view-center.invalid/case/Qe7r",
    afterScammerTurns: 2,
    announceInstruction:
      "(참가자 휴대전화로 방금 사건 조회 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크에서 본인 확인 후 사건 기록을 직접 확인해 보라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 실제 주소·사건번호를 읽어 주지 마라.)",
  },
  // ⭐ §98(2026-10-21 사용자 실기 신고) — 검찰 고급 fv-c8wq의 transfer 슬롯. 코인으로 바꾼 자산을 보낼 "검수 전용 보관 지갑" 안내 + 이체형 모의 화면.
  // ⛔ 지갑 번호는 실제 지갑 주소 형식이 아닌 모의 표기(영문 · 숫자 4자 묶음 — 8자리+ 연속 숫자 0) · 거래소 · 코인 종류 0(§81).
  // afterScammerTurns=6: 이 시나리오의 2와 겹치지 않는 값(발송 시점은 변형 선언 notBeforeUserTurns가 정한다).
  {
    smsId: "prosecution-wallet-link",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["prosecution-cooperation-call"]} (자산검수 안내)`,
    body: "[자산검수] 검수 전용 보관 지갑 안내\n보관 지갑 번호: KW-7Q2X-4471\n검수가 끝나면 전액 반환됩니다.\n아래에서 보관 지갑 전송을 진행해 주세요.\n외부에 알리지 마십시오.",
    linkDisplayText: "보관 지갑 전송 진행하기",
    fakeLandingId: "asset-check-wallet",
    linkAddress: "asset-check-wallet.invalid/send/Wk4p",
    afterScammerTurns: 6,
    announceInstruction:
      "(참가자 휴대전화로 방금 검수 전용 보관 지갑 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 코인으로 바꾼 금액을 문자 속 링크 화면에서 보관 지갑으로 전송해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 지갑 번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)",
  },
  // ⭐ §101(2026-10-21 사용자 요청) — 검찰 고급 fv-h3vn의 transfer 슬롯. 문자는 사이트로 보내기만 하고, 전환 · 이체는 모의 사이트(`asset-check-site`)에서
  // 참가자가 직접 누른다(지갑 번호도 사이트 마지막 화면이 원천 — 문자 · 통화에는 0). ⛔ 거래소 · 코인 종류 · 실제 주소 형식 0(§81).
  // afterScammerTurns=7: 이 시나리오의 2 · 6과 겹치지 않는 값(발송 시점은 변형 선언 notBeforeUserTurns가 정한다).
  {
    smsId: "prosecution-asset-site-link",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["prosecution-cooperation-call"]} (자산검수 안내)`,
    body: "[자산검수] 사건 관련 자산 검수 안내\n검수 대상 자산은 안전 자산으로 전환해 보관하셔야 합니다.\n아래 사이트에서 본인 확인 후 화면 안내대로 진행해 주세요.\n검수가 끝나면 전액 반환됩니다.\n외부에 알리지 마십시오.",
    linkDisplayText: "자산 검수 진행하기",
    fakeLandingId: "asset-check-site",
    linkAddress: "asset-review-desk.invalid/check/Rv5m",
    afterScammerTurns: 7,
    announceInstruction:
      "(참가자 휴대전화로 방금 자산 검수 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 들어가 본인 확인부터 하고 화면 안내대로 진행해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 화면의 순서·버튼·금액을 대신 불러 주지 말고, 실제 주소를 읽어 주지도 마라.)",
  },
];

const INSTITUTIONAL_IMPERSONATION: InCallSmsItem[] = [
  {
    smsId: "institution-otp",
    kind: "otp",
    senderLabel: `${SMS_SENDER_NUMBER["institutional-impersonation"]} (본인확인 안내)`,
    body: "[본인확인] 인증번호 [048231]\n타인에게 절대 알려주지 마세요. 유출 시 금전 피해가 발생할 수 있습니다.",
    otpCode: "048231",
    afterScammerTurns: 3,
    announceInstruction:
      "(참가자 휴대전화로 방금 6자리 인증번호 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 그 번호를 불러 달라고 요구하라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. **번호를 네가 지어내서 말하지 마라** — 참가자가 화면에서 읽어 불러주게 해야 한다.)",
  },
  {
    smsId: "institution-safe-account",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["institutional-impersonation"]} (자산보호 안내)`,
    // §51(사용자 라이브 신고 — §45 ⓐ 미집행) — 기존 4줄은 한 글자도 지우지 않고 예고 1줄을
    // 더했다(D-59 관례). 새 4번째 줄이 아래 `fakeLandingId`가 여는 이체 랜딩(UX-023
    // safe-account-transfer)을 예고한다.
    body: "[자산보호절차] 임시 안전계좌 안내\n예금주: 국민안전지원센터\nOO은행 210-3391-5540-08\n아래에서 안전계좌 이체를 진행해 주세요.\n이체 후 담당자에게 바로 알려 주세요.",
    // §51.6 R10 — 기존 account 항목에 링크 필드를 병기한다(신규 항목 신설 0건, G245 — 도착 턴
    // 그대로 6 유지).
    linkDisplayText: "안전계좌 이체 진행하기",
    fakeLandingId: "safe-account-transfer",
    linkAddress: "jasan-boho-center.invalid/transfer/a7Kq",
    afterScammerTurns: 6,
    announceInstruction:
      '(참가자 휴대전화로 방금 안전계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 이체를 진행해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)',
  },
];

const CARD_COMPANY_IMPERSONATION: InCallSmsItem[] = [
  {
    smsId: "card-otp",
    kind: "otp",
    senderLabel: `${SMS_SENDER_NUMBER["card-company-impersonation"]} (카드 승인취소 인증)`,
    body: "[승인취소] 인증번호 [739104]\n본인 외 타인에게 알려주지 마세요. 상담원도 요구하지 않습니다.",
    otpCode: "739104",
    afterScammerTurns: 3,
    announceInstruction:
      "(참가자 휴대전화로 방금 6자리 인증번호 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 결제 취소 처리를 위해 그 번호를 불러 달라고 요구하라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. **번호를 네가 지어내서 말하지 마라** — 참가자가 화면에서 읽어 불러주게 해야 한다.)",
  },
  // §51(§51.3 F1 해소의 후속 — card-company-impersonation.prompt.ts:53 계좌 확인형 교체와 짝) —
  // 이 시나리오 최초의 계좌 문자. afterScammerTurns=5: ⛔ 4가 아니다(이 시나리오의 확인 게이트
  // availableAfterScammerTurns가 4라 큐가 충돌한다 — E2, verifyIntercept.ts 계열 값) · ⛔ 3도
  // 아니다(위 card-otp가 이미 3을 쓴다 — 시나리오 내 중복 금지).
  {
    smsId: "card-relief-account",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["card-company-impersonation"]} (피해금 이관 안내)`,
    body: "[승인취소 지원] 피해금 이관 전용 계좌 안내\n예금주: 카드피해대응지원센터\nOO은행 417-0625-3082-19\n금액: 2,340,000원\n아래에서 피해금 이관을 진행해 주세요.",
    linkDisplayText: "피해금 이관 진행하기",
    fakeLandingId: "card-relief-transfer",
    linkAddress: "card-relief-desk.invalid/move/R3xp",
    afterScammerTurns: 5,
    announceInstruction:
      '(참가자 휴대전화로 방금 피해금 이관 계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 이관을 마쳐 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)',
  },
  // ⭐ T194-c-1(docs/Architecture.md §84.5.2 · §84.16.2 · DECISIONS #192) — **자가 훈련 고급** card-company 신규 변형의 `link` 슬롯 문자(Q2).
  // 챌린지 고급(`fv-akj5` 무변경 · 문자 선언 0)은 이 문자를 선언하지 않는다. afterScammerTurns=2: 이 시나리오의 3 · 5와 겹치지 않는다.
  {
    smsId: "card-guard-app-link",
    kind: "link",
    senderLabel: `${SMS_SENDER_NUMBER["card-company-impersonation"]} (카드 명의보호 안내)`,
    body: "[명의도용 피해예방] 다른 결제로 번지지 않게 보호 조치가 필요합니다.\n아래에서 피해 차단용 보안 앱을 설치해 주세요.",
    linkDisplayText: "피해 차단용 보안 앱 설치하기",
    fakeLandingId: "card-guard-app-install",
    linkAddress: "card-guard-check.invalid/guard/Kt2m",
    afterScammerTurns: 2,
    announceInstruction:
      "(참가자 휴대전화로 방금 보안 앱 설치 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 앱 설치를 진행해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 실제 주소를 읽어 주지 말고, 설치 방법·권한 설정은 설명하지 마라.)",
  },
];

const TAX_REFUND_SCAM: InCallSmsItem[] = [
  {
    smsId: "tax-refund-link",
    kind: "link",
    senderLabel: `${SMS_SENDER_NUMBER["tax-refund-scam"]} (환급금 안내)`,
    body: "[환급안내] 미수령 환급금 조회 결과가 있습니다.\n아래에서 계좌를 등록하시면 당일 지급됩니다.",
    linkDisplayText: "환급금 수령 계좌 등록하기",
    fakeLandingId: "tax-refund-claim",
    linkAddress: "refund-pay-center.invalid/claim/Tq8n",
    afterScammerTurns: 3,
    announceInstruction:
      "(참가자 휴대전화로 방금 환급금 조회 링크 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 그 링크를 눌러 계좌를 등록해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 실제 주소를 읽어 주지 말고 문자 속 링크를 누르라고만 하라.)",
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
    senderLabel: `${SMS_SENDER_NUMBER["reputation-blackmail-scam"]}`,
    body: "예금주: 김민재\nOO은행 352-0812-4471-63\n금액: 3,000,000원\n오늘 안에 입금 확인되면 정리됩니다.",
    // afterScammerTurns=3 — 이 시나리오는 "5~8턴 내외"로 마무리되도록 지시받아(prompt.ts 진행
    // 방식) 기존 최빈값 3과 맞춘다(`:49`·`:73`·`:95`·`:109` 참고).
    afterScammerTurns: 3,
    announceInstruction:
      '(참가자 휴대전화로 방금 계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 오늘 안에 넣으라는 말을 한두 문장으로 차갑게 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호·금액을 새로 지어내 말하지 말고, 문자를 보냈다는 사실과 입금 기한만 말하라.)',
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
    senderLabel: `${SMS_SENDER_NUMBER["bank-security-verify-scam"]} (계좌보호 안내)`,
    body: "[금융사고대응] 보호계좌 이체 안내\n예금주: 계좌보호대응센터\nOO은행 100-2043-7788-21\n금액: 4,120,000원\n아래에서 보호계좌로 옮기기를 진행해 주세요.",
    linkDisplayText: "보호계좌 이체 진행하기",
    fakeLandingId: "protect-account-transfer",
    linkAddress: "acct-protect-desk.invalid/shield/Bq4t",
    afterScammerTurns: 3,
    announceInstruction:
      '(참가자 휴대전화로 방금 보호계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 옮기기를 마쳐 달라는 말을 한두 문장으로 침착하게 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)',
  },
];

const COURIER_CUSTOMS_SCAM: InCallSmsItem[] = [
  {
    smsId: "courier-customs-link",
    kind: "link",
    senderLabel: `${SMS_SENDER_NUMBER["courier-customs-scam"]} (통관 안내)`,
    body: "[통관보류] 수취인 정보 불일치로 통관이 보류되었습니다.\n아래에서 정보를 확인해 주세요.",
    linkDisplayText: "통관 정보 확인하기",
    fakeLandingId: "courier-customs-check",
    linkAddress: "customs-check-desk.invalid/check/Hv5r",
    afterScammerTurns: 2,
    announceInstruction:
      "(참가자 휴대전화로 방금 통관 확인 링크 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 그 링크를 눌러 수취인 정보를 확인해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 실제 주소를 읽어 주지 말고 문자 속 링크를 누르라고만 하라.)",
  },
  {
    smsId: "courier-customs-fee",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["courier-customs-scam"]} (통관 안내)`,
    body: "[통관수수료] 납부 계좌 안내\n예금주: 국제통관지원센터\nOO은행 604-2270-1183-91\n금액: 78,000원",
    afterScammerTurns: 5,
    announceInstruction:
      "(참가자 휴대전화로 방금 통관수수료 계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 오늘 안에 넣어 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호를 새로 지어내 말하지 말고 문자를 보라고만 하라.)",
  },
  // §122(DECISIONS #237) — 택배 통관 고급 ② 명의 도용 이관형(fv-y3ks) 전용. 화면 없이 계좌 문자만(courier-customs-fee와 같은 모양).
  // afterScammerTurns=7: 이 시나리오의 2 · 5와 겹치지 않는 값(발송 시점은 변형 선언 notBeforeUserTurns가 정한다).
  {
    smsId: "courier-safe-account",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["courier-customs-scam"]} (자산 보호 안내)`,
    body: "[명의도용 피해조치] 국가 안전계좌 안내\n예금주: 자산보호관리센터\nOO은행 604-2270-1183-91\n수사 종료 시까지 보관 후 반환됩니다.",
    afterScammerTurns: 7,
    announceInstruction:
      "(참가자 휴대전화로 방금 국가 안전계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 수사가 끝날 때까지 그 계좌로 옮겨 두라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호를 새로 지어내 말하지 말고 문자를 보라고만 하라.)",
  },
];

/**
 * 시나리오별 통화 중 문자 카탈로그. **카탈로그가 없는 시나리오는 이 기능이 아예 켜지지 않는다**
 * (프롬프트의 조건형 문구도 함께 꺼져 기존 동작이 한 글자도 바뀌지 않는다 — 회귀 0).
 *
 * 메신저 채널 시나리오는 의도적으로 비워 둔다 — 이미 메시지 표면 안이라 "통화를 유지한 채 문자를
 * 본다"는 문제 자체가 없다(UX.md UX-022 v1.11 갱신).
 */
// ⚠️ 계좌 문자 본문 규칙(Architecture §81.6) — 계좌는 "OO은행 ###-####-####-##"(자리표시자 + 3-4-4-2 형식) 한 줄로 쓴다.
// `shared/fictionalBank.ts` `extractAccountNumber`가 이 형식으로 세션 계좌를 뽑아 프롬프트·문자 문서(`accountNumber`)에 쓴다 —
// 형식이 바뀌면 조용히 예시 계좌로 돌아가 대사와 문자가 다시 갈린다(테스트 `fictionalBank.test.ts` [계좌]가 잡는다).
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
  // T194-c-1(§84.5.2) — 카탈로그 신설(이 시나리오 첫 항목 · Q2 설치 문자).
  "card-delivery-call": CARD_DELIVERY_CALL,
  // §92.3(DECISIONS #206) — 고급 전용 2종 카탈로그 신설(각 1건 · `link` → `credential-form`).
  "asset-protection-notice-call": ASSET_PROTECTION_NOTICE_CALL,
  "prosecution-cooperation-call": PROSECUTION_COOPERATION_CALL,
};

// ── §59.6/§59.10 커밋 B — 모델 도구 경로의 거절 지시(서버 소유, G386) ─────────────────
// ⚠️ 이 두 상수는 `deliverInCallSms`의 `trigger:"model_tool"` 경로에서만 쓰인다(§59.7 하한
// 재검증 신규). 오늘은 그 트리거를 보내는 클라가 없어(§59 커밋 C 이전) **어떤 응답에도 실리지
// 않는다**(회귀 0) — 정본 문구는 `docs/Architecture.md` §59.6이 이미 확정해 둔 것을 그대로 옮긴다.
// ⏳ T191 S4(2026-10-18 · AC-100 (a)③ · 설계 §2.5 A4) — `SMS_DECLINE_ALREADY`만 바꿨다: 옛 문면의
// *"이미 보낸 문자를 확인해 달라고 하거나"* 가 같은 문자 언급의 반복을 허용했다(원인 R4). ⚠️ §59.6 인용문은
// 아직 옛 문면이다 — 문서 동기화는 docs 단계 몫. 같은 이유로 위 카탈로그 announce 5건의 "재촉하라"·"다급하게"를
// "사실을 알리고 상대의 반응을 기다려라"로 바꿨다(인증번호 2건과 `buildOtpCheckInstruction`은 무변경).
export const SMS_DECLINE_TOO_EARLY =
  "(아직 그 안내를 보낼 단계가 아니다. 문자를 보냈다고 말하지 말고, 지금 하던 이야기를 그대로 이어가라. 조금 뒤에 다시 시도해도 된다.)";
export const SMS_DECLINE_ALREADY =
  "(그 안내는 이미 보냈다. 새로 보냈다고 말하지 말고, 이미 보낸 문자를 다시 언급하지도 말고 하던 요구 흐름을 이어가라.)";

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
 * 인증번호 대조 **결과** 지시(2026-10-18 사용자 신고 → #300 회귀 수정, Architecture §78).
 *
 * #300은 실제 번호와 대조 규칙을 모델에 줬다가 두 가지 회귀를 냈다(scenario-review R8 재현, 텍스트 폴백·고급·기관 사칭
 * 커밋당 7세션): ① 계좌 문자 도착 뒤에도 인증번호만 다시 요구 — 세션 0/7 → 6/7 ② 모델이 번호를 먼저 말함 — 0/7 → 3/7.
 * ⇒ **서버가 대조하고 결과만 그 턴에 준다.** 이 문자열에는 번호(정답)도, 참가자가 부른 숫자도 들어가지 않는다 —
 * 번호 유출이 구조적으로 불가능하다. "다음 단계로 넘어가지 말라" 같은 진행 차단 표현도 넣지 않는다(고착 원인 후보).
 */
export function buildOtpCompareInstruction(result: "match" | "mismatch", options: { repeat?: boolean } = {}): string {
  // ⚠️ 2026-10-18 라이브 재현(Architecture §80) — 종전 "(참고 — … 다르다 …)" 문면은 지시가 실렸는데도 Gemini가
  // "인증번호 확인했습니다"로 넘어갔다(실호출 3/3). 같은 조건에서 아래 문면은 3/3 "번호가 안 맞는데요…"로 되물었다.
  // 핵심은 ① "서버 확인 결과"로 판정 주체를 밝히고 ② "확인했습니다"를 명시적으로 금지하고 ③ 첫 문장을 지정한 것.
  // ⛔ 진행 차단 표현("다음 단계로 넘어가지 말고")은 여전히 넣지 않는다(#300 회귀 원인 후보 — 이 지시는 그 턴 1회뿐이다).
  // ⚠️ 재시도(두 번째 이후 불일치, QA §80) — 한 번 되물은 뒤 참가자가 **다른** 번호를 부르면 모델은 위 mismatch 문면을 무시하고
  // "확인됐습니다"로 넘겼다(실호출 0/4). "이번에도 다르다 · 새로 불렀다고 맞는 것이 아니다"를 명시한 문면은 4/4 다시 되물었다.
  if (result === "mismatch" && options.repeat) {
    return '(⚠️ 서버 확인 결과 — 상대가 이번에 다시 불러 준 번호도 문자 속 인증번호와 다르다(두 번째 이후 불일치). 번호를 새로 불렀다고 해서 맞는 것이 아니다. 이번 답변에서 "확인했습니다"·"확인됐습니다"·"확인 완료"라고 말하지 마라. 첫 문장에서 이번 번호도 맞지 않는다고 말하고, 번호를 말하거나 힌트를 주지 말고 문자를 다시 보고 불러 달라고 요구한다 — 예: "이번에도 인증번호가 안 맞는데요, 문자를 다시 보시고 불러 주세요.")';
  }
  return result === "match"
    ? "(서버 확인 결과 — 상대가 방금 불러 준 번호는 문자 속 인증번호와 일치한다. 확인됐다고 짧게 말하고 시나리오의 다음 단계로 이어 간다. 번호를 되읽지 않는다.)"
    : '(⚠️ 서버 확인 결과 — 상대가 방금 불러 준 번호는 문자 속 인증번호와 다르다. 이번 답변에서 "확인했습니다"·"확인됐습니다"라고 말하지 마라. 첫 문장에서 인증번호가 맞지 않는다고 말하고, 번호를 말하거나 힌트를 주지 말고 문자를 다시 보고 불러 달라고 한 번만 요구한다 — 예: "인증번호가 안 맞는데요, 문자 다시 확인해서 불러 주세요.")';
}

/**
 * ⭐ §101 추가(2026-10-21 사용자 실기 신고 *"인증번호 다르게 이야기해도 확인되었다고 넘어가는데?"* — Architecture §78.4의 (L1)을 바꾼다) —
 * **실시간(Live) 경로 전용** 대조 1줄. Live는 서버가 참가자 발화를 실시간으로 보지 못해 텍스트 폴백의 서버 대조(`roleplay/otpCheck.ts`)를 못 쓴다
 * ⇒ 문자 도착 응답(`buildInCallSmsResponse` — 맥락 주입 · 도구 결과)에 정답을 **한 번만** 싣고 모델이 직접 비교하게 한다.
 * ⛔ 정답을 먼저 말하거나 힌트를 주지 말 것을 첫 문장에 둔다(§78 — 텍스트 폴백에서 매 턴 정답을 실었을 때 모델이 번호를 먼저 말한 3/7).
 * ⛔ 텍스트 폴백(`roleplay/index.ts` `turnInstruction`)은 이 함수를 쓰지 않는다 — 그쪽은 서버 대조가 그대로다.
 */
export function buildOtpLiveCompareLine(otpCode: string): string {
  const spelled = otpCode.split("").join(" ");
  return `(⚠️ 대조용 — 이 문자 속 인증번호는 ${spelled}이다. 이 번호를 네가 먼저 말하거나 일부라도 알려 주지 마라. 상대가 번호를 불러 주면 이 번호와 한 자리씩 비교해 모두 같을 때만 확인됐다고 하고 다음 단계로 넘어간다. 하나라도 다르면 "확인했습니다"·"확인됐습니다"라고 말하지 말고, 첫 문장에서 번호가 맞지 않는다고 말한 뒤 문자를 다시 보고 불러 달라고 한다 — 예: "번호가 다르네요, 문자 다시 확인해서 불러 주세요." 두 번 넘게 계속 다르면 불이익을 한 번 암시하고 인증번호 없이 다음 단계로 넘어간다.)`;
}

/** 이 시나리오의 인증번호 문자 항목(`kind==="otp"` · `otpCode` 있음). 없으면 빈 배열. */
export function listOtpItems(scenarioId: string): InCallSmsItem[] {
  return (IN_CALL_SMS[scenarioId] ?? []).filter((item) => item.kind === "otp" && Boolean(item.otpCode));
}
