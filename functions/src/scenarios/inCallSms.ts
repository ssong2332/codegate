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

import { CARD_FAKE_CALLBACK_NUMBER_ID, dialNumberOf } from "./dialDirectory";
import { CARD_REBUILD_NAMES } from "./fictionalNames";

// §142 — `callback` = 전화번호를 안내하는 문자(번호를 누르면 앱 안 다이얼 화면이 그 번호로 채워진다 · `dialNumberId` 필수 · 링크 · 인증번호 0).
export type InCallSmsKind = "account" | "link" | "otp" | "callback";

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
  /** §142 — `kind === "callback"`일 때만. 본문 속 번호의 번호부 id(`dialDirectory.ts`). 그 항목의 `number`가 본문에 그대로 있어야 한다(테스트 고정). */
  dialNumberId?: string;
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
  // 2026-11-07(앱 밖 행동 유도 제거 · 사용자 결정 "앱 안 화면 추가") — 납치 협박 고급의 계좌 문자. 협박범 = 인터넷전화 070(위 규칙 · 국번 첫 자리 0).
  "kidnapping-threat": "070-0457-2618",
};

// ⭐ 2026-11-07(카드사 고급 R1 축소 · 메인 지시 "문자 발신처 분리") — R1(fv-k3dn) 문자 3통은 **보낸 곳마다 다른 번호**이고 발신 표시는 **번호만**이다.
// 근거: 저장되지 않은 번호는 실제 휴대폰 문자함에서 이름 없이 번호만 보인다 · 실제로 보낸 쪽(배송 대행 · 가짜 고객센터 · 자산보호 안내)이 다르다.
// 종전에는 셋 다 `02-0762-4180 (윤슬카드 …)`라 한 대화방에 묶였다. ⛔ 위 §104.10 표(시나리오 고정 번호)와 이 표 밖 문자의 발신 표시는 무변경.
// 클라 계약: 문자함 대화방은 `senderLabel`의 번호로 나눈다(이 세 문자는 senderLabel = 번호 그대로).
// | smsId | 보낸 곳 | 번호 | 근거 |
// |---|---|---|---|
// | `card-callback-number` | 카드 배송 대행(배송원 레그) | 02-0767-3051 | 새 가상 번호(국번 첫 자리 0 · 다른 표와 중복 0) |
// | `card-remote-support-link` | 가짜 고객센터(상담원 레그) | 02-0762-5513 | 참가자가 방금 건 그 고객센터 번호(번호부 `card-fake-callback`) — 그 번호에서 문자가 온다 |
// | `card-safe-account` | 자산보호 안내(검사 레그) | 070-0462-1593 | 새 가상 인터넷전화 번호(사기 문자 발신에 흔한 070 · 검찰청 대표번호와 다른 번호) |
export const CARD_R1_SMS_SENDER: Readonly<Record<string, string>> = {
  "card-callback-number": "02-0767-3051",
  "card-remote-support-link": dialNumberOf("card-company-impersonation", CARD_FAKE_CALLBACK_NUMBER_ID),
  "card-safe-account": "070-0462-1593",
};

/**
 * ⭐ PR-B(2026-11-07 · 기관 사칭 고급 3통화) — 시나리오 고정 번호(§104.10 표) 밖 발신처. 대출 실행 입금 안내는 사기범이 아니라 가상 캐피탈이 보낸다
 * (사기범 번호와 같은 대화방에 묶이지 않게 · 저장 안 된 번호는 번호만 — 위 R1 표와 같은 규칙). 번호 = 대출 확인 상담원 번호(`flowVariants.ts` 통화 2).
 */
export const INSTITUTION_LOAN_SMS_SENDER: Readonly<Record<string, string>> = {
  "institution-loan-disbursed": "02-0719-3300",
};

