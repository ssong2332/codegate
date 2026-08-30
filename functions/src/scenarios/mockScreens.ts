// 인앱 모의 화면(가짜 랜딩) 콘텐츠 카탈로그 — 서버 전용 (T84, Architecture.md §15.9.1 R3,
// DECISIONS #42, UX-023 kind=`app-install` / UF-012, AC-072/AC-073).
//
// ⚠️ **왜 서버 카탈로그가 kind를 정하는가(§15.9.1 R3, DECISIONS #42 (d))**: 클라가
// `fakeLandingId` 문자열을 파싱·분류해 화면 종류를 정하면 그 자체가 **자유문자열 분류**이고
// (AC-024 원칙 위반), 위조 시 일어나지 않은 "속은 순간"이 만들어진다. kind의 진실 원천은 이
// 파일 하나이며, `recordMockScreenEvent`가 **시나리오 소속을 재검증**한다(§15.6 G12 동형).
//
// ⚠️ **AC-072 하드 제약(스키마·콘텐츠 층위의 구조적 금지)**:
//   - 실제 설치 파일(APK 등)·실제 앱스토어 URL·**실존 앱명**·실제 OS 권한 요청·실제 기기 설정
//     변경·외부 네비게이션에 해당하는 **필드가 이 타입에 존재하지 않는다.** `url`·`packageName`·
//     `storeUrl` 계열은 어느 스키마에도 없다(AC-023 송금 금지·AC-032/045 실 URL 금지와 동형).
//   - "권한 허용"은 **화면 안의 가짜 버튼 라벨**(`consentLabel`)일 뿐이며, 브라우저·OS 권한
//     API(`navigator.permissions`·`getUserMedia`·`Notification.requestPermission` 등)를 호출하는
//     경로가 UI·API 어디에도 없다(스캔 테스트가 고정한다 — §15.9.7 G50).
//   - `headline`·`bodyLines`·`consentLabel`은 **화면에 그려지는 문구의 정본**이다. 실제 렌더는
//     `src/components/MessengerFakeLanding.tsx` **한 파일 안**에서 일어나며(§15.9.1 R1 — 파일을
//     쪼개면 안전 계약이 두 벌이 된다), 두 곳의 문구가 갈라지지 않도록 드리프트 테스트가 묶는다.
//     ⚠️ 이 문구들은 **리포트 스냅샷에 싣지 않는다**(§15.9.5 e-4 — 사후 화면이 목업을 재구성·
//     재진입할 수 있게 된다).
//   - 이 파일은 **클라이언트에 원문 배포되지 않는다.** 클라에 내려가는 것은 `MessengerAttachment.
//     landingKind` 하나뿐이다(`roleplay/linkMarker.ts`).

export type MockScreenKind = "credential-form" | "app-install";

/**
 * 이 랜딩이 어느 표면에서 열리는가 — **게이트의 단일 판정 키**(T104, Architecture.md §19.2 (3),
 * ADR-0012).
 *
 * ⚠️ **왜 필수 필드인가**: G53·G55·`channel==="messenger"` 세 단언은 원래 *"카탈로그의 모든
 * scenarioId"* 를 훑었다. 그 조건은 세 단언의 **원문 사유**(전부 `app-install` 또는
 * `[[LINK:]]` 렌더 경로를 가리킨다 — §19.1)를 가장 거칠게 근사한 것이라, 통화 중 문자로 열리는
 * `credential-form` 랜딩을 카탈로그에 넣는 순간 **사유와 무관하게** 깨진다. 게이트를 지우는 대신
 * 판정 키를 여기로 옮긴다. 옵셔널로 두면 새 항목이 조용히 빠지므로 **필수**다 — 표면을 선언하지
 * 않은 항목은 타입이 깨져 넘어갈 수 없다.
 */
export type MockScreenEntrySurface = "messenger-link" | "in-call-sms";

