// UX D-138 (1) — 화면 높이 단위 게이트. 모바일 `100vh`(= Tailwind `min-h-screen` · `h-screen`)는 **주소창이 숨은 높이**라
// 주소창이 보이는 동안 화면이 그만큼 넘친다(실기 신고 2026-10-21 · 360×650 실측 넘침 90px). 화면 높이는 `dvh`로 쓴다.
// ⛔ 이 게이트가 증명하지 못하는 것: 내용 자체가 화면보다 긴 경우(그건 실측 — docs/Architecture.md §95.3 표).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// ⚠️ 메신저 대화방은 키보드 처리 작업(kakao-ux-2 세션)이 같은 파일을 고치는 중이라 이번 변경에서 뺐다(§95.6).
// 그 작업이 병합되면 이 예외를 지우고 같은 규칙을 건다.
const ALLOWLIST = new Set(["src/app/session/messenger/page.tsx"]);

const FORBIDDEN = /\bmin-h-screen\b|\bh-screen\b|\bmax-h-screen\b|(?<![\w.-])\d+(?:\.\d+)?vh\b/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function sourceFiles(): string[] {
  return fs
    .globSync(["src/**/*.tsx", "src/**/*.ts", "src/**/*.css"])
    .map((p) => p.split("\\").join("/"))
    .filter((p) => !/\.test\.tsx?$/.test(p));
}

test("[D-138/G-VU1] 화면 높이에 100vh 계열(min-h-screen · h-screen · Nvh)을 쓰지 않는다", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles()) {
    if (ALLOWLIST.has(file)) continue;
    const code = stripComments(fs.readFileSync(file, "utf8"));
    for (const match of code.matchAll(FORBIDDEN)) offenders.push(`${file}: ${match[0]}`);
  }
  assert.deepEqual(offenders, [], "dvh(min-h-dvh · h-dvh · Ndvh)로 바꿀 것 — 주소창이 보이면 화면이 넘친다");
});

test("[D-138/G-VU2] 예외 목록은 실제로 쓰일 때만 남긴다(병합 뒤 지우는 것을 잊지 않게)", () => {
  for (const file of ALLOWLIST) {
    const code = stripComments(fs.readFileSync(file, "utf8"));
    assert.ok(FORBIDDEN.test(code), `${file}에 이제 100vh 계열이 없다 — ALLOWLIST에서 지울 것`);
    FORBIDDEN.lastIndex = 0;
  }
});

test("[D-138/G-VU3] 페이지 진입 모션의 transform이 문서 높이를 늘리지 않게 껍데기를 자른다(overflow: clip)", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /\.page-enter\s*\{\s*overflow:\s*clip;\s*\}/);
});

test("[D-138/G-VU4] 통화 화면 상단 여백은 줄어드는 칸이다(기준 크기 0 · 최대 = 종전 여백 · dvh 기준)", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /\.call-top-slack\s*\{\s*flex:\s*1000 1 0px;\s*\}/);
  const play = fs.readFileSync("src/app/session/play/page.tsx", "utf8");
  assert.ok(play.includes('className="call-top-slack"'), "상단 여백 칸이 없다");
  assert.ok(play.includes('"max(0px, calc(18dvh - 24px))"'), "One UI형 최대 여백은 18dvh - 24px");
  assert.ok(!play.includes("paddingTop: callTokens.hasAvatar"), "고정 padding이 되살아났다 — 주소창이 보이면 버튼이 밀린다");
  // 키패드 영역 안 sr-only(absolute) 라벨이 문서 높이를 늘리지 않게 가둔다(실측 +201px).
  assert.ok(play.includes('className="relative max-h-[56dvh] min-h-0 overflow-y-auto px-6"'));
});

test("[D-138/G-VU5] 짧은 화면 간격 축소는 높이 700px 이하에서만 · 글자 크기는 건드리지 않는다", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  const block = css.match(/@media \(max-height: 700px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(block.includes(".call-compact-gap") && block.includes(".end-compact"), "축소 규칙이 media 블록 밖으로 나갔다");
  assert.ok(!/font-size/.test(block), "짧은 화면에서도 글자 크기는 줄이지 않는다(어르신 사용자)");
});
