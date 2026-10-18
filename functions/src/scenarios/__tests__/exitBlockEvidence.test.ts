// D 좌표(`exitBlock`) ↔ 콘텐츠(`weakenedTactics`) 정합 게이트 — T102 / 갭 **G60**,
// AC-076 · AC-077, Architecture.md §17.1.1.
//
// **왜 이 파일이 있는가.** `SCENARIO_AXES`는 손으로 유지되는 요약 표라 콘텐츠와 조용히 어긋난다 —
// 실제로 **9/13행이 언더카운트**였고(§17.1.1 전수 대조), 그중 3행은 `D0_none`("이탈 차단 수법이
// 없다")이라 **사실과 다른 보고**였다. §15.10.4가 자인한 대로 기존 `deepEqual` 키 게이트는
// *값을 가졌다*는 사실만 고정하고 *값이 맞다*는 사실은 고정하지 못한다. 이 파일이 그 구멍을 메운다.
//
// **테스트 전용이다** — `src/` 런타임 모듈을 새로 만들지 않는다. 축 표의 소비처는 설계상
// ① 테스트 단언 ② 사람이 읽는 리포트 스크립트 2곳뿐이며(§15.10.3), 여기에 세 번째 소비처를
// 만들면 §17.1.2 (b)("표를 런타임 입력으로 삼지 않는다", DECISIONS #43)를 잠식한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIO_AXES, type AxisExitBlock } from "../axes";
import { SCENARIO_PROMPTS } from "../index";

// ── 판정 규칙표 — T191 S5에서 `exitBlockLabelRules.ts`(테스트 헬퍼)로 **문면 그대로** 옮겼다 ───────
// 흐름 변형 게이트(`flowVariants.test.ts`)가 같은 규칙으로 판정하기 위해서다(사본을 만들지 않는다).
import {
  LABEL_RULES,
  REVIEWED_NON_EXIT_BLOCK_LABELS,
  SUSPICIOUS_TOKENS,
  derivedExitBlock,
  labelOf,
} from "./exitBlockLabelRules";

function taggedExitBlock(scenarioId: string): AxisExitBlock[] {
  return [...SCENARIO_AXES[scenarioId].exitBlock].sort();
}

// ── (1) 양방향 정합 — 누락도 허위 추가도 잡는다 ──────────────────────────────

test("[T102/G60] 시나리오별 exitBlock이 weakenedTactics 근거와 정확히 일치한다(양방향)", () => {
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const derived = derivedExitBlock(prompt.weakenedTactics);
    const tagged = taggedExitBlock(scenarioId);
    if (derived.length === 0) {
      // 이탈 차단 라벨이 하나도 없으면 `D0_none` sentinel이어야 한다(§15.10.1).
      assert.deepEqual(
        tagged,
        ["D0_none"],
        `${scenarioId}: weakenedTactics에 D 계열 라벨이 없으므로 exitBlock은 D0_none 하나여야 한다.`,
      );
      continue;
    }
    assert.deepEqual(
      tagged,
      derived,
      `${scenarioId}: axes.ts의 exitBlock과 콘텐츠 근거가 어긋난다(G60의 재발). ` +
        `콘텐츠 근거=${derived.join(",")} / 표=${tagged.join(",")} — ` +
        "표가 콘텐츠를 따라간다(콘텐츠를 고쳐 표에 맞추지 않는다).",
    );
  }
});