export type MockScreenItem = {
  /** 카탈로그 안에서 유일한 id. `MessengerAttachment.fakeLandingId`와 같은 값이며
   * Firestore `sessions/{sid}/mockScreens/{landingId}`의 문서 id가 된다(멱등). */
  landingId: string;
  kind: MockScreenKind;
  /** 이 항목이 열리는 진입 표면(§19.2 (3)) — 안전 게이트가 이 값으로 스코프를 판정한다. */
  entrySurface: MockScreenEntrySurface;
  /** 목업 제목 — **실존 앱명·실존 기관명 금지**(AC-072/AC-075 `mockSurface` 프로파일). */
  headline: string;
  /** 화면 안내 문구. */
  bodyLines: string[];
  /** 화면 하단 발신 주체 표기(현행 하드코딩 `"ⓒ 본인확인센터"`·`"ⓒ 업무처리 확인센터"`를
   * 카탈로그로 올린 것). **실존 기관명 금지** — `mockSurface` 프로파일을 탄다. */
  issuerLabel: string;
  /** 입력 필드 라벨(`credential-form` 전용, **최대 3개** — UX-023 v1.13 표).
   * ⛔ `app-install`이면 반드시 `undefined`다(AC-072 *"입력 필드 0"*). G-C가 단언한다.
   * ⛔ 라벨 안에 숫자열을 넣지 않는다(`LONG_DIGIT_SEQUENCE`). */
  fields?: string[];
  /** 가짜 제출 CTA 라벨(`credential-form` 전용). */
  submitLabel?: string;
  /** 가짜 성공 문구(`credential-form` 전용). ⚠️ 그 아래 **안전 고지**는 상황과 무관하게 동일하며
   * 카탈로그 필드가 아니다(§19.3 (3) · P-28 ⑤ — G-D가 단언한다). */
  successHeadline?: string;
  /** 가짜 "권한 허용" 버튼 라벨(`app-install` 전용) — 실제 권한 요청이 아니다.
   * `InCallSmsItem.otpCode`/`linkDisplayText`와 **동형인 kind 스코프 옵셔널 필드**이며,
   * 부재를 판별자로 오버로드하지 않는다(§14.9.1 — kind가 유일한 판별자이고 G-C가 정합을 단언한다). */
  consentLabel?: string;
  /** 승격 시 `DeceivedMoment.tactic`(§15.9.5 e-1). 기존 `resolveTacticCategory`가
   * `link_or_install`로 정규화한다 — **신규 카테고리 0건**. */
  momentTactic: string;
  /** 승격 시 `DeceivedMoment.correctAction`(D-52/P-25 카피 규칙 — 유효 대처 먼저·크게,
   * 구조 설명은 뒤에 짧게, "소용없다"류 무력감 표현 금지). */
  correctAction: string;
};

/** 부재 id의 kind 폴백(§15.9.1 R5) — **`app-install`이 사고로 열리는 방향의 폴백은 금지**한다. */
export const DEFAULT_MOCK_SCREEN_KIND: MockScreenKind = "credential-form";

/**
 * 응낙 사실을 사기범이 언급하게 하는 **턴 지시 1줄**(§15.9.3 인과 배선 — `IN_CALL_SMS`의
 * `announceInstruction`과 동형이지만, 항목이 아니라 **모듈 상수**다: `MockScreenItem`의 필드
 * 집합은 §15.9.1 R3이 고정했고 이 문자열은 화면 콘텐츠가 아니라 모델 지시라 카탈로그 항목에
 * 싣지 않는다. Firestore 문서·리포트 스냅샷 어디에도 저장되지 않는다 — AC-024).
 *
 * ⚠️ **이 지시는 전이 신호가 아니다**(§15.9.7 G54). "이제 전화로 이어서 안내하겠다"는 말은
 * 기존 에스컬레이션 규칙대로 모델이 `[[SIGNAL:ESCALATE_VOICE]]`를 실을 때만 실제 전이를
 * 일으키며, 이 지시가 곧바로 `transitionChannel`을 부르지 않는다.
 */
export const MOCK_INSTALL_CONSENT_INSTRUCTION =
  "(참가자가 방금 안내대로 설치와 권한 허용을 마쳤다. 지금 캐릭터로서 한두 문장으로 그 사실을 자연스럽게 확인해 주고, 이제 담당자가 전화로 이어서 안내하겠다고 말하라. 설치 절차·권한의 구체적인 작동 방식을 설명하지는 마라.)";

