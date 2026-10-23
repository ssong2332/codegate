// G630 — 시안 A 사이트 토큰: ⓐ globals.css 사본 = 원천 ⓑ WCAG AA 대비 (docs/Architecture.md §89 · UX D-132).
import { test } from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { contrastViolations, pairContrast } from "../phone/skinTokens.ts";
import { SITE_TOKENS, siteContrastPairs } from "./siteTokens.ts";

const css = readFileSync("src/app/globals.css", "utf8");

/** globals.css `:root`의 `--이름: #hex;` 선언 전부(대문자 hex). */
function cssRootHexTokens(source: string): Record<string, string> {
  const root = source.match(/:root\s*\{([\s\S]*?)\n\}/);
  assert.ok(root, "globals.css에서 :root 블록을 못 찾았다");
  const out: Record<string, string> = {};
  for (const m of root[1].matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toUpperCase();
  return out;
}

test("[G630] globals.css :root 색 = siteTokens.ts 원천(키 집합 · 값 모두)", () => {
  assert.deepEqual(cssRootHexTokens(css), { ...SITE_TOKENS });
});

test("[G630 역검증] 값 하나를 바꾼 사본은 실패한다", () => {
  const poisoned = css.replace("--brand: #1b4b8a;", "--brand: #0e6b62;");
  assert.notDeepEqual(cssRootHexTokens(poisoned), { ...SITE_TOKENS });
});

test("[G630] 사이트 토큰의 모든 (글자/아이콘, 바탕) 쌍이 WCAG AA 이상이다", (t) => {
  const pairs = siteContrastPairs();
  assert.ok(pairs.length >= 20, `대비 쌍이 ${pairs.length}개뿐이다`);
  t.diagnostic(`[G630] ${pairs.map((p) => `${p.name}=${pairContrast(p).toFixed(2)}`).join(" · ")}`);
  assert.deepEqual(contrastViolations(pairs), []);
});

test("[G630] 훈련 화면 루트는 폰 서체(font-phone)를 쓴다 — 사이트 제목 서체(함렛)가 기기 재현 화면에 새지 않게", () => {
  for (const file of ["src/app/session/play/page.tsx", "src/components/MessengerChatRoom.tsx"]) {
    assert.ok(readFileSync(file, "utf8").includes("font-phone"), `${file} 루트에 font-phone이 없다`);
  }
});

// G631 — 사이트 화면은 옛 팔레트 hex를 유틸리티로 다시 쓰지 않는다(§89 P2 치환의 회귀 방지).
// 훈련 표면(기기 재현 색 — skinTokens.ts · P3 개별 판단)은 제외한다.
const TRAINING_SURFACE = [
  "src/app/session/play/page.tsx",
  "src/components/MessengerChatRoom.tsx",
  "src/components/InCallSmsOverlay.tsx",
  "src/components/MessengerFakeLanding.tsx",
  "src/components/VerifyCallOverlay.tsx",
  "src/components/CallWaveform.tsx",
  "src/components/PhoneIcon.tsx",
];
const OLD_PALETTE = /-\[#(FAF8F5|22303A|6B655C|0E6B62|0B564F|E4F0EC|E2DDD3|C9C2B6|F2EFE9|C6392F|A82F27|B96A1B|FBF3E8)\]/i;

function oldPaletteHits(files: Record<string, string>): string[] {
  return Object.entries(files).flatMap(([file, src]) =>
    src.split("\n").flatMap((line, i) => (OLD_PALETTE.test(line) ? [`${file}:${i + 1}`] : [])),
  );
}

test("[G631] 사이트 화면(.tsx)에 옛 팔레트 hex 유틸리티가 0건이다", () => {
  const files = [...globSync("src/app/**/*.tsx"), ...globSync("src/components/**/*.tsx")]
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => !TRAINING_SURFACE.includes(f));
  assert.ok(files.length >= 30, `스캔 대상이 ${files.length}개뿐이다`);
  assert.deepEqual(oldPaletteHits(Object.fromEntries(files.map((f) => [f, readFileSync(f, "utf8")]))), []);
});

test("[G631 역검증] 옛 청록 유틸리티를 넣은 사본은 실패한다", () => {
  assert.deepEqual(oldPaletteHits({ "x.tsx": 'a\n<p className="text-[#0E6B62]">' }), ["x.tsx:2"]);
});
