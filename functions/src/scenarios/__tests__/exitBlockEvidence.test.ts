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

// ── 판정 규칙표 (임의 판단 금지 — 이 표대로만 적용) ─────────────────────────
//
// 대조 단위는 `weakenedTactics` 문자열의 **라벨부**(첫 "—" 앞)다. 설명부까지 보면 오탐이 난다:
// 예컨대 "다급함 조성 — ... **시간 압박**만 준다"는 라벨이 아니라 설명에 D1 어휘가 들어 있다.
// §17.1.1의 대조는 라벨을 인용했고, 이 표는 그 판정을 기계화한 것이다(재판정 아님).
const LABEL_RULES: readonly { readonly pattern: RegExp; readonly value: AxisExitBlock }[] = [
  // ⚠️ D3가 먼저다 — "확인 시도 무력화"는 확인을 *막는* 수법(D2)이 아니라 *가로채는* 수법이다.
  { pattern: /확인\s*시도\s*무력화|확인\s*무력화/, value: "D3_verification_hijack" },
  // 확인 차단 / 확인 절차 차단 / 확인 전화 차단 / 주변·원격 확인 차단 + 비밀 유지 + 고립 유도
  { pattern: /확인\s*(절차|전화)?\s*차단/, value: "D2_secrecy" },
  { pattern: /비밀\s*유지/, value: "D2_secrecy" },
  { pattern: /고립\s*유도/, value: "D2_secrecy" },
  { pattern: /(마감|시간)\s*압박/, value: "D1_time_pressure" },
  { pattern: /절차·서류\s*정당화/, value: "D4_procedural_legitimacy" },
  { pattern: /신고\s*차단/, value: "D6_report_blocking" },
  { pattern: /전화\s*끊음\s*저지/, value: "D5_call_retention" },
];

/** 이탈 차단처럼 **보이는 어휘**를 담았지만 D 계열이 **아니라고 판정된** 라벨(§17.1.1이 D로 계수하지
 *  않은 것들). 아래 백스톱이 "미분류 라벨"을 잡으므로, 새 라벨은 규칙표에 넣든 여기 넣든 **판정을
 *  적어야** 통과한다 — 조용히 지나가는 경로를 남기지 않는 것이 이 목록의 목적이다. */
const REVIEWED_NON_EXIT_BLOCK_LABELS: readonly string[] = [
  // 막연한 시간 제한("3분 드릴게요")이라 §17.1.1이 D1로 계수하지 않았다(kidnapping-threat).
  "촉박한 결정 압박",
  // T92 부인 대응 계열 — 전제("환급 대상")를 정당화하는 것이지 이탈을 막는 절차·서류가 아니다.
  // Architecture.md §18이 *"G60 정정과 절대 섞지 않는다"* 고 명시했다(tax-refund-scam).
  "부인 시 절차 정당화",
  // B·C축(권위로 신뢰를 얻는다)이지 이탈 차단이 아니다(loan-refinance-scam).
  "권위·정당성 포장",
  // 대화 태도(말을 자른다)이지 통화 유지 수법이 아니다(kidnapping-threat).
  "말 끊기",
  // 정보 요구를 재촉하는 E축 행위다(다수 시나리오).
  "확인질문 재촉",
  // 본인확인을 빙자한 개인정보 수집 = E2다(bank-security-verify-scam / tax-refund-scam).
  "본인확인 정보 직접 요구",
  "본인확인 빙자 정보 수집",
];

/** 라벨이 D 계열일 **가능성**을 알리는 어휘. 여기 걸렸는데 규칙표에도 예외 목록에도 없으면 실패한다
 *  — 새 수법 라벨이 태깅 없이 들어오는 것을 막는 백스톱이다.
 *  ⚠️ **한계(정직 고지)**: 이 어휘를 하나도 쓰지 않는 새 이탈 차단 라벨은 못 잡는다. 이 게이트가
 *  보장하는 것은 *"알려진 어휘의 드리프트가 조용히 지나가지 않는다"* 까지다. */
const SUSPICIOUS_TOKENS = /확인|차단|저지|무력화|비밀|압박|고립|정당|끊|유지|신고/;

function labelOf(tactic: string): string {
  return tactic.split("—")[0].trim();
}

function derivedExitBlock(tactics: readonly string[]): AxisExitBlock[] {
  const found = new Set<AxisExitBlock>();
  for (const tactic of tactics) {
    const label = labelOf(tactic);
    for (const rule of LABEL_RULES) {
      if (rule.pattern.test(label)) found.add(rule.value);
    }
  }
  return [...found].sort();
}

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