// UF-012 2단계 — 지원금 안내 문자(1단계)에서 이어지는 모의 앱 설치 화면.
// OQ-42 확정 = (b) 지원금 문자 확장 → `messenger-subsidy-smishing-sms`의 기존 escalation 배선을
// 그대로 재사용한다(신규 전이 경로 미신설).
const MESSENGER_SUBSIDY_SMISHING_SMS: MockScreenItem[] = [
  {
    landingId: "subsidy-install",
    kind: "app-install",
    entrySurface: "messenger-link",
    headline: "업무처리 확인 앱을 설치해야 진행됩니다",
    bodyLines: [
      "지원금 신청은 본인확인 절차가 끝난 뒤에 접수됩니다.",
      "아래에서 확인용 앱 설치를 진행해 주세요.",
      "설치 후 접근 권한을 허용하면 담당자가 신청을 대신 처리해 드립니다.",
    ],
    issuerLabel: "ⓒ 업무처리 확인센터",
    consentLabel: "권한 허용하고 계속하기",
    momentTactic: "앱 설치·원격 허용 유도",
    correctAction:
      "설치나 권한 허용을 요구받으면 그 자리에서 허용하지 말고 화면을 닫으세요. ① 앱은 기관 공식 경로에서만 설치하기 ② 설치를 권유받으면 대화를 멈추고 이미 알고 있는 번호로 직접 확인하기 ③ 가족·가까운 창구에서 함께 확인하기 ④ 이미 허용했다면 112(경찰)·1332(금융감독원)에 신고하기.",
  },
];

