// 무해화(harmlessness) 금지 패턴 **단일 정본** — T86 / AC-075 (b)(c).
//
// ⚠️ **이 파일은 테스트 헬퍼다.** `functions/package.json`의 테스트 글롭은
// `lib/**/__tests__/*.test.js`라 이 파일(`harmlessnessPatterns.js`)은 러너에 잡히지 않고,
// 테스트 파일들이 import해서 쓴다. 런타임 코드는 이 파일을 import하지 않는다.
//
// **왜 만들었나(T86 (b) 지시 — "중복 구현하지 말고 공통화하거나 재사용")**: 금지 패턴 검사가
// 태스크마다 따로 자라 **네 곳에 흩어져 있었다.**
//   | 기존 위치 | 검사하던 것 | 적용 대상 |
//   |---|---|---|
//   | `scenarios.test.ts` `assertNoOperationalFraudInfo` | 8자리+ 연속 숫자 · http(s) | 시나리오 프롬프트·공개 메타 |
//   | `verifyIntercept.test.ts` `REAL_WORLD_FORBIDDEN` | 실존 기관명·대표번호 | 확인 무력화 카탈로그 3필드 |
//   | `mockScreens.test.ts` `REAL_WORLD_APP_NAMES` + 스토어 정규식 | 실존 앱명·스토어 URL | 모의 화면 카탈로그 |
//   | `mockScreenCopy.test.ts` | 앱명·URL·설치 토큰(클라 소스) | `MessengerFakeLanding.tsx` |
// 각 목록이 **자기 카탈로그에만** 걸려 있어, 예컨대 확인 무력화 카탈로그에 실존 앱명이 들어와도
// 아무도 잡지 못했다. 이 파일이 목록의 정본이 되고 위 파일들은 여기서 가져다 쓴다.
//
// ⚠️ **적용 범위를 목록이 아니라 "프로파일 표"로 정한다(임의 판단 금지).** 전역 금지어로 만들면
// **제품 요구를 스스로 위반**한다 — AC-071은 리포트 대처 문구에 신고처(112·1332)를 **명시 요구**하고,
// PRD의 기관 사칭 시나리오는 사칭 **대상**으로서 실존 기관명("검찰·금융감독원"·"국세청")을 제목·
// 페르소나에 갖는 것이 콘텐츠 그 자체다. 그래서 아래 `SCAN_PROFILES`가 표면별로 어떤 패턴군을
// 적용할지 못박는다.

export type PatternFamily =
  /** 운영 가능한 페이로드 — 8자리 이상 연속 숫자(실계좌 형태)·실 URL (기존 AC-005 검사). */
  | "operationalPayload"
  /** 실 스토어 URL·설치 파일·패키지명·딥링크 (T86 신규 요구). */
  | "storeAndInstall"
  /** 실존 앱·서비스명 (T86 신규 요구 — 기존엔 모의 화면 카탈로그에만 걸려 있었다). */
  | "realAppName"
  /** 실존 기관 대표번호 (T86 신규 요구 — 기존엔 확인 무력화 카탈로그에만 걸려 있었다). */
  | "realHotline"
  /** 실제 원격제어·권한 조작 **절차** (T86 신규 요구). */
  | "remoteControlProcedure"
  /** 확인 전화 가로채기의 **수단** 서술 (T83이 카탈로그에만 걸어 뒀던 것을 전 도메인으로). */
  | "interceptionMeans"
  /** 실존 기관명 — **사칭 대상이 아닌 모의 표면에만** 적용한다(아래 프로파일 표 참고). */
  | "realInstitutionName";

/**
 * 실존 기관 대표번호. ⚠️ 3자리 이하는 임의 숫자열에 우연히 박히므로 **숫자 경계**로 검사한다
 * (4자리 이상은 기존 `verifyIntercept.test.ts`와 동일하게 부분 문자열).
 * 모의 번호 형식은 `/^\d{3,4}-0000$/`(§16.1.3)이라 실제 대표번호 접두와 겹치면 여기서 걸린다.
 */
