// UX D-140 (3)(4) — 긴 페이지 "목록" 토글: 판정 · 카테고리 · 배선 게이트.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  OTHER_CATEGORY,
  TOC_MIN_SECTIONS,
  TOC_BAR_HEIGHT_PX,
  TOC_SCROLL_MARGIN_PX,
  VOICE_SCENARIO_CATEGORY,
  groupInOrder,
  shouldShowPageToc,
  tocScrollBehavior,
  voiceScenarioCategory,
} from "./pageToc.ts";
import { PUBLIC_SCENARIOS } from "../../../functions/src/scenarios/publicMeta.ts";

test("[D-140/G-TOC1] 구역이 2개 미만이면 목록을 그리지 않는다", () => {
  assert.equal(TOC_MIN_SECTIONS, 2);
  assert.equal(shouldShowPageToc([]), false);
  assert.equal(shouldShowPageToc([{ id: "a", label: "A" }]), false);
  assert.equal(shouldShowPageToc([{ id: "a", label: "A" }, { id: "b", label: "B" }]), true);
});

test("[D-140/G-TOC2] reduced-motion이면 즉시 이동한다", () => {
  assert.equal(tocScrollBehavior(true), "auto");
  assert.equal(tocScrollBehavior(false), "smooth");
});

test("[D-140/G-TOC3] 묶음은 원래 순서를 지킨다(묶음 순서 = 첫 등장 순 · 묶음 안 = 원래 순)", () => {
  const groups = groupInOrder(["a1", "b1", "a2", "c1", "b2"], (s) => s[0], "g");
  assert.deepEqual(
    groups.map((g) => [g.key, g.label, g.entries]),
    [
      ["g-1", "a", ["a1", "a2"]],
      ["g-2", "b", ["b1", "b2"]],
      ["g-3", "c", ["c1"]],
    ],
  );
});

test("[D-140/G-TOC4] 보이스피싱 시나리오는 전부 카테고리 표에 있다(그 밖의 수법 0건)", () => {
  // 채널이 없거나 voice인 공개 시나리오 = 보이스피싱 목록 대상(합쳐진 시나리오 포함 — 옛 링크로도 들어온다).
  const ids = Object.entries(PUBLIC_SCENARIOS)
    .filter(([, meta]) => (meta.channel ?? "voice") === "voice")
    .map(([id]) => id);
  assert.ok(ids.length >= 10, `보이스 시나리오를 못 찾았다(${ids.length}) — 파서 확인`);
  const missing = ids.filter((id) => voiceScenarioCategory(id) === OTHER_CATEGORY);
  assert.deepEqual(missing, [], "새 보이스 시나리오는 VOICE_SCENARIO_CATEGORY에 카테고리를 넣을 것");
  for (const id of Object.keys(VOICE_SCENARIO_CATEGORY)) assert.ok(ids.includes(id), `표에만 있고 시나리오가 없다: ${id}`);
});

test("[D-140/G-TOC5] 목록 막대 아래 여백(scroll-margin)이 상수와 같다", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.match(css, new RegExp(`\\[data-toc-target\\]\\s*\\{\\s*scroll-margin-top:\\s*${TOC_SCROLL_MARGIN_PX}px;`));
});

const TOC_PAGES = [
  "src/app/scenarios/voice/ScenarioListView.tsx",
  "src/app/scenarios/messenger/page.tsx",
  "src/app/report/page.tsx",
  "src/app/report/archive/page.tsx",
  "src/components/LegalDocumentView.tsx",
];

test("[D-140/G-TOC6] 판정표 (3)의 대상 화면에만 목록이 있고, 이동 대상에 data-toc-target이 있다", () => {
  for (const file of TOC_PAGES) {
    const code = fs.readFileSync(file, "utf8");
    assert.ok(code.includes("<PageToc"), `${file}: 목록 없음`);
    assert.ok(code.includes("data-toc-target"), `${file}: 이동 대상 표시(data-toc-target) 없음`);
  }
  const users = fs
    .globSync(["src/**/*.tsx"])
    .map((p) => p.split("\\").join("/"))
    .filter((p) => p !== "src/components/PageToc.tsx" && fs.readFileSync(p, "utf8").includes("<PageToc"));
  assert.deepEqual(users.sort(), [...TOC_PAGES].sort(), "판정표에 없는 화면에 목록을 넣지 말 것(표에 행을 먼저 추가)");
});

test("[D-140/G-TOC7] 훈련 화면(통화 · 채팅 · 메신저 · 문자 · 이체)에는 목록이 없다", () => {
  const training = [
    "src/app/session/play/page.tsx",
    "src/app/session/chat/page.tsx",
    "src/app/session/messenger/page.tsx",
    "src/components/InCallSmsOverlay.tsx",
    "src/components/VerifyCallOverlay.tsx",
    "src/components/MessengerFakeLanding.tsx",
  ];
  for (const file of training) assert.ok(!fs.readFileSync(file, "utf8").includes("PageToc"), file);
});

test("[D-140/G-TOC8] 목록 컴포넌트 접근성 — 펼침 상태 · 대상 연결 · Esc 닫기 · 포커스 이동", () => {
  const code = fs.readFileSync("src/components/PageToc.tsx", "utf8");
  for (const needle of ["aria-expanded={open}", "aria-controls={panelId}", '"Escape"', "toggleRef.current?.focus()", "focus({ preventScroll: true })", "prefers-reduced-motion", 'aria-label="이 화면 목록"']) {
    assert.ok(code.includes(needle), needle);
  }
});

test("[D-140/G-TOC9] 막대 높이 상수 = 막대 클래스 = 모아보기 묶음 머리줄 오프셋", () => {
  const toc = fs.readFileSync("src/components/PageToc.tsx", "utf8");
  assert.ok(toc.includes(`min-h-[${TOC_BAR_HEIGHT_PX}px]`), "PageToc 막대 높이가 상수와 다르다");
  const archive = fs.readFileSync("src/app/report/archive/page.tsx", "utf8");
  assert.ok(archive.includes(`top-[${TOC_BAR_HEIGHT_PX}px]`), "모아보기 머리줄이 막대 아래에 붙지 않는다");
  assert.ok(TOC_SCROLL_MARGIN_PX > TOC_BAR_HEIGHT_PX, "이동한 제목이 막대에 가려진다");
});

test("[D-140/G-TOC10] 리포트 목록의 고정 id는 화면에 실제로 있다(없으면 눌러도 조용히 안 움직인다)", () => {
  const code = fs.readFileSync("src/app/report/page.tsx", "utf8");
  const listed = [...code.matchAll(/\{ id: "([a-z-]+)", label/g)].map((m) => m[1]);
  assert.ok(listed.length >= 5, `목록 id를 못 찾았다(${listed.length})`);
  for (const id of listed) assert.ok(code.includes(`id="${id}"`), `목록에 있지만 화면에 없는 id: ${id}`);
});