// ── T104 상황별 랜딩 콘텐츠 (UX-023 v1.13 (3) · D-58 · P-28 · AC-078) ────────────
//
// **왜 콘텐츠가 서버 카탈로그에 있는가(§19.3 (1) ③ — 결정적 이유)**: `mockSurface` 프로파일만
// `realInstitutionName`(국세청·관세청·우체국…)을 포함하고, 그 스캔은 `harmlessnessGate.test.ts`의
// `collectAllSurfaces()`가 순회하는 **이 카탈로그**에만 걸린다. 클라 상수에만 두거나 새 서버 파일을
// 만들면 환급·통관 랜딩의 실존 기관명이 **어디에서도 안 걸린다** — D-58이 최대 위험으로 지목한 지점.
//
// ⚠️ 아래 6종은 전부 `credential-form`이다(**신규 kind 0건** — D-58). 새로 붙는 화면이 모두
// "정보를 입력하게 만드는 화면"이라 기존 안전 계약(입력 허용·서버 미전송·외부 네비게이션 부재)과
// 정확히 일치하고, kind를 늘리면 안전 계약이 한 벌 더 늘어 AC-072가 금지한 "검증 경로 이중화"에
// 스스로 다가간다.
//
// ⚠️ **§51(사용자 라이브 신고) — `safe-account-transfer`·`card-relief-transfer`·
// `protect-account-transfer` 3종이 여기 더해졌다.** §45 ⓐ가 판정만 하고 구현이 0줄이던 이체형
// 랜딩(계좌번호·금액을 입력해 이체를 완료하는 화면)의 집행이다. 마지막 1종
// (`protect-account-transfer`)은 §51.5 (3)·§51.7 (3)이 요구한 P-1 라이브 프로브(전환이 실제로
// 몇 번째 사기범 턴에 일어나는지) 통과 후 커밋됐다 — 대상 판정·회피 방지(G319)의 근거는
// `docs/Architecture.md` §51.
//
// ── ⭐ AC-078 (c) 미끼 → 랜딩 대조표 (구현 산출물 — AC 본문이 "대조표가 없으면 미충족"이라 규정) ──
//
// 각 랜딩의 **헤드라인·CTA**가, 그 랜딩으로 이어진 **미끼 문면**이 예고한 행위를 그대로 수행하게
// 하는지를 보이는 표다. reviewer·QA는 이 표로 (c)를 판정한다.
//
// | landingId | 미끼 문면 출처(파일:줄 — 스냅샷) | 미끼 인용 | 미끼가 예고한 행위 | 랜딩 헤드라인 | 랜딩 CTA |
// |---|---|---|---|---|---|
// | `parcel-redelivery` | `roleplay/linkMarker.ts:22`(칩 라벨) · `messengerParcelSmishingSms.prompt.ts:37` | "재배송 신청 확인하기" | 주소 확인 → 재배송 신청 | "주소가 확인되지 않아 배송이 보류되었습니다" | "재배송 신청하기" |
// | `subsidy-install` | `roleplay/linkMarker.ts:24`(칩 라벨) · `messengerSubsidySmishingSms.prompt.ts:64` | "지원금 신청 앱 설치하기" | 확인 앱 설치 | "업무처리 확인 앱을 설치해야 진행됩니다" | "권한 허용하고 계속하기" |
// | `loan-refinance-apply` | `scenarios/inCallSms.ts:57-58`(문자 본문·칩) | "아래에서 본인확인 후 신청을 완료해 주세요." | 링크에서 본인확인 → 신청 완료 | "전환 신청서 본인확인이 필요합니다" | "본인확인 완료하기" |
// | `tax-refund-claim` | `scenarios/inCallSms.ts:106-107`(문자 본문·칩) | "아래에서 계좌를 등록하시면 당일 지급됩니다." | 수령 계좌 등록 → 당일 지급 | "환급금 받으실 계좌를 등록해 주세요" | "계좌 등록하기" |
// | `courier-customs-check` | `scenarios/inCallSms.ts:120-121`(문자 본문·칩) | "수취인 정보 불일치로 통관이 보류되었습니다." | 수취인 정보 확인 → 통관 재개 | "수취인 정보가 일치하지 않아 통관이 보류되었습니다" | "수취인 정보 확인하기" |
// | `safe-account-transfer` | `scenarios/inCallSms.ts:87-91`(문자 본문·칩) | "아래에서 안전계좌 이체를 진행해 주세요." | 링크에서 안전계좌 이체 | "안전계좌 이체가 아직 완료되지 않았습니다" | "안전계좌로 이체하기" |
// | `card-relief-transfer` | `scenarios/inCallSms.ts:117-119`(문자 본문·칩) | "아래에서 피해금 이관을 진행해 주세요." | 링크에서 피해금 이관 | "피해금 이관 신청이 완료되지 않았습니다" | "피해금 이관하기" |
// | `protect-account-transfer` | `scenarios/inCallSms.ts:142-143`(문자 본문·칩) | "아래에서 보호계좌로 옮기기를 진행해 주세요." | 링크에서 보호계좌로 옮기기 | "보호계좌로 옮기기가 아직 처리되지 않았습니다" | "보호계좌로 옮기기" |
//
// ⚠️ **이 표가 조용히 낡지 않게 하는 장치(주석은 강제가 아니다).** 위 **줄 번호는 스냅샷일 뿐이며
// 앵커가 아니다** — 파일이 바뀌면 줄은 밀린다. 진짜 앵커는 `__tests__/mockScreens.test.ts`의
// `BAIT_TO_LANDING` 표이고, 그 테스트가 매 실행마다 다음 넷을 **런타임 카탈로그 값으로** 검사한다:
//   ① 표의 landingId 집합 == `MOCK_SCREENS`의 landingId 집합(새 랜딩이 표를 건너뛸 수 없다)
//   ② "미끼 인용" 문자열이 **실제 미끼 텍스트에 지금도 존재**한다(미끼가 바뀌면 실패)
//   ③ 랜딩마다 정한 **앵커 토큰**이 미끼 인용과 랜딩 헤드라인+CTA **양쪽에** 있다(어느 쪽이 바뀌어도 실패)
//   ④ 위 주석 표에 7개 landingId와 7개 미끼 인용이 전부 들어 있다(주석 ↔ 테스트 표 1:1)
// **자동화의 한계(정직 고지)**: "상황이 맞는가"는 의미 판정이라 기계로 할 수 없다. 앵커 토큰 공유는
// 그 **필요조건**일 뿐 충분조건이 아니므로, 사람이 읽는 표를 여기 남기고 그 표를 ①~④로 묶는다.

