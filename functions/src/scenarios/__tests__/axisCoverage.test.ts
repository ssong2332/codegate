// 수법 축 태깅·커버리지 테스트 — T82 / AC-070 · AC-076 · AC-077, Architecture.md §15.10.
// node:test(저장소에 별도 테스트 프레임워크 없음 — scenarios.test.ts와 같은 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  AXIS_ACCESS,
  AXIS_DEMAND,
  AXIS_DOMAINS,
  AXIS_EXIT_BLOCK,
  AXIS_IMPERSONATION,
  AXIS_KEYS,
  AXIS_PRESSURE,
  SCENARIO_AXES,
  type AxisKey,
  type AxisValue,
  type ScenarioAxes,
} from "../axes";
import {
  computeAxisCoverage,
  DECLARED_COVERAGE_GAPS,
  findCoverageRow,
  GAP_EXEMPT_VALUES,
} from "../axisCoverage";
import { PUBLIC_SCENARIOS } from "../publicMeta";
import { TACTIC_CATEGORIES } from "../../report/tacticCategory";

// ── AC-070 (a) 고정 열거형 — 자유 문자열이 아니다 ────────────────────────────

test("축 값은 고정 열거형 5벌이며 `<PRD코드>_<의미>` 형식이다(AC-070, §15.10.1)", () => {
  const namePattern = /^[A-E][0-9]_[a-z_]+$/;
  const perAxis: Record<AxisKey, readonly string[]> = {
    access: AXIS_ACCESS,
    impersonation: AXIS_IMPERSONATION,
    pressure: AXIS_PRESSURE,
    exitBlock: AXIS_EXIT_BLOCK,
    demand: AXIS_DEMAND,
  };
  const expectedPrefix: Record<AxisKey, string> = {
    access: "A",
    impersonation: "B",
    pressure: "C",
    exitBlock: "D",
    demand: "E",
  };
  for (const axis of AXIS_KEYS) {
    assert.ok(perAxis[axis].length > 0, `${axis}: 축 도메인이 비어있다`);
    for (const value of perAxis[axis]) {
      assert.match(value, namePattern, `${axis}.${value}: <PRD코드>_<의미> 형식이어야 한다`);
      assert.equal(value[0], expectedPrefix[axis], `${axis}.${value}: 축 접두사가 어긋난다`);
    }
    // 같은 값이 두 축에 있으면 커버리지 키가 충돌한다.
    assert.equal(new Set(perAxis[axis]).size, perAxis[axis].length, `${axis}: 중복 값`);
  }
  // AC-070의 "태깅 없으면 등록 불가"를 무력화하는 폴백 값이 없어야 한다(§15.10.0-1).
  // ⚠️ `D0_none`은 폴백이 아니다 — PRD 표의 "(없음)" 셀에 표현형을 준 **sentinel**이며 의미가
  //    "이탈 차단 수법이 없다"로 확정돼 있다(미태깅과 구분된다). 아래 목록에 "none"을 넣지 않는 이유다.
  const FALLBACK_MEANINGS = ["other", "unknown", "unspecified", "untagged", "misc", "etc", "tbd"];
  const allValues = AXIS_KEYS.flatMap((axis) => [...perAxis[axis]]);
  for (const value of allValues) {
    const meaning = value.slice(3); // "<코드>_" 이후
    assert.equal(
      FALLBACK_MEANINGS.includes(meaning),
      false,
      `${value}: 축 열거형에 폴백 값을 두면 미태깅 시나리오가 조용히 통과한다.`,
    );
  }
  assert.equal(new Set(allValues).size, allValues.length, "축 간에도 값이 중복되면 안 된다");
});

// ── AC-070 (d) 태깅 누락 강제 — 2겹째: 키 1:1 deepEqual 게이트 ───────────────

test("SCENARIO_AXES 키가 PUBLIC_SCENARIOS 키와 1:1이다(태깅 누락 강제, §15.10.4)", () => {
  const scenarioIds = Object.keys(PUBLIC_SCENARIOS).sort();
  const axisIds = Object.keys(SCENARIO_AXES).sort();
  assert.deepEqual(
    axisIds,
    scenarioIds,
    "시나리오를 추가/삭제했으면 SCENARIO_AXES(functions/src/scenarios/axes.ts)도 함께 갱신해야 한다. " +
      "축 태깅이 없는 시나리오는 라이브러리에 등록되지 않는다(AC-070).",
  );
  assert.equal(scenarioIds.length, 13, "현재 시나리오는 13종이다(AC-077 — 삭제·통합 0건)");
});

