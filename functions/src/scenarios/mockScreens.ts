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
import { resolveSessionEscalation, type EscalationSessionView } from "./escalation";
import { findInCallSmsItem } from "./inCallSms";
import { PUBLIC_SCENARIOS } from "./publicMeta";
import { sessionReachableLandingIds } from "./reachability";

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
  /**
   * T190-2(docs/Architecture.md §74.9 · UX D-101 · PRD AC-094) — 가짜 브라우저 주소창에 보일 **가짜 호스트**
   * (호스트만 — 경로·스킴 0). ⛔ 마지막 레이블은 반드시 `.invalid`(RFC 2606 예약 — 영구히 실존할 수 없는 이름)이고
   * `http(s)://`·`www.`·`href` 0 · 연속 숫자 3자리 이하 · 실존 기관 도메인 꼴·실존 브랜드 낱말 0
   * (`__tests__/mockAddress.test.ts` G453). 화면 렌더 정본은 클라 `MessengerFakeLanding.tsx`의 같은 글자이며
   * 드리프트 테스트(`src/components/mockScreenCopy.test.ts` G76)가 묶는다. 눌러도 어디로도 이동하지 않는다.
   */
  mockHost: string;
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

/**
 * A-1 ⑧(2026-10-19 · audit-B 1일차 #2) — 이미 통화로 넘어온 뒤(메신저→voice 전이 뒤 폴백)에 응낙이 알려질 때의 변형.
 * 위 원문의 "전화로 이어서 안내하겠다고 말하라"가 통화 중에는 **이미 일어난 일을 다시 예고**하게 만들어, 폴백에서
 * "곧 전화드리겠습니다"가 반복됐다. 판정은 `roleplay/escalatedCall.ts` `isEscalatedVoiceCall` 한 곳이 소유한다.
 * ⛔ 원문(위)은 메신저 단계 응낙용으로 그대로 둔다(바이트 동일).
 */
export const MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL =
  "(참가자가 방금 안내대로 설치와 권한 허용을 마쳤다. 지금 캐릭터로서 한두 문장으로 그 사실을 자연스럽게 확인해 주고, 이미 통화 중이니 전화하겠다는 말 없이 이 통화에서 다음 안내를 바로 이어가라. 설치 절차·권한의 구체적인 작동 방식을 설명하지는 마라.)";

/**
 * ⭐ T194-c-1(docs/Architecture.md §84.5.4 정본 · §84.15.4 진리표 실시간 행) — 통화 중 문자로 연 설치 화면(Q2)의 응낙을 **실시간(Live)**
 * 사기범에게 알리는 맥락 주입용 조건형 지시(*"대답할 때 그 대답 안에서"*). ⚠️ 이 상수를 Live에 싣는 배선(맥락 주입 전달 행 G609)은
 * T194-c-2(PR-A2 뒤)다 — c-1에서는 선택 함수의 진리표 행으로만 존재한다(어떤 응답에도 아직 실리지 않는다).
 */
export const IN_CALL_INSTALL_CONSENT_INSTRUCTION =
  "(참가자가 방금 문자 속 링크에서 안내대로 앱 설치와 권한 허용을 마쳤다. 상대의 말에 대답할 때 그 대답 안에서 한두 문장으로 그 사실을 자연스럽게 확인하고 다음 요구로 이어가라. 이것만 말하려고 지금 따로 말을 꺼내지는 마라. 설치 절차·권한의 구체적인 작동 방식은 설명하지 마라. 전화를 새로 걸겠다거나 다른 사람이 연락하겠다는 말은 하지 마라.)";

/** 응낙 지시를 실을 경로 — 폴백(`sendMessage` 턴 지시) · 실시간(Live 맥락 주입 — c-2). */
export type InstallConsentPath = "fallback" | "realtime";

