// T116 — **층 1: 렌더 하네스 격리 게이트**(Architecture.md §39.4 / T116 E② / AC-045·AC-072 계열).
//
// ── 무엇을 막는가 ──────────────────────────────────────────────────────────────────────
// T116은 **신규 의존성을 0건** 들였다. 그래서 *"새로 들인 패키지가 번들에 실린다"* 는 위험은
// 애초에 성립하지 않는다. **실제로 남는 위험은 다른 것이다** — `renderHarness.ts`는 `typescript`와
// Node 내장(`node:module`·`node:fs`)을 쓰는 **테스트 전용** 모듈이라, 앱 코드가 이것을 import하는
// 순간 **테스트 도구가 제품 의존성으로 승격**되고 Node 내장이 클라이언트 번들에 끌려 들어간다.
// `src/lib/sourcescan/scanSource.ts:3-4`가 같은 위험을 이미 문장으로 적어 둔 자리이며(S1/G98),
// 이 파일은 그 문장을 **기계로** 받는다.
//
// ── 2층 분업(선례 = `devSignIn.guard.test.ts` ↔ `scripts/verify-no-dev-auth-in-build.mjs`) ──
// | 층 | 무엇을 보는가 | 언제 도는가 |
// |---|---|---|
// | **층 1(이 파일)** | `src/app/**`·`src/components/**` 어느 파일도 금지 지정자를 import하지 않는다 | ⭐ `npm test`에서 **항상** |
// | 층 2 | `out/**`에 하네스 센티널·`transpileModule` 토큰이 0건 | `npm run verify:build`(**opt-in**) |
// ⚠️ **층 2의 한계(⛔ 이걸 안 적으면 다음 사람이 층 2를 믿는다)**: ① opt-in이라 사람이 안 치면
// 안 돈다 ② `out/`이 있어야 도는데 **루트 빌드는 `.env`가 없는 워크트리에서 실패**한다(격리
// 워크트리에서는 층 2를 돌릴 수 없다) ③ 센티널 문자열 기반이라 번들러가 그 문자열을 지우거나
// 변형하면 조용히 통과한다. **그 구멍을 층 1이 받는다.**
//
// ── ⛔ R-4 — 이것은 **계약이 아니라 트립와이어다** ────────────────────────────────────────
// 하네스를 `src/lib/mockscreenrender/` 밖으로 옮기거나 파일을 쪼개거나, 지정자를 동적으로
// 조립하면(`import("node:" + "fs")`) **무력화된다.** `scanSource.ts:20-21`이 남긴 자기 고지와
// 같은 성격이다 — 완전성을 주장하지 않고, **가장 흔한 회귀 형태**를 막는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { HARNESS_BUNDLE_SENTINEL } from "./renderHarness.ts";

/** ⭐ **R-1 — 손으로 나열하지 않는다.** 손 목록은 반드시 밀리고, 새 컴포넌트가 생기면 그 파일만
 *  검사를 통째로 비껴간다(`mockScreenCopy.test.ts:86-89`가 `readdirSync` 순회를 택한 이유와 같다). */
const SCAN_ROOTS = ["src/app", "src/components"];

const VERIFY_BUILD_SCRIPT = "scripts/verify-no-dev-auth-in-build.mjs";

/** ⭐ **R-3 — 금지 지정자와 사유를 한 곳에** 두고 실패 메시지에 **처방**을 담는다.
 *  문구 없는 실패는 다음 사람이 게이트를 지우게 만든다(G167). */
const FORBIDDEN_SPECIFIERS: Array<{ match: (spec: string) => boolean; label: string; why: string }> = [
  {
    match: (spec) => spec.includes("mockscreenrender"),
    label: "렌더 하네스(src/lib/mockscreenrender/**)",
    why: "테스트 전용 하네스다. 앱이 import하면 typescript와 Node 내장이 클라이언트 번들 후보가 된다",
  },
  {
    match: (spec) => spec === "typescript",
    label: "typescript",
    why: "devDependency다. 앱 코드가 import하면 테스트 도구가 제품 의존성으로 승격된다",
  },
  {
    match: (spec) => spec === "node:module" || spec === "node:vm" || spec === "node:fs",
    label: "node:module / node:vm / node:fs",
    why: "Node 내장이다. 클라이언트 번들에 끌려 들어가면 빌드가 깨지거나 폴리필이 실린다",
  },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

/** 검사 대상 = `.ts`/`.tsx` 중 **테스트 파일이 아닌 것**.
 *  ⚠️ 테스트 파일은 Next 라우트에서 도달하지 못해 번들 대상이 아니고, 실제로 기존 테스트가
 *  `node:fs`·`scanSource`를 정당하게 쓴다(`mockScreenCopy.test.ts:11`). 그것까지 금지하면
 *  게이트가 오탐으로 삭제된다(§32.3 (1)). */
function isAppSource(path: string): boolean {
  return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path);
}