test("13종 전부가 5개 축 각각에 최소 1개 값을 갖는다(AC-070)", () => {
  for (const [scenarioId, axes] of Object.entries(SCENARIO_AXES)) {
    for (const axis of AXIS_KEYS) {
      const values = axes[axis] as readonly AxisValue[];
      assert.ok(Array.isArray(values), `${scenarioId}.${axis}: 배열이어야 한다`);
      assert.ok(values.length >= 1, `${scenarioId}.${axis}: 최소 1개 값이 필요하다(AC-070)`);
      assert.equal(new Set(values).size, values.length, `${scenarioId}.${axis}: 같은 값이 중복됐다`);
      for (const value of values) {
        assert.ok(
          (AXIS_DOMAINS[axis] as readonly string[]).includes(value),
          `${scenarioId}.${axis}: "${value}"는 그 축의 열거형 값이 아니다`,
        );
      }
    }
  }
});

test("키 게이트가 실제로 실패한다 — 시나리오 1종의 축 태깅을 빼면 deepEqual이 깨진다(게이트 회귀 증명)", () => {
  const withoutOne = { ...SCENARIO_AXES };
  delete withoutOne["courier-customs-scam"];
  assert.throws(
    () =>
      assert.deepEqual(
        Object.keys(withoutOne).sort(),
        Object.keys(PUBLIC_SCENARIOS).sort(),
      ),
    /courier-customs-scam|Expected|deepEqual/i,
    "축 표에서 시나리오가 빠졌는데도 게이트가 통과하면 AC-070이 무력화된다.",
  );
});

// ── AC-076 (c) 커버리지 — 전(全) 열거형 도메인 순회 ─────────────────────────

test("커버리지는 열거형 전 도메인을 순회한다 — 0건 값도 행이 남는다(AC-076의 성립 조건, §15.10.3)", () => {
  const coverage = computeAxisCoverage();
  assert.equal(coverage.totalScenarios, 13);
  let rowCount = 0;
  for (const axis of AXIS_KEYS) {
    assert.equal(
      coverage.byAxis[axis].length,
      AXIS_DOMAINS[axis].length,
      `${axis}: 커버리지 행 수가 열거형 값 수와 달라졌다 — 데이터 순회로 바뀌면 0건 값이 사라진다(G39)`,
    );
    assert.deepEqual(
      coverage.byAxis[axis].map((r) => r.value),
      [...AXIS_DOMAINS[axis]],
      `${axis}: 커버리지가 열거형 순서·전량을 그대로 보고해야 한다`,
    );
    rowCount += coverage.byAxis[axis].length;
  }
  const totalValues = AXIS_KEYS.reduce((sum, axis) => sum + AXIS_DOMAINS[axis].length, 0);
  assert.equal(rowCount, totalValues, "축 값 전량이 커버리지에 나타나야 한다");
});

test("E4(대면 현금 전달)가 커버리지에 0건으로 드러난다(AC-076 명시 요건 — OQ-39 미채택 잔여 공백)", () => {
  const coverage = computeAxisCoverage();
  const row = findCoverageRow(coverage, "E4_in_person_cash_demand");
  assert.ok(row, "E4 행이 커버리지에 존재해야 한다 — 없으면 AC-076은 즉시 미충족이다.");
  assert.equal(row.count, 0);
  assert.deepEqual(row.scenarioIds, []);
  assert.ok(
    row.declaredGapReason && row.declaredGapReason.includes("OQ-39"),
    "E4의 0건에는 사유(OQ-39 미채택)가 붙어 있어야 한다 — 조용한 누락 금지.",
  );
});

test("데이터 순회로 계산하면 E4가 사라진다 — 그래서 도메인 순회여야 한다(G39 대조)", () => {
  // ⚠️ 이 블록은 **틀린 방식**을 일부러 재현한 것이다. 커버리지 구현을 이 방식으로 바꾸면
  //    0건 값의 키 자체가 생기지 않아 E4가 결과에서 조용히 사라진다.
  const naive: Record<string, number> = {};
  for (const axes of Object.values(SCENARIO_AXES)) {
    for (const value of axes.demand) naive[value] = (naive[value] ?? 0) + 1;
  }
  assert.equal(
    Object.prototype.hasOwnProperty.call(naive, "E4_in_person_cash_demand"),
    false,
    "데이터 순회 방식에서는 E4 키가 아예 생기지 않는다(이것이 G39가 경고한 실패다)",
  );
  // 반면 구현(도메인 순회)에서는 남아 있다.
  assert.ok(findCoverageRow(computeAxisCoverage(), "E4_in_person_cash_demand"));
});