/**
 * ⭐ T194-c-1 G607(docs/Architecture.md §84.15.4 진리표 · Q-X4) — 설치 응낙 지시 선택의 **단일 함수**(폴백 · 실시간 응답이 같은 함수 · J-1).
 * 예전 선택식(`escalatedCall ? …_IN_CALL : …`)은 메신저→통화 전이 기록만 봐서, **처음부터 통화인** Q2 세션(통화 중 문자 → 설치)에
 * *"이제 담당자가 전화로 이어서 안내하겠다"* 를 실었다(거짓 문면). 진입 표면을 함께 본다.
 *
 * | `entrySurface` | `escalatedCall` | `path` | `transferPlaced` | 결과 |
 * |---|---|---|---|---|
 * | `messenger-link` | false | fallback | — | `MOCK_INSTALL_CONSENT_INSTRUCTION`(현행) |
 * | `messenger-link` | true | fallback | — | `MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL`(현행) |
 * | `in-call-sms` | 무관 | fallback | false | `MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL` 재사용(새 문면 0) |
 * | `in-call-sms` | 무관 | realtime | false | `IN_CALL_INSTALL_CONSENT_INSTRUCTION`(조건형 · 소비는 c-2) |
 * | `in-call-sms` | 무관 | 둘 다 | true | `undefined` — 호 전환 뒤 화자는 확인 창구다(`resolveInCallSmsPlan`과 같은 게이트) |
 *
 * ⚠️ 표 밖 조합(`messenger-link` + `realtime`)은 오늘 호출부가 없다 — 메신저 표면은 실시간 경로가 없다. 그 조합은 현행 메신저 행과
 * 같은 값(전이 여부로 고른다)을 돌려준다(새 판단 0 — 표에 행을 더할 때 architect에 묻는다).
 */
