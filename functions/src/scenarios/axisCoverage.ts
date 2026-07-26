// 수법 축 커버리지 산출 — T82 / AC-070 · AC-076, Architecture.md §15.10.3.
//
// **빌드타임 상수 순회(순수 함수)다.** 런타임 Firestore 집계·콜러블·화면이 없다(§15.10.3 옵션 비교):
//   - 배포·시딩 상태와 무관하게 항상 정확하다. `scenarios` write는 `if false`라 사람이 손으로 넣는
//     경로가 애초에 없다(firestore.rules).
//   - 커버리지가 **CI에서 깨질 수 있다** = 공백이 조용히 사라지거나 조용히 채워질 수 없다.
//   - 커버리지 대시보드·화면은 만들지 않는다(**D-45/D-46** — 커버리지 산출물은 빌드·테스트 산출물이지
//     화면이 아니다).
//
// 소비처는 ① 테스트 단언(axisCoverage.test.ts) ② 사람이 읽는 리포트 스크립트(axisCoverageReport.ts)
// 2곳뿐이다.

import {
  AXIS_DOMAINS,
  AXIS_KEYS,
  SCENARIO_AXES,
  type AxisKey,
  type AxisValue,
  type ScenarioAxes,
} from "./axes";

/** 축 값 하나의 커버리지. `count === 0`이어도 **행이 반드시 존재한다**(전 도메인 순회). */
export type AxisValueCoverage = {
  readonly axis: AxisKey;
  readonly value: AxisValue;
  readonly count: number;
  readonly scenarioIds: readonly string[];
  /** 0건이 **의도된** 공백일 때의 사유(DECLARED_COVERAGE_GAPS). 0건인데 사유가 없으면 미선언 공백이다. */
  readonly declaredGapReason?: string;
};

export type AxisCoverage = {
  readonly totalScenarios: number;
  /** 축별 커버리지 행. 각 배열 길이 = 그 축 열거형의 값 수(항상 고정). */
  readonly byAxis: { readonly [K in AxisKey]: readonly AxisValueCoverage[] };
  /** 0건인 축 값 전부(선언 면제값 제외). AC-076의 "공백" 집합이다. */
  readonly zeroCountValues: readonly AxisValue[];
};

/** 0건인 채로 남는 것이 **의도된** 축 값과 그 사유(§15.10.3). 사유 없는 공백은 허용하지 않는다(AC-076).
 *
 * 이 표와 실제 0건 집합을 **양방향 `deepEqual`** 로 고정한다(axisCoverage.test.ts) — 그래야
 * ① 공백이 조용히 사라지는 것(E4가 결과에서 빠짐)과 ② 공백이 조용히 채워지는 것(누가 D3를
 * 태깅했는데 이 표를 안 고침)을 동시에 잡는다.
 *
 * **T83~T85가 공백을 채우면 이 테스트가 먼저 깨진다 — 그게 정상이며, 해당 행을 삭제하는 것이
 * "해소 기록"이다.** */
export const DECLARED_COVERAGE_GAPS: Partial<Record<AxisValue, string>> = {
  // A3_post_install_contact — **T84(MVP #30)에서 해소됨**(2026-07-26). 3단계 결합
  // (`messenger-subsidy-smishing-sms`)의 3단계 통화가 설치·권한 허용 뒤에 걸려온다(axes.ts 주석).
  // E3_install_remote_demand — **T84(MVP #30)에서 해소됨**(2026-07-26). 같은 시나리오의
  // "앱 설치·권한 허용 유도"(`[[LINK:subsidy-install]]` → UX-023 kind=`app-install`).
  A4_account_takeover:
    "⚠️ PRD v1.6 '드러난 공백' 표에 등재되지 않은 0건(T78 발견, §15.10.9 G35). planner 확인 전까지 채택 계획 없음 — implementer가 임의로 A4 시나리오를 만들면 스코프 크립",
  D3_verification_hijack: "MVP #29(T83)에서 해소 예정 — AC-076 필수 4값",
  D4_procedural_legitimacy: "MVP #31(T85)에서 해소 예정 — AC-076 필수 4값",
  E4_in_person_cash_demand: "OQ-39 미채택 확정(2026-07-25) — 재구성 후에도 잔여 공백으로 유지",
  E5_giftcard_crypto_demand: "MVP #32 P1 착수 보류(T88) — 잔여 공백",
};

/** sentinel — 0건이어도 "공백"이 아닌 값(§15.10.1). `D0_none`의 count가 0이 되는 것은 결핍이 아니라
 *  **전 시나리오가 이탈 차단 수법을 갖게 된 목표 상태**다. 이 제외는 여기 한 곳에만 선언한다. */
export const GAP_EXEMPT_VALUES = ["D0_none"] as const;

function isGapExempt(value: AxisValue): boolean {
  return (GAP_EXEMPT_VALUES as readonly string[]).includes(value);
}

/** 축 태깅 표에서 커버리지를 산출한다.
 *
 * ⚠️ **열거형 전(全) 도메인을 순회한다 — 입력 데이터를 순회하지 않는다.** 데이터를 순회하며 카운트를
 * 올리면 0건 값은 키 자체가 생기지 않아 **E4가 결과에서 조용히 사라지고**, AC-076이 즉시 미충족이
 * 된다(§15.10.9 G39). 이 함수의 존재 이유가 그 한 줄이다.
 *
 * @param scenarioAxes 기본값은 정본 표. 테스트가 가공된 표를 넣어 게이트 동작을 검증할 수 있게 DI한다.
 */
export function computeAxisCoverage(
  scenarioAxes: Record<string, ScenarioAxes> = SCENARIO_AXES,
): AxisCoverage {
  const entries = Object.entries(scenarioAxes);
  const byAxis = {} as { [K in AxisKey]: readonly AxisValueCoverage[] };
  const zeroCountValues: AxisValue[] = [];

  for (const axis of AXIS_KEYS) {
    const rows: AxisValueCoverage[] = [];
    // ← 도메인 순회(옳음). `for (const s of entries) for (const v of s[axis])`(데이터 순회)로 바꾸면
    //    0건 값이 사라진다.
    for (const value of AXIS_DOMAINS[axis]) {
      const scenarioIds = entries
        .filter(([, axesOfScenario]) => (axesOfScenario[axis] as readonly AxisValue[]).includes(value))
        .map(([scenarioId]) => scenarioId);
      const declaredGapReason = DECLARED_COVERAGE_GAPS[value];
      rows.push({
        axis,
        value,
        count: scenarioIds.length,
        scenarioIds,
        ...(declaredGapReason === undefined ? {} : { declaredGapReason }),
      });
      if (scenarioIds.length === 0 && !isGapExempt(value)) zeroCountValues.push(value);
    }
    byAxis[axis] = rows;
  }

  return { totalScenarios: entries.length, byAxis, zeroCountValues };
}

/** 축 값 하나의 커버리지 행을 찾는다(테스트·리포트 편의). */
export function findCoverageRow(coverage: AxisCoverage, value: AxisValue): AxisValueCoverage | undefined {
  for (const axis of AXIS_KEYS) {
    const row = coverage.byAxis[axis].find((r) => r.value === value);
    if (row) return row;
  }
  return undefined;
}