// UF-006 Step 4 — 메신저 채팅(UX-022)의 `[[LINK:parcel-redelivery]]` 칩에서 열린다.
const MESSENGER_PARCEL_SMISHING_SMS: MockScreenItem[] = [
  {
    landingId: "parcel-redelivery",
    kind: "credential-form",
    entrySurface: "messenger-link",
    headline: "주소가 확인되지 않아 배송이 보류되었습니다",
    bodyLines: [
      "받는 분 정보가 일부 확인되지 않아 물품이 접수처에 보관 중입니다.",
      "아래 정보를 확인해 주시면 오늘 중으로 재배송이 접수됩니다.",
    ],
    issuerLabel: "ⓒ 종합물류 재배송 접수처",
    fields: ["받는 분 성함", "연락처", "받으실 주소"],
    submitLabel: "재배송 신청하기",
    successHeadline: "재배송이 접수되었습니다.",
    momentTactic: "배송 보류를 빌미로 한 개인정보 입력 유도",
    correctAction:
      "문자 링크로 배송 정보를 입력하지 말고 화면을 닫으세요. ① 배송 상태는 주문한 판매처나 택배사 공식 경로에서 직접 조회하기 ② 주소·연락처를 링크로 요구하면 일단 멈추기 ③ 가족이나 가까운 사람에게 화면을 보여 주고 함께 확인하기 ④ 이미 입력했다면 112(경찰)·1332(금융감독원)에 신고하기.",
  },
];

// UF-008 — 통화 중 문자(UX-027)의 `loan-apply-link` 칩에서 열린다(`inCallSms.ts` LOAN_SCAM).
const LOAN_REFINANCE_SCAM: MockScreenItem[] = [
  {
    landingId: "loan-refinance-apply",
    kind: "credential-form",
    entrySurface: "in-call-sms",
    headline: "전환 신청서 본인확인이 필요합니다",
    bodyLines: [
      "저금리 전환 승인을 위해 신청인 본인 확인이 남아 있습니다.",
      "아래 정보를 입력하시면 상담사가 접수 완료를 안내해 드립니다.",
    ],
    // 문자 본문의 가상 발신 주체(`inCallSms.ts` LOAN_SCAM `senderLabel`)와 표기를 맞춘다.
    issuerLabel: "ⓒ ○○캐피탈 전환심사팀",
    fields: ["성함", "생년월일", "연락처"],
    submitLabel: "본인확인 완료하기",
    successHeadline: "본인확인이 완료되었습니다.",
    momentTactic: "저금리 전환 승인을 빌미로 한 신상정보 입력 유도",
    correctAction:
      "전환 신청서라며 링크로 본인확인을 요구하면 입력하지 말고 화면을 닫으세요. ① 대출 상담은 이미 알고 있는 금융회사 대표번호로 직접 걸어 확인하기 ② 생년월일·연락처를 링크에 넣지 않기 ③ 가족이나 가까운 창구에서 함께 확인하기 ④ 이미 입력했다면 112(경찰)·1332(금융감독원)에 신고하기.",
  },
];

// UF-008 — `tax-refund-link` 칩에서 열린다. ⚠️ 실존 기관명(국세청) 금지라 가상 안내센터 표기를 쓴다.
const TAX_REFUND_SCAM: MockScreenItem[] = [
  {
    landingId: "tax-refund-claim",
    kind: "credential-form",
    entrySurface: "in-call-sms",
    headline: "환급금 받으실 계좌를 등록해 주세요",
    bodyLines: [
      "조회된 미수령 환급금이 확인되었습니다.",
      "받으실 계좌를 등록하시면 당일 지급 처리됩니다.",
    ],
    issuerLabel: "ⓒ 환급금 지급 안내센터",
    // ⛔ 라벨에 숫자열을 넣지 않는다(`LONG_DIGIT_SEQUENCE`) — 안내 텍스트만 쓴다.
    fields: ["예금주", "은행", "계좌번호"],
    submitLabel: "계좌 등록하기",
    successHeadline: "계좌가 등록되었습니다.",
    momentTactic: "미수령 환급금을 빌미로 한 계좌정보 입력 유도",
    correctAction:
      "돈을 준다며 계좌를 입력하라고 하면 그 자리에서 멈추세요 — 환급은 계좌번호를 링크로 받지 않습니다. ① 환급 여부는 공식 기관 창구에 직접 문의해 확인하기 ② 예금주·계좌번호를 문자 링크에 넣지 않기 ③ 가족이나 가까운 창구에서 함께 확인하기 ④ 이미 입력했다면 112(경찰)·1332(금융감독원)에 신고하기.",
  },
];