export function installConsentInstructionFor(input: {
  entrySurface: MockScreenEntrySurface;
  escalatedCall: boolean;
  path: InstallConsentPath;
  transferPlaced: boolean;
}): string | undefined {
  if (input.entrySurface === "in-call-sms") {
    if (input.transferPlaced) return undefined;
    return input.path === "realtime" ? IN_CALL_INSTALL_CONSENT_INSTRUCTION : MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL;
  }
  return input.escalatedCall ? MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL : MOCK_INSTALL_CONSENT_INSTRUCTION;
}

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
    mockHost: "support-app-center.invalid",
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
// ⚠️ 아래 7종은 전부 `credential-form`이다(**신규 kind 0건** — D-58). 새로 붙는 화면이 모두
// "정보를 입력하게 만드는 화면"이라 기존 안전 계약(입력 허용·서버 미전송·외부 네비게이션 부재)과
// 정확히 일치하고, kind를 늘리면 안전 계약이 한 벌 더 늘어 AC-072가 금지한 "검증 경로 이중화"에
// 스스로 다가간다.
//
// ⚠️ **§51(사용자 라이브 신고) — `safe-account-transfer`·`card-relief-transfer` 2종이 여기
// 더해졌다.** §45 ⓐ가 판정만 하고 구현이 0줄이던 이체형 랜딩(계좌번호·금액을 입력해 이체를
// 완료하는 화면)의 집행이다. 대상 판정·회피 방지(G319)의 근거는 `docs/Architecture.md` §51.
//
// ⚠️ **§53(§51 커밋 D) — 나머지 이체형 1종 `protect-account-transfer`가 여기 더해졌다.**
// §51.5 판정이 남겨 둔 3순위 후보를, §53이 값(`afterScammerTurns:3`)과 서버 게이트(§53.6 (3))로
// 마무리한 것의 집행이다.
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
// | `parcel-install` | `roleplay/linkMarker.ts:25`(칩 라벨) · `messengerParcelSmishingSms.prompt.ts`(고급 leg 페르소나 · 설치 수법) | "배송 확인 앱 설치하기" | 배송 확인 앱 설치 | "배송 확인 앱을 설치해야 재배송이 접수됩니다" | "권한 허용하고 계속하기" |
// | `loan-refinance-apply` | `scenarios/inCallSms.ts:57-58`(문자 본문·칩) | "아래에서 본인확인 후 신청을 완료해 주세요." | 링크에서 본인확인 → 신청 완료 | "전환 신청서 본인확인이 필요합니다" | "본인확인 완료하기" |
// | `tax-refund-claim` | `scenarios/inCallSms.ts:106-107`(문자 본문·칩) | "아래에서 계좌를 등록하시면 당일 지급됩니다." | 수령 계좌 등록 → 당일 지급 | "환급금 받으실 계좌를 등록해 주세요" | "계좌 등록하기" |
// | `courier-customs-check` | `scenarios/inCallSms.ts:120-121`(문자 본문·칩) | "수취인 정보 불일치로 통관이 보류되었습니다." | 수취인 정보 확인 → 통관 재개 | "수취인 정보가 일치하지 않아 통관이 보류되었습니다" | "수취인 정보 확인하기" |
// | `safe-account-transfer` | `scenarios/inCallSms.ts:87-91`(문자 본문·칩) | "아래에서 안전계좌 이체를 진행해 주세요." | 링크에서 안전계좌 이체 | "안전계좌 이체가 아직 완료되지 않았습니다" | "안전계좌로 이체하기" |
// | `card-relief-transfer` | `scenarios/inCallSms.ts:117-119`(문자 본문·칩) | "아래에서 피해금 이관을 진행해 주세요." | 링크에서 피해금 이관 | "피해금 이관 신청이 완료되지 않았습니다" | "피해금 이관하기" |
// | `protect-account-transfer` | `scenarios/inCallSms.ts:173-175`(문자 본문·칩) | "아래에서 보호계좌로 옮기기를 진행해 주세요." | 링크에서 보호계좌로 옮기기 | "보호계좌로 옮기기가 아직 처리되지 않았습니다" | "보호계좌로 옮기기" |
// | `card-delivery-app-install` | `scenarios/inCallSms.ts` CARD_DELIVERY_CALL(문자 본문·칩 — T194-c-1 Q2) | "아래에서 보안 점검 앱을 설치해 주세요." | 보안 점검 앱 설치 | "보안 점검 앱을 설치해야 사고 접수가 이어집니다" | "권한 허용하고 계속하기" |
// | `card-guard-app-install` | `scenarios/inCallSms.ts` CARD_COMPANY_IMPERSONATION(문자 본문·칩 — T194-c-1 Q2) | "아래에서 피해 차단용 보안 앱을 설치해 주세요." | 피해 차단용 보안 앱 설치 | "피해 차단용 보안 앱을 설치해야 보호 조치가 시작됩니다" | "권한 허용하고 계속하기" |
// | `loan-check-app-install` | `scenarios/inCallSms.ts` LOAN_SCAM(문자 본문·칩 — T194-c-1 Q2) | "아래에서 심사용 보안 점검 앱을 설치해 주세요." | 심사용 보안 점검 앱 설치 | "심사용 보안 점검 앱을 설치해야 대출 심사가 진행됩니다" | "권한 허용하고 계속하기" |
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
    mockHost: "parcel-resend-desk.invalid",
    fields: ["받는 분 성함", "연락처", "받으실 주소"],
    submitLabel: "재배송 신청하기",
    successHeadline: "재배송이 접수되었습니다.",
    momentTactic: "배송 보류를 빌미로 한 개인정보 입력 유도",
    correctAction:
      "문자 링크로 배송 정보를 입력하지 말고 화면을 닫으세요. ① 배송 상태는 주문한 판매처나 택배사 공식 경로에서 직접 조회하기 ② 주소·연락처를 링크로 요구하면 일단 멈추기 ③ 가족이나 가까운 사람에게 화면을 보여 주고 함께 확인하기 ④ 이미 입력했다면 112(경찰)·1332(금융감독원)에 신고하기.",
  },
  // ⭐ T194-a(docs/Architecture.md §84.4.3 · PRD AC-106 (a) · UX UF-012 v1.38 (1) "콘텐츠 1벌") — **고급 세션에서만** 도달하는
  // 모의 앱 설치 화면(UF-012 2단계의 두 번째 사용처). kind = 기존 `app-install`(신규 kind 0). 도달 조건은 카탈로그 소속만으로
  // 끝나지 않는다 — `isMockScreenReachable`(아래)이 세션의 (시나리오 × 난이도)로 거른다(초급 · 중급 응낙 기록 거부 ·
  // 지어낸 링크 마커 강등). 앱 이름은 가상 일반명이다(AC-102 (b) · AC-072).
  {
    landingId: "parcel-install",
    kind: "app-install",
    entrySurface: "messenger-link",
    headline: "배송 확인 앱을 설치해야 재배송이 접수됩니다",
    bodyLines: [
      "주소 확인이 끝나지 않아 재배송 접수가 보류되어 있습니다.",
      "아래에서 배송 확인 앱 설치를 진행해 주세요.",
      "설치 후 접근 권한을 허용하면 상담원이 재배송 접수를 마무리해 드립니다.",
    ],
    issuerLabel: "ⓒ 종합물류 배송확인센터",
    mockHost: "parcel-app-desk.invalid",
    consentLabel: "권한 허용하고 계속하기",
    momentTactic: "재배송 접수를 빌미로 한 앱 설치·권한 허용 유도",
    correctAction:
      "배송 확인을 이유로 앱 설치나 권한 허용을 요구받으면 그 자리에서 허용하지 말고 화면을 닫으세요. ① 배송 상태는 주문한 판매처나 택배사 공식 경로에서 직접 조회하기 ② 설치를 권유받으면 대화를 멈추고 이미 알고 있는 번호로 직접 확인하기 ③ 가족·가까운 사람에게 화면을 보여 주고 함께 확인하기 ④ 이미 허용했다면 112(경찰)·1332(금융감독원)에 신고하기.",
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
    issuerLabel: "ⓒ 대환대출 전환심사팀",
    mockHost: "loan-switch-center.invalid",
    fields: ["성함", "생년월일", "연락처"],
    submitLabel: "본인확인 완료하기",
    successHeadline: "본인확인이 완료되었습니다.",
    momentTactic: "저금리 전환 승인을 빌미로 한 신상정보 입력 유도",
    correctAction:
      "전환 신청서라며 링크로 본인확인을 요구하면 입력하지 말고 화면을 닫으세요. ① 대출 상담은 이미 알고 있는 금융회사 대표번호로 직접 걸어 확인하기 ② 생년월일·연락처를 링크에 넣지 않기 ③ 가족이나 가까운 창구에서 함께 확인하기 ④ 이미 입력했다면 112(경찰)·1332(금융감독원)에 신고하기.",
  },
  // ⭐ T194-c-1(docs/Architecture.md §84.5.2 · §84.16.2 · DECISIONS #191 · AC-105 갱신 고지 1 · 3) — **자가 훈련 고급** loan 세션의 통화 중
  // 설치 문자(`loan-check-app-link`)가 여는 모의 설치 화면(Q2). kind = 기존 `app-install`(신규 kind 0 · AC-072 제약 그대로). 위
  // `loan-refinance-apply`는 **삭제하지 않는다** — 챌린지 고급 loan(`fv-6s5p` 무변경)이 계속 그 링크를 선언한다(#191 · AC-078 (a)).
  {
    landingId: "loan-check-app-install",
    kind: "app-install",
    entrySurface: "in-call-sms",
    headline: "심사용 보안 점검 앱을 설치해야 대출 심사가 진행됩니다",
    bodyLines: [
      "저금리 전환 심사 전에 휴대폰 보안 점검이 남아 있습니다.",
      "아래에서 심사용 보안 점검 앱 설치를 진행해 주세요.",
      "설치 후 접근 권한을 허용하면 상담사가 심사 접수를 이어서 진행해 드립니다.",
    ],
    issuerLabel: "ⓒ 대출심사 보안점검 안내",
    mockHost: "loan-check-app.invalid",
    consentLabel: "권한 허용하고 계속하기",
    momentTactic: "대출 심사를 빌미로 한 보안 점검 앱 설치·권한 허용 유도",
    correctAction:
      "대출 심사를 이유로 앱 설치나 권한 허용을 요구받으면 그 자리에서 허용하지 말고 화면을 닫으세요. ① 대출 상담은 이미 알고 있는 금융회사 대표번호로 직접 확인하기 ② 문자 속 링크로 앱을 설치하지 않기 ③ 가족이나 가까운 창구에서 함께 확인하기 ④ 이미 허용했다면 가족 휴대폰이나 집 전화로 경찰이나 금융감독원에 신고하기.",
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
    mockHost: "refund-pay-center.invalid",
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
    mockHost: "customs-check-desk.invalid",
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
    mockHost: "jasan-boho-center.invalid",
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
    mockHost: "card-relief-desk.invalid",
    fields: ["이관 전용 계좌번호", "이관 금액"],
    submitLabel: "피해금 이관하기",
    successHeadline: "피해금 이관이 접수되었습니다.",
    momentTactic: "부정결제 피해를 빌미로 한 피해금 이관 이체 유도",
    correctAction:
      "'피해금을 다른 계좌로 옮기라'고 하면 그 자리에서 멈추세요 — 카드사는 결제를 막기 위해 고객 돈을 옮기지 않습니다. ① 통화를 끊고 카드 뒷면이나 명세서에 적힌 번호로 직접 확인하기 ② 계좌번호·금액을 문자 링크에 넣지 않기 ③ 가족이나 가까운 은행 창구에서 함께 확인하기 ④ 이미 입력했다면 112(경찰)·1332(금융감독원)에 신고하기.",
  },
  // ⭐ T194-c-1(docs/Architecture.md §84.5.2 · §84.16.2 · DECISIONS #192) — **자가 훈련 고급** card-company 세션의 통화 중 설치 문자
  // (`card-guard-app-link`)가 여는 모의 설치 화면(Q2). 챌린지 고급(`fv-akj5` 무변경 · 문자 선언 0)은 이 화면에 도달하지 않는다.
  {
    landingId: "card-guard-app-install",
    kind: "app-install",
    entrySurface: "in-call-sms",
    headline: "피해 차단용 보안 앱을 설치해야 보호 조치가 시작됩니다",
    bodyLines: [
      "명의 도용 피해가 다른 결제로 번지지 않도록 보호 조치가 필요합니다.",
      "아래에서 피해 차단용 보안 앱 설치를 진행해 주세요.",
      "설치 후 접근 권한을 허용하면 상담원이 보호 조치를 이어서 진행해 드립니다.",
    ],
    issuerLabel: "ⓒ 카드 명의보호 안내센터",
    mockHost: "card-guard-check.invalid",
    consentLabel: "권한 허용하고 계속하기",
    momentTactic: "명의 도용 피해 차단을 빌미로 한 보안 앱 설치·권한 허용 유도",
    correctAction:
      "피해를 막아 주겠다며 앱 설치나 권한 허용을 요구받으면 그 자리에서 허용하지 말고 화면을 닫으세요. ① 통화를 끊고 카드 뒷면이나 명세서에 적힌 번호로 직접 확인하기 ② 문자 속 링크로 앱을 설치하지 않기 ③ 가족이나 가까운 은행 창구에서 함께 확인하기 ④ 이미 허용했다면 가족 휴대폰이나 집 전화로 경찰이나 금융감독원에 신고하기.",
  },
];

