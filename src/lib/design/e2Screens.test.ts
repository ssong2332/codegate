// G649~G651 — 시안 E2 P2 선택 화면 배선(UX D-141 · docs/Architecture.md §97). 화면은 이 러너에서 렌더할 수 없어 소스로 본다.
//   G649 선택 화면 5곳은 판(PanelList)을 쓰고 옛 카드(DrilldownOptionCard · SelectableCard)는 쓰지 않는다
//   G650 시나리오 목록은 판 1탭으로 난이도 화면에 간다(옛 "다음 — 난이도 고르기" 하단 버튼 0)
//   G651 난이도 = choose 판 + 설명 시트(sticky) + "이걸로 시작" — 고르기 전 진행 버튼 0(AC-064) · 안전 고지 그대로
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const codeOnly = (file: string) =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SELECT_SCREENS = [
  "src/app/scenarios/page.tsx",
  "src/app/scenarios/experience-select/page.tsx",
  "src/app/scenarios/voice/page.tsx",
  "src/components/ScenarioPanelGroups.tsx",
  "src/app/scenarios/difficulty/page.tsx",
];
const SCENARIO_LISTS = ["src/app/scenarios/voice/ScenarioListView.tsx", "src/app/scenarios/messenger/page.tsx"];

test("[G649] 선택 화면은 판(PanelList)을 쓰고 옛 카드는 쓰지 않는다 · 머리는 SelectScreenHeader(단계 표시 글자 · aria-current)", () => {
  for (const file of SELECT_SCREENS) {
    const code = codeOnly(file);
    assert.ok(code.includes("<PanelList"), `${file}: PanelList 없음`);
    assert.ok(!/DrilldownOptionCard|SelectableCard/.test(code), `${file}: 옛 카드가 남았다`);
  }
  for (const file of [...SELECT_SCREENS.filter((f) => !f.includes("ScenarioPanelGroups")), ...SCENARIO_LISTS]) {
    assert.ok(codeOnly(file).includes("<SelectScreenHeader"), `${file}: 머리 컴포넌트 없음`);
  }
  assert.ok(readFileSync("src/components/SelectScreenHeader.tsx", "utf8").includes('aria-current="step"'));
});

test("[G650] 시나리오 목록 — 판을 누르면 시나리오를 확정하고 난이도 화면으로 간다 · 하단 '다음' 버튼 0", () => {
  for (const file of SCENARIO_LISTS) {
    const code = codeOnly(file);
    assert.ok(code.includes("<ScenarioPanelGroups"), `${file}: 판 묶음 없음`);
    const handler = code.slice(code.indexOf("const handleSelectScenario"), code.indexOf("const toItem"));
    assert.match(handler, /router\.push\("\/scenarios\/difficulty"\)/, `${file}: 판 탭이 난이도로 가지 않는다`);
    assert.ok(!code.includes("다음 — 난이도 고르기"), `${file}: 옛 하단 버튼이 남았다`);
    assert.ok(code.includes("SCENARIO_TRAIT_LABEL"), `${file}: AC-067 성향 표기가 빠졌다`);
  }
  // 미리 지목(T74)은 자동 시작하지 않는다 — 스크롤만.
  const groups = codeOnly("src/components/ScenarioPanelGroups.tsx");
  assert.ok(groups.includes("scrollIntoView") && !groups.includes("router"), "지목된 판은 보이게만 한다");
});

test("[G651] 난이도 — choose 판 + sticky 설명 시트 + '이걸로 시작' · 고르기 전 시트(진행 버튼) 0 · 안전 고지 유지", () => {
  const code = codeOnly("src/app/scenarios/difficulty/page.tsx");
  assert.ok(code.includes('mode="choose"'));
  assert.match(code, /<BottomSheet open=\{selected !== null\} placement="sticky"/);
  assert.ok(code.includes('"이걸로 시작"'));
  assert.ok(!code.includes("이 난이도로 시작"), "옛 버튼 문구가 남았다");
  assert.match(code, /disabled=\{!selected \|\| state === "starting" \|\| state === "difficulty-fallback"\}/);
  // 안전 고지 · 내 정보 · 미리 보기 · 대기 문구(D-134)는 그대로 있다.
  for (const needle of ["{PRE_SESSION_BURDEN_NOTICE}", "<PersonaCardInputFields", "위험 신호 미리 보기", "SESSION_PREP_HINTS", "advancedNotice"]) {
    assert.ok(code.includes(needle), needle);
  }
});
