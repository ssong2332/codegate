// 수법 축 커버리지 리포트 스크립트 — T82 / AC-076, Architecture.md §15.10.3.
//
// 실행 방법(`seed:scenarios` 관례와 동형 — 빌드 선행):
//   cd functions
//   npm run build
//   npm run report:axis-coverage
//
// **왜 스크립트가 따로 필요한가**: T87(QA)이 *"커버리지 산출이 잔여 공백(E4/E5)을 명시 보고"* 를
// GO/NO-GO 증거로 요구한다. 테스트 통과 여부만으로는 부족하고 **사람이 붙여넣을 수 있는 표 출력**이
// 있어야 한다.
//
// ⚠️ **화면이 아니다.** 이 출력은 빌드·테스트 산출물이며 앱 UI에 축을 노출하지 않는다(D-45/D-46).
// ⚠️ **강제는 이 스크립트가 아니라 테스트가 한다**(axisCoverage.test.ts의 양방향 `deepEqual`).
//    여기서는 미선언 공백을 눈에 띄게 출력만 하고 종료 코드를 바꾸지 않는다 — 리포트가 게이트를
//    흉내 내면 게이트가 두 곳이 되어 어느 쪽이 정본인지 흐려진다.

import { AXIS_KEYS, AXIS_LABEL } from "./axes";
import { computeAxisCoverage, DECLARED_COVERAGE_GAPS, GAP_EXEMPT_VALUES } from "./axisCoverage";

function main(): void {
  const coverage = computeAxisCoverage();

  console.log(`# 수법 축 커버리지 (시나리오 ${coverage.totalScenarios}종, AC-070/AC-076)`);
  console.log("");

  for (const axis of AXIS_KEYS) {
    console.log(`## ${AXIS_LABEL[axis]}`);
    console.log("| 축 값 | count | 시나리오 | 0건 사유 |");
    console.log("|---|---|---|---|");
    for (const row of coverage.byAxis[axis]) {
      const scenarios = row.scenarioIds.length > 0 ? row.scenarioIds.join(", ") : "—";
      const exempt = (GAP_EXEMPT_VALUES as readonly string[]).includes(row.value);
      const reason =
        row.count > 0
          ? "—"
          : (row.declaredGapReason ??
            (exempt ? "(공백 산정 제외 — sentinel)" : "⚠️ 미선언 공백 — DECLARED_COVERAGE_GAPS에 사유를 등재하라"));
      console.log(`| ${row.value} | ${row.count} | ${scenarios} | ${reason} |`);
    }
    console.log("");
  }

  const declaredKeys = Object.keys(DECLARED_COVERAGE_GAPS).sort();
  const zeroValues = [...coverage.zeroCountValues].sort();
  console.log(`## 공백 요약 (0건 ${zeroValues.length}개 — sentinel ${GAP_EXEMPT_VALUES.join(", ")} 제외)`);
  console.log(`- 실측 0건: ${zeroValues.join(", ") || "없음"}`);
  console.log(`- 선언된 공백: ${declaredKeys.join(", ") || "없음"}`);

  const undeclared = zeroValues.filter((v) => !declaredKeys.includes(v));
  const resolved = declaredKeys.filter((v) => !zeroValues.includes(v as (typeof zeroValues)[number]));
  if (undeclared.length > 0) {
    console.log(`- ⚠️ 미선언 공백(사유 없음 — AC-076 위반): ${undeclared.join(", ")}`);
  }
  if (resolved.length > 0) {
    console.log(`- ✅ 채워진 공백(DECLARED_COVERAGE_GAPS에서 해당 행을 삭제하라): ${resolved.join(", ")}`);
  }
  if (undeclared.length === 0 && resolved.length === 0) {
    console.log("- 실측 0건 집합과 선언된 공백이 일치한다(조용한 누락 0건).");
  }
}

main();