// ⭐ T194-c-1(docs/Architecture.md §84.5.2 · §84.15.4 · AC-105 갱신 고지 1) — `card-delivery-call`(고급 전용 · 챌린지 불가) 최초의 모의
// 화면. 통화 중 설치 문자(`card-delivery-app-link`)에서 열린다. 앱 이름은 일반명뿐(AC-102 (b) · AC-072).
const CARD_DELIVERY_CALL: MockScreenItem[] = [
  {
    landingId: "card-delivery-app-install",
    kind: "app-install",
    entrySurface: "in-call-sms",
    headline: "보안 점검 앱을 설치해야 사고 접수가 이어집니다",
    bodyLines: [
      "신청하지 않은 카드 발급 건이 명의 도용 사고로 접수 대기 중입니다.",
      "아래에서 보안 점검 앱 설치를 진행해 주세요.",
      "설치 후 접근 권한을 허용하면 상담원이 사고 접수를 이어서 처리해 드립니다.",
    ],
    issuerLabel: "ⓒ 카드 사고접수 안내",
    mockHost: "card-safe-check.invalid",
    consentLabel: "권한 허용하고 계속하기",
    momentTactic: "카드 명의 도용 사고 접수를 빌미로 한 보안 점검 앱 설치·권한 허용 유도",
    correctAction:
      "카드 사고 접수를 이유로 앱 설치나 권한 허용을 요구받으면 그 자리에서 허용하지 말고 화면을 닫으세요. ① 통화를 끊고 카드 뒷면이나 카드사 공식 경로에서 찾은 번호로 직접 확인하기 ② 문자 속 링크로 앱을 설치하지 않기 ③ 가족이나 가까운 사람에게 화면을 보여 주고 함께 확인하기 ④ 이미 허용했다면 가족 휴대폰이나 집 전화로 경찰이나 금융감독원에 신고하기.",
  },
];