test("0건 축 값은 정확히 7개(A3·A4·D3·D4·E3·E4·E5)다(§15.10.7 사전 계산값)", () => {
  const coverage = computeAxisCoverage();
  assert.deepEqual([...coverage.zeroCountValues].sort(), [
    "A3_post_install_contact",
    "A4_account_takeover",
    "D3_verification_hijack",
    "D4_procedural_legitimacy",
    "E3_install_remote_demand",
    "E4_in_person_cash_demand",
    "E5_giftcard_crypto_demand",
  ]);
});

test("실측 0건 집합 ↔ DECLARED_COVERAGE_GAPS 양방향 일치(공백이 조용히 사라지지도, 채워지지도 않는다)", () => {
  const coverage = computeAxisCoverage();
  assert.deepEqual(
    [...coverage.zeroCountValues].sort(),
    Object.keys(DECLARED_COVERAGE_GAPS).sort(),
    "T83~T85가 공백을 채우면 이 단언이 먼저 깨진다 — 그게 정상이며, DECLARED_COVERAGE_GAPS의 " +
      "해당 행을 삭제하는 것이 '해소 기록'이다. 반대로 새 공백이 생기면 사유를 등재해야 한다(AC-076).",
  );
  for (const [value, reason] of Object.entries(DECLARED_COVERAGE_GAPS)) {
    assert.ok(reason && reason.trim().length > 0, `${value}: 사유 없는 공백은 허용하지 않는다(AC-076)`);
  }
});

test("D0_none은 sentinel이라 공백 산정에서 제외된다(§15.10.1)", () => {
  const coverage = computeAxisCoverage();
  const row = findCoverageRow(coverage, "D0_none");
  assert.ok(row);
  assert.equal(row.count, 4, "PRD 표에서 D열이 '(없음)'인 시나리오는 4종이다");
  assert.deepEqual([...row.scenarioIds].sort(), [
    "courier-customs-scam",
    "messenger-friend-loan-kakao",
    "messenger-parcel-smishing-sms",
    "messenger-subsidy-smishing-sms",
  ]);
  // D0이 0건이 되는 것은 결핍이 아니라 목표 상태다 — 그때도 공백으로 보고되지 않아야 한다.
  const allTagged: Record<string, ScenarioAxes> = Object.fromEntries(
    Object.entries(SCENARIO_AXES).map(([id, axes]) => [
      id,
      { ...axes, exitBlock: ["D2_secrecy"] as ScenarioAxes["exitBlock"] },
    ]),
  );
  const hypothetical = computeAxisCoverage(allTagged);
  assert.equal(findCoverageRow(hypothetical, "D0_none")?.count, 0);
  assert.equal(
    hypothetical.zeroCountValues.includes("D0_none"),
    false,
    "GAP_EXEMPT_VALUES가 D0_none을 공백 산정에서 제외해야 한다",
  );
  assert.deepEqual([...GAP_EXEMPT_VALUES], ["D0_none"]);
});

test("B1(기관 사칭)은 3건이다 — PRD 공백 표의 '2종'이 아니라 매핑 표가 정본이다(§15.10.9 G36)", () => {
  const row = findCoverageRow(computeAxisCoverage(), "B1_authority");
  assert.equal(row?.count, 3);
  assert.deepEqual([...(row?.scenarioIds ?? [])].sort(), [
    "institutional-impersonation",
    "messenger-subsidy-smishing-sms",
    "tax-refund-scam",
  ]);
});

test("커버리지 행의 count와 scenarioIds가 일치하고, 시나리오별 축 값 합계가 보존된다", () => {
  const coverage = computeAxisCoverage();
  for (const axis of AXIS_KEYS) {
    let tagged = 0;
    for (const row of coverage.byAxis[axis]) {
      assert.equal(row.count, row.scenarioIds.length, `${row.value}: count와 목록 길이가 다르다`);
      tagged += row.count;
    }
    const expected = Object.values(SCENARIO_AXES).reduce((sum, axes) => sum + axes[axis].length, 0);
    assert.equal(tagged, expected, `${axis}: 태깅 총량이 커버리지 합계와 다르다`);
  }
});

// ── AC-077 회귀 금지 — 축 도입이 기존 데이터 형태를 건드리지 않는다 ─────────