export const REAL_WORLD_HOTLINES: readonly string[] = [
  "112", // 경찰
  "119", // 소방·구조
  "118", // 인터넷침해대응
  "182", // 경찰 민원
  "1301", // 검찰
  "1332", // 금융감독원
  "1350", // 고용노동부
  "1355", // 국민연금
  "1372", // 소비자상담
  "1544",
  "1566",
  "1577",
  "1588",
  "1599",
];

/**
 * 실존 기관명. ⚠️ **적용 대상은 모의 창구·모의 번호·모의 화면 문구뿐**이다 — 시나리오 페르소나·
 * 제목은 사칭 **대상**으로 이 이름들을 쓰는 것이 콘텐츠이며(PRD "기관 사칭(검찰·금융감독원)",
 * "국세청 환급금 빙자"), 리포트 대처 문구는 AC-071이 신고처 기관명을 명시 요구한다.
 */
export const REAL_WORLD_INSTITUTION_NAMES: readonly string[] = [
  "국세청",
  "경찰청",
  "금융감독원",
  "검찰청",
  "금감원",
  "우체국",
  "관세청",
  "국민건강보험공단",
  "국민연금공단",
  "한국은행",
  "예금보험공사",
];

/**
 * 기존 `verifyIntercept.test.ts`가 쓰던 목록의 정본(대표번호 ∪ 기관명). 그 파일은 이 배열을
 * `.includes()`로 쓰므로 문자열 배열 형태를 유지한다.
 */
export const REAL_WORLD_FORBIDDEN: readonly string[] = [
  ...REAL_WORLD_HOTLINES,
  ...REAL_WORLD_INSTITUTION_NAMES,
];

/**
 * 실존 앱·서비스명. ⚠️ **"카카오톡"은 넣지 않는다** — OQ-18 확정(정확 모사, accepted risk)으로
 * 메신저 시나리오 제목이 "(카카오톡)"을 갖는다. 금지 대상은 **금융·인증·원격제어 앱**이다.
 */
export const REAL_WORLD_APP_NAMES: readonly string[] = [
  // 금융·간편결제
  "카카오뱅크",
  "카카오페이",
  "토스",
  "네이버",
  "국민은행",
  "KB스타뱅킹",
  "신한",
  "우리은행",
  "하나은행",
  "농협",
  "기업은행",
  "새마을금고",
  "케이뱅크",
  "삼성페이",
  "페이코",
  "뱅크샐러드",
  // 공공·세무
  "정부24",
  "손택스",
  "홈택스",
  "정부민원포털",
  // 원격제어·원격지원(AC-072가 이름을 콕 집어 금지한 계열)
  "AnyDesk",
  "TeamViewer",
  "애니데스크",
  "팀뷰어",
  "RustDesk",
  "QuickSupport",
  "퀵서포트",
  "Splashtop",
  "LogMeIn",
  "AirDroid",
  "VNC",
];

/**
 * 실 스토어·설치 경로 표기(문구·값 층위). 클라 소스 토큰 스캔은 `mockScreenCopy.test.ts`가 맡는다.
 *
 * ⚠️ **한글이 닿는 패턴에 `\b`를 쓰지 마라(T86 reviewer Major 1).** JS의 `\b`는 **ASCII 단어 경계**라
 * 한글 앞뒤에서는 경계가 성립하지 않는다 — `/\bplay\s*스토어\b/`는 `"play 스토어"`·`"Play 스토어"`를
 * **하나도 잡지 못한다**(검출력 0인데 겉보기엔 정상 규칙이라 더 위험하다). 이 파일을 만든 이유가
 * 정확히 그 버그를 없애는 것이었는데 최초 작성에서 같은 형태가 그대로 옮겨 심어졌다.
 * 아래 `[T86/생존] 모든 규칙이 자기 양성 샘플을 실제로 잡는다` 테스트가 재발을 막는다.
 */
export const STORE_AND_INSTALL_PATTERNS: readonly RegExp[] = [
  /https?:\/\//i,
  /\.apk\b/i,
  /\.ipa\b/i,
  /\bplay\.google\b/i,
  /\bapps\.apple\b/i,
  /\bapp\s*store\b/i,
  /\bappstore\b/i,
  // 안드로이드 한국어 UI의 실제 표기가 "Play 스토어"라 한영 혼용형을 따로 둔다(형제 규칙
  // `/플레이\s*스토어/`와 중복이 아니다). `\b` 없이 — 위 경고 참고.
  /play\s*스토어/i,
  /플레이\s*스토어/,
  /앱\s*스토어/,
  /원스토어/,
  /\bmarket:\/\//i,
  /\bintent:\/\//i,
  /\bpackage(Name)?\s*[:=]/i,
];