// UF-008 — `bank-protect-account` 문자(§53/§51 커밋 D)에서 열린다. §51.6 R10 — 신규
// `InCallSmsKind`·`MockScreenKind` 0건.
//
// ⚠️ **UX v1.25 정정 — bodyLines 둘째 줄만.** v1.24 원안은 fields 라벨("보호계좌 번호"·"옮길
// 금액")을 문자 그대로 반복해 T116 G194에 걸렸다(institutional·card와 같은 형태).
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
    mockHost: "acct-protect-desk.invalid",
    fields: ["보호계좌 번호", "옮길 금액"],
    submitLabel: "보호계좌로 옮기기",
    successHeadline: "보호계좌로 옮기기가 처리되었습니다.",
    momentTactic: "비정상 출금 차단을 빌미로 한 보호계좌 이체 유도",
    // ⚠️ ①만 다른 이유(의도적, UX-023 v1.24 (2) 각주) — 이 시나리오의 수법 축이 확인 시도
    // 무력화(D3)라 "대표번호로 확인하세요"만 적으면 참가자가 방금 겪은 일(확인했는데도 속았다)과
    // 어긋난다. 가로채기의 수단·원리는 적지 않는다(AC-071 표현 수위) — 적는 것은 "번호를 어디서
    // 얻는가"뿐이다.
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
 * ⚠️ **R6(§15.9.1) — T194-c-1(§84.5.1 J-3 · G583)로 허용목록 대체**: 통화 중 문자(`InCallSmsDoc.fakeLandingId`)로
 * **`app-install`이** 열리는 경로는 `IN_CALL_INSTALL_SCENARIOS`(아래) 3종에서만 열린다. 그 항목을 가리키는 문자는 **고급 변형에서만**
 * 선언되고, 응낙 문서는 시각이 아니라 그 문자 문서의 명시 앵커(`anchorScammerTurn` 복사 — §84.15.3)를 쓴다(R6이 막던 합성 타임스탬프
 * 얽힘의 원인 제거). 허용목록 밖의 통화 시나리오는 여전히 양쪽(`IN_CALL_SMS` R6 단언 · 카탈로그 G-A)에서 막힌다.
 *
 * ⚠️ **T104**: 통화 경로 `credential-form` 랜딩 3종이 여기 등재된다. 이들은 `turnInstruction`을
 * 만들지 않고(`listAppInstallMockScreens` 게이팅), `consentedAt`도 가질 수 없어(콜러블이 거부)
 * G55가 막던 지시 경합(M1)과 R6이 막던 앵커 얽힘(M2) 어느 쪽도 발생시키지 않는다(§19.1 (2)).
 *
 * ⚠️ **§51**: `institutional-impersonation`·`card-company-impersonation`이 여기 신규
 * 등재된다(§45 ⓐ 집행 — 통화 경로 `credential-form` 이체형 랜딩 각 1건, `IN_CALL_SMS`의
 * `institution-safe-account`·`card-relief-account`가 병기한 `fakeLandingId`를 가리킨다).
 * G159 트립와이어 — 두 시나리오 모두 도달 가능 랜딩은 **1건뿐**이다.
 *
 * ⚠️ **§53(§51 커밋 D)**: `bank-security-verify-scam`이 여기 신규 등재된다(OQ-A31 (b) 집행 —
 * `IN_CALL_SMS`의 `bank-protect-account`가 병기한 `fakeLandingId`를 가리킨다). 이 시나리오도
 * 도달 가능 랜딩은 **1건뿐**이다(G159).
 */