test("AC-077: 기존 13종 scenarioId가 그대로다(축 태깅이 식별자를 바꾸지 않는다)", () => {
  assert.deepEqual(Object.keys(SCENARIO_AXES).sort(), [
    "card-company-impersonation",
    "courier-customs-scam",
    "family-accident-deepvoice",
    "grandchild-impersonation",
    "institutional-impersonation",
    "kidnapping-threat",
    "loan-refinance-scam",
    "messenger-child-impersonation-kakao",
    "messenger-friend-loan-kakao",
    "messenger-parcel-smishing-sms",
    "messenger-subsidy-smishing-sms",
    "reputation-blackmail-scam",
    "tax-refund-scam",
  ]);
});

// 테스트는 컴파일 산출물(lib/)에서 실행되므로 소스 경로를 명시적으로 잡는다
// (scenarios.test.ts의 미러 드리프트 테스트와 같은 관례).
const FUNCTIONS_SRC_DIR = path.resolve(__dirname, "../../../src");

test("AC-077 / D-46: 축이 ScenarioMeta·Firestore 문서·클라 계약에 새지 않는다(미러 0벌)", () => {
  const scenariosDir = path.join(FUNCTIONS_SRC_DIR, "scenarios");
  const publicMetaSource = fs.readFileSync(path.join(scenariosDir, "publicMeta.ts"), "utf-8");
  const seedSource = fs.readFileSync(path.join(scenariosDir, "seed.ts"), "utf-8");
  for (const [label, source] of [
    ["publicMeta.ts", publicMetaSource],
    ["seed.ts", seedSource],
  ] as const) {
    assert.equal(
      /SCENARIO_AXES|ScenarioAxes|from "\.\/axes"/.test(source),
      false,
      `${label}이 축을 참조하면 축이 Firestore scenarios/{} 문서(클라 read 허용)로 새고 D-46이 무너진다.`,
    );
  }
  // 클라(src/content/scenarios/*.ts)에도 미러가 없어야 한다.
  const clientDir = path.resolve(__dirname, "../../../../src/content/scenarios");
  for (const file of fs.readdirSync(clientDir)) {
    if (!file.endsWith(".ts")) continue;
    const source = fs.readFileSync(path.join(clientDir, file), "utf-8");
    assert.equal(
      /A1_cold_call|D0_none|E4_in_person_cash_demand|ScenarioAxes/.test(source),
      false,
      `src/content/scenarios/${file}에 축 값이 있다 — 클라가 축을 필요로 하는 순간은 D-46 위반 신호다(G37). 미러를 만들지 말고 ux-design에 확인하라.`,
    );
  }
});

// ── OQ-U25: 축과 tacticCategory는 직교다(§15.10.5의 금지 3건) ───────────────

test("OQ-U25: axes/axisCoverage와 report/tacticCategory가 서로를 import하지 않는다(직교)", () => {
  const scenariosDir = path.join(FUNCTIONS_SRC_DIR, "scenarios");
  for (const file of ["axes.ts", "axisCoverage.ts", "axisCoverageReport.ts"]) {
    const source = fs.readFileSync(path.join(scenariosDir, file), "utf-8");
    assert.equal(
      /^import[^\n]*tacticCategory/m.test(source),
      false,
      `${file}이 tacticCategory를 import하면 안 된다(§15.10.5 금지 3).`,
    );
  }
  const tacticCategorySource = fs.readFileSync(
    path.join(FUNCTIONS_SRC_DIR, "report/tacticCategory.ts"),
    "utf-8",
  );
  assert.equal(
    /^import[^\n]*axes/m.test(tacticCategorySource),
    false,
    "tacticCategory.ts가 axes를 import하면 안 된다(§15.10.5 금지 3).",
  );
});

test("OQ-U25: TACTIC_CATEGORIES에 축 코드가 섞이지 않는다 / DeceivedMoment에 축 필드가 없다", () => {
  for (const category of TACTIC_CATEGORIES) {
    assert.equal(
      /^[A-E][0-9]_/.test(category),
      false,
      `${category}: tacticCategory 값은 절대 축 코드 접두사를 갖지 않는다(§15.10.5 명명 규칙).`,
    );
  }
  assert.equal(TACTIC_CATEGORIES.length, 10, "축 도입이 tacticCategory 열거형을 늘리지 않는다(enum append 0건)");

  const typesSource = fs.readFileSync(path.join(FUNCTIONS_SRC_DIR, "shared/types.ts"), "utf-8");
  const block = typesSource.match(/export type DeceivedMoment = \{[^}]*\}/);
  assert.ok(block, "DeceivedMoment 타입 선언을 찾지 못했다");
  assert.equal(
    /axis/i.test(block[0]),
    false,
    "DeceivedMoment에 축 필드를 추가하면 과거 리포트의 묶기 의미가 바뀐다 = AC-077 위반(§15.10.5 금지 1).",
  );
});