test("[T102/G60] `D0_none`은 D 계열 라벨이 0건인 시나리오에만 붙는다(적극적 주장의 검증)", () => {
  // `D0_none`은 "아직 태깅 안 함"이 아니라 **"이탈 차단 수법이 없다"는 주장**이라 틀리면 사실과
  // 다른 보고가 된다 — 정정 전 3행(courier-customs·parcel·subsidy)이 정확히 그 상태였다.
  const d0Scenarios = Object.keys(SCENARIO_AXES).filter((id) =>
    (SCENARIO_AXES[id].exitBlock as readonly string[]).includes("D0_none"),
  );
  assert.deepEqual(
    d0Scenarios,
    ["messenger-friend-loan-kakao"],
    "D0_none을 주장할 수 있는 시나리오는 콘텐츠에 D 계열 라벨이 0건인 1종뿐이다(T102 정정 결과).",
  );
  for (const scenarioId of d0Scenarios) {
    assert.deepEqual(derivedExitBlock(SCENARIO_PROMPTS[scenarioId].weakenedTactics), []);
    assert.deepEqual(taggedExitBlock(scenarioId), ["D0_none"], `${scenarioId}: D0_none은 단독이어야 한다`);
  }
});

// ── (2) 백스톱 — 미분류 라벨이 조용히 지나가지 못한다 ───────────────────────

test("[T102] 이탈 차단 어휘를 가진 라벨은 전부 규칙표 또는 판정된 예외 목록에 속한다", () => {
  const unclassified: string[] = [];
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    for (const tactic of prompt.weakenedTactics) {
      const label = labelOf(tactic);
      if (!SUSPICIOUS_TOKENS.test(label)) continue;
      if (LABEL_RULES.some((rule) => rule.pattern.test(label))) continue;
      if (REVIEWED_NON_EXIT_BLOCK_LABELS.includes(label)) continue;
      unclassified.push(`${scenarioId}: "${label}"`);
    }
  }
  assert.deepEqual(
    unclassified,
    [],
    "이탈 차단으로 읽힐 수 있는 새 라벨이 판정 없이 들어왔다. LABEL_RULES에 넣어 exitBlock을 " +
      "정정하거나, D 계열이 아니라면 REVIEWED_NON_EXIT_BLOCK_LABELS에 사유와 함께 등재하라.",
  );
});

test("[T102] 예외 목록·규칙표에 죽은 항목이 없다(콘텐츠에서 사라진 라벨은 지운다)", () => {
  const allLabels = Object.values(SCENARIO_PROMPTS).flatMap((p) => p.weakenedTactics.map(labelOf));
  for (const label of REVIEWED_NON_EXIT_BLOCK_LABELS) {
    assert.ok(
      allLabels.includes(label),
      `REVIEWED_NON_EXIT_BLOCK_LABELS의 "${label}"이 어느 시나리오에도 없다 — 목록이 낡았다.`,
    );
  }
  for (const rule of LABEL_RULES) {
    assert.ok(
      allLabels.some((label) => rule.pattern.test(label)),
      `LABEL_RULES의 ${rule.value} 규칙(${rule.pattern})에 걸리는 라벨이 콘텐츠에 없다 — 규칙이 낡았다.`,
    );
  }
});

// ── (3) 게이트가 실제로 실패하는가(회귀 포착 증명, 저장소 관례) ─────────────

test("[T102] 게이트 역검증 — D 값을 빼거나 없는 값을 넣으면 실패한다", () => {
  const scenarioId = "courier-customs-scam";
  const derived = derivedExitBlock(SCENARIO_PROMPTS[scenarioId].weakenedTactics);
  assert.deepEqual(derived, ["D2_secrecy", "D5_call_retention"]);

  // ① 언더카운트(정정 전 상태 = `D0_none`)를 재현하면 깨진다.
  assert.throws(
    () => assert.deepEqual(["D0_none"], derived),
    /D0_none|Expected|deepEqual/i,
    "정정 전의 D0_none이 통과하면 이 게이트는 G60을 다시 놓친다.",
  );
  // ② 허위 추가(콘텐츠에 근거가 없는 D4)를 넣어도 깨진다.
  assert.throws(
    () => assert.deepEqual([...derived, "D4_procedural_legitimacy"].sort(), derived),
    /D4_procedural_legitimacy|Expected|deepEqual/i,
    "근거 없는 좌표가 통과하면 커버리지 count가 부풀려진다.",
  );
});