export const MOCK_SCREENS: Record<string, MockScreenItem[]> = {
  "messenger-subsidy-smishing-sms": MESSENGER_SUBSIDY_SMISHING_SMS,
  "messenger-parcel-smishing-sms": MESSENGER_PARCEL_SMISHING_SMS,
  "institutional-impersonation": INSTITUTIONAL_IMPERSONATION,
  "card-company-impersonation": CARD_COMPANY_IMPERSONATION,
  "loan-refinance-scam": LOAN_REFINANCE_SCAM,
  "tax-refund-scam": TAX_REFUND_SCAM,
  "courier-customs-scam": COURIER_CUSTOMS_SCAM,
  "bank-security-verify-scam": BANK_SECURITY_VERIFY_SCAM,
  // T194-c-1(§84.5.2) — 카탈로그 신설(이 시나리오 첫 항목 · 통화 중 설치 화면 1건).
  "card-delivery-call": CARD_DELIVERY_CALL,
};

/**
 * ⭐ T194-c-1(docs/Architecture.md §84.5.1 G-A 대체 · J-3 · G583) — 통화 중 문자 표면(`in-call-sms`)에서 `app-install`이 열려도 되는
 * 시나리오 **허용목록**(DECISIONS #177 · AC-105 갱신 고지 1). 이 목록 밖에서는 통화 중 설치 화면이 카탈로그에 들어올 수 없고(G583
 * 테스트) 도달 술어도 거짓이다(`isMockScreenReachable`). 챌린지 배정 풀의 판별(`variantPool.ts` `expectsInCallInstall`)도 이 상수를
 * 재사용한다(두 목록 금지).
 */