/**
 * 실제 원격제어·권한 조작 **절차**. ⚠️ 재현 대상은 "설치·허용을 요구받는 상황"이지 **조작 방법**이
 * 아니다(AC-005/AC-072). "접근 권한을 허용하면"처럼 **결과만 말하는 문구는 금지가 아니다** —
 * 아래 패턴은 전부 실제로 따라 할 수 있는 **경로·토글 이름**을 겨냥한다.
 */
export const REMOTE_CONTROL_PROCEDURE_PATTERNS: readonly RegExp[] = [
  /접근성\s*(서비스|권한|설정)/,
  /화면\s*(공유|미러링)[을를]?\s*(켜|허용|활성)/,
  /원격\s*(제어|지원)[^.\n]{0,12}(설치|연결|접속)\s*(방법|절차|법)/,
  /알림\s*접근\s*권한[^.\n]{0,8}(켜|허용|활성)/,
  /개발자\s*(옵션|모드)[^.\n]{0,8}(켜|활성|들어가)/,
  /알\s*수\s*없는\s*(출처|앱)[^.\n]{0,10}(허용|설치|켜)/,
  /출처를?\s*알\s*수\s*없는\s*앱/,
  /USB\s*디버깅/i,
  /기기\s*관리자\s*권한[^.\n]{0,8}(허용|활성)/,
  /설정\s*[>·→-]\s*(보안|앱|일반)/,
];

/**
 * 확인 전화 가로채기의 **수단** 서술. T83이 `verifyIntercept.test.ts`의 모델 지시 2필드에만,
 * T95가 신규 시나리오 콘텐츠에만 걸어 뒀던 검사를 전 도메인으로 넓힌다(AC-005 불변 —
 * 재현되는 것은 "걸었더니 받더라"는 **상황**뿐이다).
 */
export const INTERCEPTION_MEANS_PATTERNS: readonly RegExp[] = [
  /착신\s*전환/,
  /포워딩/,
  /중계기/,
  /번호\s*목록/,
  /앱을\s*설치하면\s*통화가/,
];

/** AC-005 기존 검사 — 실계좌로 보이는 8자리 이상 연속 숫자 · 실 URL. */
export const LONG_DIGIT_SEQUENCE = /\d{8,}/;
export const URL_PATTERN = /https?:\/\//i;

export type ForbiddenRule = {
  family: PatternFamily;
  label: string;
  pattern: RegExp;
  /**
   * **금지형 문맥 예외를 받는가**(아래 판정 규칙 참고). 기본 `false`.
   *
   * ⚠️ **이 저장소의 기존 관례**다 — `verifyIntercept.test.ts`의 `[OQ-38/D-6]`와
   * `scenarios.test.ts`의 `[AC-071/OQ-38]`가 이미 *"등장 자체를 막는 대신, 등장할 때 반드시
   * 금지형이어야 한다"* 로 판정한다. 프롬프트가 모델에게 *"실존 앱 이름·앱스토어를 절대 말하지
   * 않는다"* 라고 **지시하는 문장**은 무해화를 **강화**하는 문구이지 위반이 아니다.
   *
   * | 패턴 | 예외 | 이유 |
   * |---|---|---|
   * | 실 URL·스킴·`.apk`·패키지명·실 도메인 | ✗ | 금지형 문장 안에 있어도 **문자열 자체가 산출물에 남는다** |
   * | 8자리+ 연속 숫자 | ✗ | 동일 |
   * | 실존 대표번호 | ✗ | 동일(따라 걸 수 있는 값이다) |
   * | 스토어 **일반명**(앱 스토어·플레이 스토어·원스토어) | ✓ | 값이 아니라 이름이다 |
   * | 실존 앱명·실존 기관명 | ✓ | 동일 |
   * | 원격제어 절차·가로채기 수단 | ✗ | T83/T95가 **평면 금지**로 세웠다 — 완화하지 않는다 |
   */
  exemptInProhibition?: true;
};

