// 방어 등급 산정 (Track A, T13, AC-010/AC-011). 순수 함수 — Firestore 없이 단위 테스트 가능
// (analyzeConversation.ts와 동일한 "부수효과와 로직 분리" 관례).
//
// ⚠️ OQ-5 미확정 — 이 산정식은 임시값(v1)이다. docs/Tasks.md "T13 착수 전 OQ-5(게임화 레벨 수·
// 산정식) 확정" 게이팅이 아직 open 상태에서, 사용자가 "간단한 플레이스홀더로 진행"이라고
// 명시적으로 결정해(2026-07-21) 이 최소 구현을 진행한다. 최종 레벨 수·정확한 임계값·가중치는
// OQ-5가 확정되면 이 파일만 교체하면 되도록 로직을 이 한 곳에 격리했다(analyzeConversation.ts와
// 동일한 어댑터 교체 원칙 — Mock LLM/Mock Voice 패턴을 게임화 산정식에도 적용). 등급명에도 항상
// "(v1)"을 붙여 화면에서도 임시값임을 드러낸다(UI 표기는 grade/page.tsx 참고).
export type DefenseGradeReportInput = { wasDeceived: boolean };

export type DefenseGradeResult = {
  defenseGrade: string;
  sessionCount: number;
};

// 방어율(속지 않은 세션 비율) 임계값 내림차순 — 임시 플레이스홀더 5단계. 세션 수가 적을 때
// (특히 1회차)는 방어율이 0 또는 1로 극단값이 되는 한계가 있으나, 이는 v1 플레이스홀더의 알려진
// 한계로 감수한다(정교한 산정식은 OQ-5 확정 후 재설계).
const GRADE_TIERS: ReadonlyArray<{ minRate: number; label: string }> = [
  { minRate: 0.8, label: "사기 방어 마스터 (v1)" },
  { minRate: 0.6, label: "능숙한 방어자 (v1)" },
  { minRate: 0.4, label: "성장하는 방어자 (v1)" },
  { minRate: 0.2, label: "주의가 필요한 방어자 (v1)" },
  { minRate: 0, label: "초보 방어자 (v1)" },
];

/** 누적 리포트 결과로부터 방어 등급(v1 임시값)과 세션 횟수를 산정한다.
 * reports가 비어 있으면(이론상 호출부는 최소 1개 있을 때만 부르지만 방어적으로 처리) 가장 낮은
 * 등급과 sessionCount=0을 반환한다 — 호출부(grade/page.tsx)는 sessionCount===0이면 이 값을 쓰지
 * 않고 별도로 "기록 없음"(UX-010 Empty 상태)을 표시한다. */
export function computeDefenseGrade(reports: readonly DefenseGradeReportInput[]): DefenseGradeResult {
  const sessionCount = reports.length;
  if (sessionCount === 0) {
    return { defenseGrade: GRADE_TIERS[GRADE_TIERS.length - 1].label, sessionCount: 0 };
  }

  const notDeceivedCount = reports.filter((r) => !r.wasDeceived).length;
  const defenseRate = notDeceivedCount / sessionCount;

  const tier = GRADE_TIERS.find((t) => defenseRate >= t.minRate) ?? GRADE_TIERS[GRADE_TIERS.length - 1];

  return { defenseGrade: tier.label, sessionCount };
}
