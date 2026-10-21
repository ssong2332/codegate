// T190-1 — G457(전역 reduced-motion) · G458(강제 다크 방지 두 겹) (docs/Architecture.md §74.11 · §74.14 G457/G458 ·
// UX P-12 · PRD AC-095 (f)).
//
// G457은 `callContinuity.test.ts`의 T103 A2(`sms-*` 전환 클래스 한정)를 **전역으로 일반화**한다 — 기존 검사는 그대로
// 둔다(합집합). `globals.css`에서 `animation:`을 가진 모든 클래스가 `prefers-reduced-motion: reduce` 블록 안에서
// `animation: none`으로 꺼져야 한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");

/** 주석 제거(주석 안 예시 클래스를 세지 않는다). */
const stripCssComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");

/** reduced-motion 블록 밖에서 `animation:`(none 아님)을 선언하는 클래스 선택자 전부. */
function animatedClasses(source: string): string[] {
  const code = stripCssComments(source).replace(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g, "");
  const out = new Set<string>();
  for (const rule of code.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const [, selectors, body] = rule;
    if (!/(^|;|\s)animation\s*:/.test(body) || /animation\s*:\s*none/.test(body)) continue;
    for (const m of selectors.matchAll(/\.([a-zA-Z0-9_-]+)/g)) out.add(m[1]);
  }
  return [...out].sort();
}

/** reduced-motion 블록 안에서 `animation: none`으로 꺼지는 클래스 전부. */
function reducedMotionOffClasses(source: string): Set<string> {
  const out = new Set<string>();
  const code = stripCssComments(source);
  for (const block of code.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g)) {
    for (const rule of block[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/animation\s*:\s*none/.test(rule[2])) continue;
      for (const m of rule[1].matchAll(/\.([a-zA-Z0-9_-]+)/g)) out.add(m[1]);
    }
  }
  return out;
}

function reducedMotionViolations(source: string): string[] {
  const off = reducedMotionOffClasses(source);
  return animatedClasses(source).filter((cls) => !off.has(cls));
}

test("[T190/G457] globals.css에서 animation을 가진 클래스는 전부 reduced-motion에서 꺼진다", (t) => {
  const animated = animatedClasses(css);
  t.diagnostic(`[G457] 애니메이션 클래스 ${animated.length}개: ${animated.join(", ")}`);
  assert.ok(animated.length >= 8, `애니메이션 클래스를 ${animated.length}개밖에 못 찾았다 — 파서가 죽었다`);
  assert.ok(animated.includes("call-accept-pulse"), "T190-3 iOS형 받기 맥동이 대상에 들어 있어야 한다");
  assert.deepEqual(reducedMotionViolations(css), []);
});

// UX D-134 — 사이트 모션은 globals.css와 나눈 motion.css에 있다. 같은 규칙(reduced-motion이면 0 모션)을 그 파일에도 건다.
test("[D-134/G457] motion.css에서 animation을 가진 클래스도 전부 reduced-motion에서 꺼진다", (t) => {
  const motionCss = readFileSync("src/app/motion.css", "utf8");
  const animated = animatedClasses(motionCss);
  t.diagnostic(`[G457 · motion.css] 애니메이션 클래스 ${animated.length}개: ${animated.join(", ")}`);
  assert.ok(animated.includes("page-enter") && animated.includes("loading-dot") && animated.includes("check-pop"), "파서가 motion.css의 클래스를 못 찾았다");
  assert.deepEqual(reducedMotionViolations(motionCss), []);
});

test("[T190/G457 역검증] reduced-motion 블록에 없는 새 애니메이션 클래스를 넣은 사본은 실패한다", () => {
  const poisoned = `${css}\n.zz-new-anim {\n  animation: call-ring-pulse 2s infinite;\n}\n`;
  assert.deepEqual(reducedMotionViolations(poisoned), ["zz-new-anim"]);
});

/** G458 — 두 겹 선언. */
function colorSchemeViolations(layoutSource: string, cssSource: string): string[] {
  const out: string[] = [];
  if (!/colorScheme:\s*"only light"/.test(layoutSource)) out.push('layout.tsx viewport.colorScheme "only light" 없음');
  if (!/export const viewport/.test(layoutSource)) out.push("layout.tsx viewport export 없음");
  const root = /:root\s*\{([^}]*)\}/.exec(stripCssComments(cssSource))?.[1] ?? "";
  if (!/color-scheme\s*:\s*only light/.test(root)) out.push("globals.css :root color-scheme: only light 없음");
  return out;
}

test("[T190/G458 · AC-095 (f)] 강제 다크 방지 — layout viewport + globals.css :root 두 겹", () => {
  assert.deepEqual(colorSchemeViolations(layout, css), []);
});

test("[T190/G458 역검증] 한쪽을 지운 사본은 각각 실패한다", () => {
  const noLayout = layout.replace('colorScheme: "only light"', 'colorScheme: "light dark"');
  assert.notEqual(noLayout, layout, "오염 지점(layout)을 찾지 못했다");
  const noCss = css.replace("color-scheme: only light;", "");
  assert.notEqual(noCss, css, "오염 지점(css)을 찾지 못했다");
  assert.deepEqual(colorSchemeViolations(noLayout, css), ['layout.tsx viewport.colorScheme "only light" 없음']);
  assert.deepEqual(colorSchemeViolations(layout, noCss), ["globals.css :root color-scheme: only light 없음"]);
});