export const IN_CALL_INSTALL_SCENARIOS: readonly string[] = [
  "card-delivery-call",
  "card-company-impersonation",
  "loan-refinance-scam",
];

/**
 * ⭐ T194-c-1(§84.16.1 · §84.15.4 G608) — 이 통화 중 문자가 **설치 화면을 여는 문자**인가(카탈로그 문자의 `fakeLandingId`가 그 시나리오
 * 카탈로그의 `app-install` 랜딩). 데이터에서 도출하는 **단일 판별자**다(새 필드 0) — 챌린지 풀(`variantPool.ts` `declaresInCallInstall`) ·
 * 결과 신호 제외(`inCallSms/confirmResult.ts`) · 실시간 프로바이더 라우팅(`realtime/provider.ts`)이 전부 이 함수를 거친다.
 */
export function isInCallInstallSms(scenarioId: string, smsId: string): boolean {
  const landingId = findInCallSmsItem(scenarioId, smsId)?.fakeLandingId;
  return landingId !== undefined && resolveMockScreenKind(scenarioId, landingId) === "app-install";
}

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

/**
 * ⭐ T194-a(docs/Architecture.md §84.4.4 · G582 · PRD AC-106 (f)(h) ⓐ) — **이 세션에서** 그 카탈로그 항목에 도달할 수 있는가.
 * 카탈로그 소속(`findMockScreenItem` — G12)은 시나리오 단위라, 같은 시나리오 안에서 난이도로 갈리는 항목(parcel 고급의
 * `parcel-install`)을 거르지 못한다. 이 술어가 그 둘째 거름이다.
 *
 * | 항목 | 도달 조건 |
 * |---|---|
 * | `credential-form` | 현행 그대로 — 카탈로그 소속이면 도달 가능 |
 * | `app-install` · `messenger-link` · 시나리오가 `escalation` 보유(지원금) | 현행 그대로 — 세 난이도 모두 도달 가능 |
 * | `app-install` · `messenger-link` · 시나리오가 `advancedEscalation`만 보유(택배) | 이 세션의 (시나리오 × 난이도) 전이가 있을 때만(`resolveSessionEscalation`) — 초급 · 중급 · 2인 챌린지 = 불가 |
 * | `app-install` · `in-call-sms`(Q2 — T194-c-1 §84.15.7 단계 3) | 시나리오가 `IN_CALL_INSTALL_SCENARIOS` 소속일 때만(위 도달 집합 AND 유지 —
 *   선언 문자가 그 랜딩을 가리키는 변형 = 자가 고급만). "그 문자가 **이 세션에 도착**했다"는 조건은 Firestore를 읽어야 해서
 *   `recordMockScreenEvent`가 같은 get으로 따로 검사한다(§84.4.4 3행 · §84.15.3) |
 *
 * 쓰는 곳: `recordMockScreenEvent`(도달 불가면 `failed-precondition` — 검증 ⑤) · `extractLinkMarker`(지어낸 마커 강등) ·
 * 리포트 단계 파생(`installIntended`).
 */
