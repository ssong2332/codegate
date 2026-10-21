// G645~G648 — 시안 E2 "큰 판 한 장씩" 공통(UX D-141 · docs/Architecture.md §97 · DECISIONS #210).
//   G645 판 구분 규칙(밝기 교차 · 판 수에 따른 높이) · G646 모션 수치 한 곳(e2Layout = panelExpand = motion.css) ·
//   G647 판 확장 전환 계약(reduced-motion 불투명도만 · transform 0 · 덮개 걷기 배선) · G648 E2 공통 컴포넌트에 hex 0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { E2_MOTION, PANEL_TONES, clockEase, formatClock, panelMinHeight, panelTone, panelsFillHeight } from "./e2Layout.ts";
import { OVERLAY_SAFETY_MS, PANEL_EXPAND_MOTION, clipInsetFromRect } from "../motion/panelExpand.ts";

const motionCss = readFileSync("src/app/motion.css", "utf8");
const panelExpandSrc = readFileSync("src/lib/motion/panelExpand.ts", "utf8");
const E2_COMPONENTS = ["PanelList", "DisplayTitle", "CtaPanel", "BottomSheet", "BoundaryPanel", "BigClock"].map(
  (n) => `src/components/ui/${n}.tsx`,
);

test("[G645] 판 색은 어두운 판 ↔ 옅은 판이 번갈아 온다(5번째부터 다시 돈다)", () => {
  assert.deepEqual(PANEL_TONES.map((t) => t.name), ["brand", "tint", "slate", "sand"]);
  const dark = (i: number) => panelTone(i).surface.includes("text-white");
  for (let i = 0; i < 9; i++) assert.equal(dark(i), i % 2 === 0, `판 ${i + 1}의 밝기가 교차하지 않는다`);
  assert.equal(panelTone(4).name, "brand");
  // 옅은 판은 경계선이 있다(색만으로 구분 안 함).
  for (const t of PANEL_TONES) assert.equal(t.surface.includes("border-panel-line"), !t.surface.includes("text-white"));
});

test("[G645] 판 높이 — 4개까지 화면을 나눠 채우고 5개부터 92px로 쌓여 스크롤된다(최소 터치 48px의 2배 이상)", () => {
  assert.equal(panelsFillHeight(2), true);
  assert.equal(panelsFillHeight(4), true);
  assert.equal(panelsFillHeight(5), false);
  assert.ok(panelMinHeight(2) > panelMinHeight(4) && panelMinHeight(4) > panelMinHeight(9));
  assert.ok(panelMinHeight(12) >= 96 - 4 && panelMinHeight(12) >= 48 * 1.9);
});

test("[G645] 큰 시계 표기 · 곡선", () => {
  assert.equal(formatClock(101), "1:41");
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(-3), "0:00");
  assert.equal(formatClock(Number.NaN), "0:00");
  assert.equal(formatClock(600.9), "10:00");
  assert.equal(clockEase(0), 0);
  assert.equal(clockEase(1), 1);
  assert.ok(clockEase(0.5) > 0.5, "ease-out이어야 한다");
});

test("[G646] 모션 수치 한 곳 — e2Layout = panelExpand = motion.css", () => {
  assert.equal(PANEL_EXPAND_MOTION.panelExpandMs, E2_MOTION.panelExpandMs);
  assert.equal(PANEL_EXPAND_MOTION.panelFadeMs, E2_MOTION.panelFadeMs);
  assert.equal(PANEL_EXPAND_MOTION.drawerEasing, E2_MOTION.drawerEasing);
  assert.equal(PANEL_EXPAND_MOTION.reducedFadeMs, E2_MOTION.reducedFadeMs);
  // 정규식 대신 글자 그대로 비교한다(이스케이프 실수 방지).
  const rule = (cls: string) => {
    const start = motionCss.indexOf(`.${cls} {`);
    return start < 0 ? "" : motionCss.slice(start, motionCss.indexOf("}", start));
  };
  const curve = `cubic-bezier(0.32, 0.72, 0, 1) backwards`;
  assert.ok(rule("e2-rise").includes(`${E2_MOTION.riseMs / 1000}s ${curve}`), rule("e2-rise"));
  assert.ok(rule("e2-rise").includes(`* ${E2_MOTION.riseStaggerMs}ms`));
  assert.ok(motionCss.includes(`translateY(${E2_MOTION.riseDistancePx}px)`));
  assert.ok(rule("e2-sheet-in").includes(`${E2_MOTION.sheetMs / 1000}s ${curve}`), rule("e2-sheet-in"));
  assert.equal(E2_MOTION.drawerEasing, "cubic-bezier(0.32, 0.72, 0, 1)");
  // 예외의 범위 — 이 값들을 넘기려면 UX 결정을 다시 받는다.
  assert.ok(E2_MOTION.panelExpandMs <= 380 && E2_MOTION.riseDistancePx <= 22 && E2_MOTION.clockMs <= 1200);
});