const LOAN_SCAM: InCallSmsItem[] = [
  {
    smsId: "loan-account",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["loan-refinance-scam"]} (○○캐피탈 상담센터)`,
    // A-1 ③(2026-10-19 · audit-A R1 ②) — 마지막 줄 "입금 확인 즉시 전환 승인 처리됩니다. (오늘 18시 마감)"이 "입금 확인을
    // 기다리는" 구도를 깔아 사기범이 "확인 중·기다려 주세요"로 버티는 재료가 됐다 → 마감만 남긴 요구 문장으로 바꿨다(계좌·금액 무변경).
    body: "[○○캐피탈] 저금리 전환 상환 전용 계좌 안내\n예금주: 윤재석\nOO은행 352-0812-4471-63\n금액: 1,850,000원\n오늘 18시까지 입금해 주세요.\n아래 링크에서 바로 이체할 수 있습니다.",
    // ⭐ P2(X6 · 2026-10-31) — 계좌만 있던 문자에 훈련용 이체 화면 링크를 병기했다(참가자가 실제 뱅킹 앱을 열 이유를 없앤다 · 계좌 · 금액 무변경).
    linkDisplayText: "상환금 이체하기",
    fakeLandingId: "loan-repay-transfer",
    linkAddress: "loan-repay-send.invalid/send/Rp4k",
    afterScammerTurns: 3,
    announceInstruction:
      "(참가자 휴대전화로 방금 상환 전용 계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 상환금 이체를 마쳐 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)",
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
  // §125(DECISIONS #240) — 자산 보호 고급 ② 공탁금 이체형(fv-p3jx) 전용. 화면 없이 계좌 문자만(courier-customs-fee와 같은 모양).
  // afterScammerTurns=5: 이 시나리오의 3과 겹치지 않는 값(발송 시점은 변형 선언 notBeforeUserTurns가 정한다).
  {
    smsId: "asset-deposit-account",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["asset-protection-notice-call"]} (공탁금 안내)`,
    body: "[자산보호] 약식 처리 공탁금 안내\n예금주: 서지원\nOO은행 519-3306-7420-85\n금액: 5,000,000원\n수사 종료 후 전액 반환됩니다.\n아래 링크에서 바로 이체할 수 있습니다.",
    // ⭐ P2(X6 · 2026-10-31) — 계좌만 있던 문자에 훈련용 이체 화면 링크를 병기했다(계좌 무변경). P2-d — 금액 줄(500만 원)을 더해 사기범 말 · 문자 · 화면 금액을 맞췄다.
    linkDisplayText: "공탁금 이체하기",
    fakeLandingId: "asset-deposit-transfer",
    linkAddress: "deposit-send-link.invalid/send/Dp7w",
    afterScammerTurns: 5,
    announceInstruction:
      "(참가자 휴대전화로 방금 공탁금 계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 약식 처리를 위해 문자 속 링크로 공탁금을 넣어 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호를 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)",
  },
  // ⭐ 2026-11-07(사용자 결정 D-G1 "자산 보호까지 함께") — 자산 보호 고급 금형(fv-t8ga) 결말. 보관 신청서 뒤 사기범이 도구로 보내고, 링크가 앱 안 가상 금 거래소
  // 주문 화면(`asset-gold-buy`)을 연다(기관 고급 `institution-gold-shop`과 같은 거래소 · 다른 화면 — 화면 id는 전역 유일). afterScammerTurns=6(이 시나리오 3 · 5와 겹치지 않음).
  {
    smsId: "asset-gold-shop",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["asset-protection-notice-call"]} (자산보관 안내)`,
    body: "[자산보호] 실물 보관 안내\n보관 대상 자산은 아래 지정 거래소에서 금 실물로 주문해 주세요.\n주문이 끝나면 담당 직원이 실물을 확인합니다.\n수사 종료 후 전액 반환됩니다.\n외부에 알리지 마십시오.",
    linkDisplayText: "보관용 금 실물 주문하기",
    fakeLandingId: "asset-gold-buy",
    linkAddress: "haedam-gold-order.invalid/order/Gd4n",
    afterScammerTurns: 6,
    announceInstruction:
      "(참가자 휴대전화로 방금 지정 거래소 금 실물 주문 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크의 거래소 화면에서 보관할 자산만큼 금 실물을 주문해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 거래소 이름 · 금액 · 중량을 지어내 말하지 말고, 은행 창구나 금은방 같은 다른 곳에서 사라고 하지 말고, 실제 주소를 읽어 주지도 마라.)",
  },
  // ⭐ 2026-11-07(사용자 결정 D-G1 · D-G2 E1-b "문자 링크 → 내 은행 화면") — 자산 보호 고급 현금형(fv-k9ra) 결말. 보관 신청서 뒤 사기범이 도구로 보내고, 링크가
  // 내 은행 앱 머리띠의 현금 · 수표 출금 예약 화면(`asset-cash-withdraw`)을 연다(문진표 · 생체 인증 · 예약 번호). ⚠️ 현실과 다름: 실제 피해자는 자기 은행 앱 · 창구로
  // 간다(문자 링크 0) — 앱 밖으로 나가지 않게 하는 대가(사용자 결정). 목적 `transfer` ↔ 종류 `account`(계좌 줄 없음 — 금 · 상품권 문자와 같은 선례).
  // afterScammerTurns=7(이 시나리오 3 · 5 · 6과 겹치지 않음).
  {
    smsId: "asset-cash-reserve",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["asset-protection-notice-call"]} (자산보관 안내)`,
    body: "[자산보호] 보관 자산 출금 예약 안내\n보관 대상 예금은 아래에서 거래 은행 출금 예약을 해 주세요.\n예약이 끝나면 담당 직원이 따로 연락드립니다.\n수사 종료 후 전액 반환됩니다.\n외부에 알리지 마십시오.",
    linkDisplayText: "보관 자산 출금 예약하기",
    fakeLandingId: "asset-cash-withdraw",
    linkAddress: "custody-reserve.invalid/reserve/Kb7q",
    afterScammerTurns: 7,
    announceInstruction:
      "(참가자 휴대전화로 방금 거래 은행 출금 예약 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크의 은행 화면에서 보관할 예금의 출금 예약을 해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 은행 이름 · 금액을 지어내 말하지 말고, 은행 창구 같은 다른 곳에서 따로 하라고 하지 말고, 실제 주소를 읽어 주지도 마라.)",
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
  // ⭐ 2026-11-07(Edge 시험 판 12 — 검찰 고급 상품권형 fv-v2mk가 "문화상품권을 구매하신 뒤 핀 번호를 불러 주시면"으로 앱 밖 구매를 요구 · 사용자 결정
  // "앱 안 화면 추가") — 상품권 구매 안내 문자. 링크는 가상 판매처의 구매 화면(`voucher-purchase` — 권종 · 수량 → 결제 확인 → 결제 인증 → 핀 번호 표시)을 연다.
  // ⛔ 실제 상품권 브랜드 · 판매처 · 핀 번호 0(핀은 화면이 만든다 — 서버 · 문자 · 통화에는 없다). afterScammerTurns=8: 이 시나리오의 2 · 6 · 7과 겹치지 않는 값.
  {
    smsId: "prosecution-voucher-link",
    // 목적 `transfer`(결정 화면) ↔ 종류 `account` 짝 규칙(flowVariants.test) — 계좌 줄 없는 `account`는 자산 검수 사이트 문자와 같은 선례다.
    // 화면 행동 판정은 이 종류가 아니라 랜딩으로 "입력 화면"이 된다(`screenAction.ts` `screenKindOf` — 상품권 구매 화면 행).
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["prosecution-cooperation-call"]} (자금검수 안내)`,
    body: "[자금검수] 검수번호 발급 안내\n검수 대상 자금은 아래 판매처에서 상품권으로 구매해 주세요.\n구매 후 화면에 표시되는 핀 번호를 담당 수사관에게 알려 주시면 검수번호로 등록됩니다.\n검수가 끝나면 전액 반환됩니다.\n외부에 알리지 마십시오.",
    linkDisplayText: "검수용 상품권 구매하기",
    fakeLandingId: "voucher-purchase",
    linkAddress: "hanol-gift-shop.invalid/buy/Gv3k",
    afterScammerTurns: 8,
    announceInstruction:
      "(참가자 휴대전화로 방금 자금 검수용 상품권 구매 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크의 판매처 화면에서 상품권을 사고 화면에 뜬 핀 번호를 불러 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 핀 번호 · 금액을 지어내 말하지 말고, 편의점이나 다른 곳에서 사라고 하지 말고, 실제 주소를 읽어 주지도 마라.)",
  },
];

const INSTITUTIONAL_IMPERSONATION: InCallSmsItem[] = [
  // ⭐ 2026-11-07(Edge 재시험 2 S7 · 사용자 결정 D-G1 ~ D-G6 "앱 안 화면으로 바꾸기") — 기관 고급 금 구매형(fv-g2ld) 결말. 인증번호 뒤 사기범이 도구로 보내고,
  // 링크가 앱 안 가상 금 거래소 구매 화면(`gold-buy`)을 연다. 목적 `transfer` ↔ 종류 `account`(계좌 줄 없음 — 상품권 구매 문자와 같은 선례).
  // ⛔ 실제 금 거래소 · 판매점 이름 0(가상 "해담골드" — 웹 검색 2026-11-07 일치 0) · 금액 · 중량 줄 0(참가자가 화면에서 고른다 · G138).
  // afterScammerTurns=8: 이 시나리오의 3 · 6 · 7 · 9 · 11 · 2와 겹치지 않는 값(발송 시점은 변형 선언이 정한다).
  {
    smsId: "institution-gold-shop",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["institutional-impersonation"]} (자산검수 안내)`,
    body: "[자산검수] 실물 자산 검수 안내\n검수 대상 예금은 아래 지정 거래소에서 골드바로 구매해 주세요.\n구매가 끝나면 담당 직원이 실물을 확인합니다.\n검수가 끝나면 전액 반환됩니다.\n외부에 알리지 마십시오.",
    linkDisplayText: "검수용 골드바 구매하기",
    fakeLandingId: "gold-buy",
    linkAddress: "haedam-gold.invalid/buy/Au7m",
    afterScammerTurns: 8,
    announceInstruction:
      "(참가자 휴대전화로 방금 지정 거래소 금 구매 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크의 거래소 화면에서 예금으로 골드바를 사 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 거래소 이름 · 금액 · 중량을 지어내 말하지 말고, 은행 창구나 금은방 같은 다른 곳에서 사라고 하지 말고, 실제 주소를 읽어 주지도 마라.)",
  },
  // ⭐ 2026-11-07(사용자 결정 D-G2 E1-b "문자 링크 → 내 은행 화면") — 기관 고급 현금 예탁형(fv-q7cn) 결말. 인증번호 뒤 사기범이 도구로 보내고, 링크가 내 은행 앱
  // 머리띠의 현금 · 수표 출금 예약 화면(`cash-withdraw`)을 연다. ⚠️ 현실과 다름(위 `asset-cash-reserve` 주석). afterScammerTurns=10(이 시나리오 2 · 3 · 6 · 7 · 8 · 9 · 11과 겹치지 않음).
  {
    smsId: "institution-cash-reserve",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["institutional-impersonation"]} (자산예탁 안내)`,
    body: "[자산예탁] 예탁금 출금 예약 안내\n예탁 대상 예금은 아래에서 거래 은행 출금 예약을 해 주세요.\n예약이 끝나면 담당 직원이 따로 연락드립니다.\n수사 종료 후 전액 반환됩니다.\n외부에 알리지 마십시오.",
    linkDisplayText: "예탁금 출금 예약하기",
    fakeLandingId: "cash-withdraw",
    linkAddress: "deposit-reserve.invalid/reserve/Ft2m",
    afterScammerTurns: 10,
    announceInstruction:
      "(참가자 휴대전화로 방금 거래 은행 출금 예약 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크의 은행 화면에서 예탁할 예금의 출금 예약을 해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 은행 이름 · 금액을 지어내 말하지 말고, 은행 창구 같은 다른 곳에서 따로 하라고 하지 말고, 실제 주소를 읽어 주지도 마라.)",
  },
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
    body: "[자산보호절차] 임시 안전계좌 안내\n예금주: 강태윤\nOO은행 210-3391-5540-08\n아래에서 안전계좌 이체를 진행해 주세요.\n이체 후 담당자에게 바로 알려 주세요.",
    // §51.6 R10 — 기존 account 항목에 링크 필드를 병기한다(신규 항목 신설 0건, G245 — 도착 턴
    // 그대로 6 유지).
    linkDisplayText: "안전계좌 이체 진행하기",
    fakeLandingId: "safe-account-transfer",
    linkAddress: "jasan-boho-center.invalid/transfer/a7Kq",
    afterScammerTurns: 6,
    announceInstruction:
      '(참가자 휴대전화로 방금 안전계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 이체를 진행해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)',
  },
  // ⭐ PR-A(2026-11-07 사용자 신고 *"이체 금액을 적게 보내도 그냥 넘어가는"* · 설계 docs/research/institution-advanced-loan-design-2026-11-07.md §1.2) —
  // 고급 전용 안전계좌 문자. 위 항목과 같은 계좌 · 같은 이체 화면에 **금액 줄**(980만 원 — 1회 이체 한도 안 · 사용자 결정 D-L6)을 더했다. 금액 줄이
  // 문서 `transferAmount`(요구액 판정표 R2의 원천)가 된다. 위 항목은 초급 · 중급 · 은퇴 변형(`fv-pgqt`)이 그대로 쓴다(바이트 무변경).
  {
    smsId: "institution-asset-safe-account",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["institutional-impersonation"]} (자산보호 안내)`,
    body: "[자산보호절차] 임시 안전계좌 안내\n예금주: 강태윤\nOO은행 210-3391-5540-08\n금액: 9,800,000원\n아래에서 안전계좌 이체를 진행해 주세요.\n이체 후 담당자에게 바로 알려 주세요.",
    linkDisplayText: "안전계좌 이체 진행하기",
    fakeLandingId: "safe-account-transfer",
    linkAddress: "jasan-boho-center.invalid/transfer/a7Kq",
    afterScammerTurns: 7,
    announceInstruction:
      "(참가자 휴대전화로 방금 안전계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 문자에 적힌 금액을 이체해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)",
  },
  // ⭐ PR-B(2026-11-07 · 사용자 결정 "앱 안 대출 체험" — docs/research/institution-advanced-loan-design-2026-11-07.md §6) — 기관 사칭 고급 3통화(fv-c5fj) 문자 3종.
  // | smsId | 언제 · 누가 | 여는 화면 |
  // |---|---|---|
  // | `institution-loan-guide` | 통화 1 · 검사가 도구로 보낸다 | `loan-apply` — 앱 안 비대면 대출 신청(본인 확인 → 한도 조회 → 신청 · 금액 · 용도는 화면 밖으로 나가지 않는다) |
  // | `institution-loan-disbursed` | 대출 실행 확인 결과 = 실행일 때 서버가 바로 보낸다(`recordLoanReview` — 게이트 밖 · 선언 밖) | 없음(입금 안내) |
  // | `institution-loan-safe-account` | 통화 3 · 실행일 때만 선언(`whenLoanReview`) · 검사가 도구로 보낸다 | `loan-safe-transfer` — 대출금 보관 계좌 이체 화면 |
  // ⛔ 금액 줄 0 — 대출 금액은 참가자가 화면에서 정한 값이라 서버가 모른다(G138). 이체 화면 요구액은 대사 · 같은 탭에 남은 신청 금액이 정한다.
  // ⛔ 실제 금융회사 이름 0 — "○○캐피탈"은 세션 가상 캐피탈명으로 바뀐다(§83).
  {
    smsId: "institution-loan-guide",
    kind: "link",
    senderLabel: `${SMS_SENDER_NUMBER["institutional-impersonation"]} (자산보호 안내)`,
    body: "[명의도용 입증 절차] 비대면 대출 신청 안내\n○○캐피탈 비대면 신용대출로 정상 거래 여부를 확인합니다.\n아래 링크에서 본인 확인 후 신청해 주세요.\n신청 후 담당자에게 바로 알려 주세요.",
    linkDisplayText: "비대면 대출 신청하기",
    fakeLandingId: "loan-apply",
    linkAddress: "credit-loan-apply.invalid/apply/R4tw",
    afterScammerTurns: 9,
    announceInstruction:
      "(참가자 휴대전화로 방금 대출 신청 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크에서 비대면 대출을 신청해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 금융회사 이름 · 금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)",
  },
  {
    smsId: "institution-loan-disbursed",
    kind: "callback",
    senderLabel: INSTITUTION_LOAN_SMS_SENDER["institution-loan-disbursed"]!,
    body: "[○○캐피탈] 신청하신 비대면 신용대출금이 고객님 명의 입출금 계좌로 입금되었습니다.\n대출 계약은 14일 안에 철회를 신청할 수 있습니다.\n문의 02-0719-3300",
    afterScammerTurns: 11,
    // 본문 속 번호 = 가상 캐피탈 대출센터(번호부 — 참가자가 걸면 진짜 안내 · 방어 종료).
    dialNumberId: "loan-capital-center",
    announceInstruction:
      "(참가자 휴대전화로 방금 금융회사의 대출금 입금 안내 문자가 도착했다. 이 문자는 네가 보낸 것이 아니다. 상대가 이 문자 이야기를 꺼내면, 상대의 말에 대답할 때 그 대답 안에서 한두 문장으로 받고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 금액 · 계좌번호를 새로 지어내 말하지 마라.)",
  },
  {
    smsId: "institution-loan-safe-account",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["institutional-impersonation"]} (자산보호 안내)`,
    body: "[자산보호절차] 대출금 보관 계좌 안내\n예금주: 노은채\nOO은행 318-0472-6619-05\n입금된 대출금 전액을 아래에서 이체해 주세요.\n이체 후 담당자에게 바로 알려 주세요.",
    linkDisplayText: "대출금 보관 이체 진행하기",
    fakeLandingId: "loan-safe-transfer",
    linkAddress: "loan-keep-account.invalid/transfer/Lp3d",
    afterScammerTurns: 2,
    announceInstruction:
      "(참가자 휴대전화로 방금 대출금 보관 계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 입금된 대출금을 그대로 옮겨 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호를 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)",
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
      "(참가자 휴대전화로 방금 6자리 인증번호 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 결제 취소 처리를 위해 그 번호를 불러 달라고 요구하라. 상대가 방금 의심하거나 거절하는 말을 했다면 문자 이야기보다 먼저 그 말에 답하고, 그다음에 번호를 요구하라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. **번호를 네가 지어내서 말하지 마라** — 참가자가 화면에서 읽어 불러주게 해야 한다.)",
  },
  // §51(§51.3 F1 해소의 후속 — card-company-impersonation.prompt.ts:53 계좌 확인형 교체와 짝) —
  // 이 시나리오 최초의 계좌 문자. afterScammerTurns=5: ⛔ 4가 아니다(이 시나리오의 확인 게이트
  // availableAfterScammerTurns가 4라 큐가 충돌한다 — E2, verifyIntercept.ts 계열 값) · ⛔ 3도
  // 아니다(위 card-otp가 이미 3을 쓴다 — 시나리오 내 중복 금지).
  {
    smsId: "card-relief-account",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["card-company-impersonation"]} (피해금 이관 안내)`,
    body: "[승인취소 지원] 피해금 이관 전용 계좌 안내\n예금주: 오현수\nOO은행 417-0625-3082-19\n금액: 2,340,000원\n아래에서 피해금 이관을 진행해 주세요.",
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
  // ⭐ §142(카드사 고급 재구성 · 다통화 변형 전용 — 레그 선언은 `flowVariants.ts`). afterScammerTurns는 발송 판정 입력이 아니다(위 타입 주석).
  // R2 시작 문자 — 세션이 이 문자가 도착한 화면에서 시작한다(게이트 밖 · 변형 `openerSmsId`). 출처: 조사 S7 · S18(카드 발급 문자 → 가짜 고객센터).
  {
    smsId: "card-issue-notice",
    kind: "callback",
    senderLabel: `${SMS_SENDER_NUMBER["card-company-impersonation"]} (${CARD_REBUILD_NAMES.cardCompany})`,
    body: `[${CARD_REBUILD_NAMES.cardCompany}] 신용카드 발급이 완료되었습니다.\n본인이 신청하지 않으셨다면 고객센터로 바로 연락 바랍니다.\n고객센터 02-0762-5513`,
    dialNumberId: CARD_FAKE_CALLBACK_NUMBER_ID,
    afterScammerTurns: 6,
    announceInstruction:
      "(참가자 휴대전화에 카드 발급 안내 문자가 와 있고, 참가자가 그 문자에 있던 고객센터로 직접 전화를 걸어 왔다. 상대의 말에 대답할 때 그 대답 안에서 전화를 받은 상담원으로 한두 문장 응대하고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 연락처 · 계좌번호 · 금액을 새로 지어내 말하지 마라.)",
  },
  // R1 배송원 레그 — 반송 처리용 가짜 대표번호(조사 S1 p.2 실제사례 · S8).
  {
    smsId: "card-callback-number",
    kind: "callback",
    senderLabel: CARD_R1_SMS_SENDER["card-callback-number"]!,
    body: `[${CARD_REBUILD_NAMES.cardCompany} 배송] 카드 반송 · 사고 접수는 고객센터로 연락 바랍니다.\n고객센터 02-0762-5513`,
    dialNumberId: CARD_FAKE_CALLBACK_NUMBER_ID,
    afterScammerTurns: 7,
    announceInstruction:
      "(참가자 휴대전화로 방금 반송 접수 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자에 있는 고객센터로 바로 전화해 보라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 연락처 숫자를 새로 지어내거나 소리 내어 불러 주지 마라.)",
  },
  // 상담원 레그 — 원격 지원 앱(조사 S1 p.3 — 공식 스토어형 원격제어 앱). 화면 `card-remote-support-install`(app-install · Q2).
  {
    smsId: "card-remote-support-link",
    kind: "link",
    senderLabel: CARD_R1_SMS_SENDER["card-remote-support-link"]!,
    body: `[${CARD_REBUILD_NAMES.cardCompany}] 명의 도용 피해 확인을 위한 보안 점검 안내입니다.\n아래에서 원격 지원 도우미를 설치해 주세요.`,
    linkDisplayText: "원격 지원 도우미 설치하기",
    fakeLandingId: "card-remote-support-install",
    linkAddress: "remote-help-store.invalid/app/Hd7q",
    afterScammerTurns: 8,
    announceInstruction:
      "(참가자 휴대전화로 방금 원격 지원 앱 설치 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 앱 설치를 진행해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 실제 주소를 읽어 주지 말고, 설치 방법·권한 설정은 설명하지 마라.)",
  },
  // 검사 레그(마지막 · 2026-11-07 넘김 축소 — 종전 감독기관 두 번째 통화의 일을 검사가 맡는다) — 안전계좌(조사 S1 p.4~5 "자산보호 · 안전계좌 송금"). 금액 = D8 980만 원. 화면 `card-safe-transfer`(훈련용 이체 화면).
  {
    smsId: "card-safe-account",
    kind: "account",
    senderLabel: CARD_R1_SMS_SENDER["card-safe-account"]!,
    body: "[자산보호 안내] 조사 기간 안전계좌 안내\n예금주: 한도윤\nOO은행 503-1847-2260-91\n금액: 9,800,000원\n아래에서 자산 보호 이체를 진행해 주세요.",
    linkDisplayText: "자산 보호 이체 진행하기",
    fakeLandingId: "card-safe-transfer",
    linkAddress: "asset-guard-desk.invalid/safe/Wm4c",
    afterScammerTurns: 9,
    announceInstruction:
      "(참가자 휴대전화로 방금 안전계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 이체를 진행해 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)",
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
  // ⭐ P2-d(2026-10-31 · X6 · 메인 "권고대로") — 환급 3변형의 "처리 수수료 선입금" 요구가 계좌를 말로 불렀다(P0 실측 F2 · 장부 ④). 계좌 문자 + 훈련용 이체 화면으로
  // 바꿨다. afterScammerTurns=4: 이 시나리오의 3과 겹치지 않는 값(발송 시점은 변형 선언 notBeforeUserTurns가 정한다).
  {
    smsId: "tax-refund-fee",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["tax-refund-scam"]} (환급금 안내)`,
    body: "[환급안내] 환급 처리 수수료 납부 계좌\n예금주: 임하늘\nOO은행 731-0452-6618-04\n금액: 99,000원\n수수료 확인 즉시 환급금이 지급됩니다.\n아래 링크에서 바로 이체할 수 있습니다.",
    linkDisplayText: "환급 수수료 이체하기",
    fakeLandingId: "tax-refund-fee-transfer",
    linkAddress: "refund-fee-send.invalid/send/Rf6t",
    afterScammerTurns: 4,
    announceInstruction:
      "(참가자 휴대전화로 방금 환급 처리 수수료 계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 문자 속 링크로 수수료를 먼저 넣어 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)",
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
    body: "예금주: 김민재\nOO은행 352-0812-4471-63\n금액: 3,000,000원\n오늘 안에 입금 확인되면 정리됩니다.\n아래 링크에서 바로 이체할 수 있습니다.",
    // ⭐ P2(X6 · 2026-10-31) — 계좌만 있던 문자에 훈련용 이체 화면 링크를 병기했다(참가자가 실제 뱅킹 앱을 열 이유를 없앤다 · 계좌 · 금액 무변경).
    linkDisplayText: "바로 이체하기",
    fakeLandingId: "blackmail-hush-transfer",
    linkAddress: "hush-send-link.invalid/send/Hs2q",
    // afterScammerTurns=3 — 이 시나리오는 "5~8턴 내외"로 마무리되도록 지시받아(prompt.ts 진행
    // 방식) 기존 최빈값 3과 맞춘다(`:49`·`:73`·`:95`·`:109` 참고).
    afterScammerTurns: 3,
    announceInstruction:
      '(참가자 휴대전화로 방금 계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 오늘 안에 문자 속 링크로 넣으라는 말을 한두 문장으로 차갑게 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)',
  },
];

// ⭐ 2026-11-07(Edge 시험 판 7 — 납치 협박 고급이 계좌를 말로만 부르고 "빨리 입금하고 다시 이야기해요"라며 끊어 참가자가 실제 은행 앱을 열 수밖에
// 없었다 · 사용자 결정 "앱 안 화면 추가") — 납치 협박 카탈로그 신설(이 시나리오 첫 항목). 고급 변형(fv-k268 · fv-w7tb)만 선언한다(초 · 중급 선언 0 —
// 세션 술어 `sessionDeclaresInCallSms`는 변형 선언을 본다 ⇒ 그 변형들의 조립 산출물은 그대로). 계좌는 말로 부른 것과 같은 세션 계좌가 문자 · 화면에 실린다.
// ⚠️ 종전 G306(납치에는 문자를 넣지 않는다 — "이 통화 끊지 말고 그대로 있어요"와 충돌)은 이 앱의 통화 중 문자함이 통화를 끊지 않아 기술 전제가 성립하지 않고,
// P2-b(2026-10-31)가 남긴 "실제 앱을 여는 위험"을 이번 사용자 결정으로 화면 쪽에서 닫는다. 실제 사례에서 계좌를 문자로도 보내는지는 **미확인**(P2-b 검색 범위).
// 금액 500,000원 = 근거 S26 · C16(금감원 소비자경보 — 50만 원 안팎 즉시 이체).
const KIDNAPPING_THREAT: InCallSmsItem[] = [
  {
    smsId: "kidnap-ransom-account",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["kidnapping-threat"]}`,
    body: "예금주: 박정호\nOO은행 948-2716-5093-27\n금액: 500,000원\n지금 바로 넣어요.\n아래 링크에서 바로 이체할 수 있습니다.",
    linkDisplayText: "바로 이체하기",
    fakeLandingId: "kidnap-ransom-transfer",
    linkAddress: "quick-send-now.invalid/send/Kd7r",
    afterScammerTurns: 2,
    announceInstruction:
      "(참가자 휴대전화로 방금 계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 지금 바로 문자 속 링크로 넣으라는 말을 한두 문장으로 차갑게 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호·금액을 새로 지어내 말하지 말고, 은행 앱이나 다른 곳에서 보내라고 하지 말고, 실제 주소를 읽어 주지도 마라.)",
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
    body: "[금융사고대응] 보호계좌 이체 안내\n예금주: 문성호\nOO은행 100-2043-7788-21\n금액: 4,120,000원\n아래에서 보호계좌로 옮기기를 진행해 주세요.",
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
    body: "[통관수수료] 납부 계좌 안내\n예금주: 배준영\nOO은행 604-2270-1183-91\n금액: 78,000원\n아래 링크에서 바로 이체할 수 있습니다.",
    // ⭐ P2(X6 · 2026-10-31) — 계좌만 있던 문자에 훈련용 이체 화면 링크를 병기했다(참가자가 실제 뱅킹 앱을 열 이유를 없앤다 · 계좌 · 금액 무변경).
    linkDisplayText: "통관수수료 이체하기",
    fakeLandingId: "courier-fee-transfer",
    linkAddress: "customs-fee-send.invalid/send/Cf3m",
    afterScammerTurns: 5,
    announceInstruction:
      "(참가자 휴대전화로 방금 통관수수료 계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 오늘 안에 문자 속 링크로 넣어 달라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호를 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)",
  },
  // §124(DECISIONS #239) — 택배 통관 고급 ② 명의 도용 이관형(fv-y3ks) 전용. 화면 없이 계좌 문자만(courier-customs-fee와 같은 모양).
  // afterScammerTurns=7: 이 시나리오의 2 · 5와 겹치지 않는 값(발송 시점은 변형 선언 notBeforeUserTurns가 정한다).
  {
    smsId: "courier-safe-account",
    kind: "account",
    senderLabel: `${SMS_SENDER_NUMBER["courier-customs-scam"]} (자산 보호 안내)`,
    body: "[명의도용 피해조치] 국가 안전계좌 안내\n예금주: 신예린\nOO은행 604-2270-1183-91\n금액: 7,600,000원\n수사 종료 시까지 보관 후 반환됩니다.\n아래 링크에서 바로 이체할 수 있습니다.",
    // ⭐ P2(X6 · 2026-10-31) — 계좌만 있던 문자에 훈련용 이체 화면 링크를 병기했다(계좌 무변경).
    // ⭐ PR-A(2026-11-07 Edge 시험 판 10 — 금액 줄이 없고 사기범도 금액을 말하지 않아 10만 원만 보내도 통과) — 금액 줄 760만 원(1회 이체 한도 안 · 판단값).
    // 문서 `transferAmount`(요구액 판정표 R2)의 원천이 된다. 이 문자는 `fv-y3ks`만 쓴다.
    linkDisplayText: "안전계좌로 이체하기",
    fakeLandingId: "courier-safe-transfer",
    linkAddress: "safe-keep-send.invalid/send/Sk8v",
    afterScammerTurns: 7,
    announceInstruction:
      "(참가자 휴대전화로 방금 국가 안전계좌 안내 문자가 실제로 도착했다. 상대의 말에 대답할 때 그 대답 안에서 문자를 보냈다는 사실과 수사가 끝날 때까지 문자 속 링크로 문자에 적힌 금액을 그 계좌에 옮겨 두라는 말을 한두 문장으로 알리고 상대의 반응을 기다려라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 계좌번호·금액을 새로 지어내 말하지 말고, 실제 주소를 읽어 주지도 마라.)",
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
  // §50.6 — 신고 ⑩ⓒ(계좌 전달 수단) 대응.
  "reputation-blackmail-scam": REPUTATION_BLACKMAIL_SCAM,
  // 2026-11-07 — 납치 협박 고급 계좌 문자(위 KIDNAPPING_THREAT 주석 · 종전 G306 대체).
  "kidnapping-threat": KIDNAPPING_THREAT,
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
/** §132.9 — 사기범이 "문자를 보냈다"고 말했는데 아직 게이트 하한 전이라 문자가 가지 않았을 때의 정정(맥락 주입 · 주장 1건당 1회). */
export const SMS_CLAIM_NOT_YET =
  "(방금 문자를 보냈다고 했지만 문자는 아직 가지 않았다. 문자를 보냈다는 말을 되풀이하지 말고, 상대가 문자를 찾으면 곧 도착한다고만 짧게 답한 뒤 하던 이야기를 이어가라.)";
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
// ⭐ 2026-11-08(Edge 재시험 7 · 8 — 관찰 e) — 말끝 "이(요)" 문장 추가: 맞게 부른 "칠팔오일삼육이요"가 전사 "7851362"로 남고 모델이 "번호가 일치하지 않습니다"를
// 되풀이했다(재시험 7 "이공일팔육육이요" → "2018662"는 통과 — 같은 꼴인데 판정이 갈렸다). 서버 · 리포트 대조는 `otpCandidatesForLength`(C2)가 같은 규칙이다.
export function buildOtpLiveCompareLine(otpCode: string): string {
  const spelled = otpCode.split("").join(" ");
  return `(⚠️ 대조용 — 이 문자 속 인증번호는 ${spelled}이다. 이 번호를 네가 먼저 말하거나 일부라도 알려 주지 마라. 상대가 번호를 불러 주면 이 번호와 한 자리씩 비교해 모두 같을 때만 확인됐다고 하고 다음 단계로 넘어간다. 번호 끝에 붙는 "이요"·"이에요"의 "이"는 숫자 2가 아니라 말끝이다 — 한 자리가 더 들리고 그 마지막이 2(이)면 그 마지막 자리를 빼고 비교한다. 하나라도 다르면 "확인했습니다"·"확인됐습니다"라고 말하지 말고, 첫 문장에서 번호가 맞지 않는다고 말한 뒤 문자를 다시 보고 불러 달라고 한다 — 예: "번호가 다르네요, 문자 다시 확인해서 불러 주세요." 두 번 넘게 계속 다르면 불이익을 한 번 암시하고 인증번호 없이 다음 단계로 넘어간다.)`;
}

/** 이 시나리오의 인증번호 문자 항목(`kind==="otp"` · `otpCode` 있음). 없으면 빈 배열. */
export function listOtpItems(scenarioId: string): InCallSmsItem[] {
  return (IN_CALL_SMS[scenarioId] ?? []).filter((item) => item.kind === "otp" && Boolean(item.otpCode));
}