export function isMockScreenReachable(
  session: EscalationSessionView & { flowVariantId?: string },
  item: MockScreenItem,
): boolean {
  // ⭐ §84.13.2 G588 흡수 — 먼저 **세션 도달 가능 집합**(그 세션 변형 프롬프트의 마커 ∪ 선언 문자의 랜딩)에 있어야 한다(전 kind).
  // 아래 표의 조건은 그 위에 AND로 남는다(택배 고급 챌린지처럼 변형 프롬프트에는 있어도 전이가 없는 세션을 거른다).
  if (!sessionReachableLandingIds(session.scenarioId, session.flowVariantId).includes(item.landingId)) return false;
  if (item.kind !== "app-install") return true;
  // T194-c-1(§84.15.7 단계 3 · G583) — 통화 중 문자 표면의 설치는 허용목록 시나리오에서만(그 밖은 닫힌 쪽).
  if (item.entrySurface === "in-call-sms") return IN_CALL_INSTALL_SCENARIOS.includes(session.scenarioId);
  // 표의 2 · 3행을 한 식으로 — `escalation` 보유 시나리오는 세션 술어가 세 난이도 · 챌린지 모두에서 값을 내므로 "현행 그대로"와
  // 같고, `advancedEscalation`만 가진 시나리오는 고급 자가 세션에서만 값을 낸다(메타 필드 직접 읽기 0 — G580).
  return resolveSessionEscalation(session, PUBLIC_SCENARIOS) !== undefined;
}

/**
 * T194-a(§84.4.4 "링크 마커 처리") — 도달 불가 `app-install` 마커를 강등할 **그 시나리오의 기본 credential 랜딩**(메신저 링크
 * 표면의 첫 `credential-form` 항목). 없으면 `undefined`(호출부가 첨부를 만들지 않는다). ⛔ `app-install` 방향 폴백은 여전히 0이다(R5).
 */
export function findDefaultCredentialLanding(scenarioId: string): MockScreenItem | undefined {
  return (MOCK_SCREENS[scenarioId] ?? []).find(
    (item) => item.kind === "credential-form" && item.entrySurface === "messenger-link",
  );
}