test("[G647] 판 확장 — clip-path inset 계산", () => {
  assert.equal(clipInsetFromRect({ top: 300, left: 0, right: 375, bottom: 420 }, 375, 812), "inset(300px 0px 392px 0px)");
  assert.equal(clipInsetFromRect({ top: -10, left: -2, right: 400, bottom: 900 }, 375, 812), "inset(0px 0px 0px 0px)");
  assert.ok(OVERLAY_SAFETY_MS >= 2000, "덮개 안전 시간이 너무 짧으면 느린 기기에서 다음 화면 전에 걷힌다");
});

test("[G647] 판 확장 — reduced-motion은 불투명도만 · transform 0 · 이동은 즉시 · template이 덮개를 걷는다", () => {
  const code = panelExpandSrc.replace(/\/\/.*$/gm, "");
  assert.match(code, /prefers-reduced-motion: reduce/);
  assert.match(code, /reduced\s*\?\s*el\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\]/, "reduced-motion 분기는 opacity만");
  assert.doesNotMatch(code, /transform/, "덮개는 transform을 쓰지 않는다");
  // navigate는 넓히기를 기다리지 않는다(이동 지연 0).
  assert.doesNotMatch(code, /await/);
  assert.match(readFileSync("src/app/template.tsx", "utf8"), /releasePanelOverlay\(\)/);
});

test("[G648] E2 공통 컴포넌트는 hex를 쓰지 않는다(색은 토큰 유틸리티만) · ui 배럴 규칙(@/ 별칭 0)", () => {
  for (const file of E2_COMPONENTS) {
    const src = readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, `${file}에 hex가 있다`);
    assert.doesNotMatch(src, /from "@\//, `${file}가 @/ 별칭을 쓴다(렌더 하네스가 못 푼다)`);
  }
});

test("[G648 역검증] hex를 넣은 사본은 걸린다", () => {
  const poisoned = 'className="bg-[#1b4b8a]"';
  assert.match(poisoned, /#[0-9a-fA-F]{3,8}\b/);
});

// 리뷰 Major — 판 확장 상태 기계(가짜 DOM). 이동 안 함(false) → 덮개 0 · 전환 중 두 번째 탭 무시 · 걷기 뒤 다시 가능.
test("[G647] 판 확장 동작 — 이동 false면 덮개 0 · 두 번째 탭 무시 · 걷은 뒤 다시 된다", async () => {
  const { expandPanelThen, releasePanelOverlay } = await import("../motion/panelExpand.ts");
  const appended: { removed: boolean }[] = [];
  const fakeAnim = () => ({ finished: Promise.resolve() });
  const makeEl = () => {
    const el = { style: { cssText: "", pointerEvents: "" }, dataset: {}, removed: false, setAttribute() {}, animate: fakeAnim, remove() { el.removed = true; } };
    return el;
  };
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, window: g.window, getComputedStyle: g.getComputedStyle };
  g.document = { createElement: () => makeEl(), body: { appendChild: (el: { removed: boolean }) => appended.push(el) }, documentElement: { clientWidth: 375, clientHeight: 812 } };
  g.window = { matchMedia: () => ({ matches: false }), setTimeout: () => 1, clearTimeout() {} };
  g.getComputedStyle = () => ({ backgroundColor: "rgb(27, 75, 138)" });
  try {
    const source = { animate: fakeAnim, getBoundingClientRect: () => ({ top: 100, left: 0, right: 375, bottom: 250 }) } as unknown as HTMLElement;
    let navs = 0;
    expandPanelThen(source, () => {
      navs++;
      return false;
    });
    assert.equal(navs, 1);
    assert.equal(appended.length, 0, "이동하지 않았는데 덮개가 생겼다");
    expandPanelThen(source, () => {
      navs++;
    });
    expandPanelThen(source, () => {
      navs++;
    });
    assert.equal(navs, 2, "전환 중 두 번째 탭이 이동을 또 불렀다");
    assert.equal(appended.length, 1);
    releasePanelOverlay();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(appended[0].removed, true, "걷기 뒤 덮개가 남았다");
    expandPanelThen(source, () => {
      navs++;
    });
    assert.equal(navs, 3, "걷은 뒤 다음 탭이 막혔다");
    releasePanelOverlay();
  } finally {
    Object.assign(g, saved);
  }
});