// UF-008 — `courier-customs-link` 칩에서 열린다. ⚠️ 관세청·우체국 등 실존 기관명 금지.
const COURIER_CUSTOMS_SCAM: MockScreenItem[] = [
  {
    landingId: "courier-customs-check",
    kind: "credential-form",
    entrySurface: "in-call-sms",
    headline: "수취인 정보가 일치하지 않아 통관이 보류되었습니다",
    bodyLines: [
      "국제 배송 물품의 수취인 정보가 확인되지 않았습니다.",
      "아래 정보를 확인해 주셔야 통관 절차가 재개됩니다.",
    ],
    // 문자 본문의 가상 발신 주체(`inCallSms.ts` COURIER_CUSTOMS_SCAM)와 표기를 맞춘다.
    issuerLabel: "ⓒ 국제통관지원센터",
    fields: ["수취인 성함", "연락처", "생년월일"],
    submitLabel: "수취인 정보 확인하기",
    successHeadline: "수취인 정보가 확인되었습니다.",
    momentTactic: "통관 보류를 빌미로 한 수취인 정보 입력 유도",
    correctAction:
      "통관이 보류됐다며 링크로 정보를 확인하라고 하면 입력하지 말고 화면을 닫으세요. ① 배송 상태는 주문한 판매처나 배송사 공식 경로에서 직접 조회하기 ② 생년월일·연락처를 문자 링크에 넣지 않기 ③ 가족이나 가까운 사람에게 화면을 보여 주고 함께 확인하기 ④ 이미 입력했다면 112(경찰)·1332(금융감독원)에 신고하기.",
  },
];

// ── §51 이체형 가짜 랜딩 (§45 ⓐ 집행 · UX-023 v1.25 (2)/(17-a) 정본 — 문면 그대로 복사, 의역 금지) ──
//
// UF-008 — `institution-safe-account` 문자에 병기된 링크 칩(`institution-safe-account-transfer`가
// 아니라 `safe-account-transfer`)에서 열린다. §51.6 R10 — 기존 account 항목에 링크만 병기했고
// 신규 `InCallSmsKind`·`MockScreenKind`는 0건이다.
//
// ⚠️ **UX v1.25 정정 — bodyLines 둘째 줄만.** v1.24 원안 "문자로 안내된 안전계좌 번호와 이체
// 금액을 입력해 주세요."는 `fields` 라벨을 문자 그대로 반복해 렌더 텍스트에 그 라벨이 2회
// 등장했다(T116 게이트 G194 — `renderGate.test.ts:191-199`). `fields`·헤드라인·CTA 등 나머지는
// 무변경.
const INSTITUTIONAL_IMPERSONATION: MockScreenItem[] = [
  {
    landingId: "safe-account-transfer",
    kind: "credential-form",
    entrySurface: "in-call-sms",
    headline: "안전계좌 이체가 아직 완료되지 않았습니다",
    bodyLines: [
      "범죄 연루가 확인된 자금은 임시 안전계좌로 옮겨야 보호 조치가 적용됩니다.",
      "문자로 안내된 계좌번호와 금액을 아래에 입력해 주세요.",
    ],
    // 문자 발신 라벨(`inCallSms.ts` INSTITUTIONAL_IMPERSONATION `institution-safe-account`
    // "(자산보호 안내)")과 일관되게 맞춘다(P-28 (6)).
    issuerLabel: "ⓒ 자산보호 이체 안내센터",
    fields: ["안전계좌 번호", "이체 금액"],
    submitLabel: "안전계좌로 이체하기",
    successHeadline: "안전계좌로 이체가 완료되었습니다.",
    momentTactic: "범죄 연루 자금 보호를 빌미로 한 안전계좌 이체 유도",
    correctAction:
      "'안전계좌로 옮기라'며 계좌번호와 금액을 입력하라고 하면 그 자리에서 멈추세요 — 어떤 수사·금융기관도 돈을 다른 계좌로 옮기라고 하지 않습니다. ① 통화를 끊고 이미 알고 있는 은행 대표번호로 직접 확인하기 ② 계좌번호·금액을 문자 링크에 넣지 않기 ③ 가족이나 가까운 은행 창구에서 함께 확인하기 ④ 이미 입력했다면 112(경찰)·1332(금융감독원)에 신고하기.",
  },
];

