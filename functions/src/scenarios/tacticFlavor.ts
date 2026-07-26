// weakenedTactics 항목("라벨 — 3인칭 설명, 예: '...식으로 위협하되, 실제 법적 조치는 제시하지
// 않는다'") 공통 파싱 유틸(2026-07-24, 사용자 실측 신고로 발견한 리포트 정확도 버그 수정의
// 일부). 원래 이 로직은 functions/src/llm/mockClient.ts(대사 생성용)와 functions/src/report/
// analyzeConversation.ts(대사 분석용)에 각각 따로 구현되어 있었다 — mockClient.ts가 2026-07-22에
// "인용구('...')만 뽑아 대사로 쓴다"로 개선됐지만 analyzeConversation.ts는 예전 "— 이후 설명부
// 전체" 방식 그대로 남아있어 두 구현이 어긋났다. 그 결과 MockLlmClient가 실제로 생성한 대사(인용구
// 기반)와 analyzeConversation.ts의 findMatchedTactic()이 찾으려는 문자열(설명부 전체 앞 8자, 인용
// 부호 포함)이 서로 달라 tacticsUsed가 항상 빈 배열로 나오는 회귀가 있었다(라이브 에뮬레이터로
// 재현·확인). 이제 양쪽이 이 모듈 하나만 참조해 같은 텍스트를 산출하므로 "대사에 심은 문구"와
// "리포트가 찾는 문구"가 구조적으로 같은 값이 된다 — 같은 로직을 두 곳에 복제해 생기는 드리프트를
// 원천 차단한다.
export const STRUCTURED_MARKER_PATTERN = /\[\[(?:LINK|SIGNAL):[a-zA-Z0-9_-]+\]\]/g;

export function extractStructuredMarkers(tacticText: string): string[] {
  return [...tacticText.matchAll(STRUCTURED_MARKER_PATTERN)].map((m) => m[0]);
}

/** "라벨 — 설명" 형식에서 라벨만 취한다(scenarioPrompts, ADR-0004). */
export function extractTacticLabel(tacticText: string): string {
  const dashIndex = tacticText.indexOf("—");
  return (dashIndex === -1 ? tacticText : tacticText.slice(0, dashIndex)).trim();
}

/**
 * ⚠️ **저작 규칙 — 홑따옴표는 "사기범이 말할 대사"에만 붙인다**(T92 구현 중 발견, 2026-07-27).
 *
 * 아래 함수는 인용구를 **전부 순서대로 join**해 (a) MockLlmClient의 대사, (b)
 * `analyzeConversation.findMatchedTactic`의 검색 문자열(**앞 8자**)로 쓴다. 그래서 부인 대응 계열
 * 수법을 *"상대가 '자녀 없다'고 하면 …"* 처럼 쓰면 **참가자의 대사가 사기범 Mock 대사 맨 앞에
 * 박히고**, 리포트 매칭도 그 8자로 돌아가 실 LLM 세션에서는 그 수법이 `tacticsUsed`에 거의 잡히지
 * 않는다.
 *
 * **현황(실측, 고치지 않고 기록만 한다 — 각각 T91/T95 범위이고 개명·수정은 별건이다)**:
 *   | 위치 | 첫 인용구 | 상태 |
 *   |---|---|---|
 *   | `loanScam.prompt.ts` "부인 시 이익 전환" | `'대출 받은 적 없다'`(참가자 대사) | ⚠️ 누수 |
 *   | `bankSecurityVerifyScam.prompt.ts` "부인 시 명의 도용 암시" | `'내 계좌 아니다'`(참가자 대사) | ⚠️ 누수 |
 *   | T92가 6종에 추가한 부인 대응 5종 | 사기범 대사 | ✅ 회피(참가자 대사는 따옴표 없이 서술) |
 * 위 2건을 손볼 때는 **함께 정리**할 것.
 */
/** 설명문 안의 '인용구'(캐릭터가 실제로 말했을 법한 대사)만 뽑아 반환한다. 인용구가 없으면(향후
 * 콘텐츠 대비 안전망) "—" 이후 설명부 전체로 폴백한다. 구조화 마커([[LINK:..]]/[[SIGNAL:..]])가
 * 있으면 인용구 뒤에 그대로 붙여 살려 보낸다(mockClient.ts가 대사에 마커를 심을 때 필요). */
export function extractTacticFlavor(tacticText: string): string {
  const quoted = [...tacticText.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const markers = extractStructuredMarkers(tacticText);
  const markerSuffix = markers.length > 0 ? ` ${markers.join(" ")}` : "";

  if (quoted.length > 0) {
    return quoted.join(", ") + markerSuffix;
  }
  const dashIndex = tacticText.indexOf("—");
  const flavor = dashIndex === -1 ? tacticText : tacticText.slice(dashIndex + 1).trim();
  return flavor.replace(/\.$/, "");
}
