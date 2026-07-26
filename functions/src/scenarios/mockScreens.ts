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

export type MockScreenItem = {
  /** 카탈로그 안에서 유일한 id. `MessengerAttachment.fakeLandingId`와 같은 값이며
   * Firestore `sessions/{sid}/mockScreens/{landingId}`의 문서 id가 된다(멱등). */
  landingId: string;
  kind: MockScreenKind;
  /** 목업 제목 — **실존 앱명 금지**(AC-072). */
  headline: string;
  /** 가짜 설치 안내 문구. */
  bodyLines: string[];
  /** 가짜 "권한 허용" 버튼 라벨(`app-install` 전용) — 실제 권한 요청이 아니다. */
  consentLabel: string;
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
    headline: "업무처리 확인 앱을 설치해야 진행됩니다",
    bodyLines: [
      "지원금 신청은 본인확인 절차가 끝난 뒤에 접수됩니다.",
      "아래에서 확인용 앱 설치를 진행해 주세요.",
      "설치 후 접근 권한을 허용하면 담당자가 신청을 대신 처리해 드립니다.",
    ],
    consentLabel: "권한 허용하고 계속하기",
    momentTactic: "앱 설치·원격 허용 유도",
    correctAction:
      "설치나 권한 허용을 요구받으면 그 자리에서 허용하지 말고 화면을 닫으세요. ① 앱은 기관 공식 경로에서만 설치하기 ② 설치를 권유받으면 대화를 멈추고 이미 알고 있는 번호로 직접 확인하기 ③ 가족·가까운 창구에서 함께 확인하기 ④ 이미 허용했다면 112(경찰)·1332(금융감독원)에 신고하기.",
  },
];

/**
 * 시나리오별 모의 화면 카탈로그(`IN_CALL_SMS` 미러 — `Record<scenarioId, Item[]>`).
 *
 * **카탈로그가 없는 시나리오는 이 기능이 아예 켜지지 않는다** — `landingKind`가 부착되지 않아
 * attachment 문서가 도입 전과 한 바이트도 같고, `sendMessage`의 추가 read도 일어나지 않는다
 * (`hasInCallSms(...)` 게이팅과 동형 — 나머지 12개 시나리오 회귀 0).
 *
 * ⚠️ **R6(§15.9.1)**: 통화 중 문자(`InCallSmsDoc.fakeLandingId`)로 `app-install`이 열리는 경로는
 * 이번 범위 밖이다 — `IN_CALL_SMS`에 이 카탈로그의 landingId를 참조하는 항목을 두지 않는다
 * (테스트로 고정). UF-012의 설치는 **메신저 단계**에서 일어난다.
 */
export const MOCK_SCREENS: Record<string, MockScreenItem[]> = {
  "messenger-subsidy-smishing-sms": MESSENGER_SUBSIDY_SMISHING_SMS,
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