/**
 * 금지형 문맥 마커. 매치 지점 앞 30자 ~ 뒤 60자 창 안에 있으면 "쓰지 말라는 지시"로 본다
 * (기존 `[OQ-38/D-6]` 검사가 쓰는 60자 창과 같은 크기).
 */
const PROHIBITIVE_CONTEXT =
  /하지\s*않는다|하지\s*마라|하지\s*말고|말하지|쓰지\s*않는다|출력하지\s*않는다|넣지\s*않는다|대지\s*않는다|절대|금지/;

function isProhibitiveMention(text: string, at: number): boolean {
  return PROHIBITIVE_CONTEXT.test(text.slice(Math.max(0, at - 30), at + 60));
}

/** 문자열 리터럴 → 정규식. 숫자 3자리 이하는 숫자 경계로 감싼다(우연한 부분 일치 방지). */
function literalRule(
  family: PatternFamily,
  value: string,
  exemptInProhibition?: true,
): ForbiddenRule {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern =
    /^\d+$/.test(value) && value.length <= 3
      ? new RegExp(`(?<!\\d)${escaped}(?!\\d)`)
      : new RegExp(escaped, "i");
  return { family, label: value, pattern, ...(exemptInProhibition ? { exemptInProhibition } : {}) };
}

function patternRules(
  family: PatternFamily,
  patterns: readonly RegExp[],
  exemptInProhibition?: true,
): ForbiddenRule[] {
  return patterns.map((pattern) => ({
    family,
    label: String(pattern),
    pattern,
    ...(exemptInProhibition ? { exemptInProhibition } : {}),
  }));
}

/**
 * 스토어 **일반명**만 금지형 예외를 받는다(실 도메인·스킴·확장자는 위 표대로 예외 없음).
 * ⚠️ `"Play 스토어"`와 `"플레이 스토어"`는 **같은 것의 두 표기**이므로 반드시 같은 버킷에 둔다 —
 * 한쪽만 예외를 받으면 같은 금지형 문장이 표기에 따라 다르게 판정된다.
 */
const STORE_NAME_ONLY_PATTERNS: readonly RegExp[] = [
  /\bapp\s*store\b/i,
  /\bappstore\b/i,
  /play\s*스토어/i,
  /플레이\s*스토어/,
  /앱\s*스토어/,
  /원스토어/,
];
const STORE_VALUE_PATTERNS: readonly RegExp[] = STORE_AND_INSTALL_PATTERNS.filter(
  (pattern) => !STORE_NAME_ONLY_PATTERNS.some((namePattern) => String(namePattern) === String(pattern)),
);

/** 전 패턴군의 평면 목록 — 프로파일이 이 중 어떤 군을 켤지 고른다. */
export const FORBIDDEN_RULES: readonly ForbiddenRule[] = [
  ...patternRules("operationalPayload", [LONG_DIGIT_SEQUENCE, URL_PATTERN]),
  ...patternRules("storeAndInstall", STORE_VALUE_PATTERNS),
  ...patternRules("storeAndInstall", STORE_NAME_ONLY_PATTERNS, true),
  ...patternRules("remoteControlProcedure", REMOTE_CONTROL_PROCEDURE_PATTERNS),
  ...patternRules("interceptionMeans", INTERCEPTION_MEANS_PATTERNS),
  ...REAL_WORLD_APP_NAMES.map((name) => literalRule("realAppName", name, true)),
  ...REAL_WORLD_HOTLINES.map((num) => literalRule("realHotline", num)),
  ...REAL_WORLD_INSTITUTION_NAMES.map((name) => literalRule("realInstitutionName", name, true)),
];

