// 연령 확인(age-gate) 순수 판정 로직 (Track C, T14, UX-011, AC-014).
// Firestore SDK 등 부수효과 의존성이 없는 순수 함수로 분리해 node:test로 검증한다
// (src/lib/history/mapHistoryItems.ts·functions/src/report/analyzeConversation.ts와 동일한
// "부수효과와 로직 분리" 관례).

// OQ-8 확정값(PRD.md v0.6 §Open Questions, AC-014) — 국내 개인정보보호법상 만14세 미만
// 법정대리인 동의 기준선과 일치하며, 별도 보호자 동의 플로우를 만들지 않는 이번 스코프에서
// 구현이 가장 간단하다는 근거로 확정됐다. 값을 바꿔야 하면 이 상수만 갱신하면 된다.
export const MIN_AGE = 14;

export type AgeGateDecision = "granted" | "blocked";

/**
 * 자기신고 확인 플래그("만 14세 이상입니다")를 최종 게이트 결과로 변환한다.
 * AC-014: 최소 연령 미만이라고 스스로 밝힌 사용자는 차단(blocked)한다.
 */
export function resolveAgeGateDecision(isAtLeastMinAge: boolean): AgeGateDecision {
  return isAtLeastMinAge ? "granted" : "blocked";
}