/** 주석을 제외한 코드에서 **import/require 지정자만** 뽑는다.
 *  ⚠️ 토큰을 통째로 `includes` 하면 이 저장소의 긴 설명 주석·문자열에 걸려 오탐이 난다. */
function importSpecifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return [...code.matchAll(/(?:\bfrom\s*|\brequire\(\s*|\bimport\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);
}

function violationsIn(path: string, source: string): string[] {
  const found: string[] = [];
  for (const spec of importSpecifiers(source)) {
    for (const rule of FORBIDDEN_SPECIFIERS) {
      if (rule.match(spec)) found.push(`${path} → ${spec} [${rule.label}] — ${rule.why}`);
    }
  }
  return found;
}

test("[T116/층1] 앱 코드가 렌더 하네스·typescript·Node 내장을 **import하지 않는다**", (t) => {
  const files = SCAN_ROOTS.flatMap(walk).filter(isAppSource);

  // ⭐ **R-2 — 반대 방향도 단언한다.** 순회가 0개 파일을 훑고 "위반 0건"을 내는 것이 G140의
  // 문서 버전이다. 하한을 두어 순회가 죽으면 게이트가 함께 죽게 만든다.
  assert.ok(
    files.length >= 30,
    `검사 대상이 ${files.length}개뿐이다 — 순회가 죽었거나 SCAN_ROOTS가 틀렸다(현재 ${SCAN_ROOTS.join(", ")})`,
  );

  const violations = files.flatMap((path) => violationsIn(path, readFileSync(path, "utf8")));
  assert.deepEqual(
    violations,
    [],
    "테스트 전용 하네스가 앱 코드로 샜다 — 하네스는 테스트 파일에서만 import한다(§39.4)",
  );
  t.diagnostic(
    `층1 스캔: ${SCAN_ROOTS.join("+")} 하위 앱 소스 ${files.length}개 / 금지 규칙 ${FORBIDDEN_SPECIFIERS.length}종 / 위반 ${violations.length}건`,
  );
});

test("[T116/층1 역검증] 앱 파일이 하네스를 import하면 위 스캔이 **실제로 실패한다**", (t) => {
  const clean = 'import { useState } from "react";\nexport default function X() { return null; }';
  const poisoned = `import { renderLandingScreen } from "../lib/mockscreenrender/renderHarness.ts";\n${clean}`;
  const alsoPoisoned = `import ts from "typescript";\n${clean}`;

  assert.deepEqual(violationsIn("src/components/Fake.tsx", clean), [], "정상 샘플은 통과해야 한다");
  assert.equal(violationsIn("src/components/Fake.tsx", poisoned).length, 1, "하네스 import를 잡아야 한다");
  assert.equal(violationsIn("src/components/Fake.tsx", alsoPoisoned).length, 1, "typescript import를 잡아야 한다");

  // 주석에 적어 둔 것으로는 걸리지 않아야 한다(이 저장소는 "왜 안 하는가"를 주석에 길게 남긴다).
  const commentOnly = `// 이 파일은 "typescript"를 import하지 않는다\n${clean}`;
  assert.deepEqual(violationsIn("src/components/Fake.tsx", commentOnly), [], "주석·설명은 오탐이 되면 안 된다");
  t.diagnostic("층1 역검증: 정상 0건 / 하네스 오염 1건 / typescript 오염 1건 / 주석 오탐 0건");
});

test("[T116/층2 연결] 산출물 게이트가 하네스 센티널을 **실제로 찾고 있다**", () => {
  const script = readFileSync(VERIFY_BUILD_SCRIPT, "utf8");
  assert.ok(
    script.includes(HARNESS_BUNDLE_SENTINEL),
    `${VERIFY_BUILD_SCRIPT}가 하네스 센티널 "${HARNESS_BUNDLE_SENTINEL}"을 찾지 않는다 — ` +
      "층 2가 조용히 늙었다. 층 1과 층 2는 같은 앵커를 봐야 한다(§39.4 (2))",
  );
  assert.ok(
    script.includes("transpileModule"),
    `${VERIFY_BUILD_SCRIPT}가 transpileModule 토큰을 찾지 않는다 — 센티널이 지워져도 잡히도록 두 축을 둔다`,
  );
});
