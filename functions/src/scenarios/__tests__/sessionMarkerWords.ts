// T187 — 세션 중 '모의/훈련' 표식 낱말 **단일 정본** (docs/Architecture.md §72.7 G437·G440·G446 ·
// PRD v1.18 AC-086 (b)(d)(e)).
//
// ⚠️ **테스트 헬퍼다.** 테스트 글롭(`lib/**/__tests__/*.test.js`)에 잡히지 않고, 런타임 코드는 이 파일을
// import하지 않는다. 루트(`src/lib/sessionboundary/inSessionMarkers.test.ts`)는 별도 빌드 루트라
// import 대신 **이 소스 텍스트를 파싱해** 쓴다(`harmlessnessScreens.test.ts`의 정본 파싱 관례) —
// 사본이 없으므로 드리프트도 없다. ⛔ 그래서 아래 배열은 **한 줄 한 원소** 서식을 지킨다.
//
// ⛔ 적용 범위(X-8): 세션 중 **앱 화면 문면·스크린리더 이름**(G437/G440)과 **프롬프트 대사 층**(G446)
// 뿐이다. 시나리오 콘텐츠(사기범 대사·문자 본문·랜딩 카탈로그)에는 걸지 않는다 — "가상" 등 정당한
// 사기 수법 낱말을 오탐한다(AC-086 (b)). 모델 출력의 런타임 검사·차단도 하지 않는다(AC-086 (e)).

/** AC-086 (b) 낱말. */
export const SESSION_MARKER_WORDS: readonly string[] = [
  "모의",
  "훈련용",
  "AI 훈련용",
  "가상",
  "재현",
];

/** AC-086 (d) — 상호작용 직후·상시 부정 고지의 형태. */
export const IN_SESSION_NEGATION_PATTERNS: readonly RegExp[] = [
  /실제로는/,
  /실제로 전화가 걸리지/,
  /전송되지 않았/,
  /설치되지 않았/,
  /부여되지 않았/,
  /실제 \S+(이|가) 아닙니다/,
  /실제 \S+(이|가) 아니며/,
];