// UF-008 — `card-relief-account` 문자(§51.3 F1 해소 후속)에서 열린다. §51.6 R10 — 신규
// `InCallSmsKind`·`MockScreenKind` 0건.
//
// ⚠️ **UX v1.25 정정 — bodyLines 둘째 줄만.** v1.24 원안은 fields 라벨("이관 전용 계좌번호"·
// "이관 금액")을 문자 그대로 반복해 T116 G194에 걸렸다(institutional과 같은 형태).
const CARD_COMPANY_IMPERSONATION: MockScreenItem[] = [
  {
    landingId: "card-relief-transfer",
    kind: "credential-form",
    entrySurface: "in-call-sms",
    headline: "피해금 이관 신청이 완료되지 않았습니다",
    bodyLines: [
      "진행 중인 해외 결제 승인을 막으려면 잔액을 이관 전용 계좌로 옮기셔야 합니다.",
      "문자로 안내된 이관 계좌와 금액을 아래에 입력해 주세요.",
    ],
    // 문자 발신 라벨(`inCallSms.ts` CARD_COMPANY_IMPERSONATION `card-relief-account`
    // "(피해금 이관 안내)")과 일관되게 맞춘다(P-28 (6)).
    issuerLabel: "ⓒ 카드 피해금 이관 지원센터",
    fields: ["이관 전용 계좌번호", "이관 금액"],
    submitLabel: "피해금 이관하기",
    successHeadline: "피해금 이관이 접수되었습니다.",
    momentTactic: "부정결제 피해를 빌미로 한 피해금 이관 이체 유도",
    correctAction:
      "'피해금을 다른 계좌로 옮기라'고 하면 그 자리에서 멈추세요 — 카드사는 결제를 막기 위해 고객 돈을 옮기지 않습니다. ① 통화를 끊고 카드 뒷면이나 명세서에 적힌 번호로 직접 확인하기 ② 계좌번호·금액을 문자 링크에 넣지 않기 ③ 가족이나 가까운 은행 창구에서 함께 확인하기 ④ 이미 입력했다면 112(경찰)·1332(금융감독원)에 신고하기.",
  },
];

// UF-008 — `bank-protect-account` 문자(§51.3 F2 후속, 이 시나리오 최초의 계좌 문자)에서 열린다.
// §51.6 R10 — 신규 `InCallSmsKind`·`MockScreenKind` 0건.
//
// bodyLines 둘째 줄은 UX-023 v1.25 정정값을 그대로 옮겼다(T116 G194 — 라벨 중복 등장 정정,
// v1.24 원안 대비 institutional·card와 같은 형태).
const BANK_SECURITY_VERIFY_SCAM: MockScreenItem[] = [
  {
    landingId: "protect-account-transfer",
    kind: "credential-form",
    entrySurface: "in-call-sms",
    headline: "보호계좌로 옮기기가 아직 처리되지 않았습니다",
    bodyLines: [
      "비정상 출금 시도가 확인되어 잔액을 옮겨 두셔야 출금이 막힙니다.",
      "문자로 안내된 계좌번호와 옮기실 금액을 아래에 입력해 주세요.",
    ],
    // 문자 발신 라벨(`inCallSms.ts` BANK_SECURITY_VERIFY_SCAM `bank-protect-account`
    // "(계좌보호 안내)")과 일관되게 맞춘다(P-28 (6)).
    issuerLabel: "ⓒ 금융사고대응 보호계좌센터",
    fields: ["보호계좌 번호", "옮길 금액"],
    submitLabel: "보호계좌로 옮기기",
    successHeadline: "보호계좌로 옮기기가 처리되었습니다.",
    momentTactic: "비정상 출금 차단을 빌미로 한 보호계좌 이체 유도",
    correctAction:
      "'출금을 막아 주겠다'며 잔액을 다른 계좌로 옮기라고 하면 그 자리에서 멈추세요 — 은행은 고객 돈을 옮겨서 지켜 주지 않습니다. ① 통화를 완전히 끊은 뒤, 통화 중 안내받은 번호가 아니라 통장·카드·공식 창구에서 직접 찾은 번호로 확인하기 ② 계좌번호·금액을 문자 링크에 넣지 않기 ③ 가족이나 가까운 은행 창구에서 함께 확인하기 ④ 이미 입력했다면 112(경찰)·1332(금융감독원)에 신고하기.",
  },
];