/**
 * ⭐ **판정표 — 표면별로 어떤 패턴군을 적용하는가(임의 판단 금지, 표에 없는 표면은 등록부에서
 * 걸린다).** 열이 빠진 칸에는 반드시 "왜 빼는가"가 근거와 함께 적혀 있어야 한다.
 *
 * | 프로파일 | payload | store | app | hotline | remote | intercept | institution |
 * |---|---|---|---|---|---|---|---|
 * | `scenarioContent` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ ← 사칭 **대상**이 곧 콘텐츠(PRD 제목/페르소나) |
 * | `mockSurface`     | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ ← 모의 창구·모의 화면은 실존을 흉내 내면 안 된다 |
 * | `modelInstruction`| ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ ← 지시가 사칭 캐릭터를 지목할 수 있다 |
 * | `correctiveGuidance` | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ ← AC-071이 신고처(112·1332·금감원)를 **명시 요구** |
 * | `assembledPrompt` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ ← persona를 포함하므로 `scenarioContent`와 동일 |
 *
 * ⚠️ `correctiveGuidance`에서 `operationalPayload`를 빼는 이유: 대처 문구는 신고 전화번호를
 * 나열하며 `LONG_DIGIT_SEQUENCE`와 무관하지만, 신고처 번호가 늘어 8자리 형태가 되는 경우를
 * 미리 허용한다. 대신 스토어·앱명·원격절차는 그대로 금지다(대처 문구에 들어갈 이유가 없다).
 */
export const SCAN_PROFILES = {
  scenarioContent: [
    "operationalPayload",
    "storeAndInstall",
    "realAppName",
    "realHotline",
    "remoteControlProcedure",
    "interceptionMeans",
  ],
  mockSurface: [
    "operationalPayload",
    "storeAndInstall",
    "realAppName",
    "realHotline",
    "remoteControlProcedure",
    "interceptionMeans",
    "realInstitutionName",
  ],
  modelInstruction: [
    "operationalPayload",
    "storeAndInstall",
    "realAppName",
    "realHotline",
    "remoteControlProcedure",
    "interceptionMeans",
  ],
  correctiveGuidance: [
    "storeAndInstall",
    "realAppName",
    "remoteControlProcedure",
    "interceptionMeans",
  ],
  assembledPrompt: [
    "operationalPayload",
    "storeAndInstall",
    "realAppName",
    "realHotline",
    "remoteControlProcedure",
    "interceptionMeans",
  ],
} as const satisfies Record<string, readonly PatternFamily[]>;

export type ScanProfile = keyof typeof SCAN_PROFILES;

export type Violation = { family: PatternFamily; label: string; excerpt: string };

/** 이 텍스트가 프로파일의 금지 패턴에 걸리는 지점을 전부 돌려준다(빈 배열 = 통과). */
export function scanText(text: string, profile: ScanProfile): Violation[] {
  const families = SCAN_PROFILES[profile] as readonly PatternFamily[];
  const violations: Violation[] = [];
  for (const rule of FORBIDDEN_RULES) {
    if (!families.includes(rule.family)) continue;
    const match = rule.pattern.exec(text);
    if (match === null) continue;
    const at = match.index;
    // 금지형 문맥 예외 — "…를 절대 말하지 않는다"는 무해화를 **강화**하는 문장이다(위 판정표).
    if (rule.exemptInProhibition === true && isProhibitiveMention(text, at)) continue;
    violations.push({
      family: rule.family,
      label: rule.label,
      excerpt: text.slice(Math.max(0, at - 20), at + 40),
    });
  }
  return violations;
}

export type Surface = {
  /** 어느 카탈로그·모듈에서 왔는가(도메인 등록부 게이트가 이 값으로 1:1을 센다). */
  domain: string;
  /** 카탈로그 안의 항목 식별자(scenarioId·landingId·offerId·smsId 등). */
  itemId: string;
  /** 항목 안의 필드 이름(필드 전수 게이트가 이 값으로 1:1을 센다). */
  field: string;
  text: string;
  profile: ScanProfile;
};

/** 표면 목록 전체를 훑어 위반을 모은다. 테스트는 결과가 비어 있음을 단언한다. */
export function scanSurfaces(surfaces: readonly Surface[]): string[] {
  const failures: string[] = [];
  for (const surface of surfaces) {
    for (const violation of scanText(surface.text, surface.profile)) {
      failures.push(
        `${surface.domain}/${surface.itemId}.${surface.field} [${surface.profile}] ` +
          `— ${violation.family}: ${violation.label} :: "${violation.excerpt}"`,
      );
    }
  }
  return failures;
}