/**
 * 시나리오별 모의 화면 카탈로그(`IN_CALL_SMS` 미러 — `Record<scenarioId, Item[]>`).
 *
 * **카탈로그가 없는 시나리오는 이 기능이 아예 켜지지 않는다** — `landingKind`가 부착되지 않아
 * attachment 문서가 도입 전과 한 바이트도 같고, `sendMessage`의 추가 read도 일어나지 않는다
 * (`hasInCallSms(...)` 게이팅과 동형 — 나머지 12개 시나리오 회귀 0).
 *
 * ⚠️ **R6(§15.9.1) — 무변경**: 통화 중 문자(`InCallSmsDoc.fakeLandingId`)로 **`app-install`이**
 * 열리는 경로는 여전히 범위 밖이다. T104 이후 이 불변식은 **양쪽에서** 검사된다 —
 * `IN_CALL_SMS` 쪽(R6 단언)과 카탈로그 쪽(G-A: `entrySurface === "in-call-sms"` ⇒
 * `kind !== "app-install"`). UF-012의 설치는 **메신저 단계**에서 일어난다.
 *
 * ⚠️ **T104**: 통화 경로 `credential-form` 랜딩 3종이 여기 등재된다. 이들은 `turnInstruction`을
 * 만들지 않고(`listAppInstallMockScreens` 게이팅), `consentedAt`도 가질 수 없어(콜러블이 거부)
 * G55가 막던 지시 경합(M1)과 R6이 막던 앵커 얽힘(M2) 어느 쪽도 발생시키지 않는다(§19.1 (2)).
 *
 * ⚠️ **§51**: `institutional-impersonation`·`card-company-impersonation`·
 * `bank-security-verify-scam`이 여기 신규 등재된다(§45 ⓐ 집행 — 통화 경로 `credential-form`
 * 이체형 랜딩 각 1건, `IN_CALL_SMS`의 `institution-safe-account`·`card-relief-account`·
 * `bank-protect-account`가 병기한 `fakeLandingId`를 가리킨다).
 * G159 트립와이어 — 세 시나리오 모두 도달 가능 랜딩은 **1건뿐**이다.
 */
export const MOCK_SCREENS: Record<string, MockScreenItem[]> = {
  "messenger-subsidy-smishing-sms": MESSENGER_SUBSIDY_SMISHING_SMS,
  "messenger-parcel-smishing-sms": MESSENGER_PARCEL_SMISHING_SMS,
  "institutional-impersonation": INSTITUTIONAL_IMPERSONATION,
  "card-company-impersonation": CARD_COMPANY_IMPERSONATION,
  "bank-security-verify-scam": BANK_SECURITY_VERIFY_SCAM,
  "loan-refinance-scam": LOAN_REFINANCE_SCAM,
  "tax-refund-scam": TAX_REFUND_SCAM,
  "courier-customs-scam": COURIER_CUSTOMS_SCAM,
};

/**
 * ⚠️ G12 동형 방어 — `landingId`가 **이 시나리오 카탈로그 소속인지** 재검증하는 유일한 지점.
 * 이걸 빼면 클라가 임의 landingId로 가짜 "속은 순간"을 만드는 경로가 된다(§15.9.6 검증 ③).
 */
export function findMockScreenItem(
  scenarioId: string,
  landingId: string,
): MockScreenItem | undefined {
  return MOCK_SCREENS[scenarioId]?.find((item) => item.landingId === landingId);
}

/**
 * 링크 마커에 실을 kind 판정(§15.9.1 R3/R5). 카탈로그에 없는 id는 조용히 실패하지 않고
 * **기본값(`credential-form`)** 으로 떨어진다 — `DEFAULT_LINK_LABEL` 폴백과 동형이되 `app-install`
 * 방향으로는 절대 폴백하지 않는다.
 */
export function resolveMockScreenKind(scenarioId: string, landingId: string): MockScreenKind {
  return findMockScreenItem(scenarioId, landingId)?.kind ?? DEFAULT_MOCK_SCREEN_KIND;
}

/** 이 시나리오가 모의 설치 단계를 갖는가(프롬프트 조건형 블록·`sendMessage` 추가 read의 단일 판정). */
export function hasAppInstallMockScreen(scenarioId: string): boolean {
  return listAppInstallMockScreens(scenarioId).length > 0;
}

/** 이 시나리오의 `app-install` 항목 목록(단계 도달 판정·인과 배선이 함께 쓴다). */
export function listAppInstallMockScreens(scenarioId: string): MockScreenItem[] {
  return (MOCK_SCREENS[scenarioId] ?? []).filter((item) => item.kind === "app-install");
}
