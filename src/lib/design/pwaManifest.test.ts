// G634 — OQ-U99 ⓐ: 홈 화면 추가 시 주소창 없이 열린다 · ⓑ(전체화면 자동 전환)는 사용자 승인 전이라 코드에 없다
// (docs/Architecture.md §89.6 · UX D-132).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, globSync, readFileSync } from "node:fs";
import manifest from "../../app/manifest.ts";

test("[G634] 매니페스트 = standalone · 시작 / · 아이콘 파일 192·512 존재(maskable 포함)", () => {
  const m = manifest();
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/");
  const sizes = (m.icons ?? []).map((i) => i.sizes);
  assert.ok(sizes.includes("192x192") && sizes.includes("512x512"));
  assert.ok((m.icons ?? []).some((i) => i.purpose === "maskable"));
  for (const icon of m.icons ?? []) assert.ok(existsSync(`public${icon.src}`), `${icon.src} 파일이 없다`);
  assert.ok(existsSync("public/apple-touch-icon.png"));
});

test("[G634] 전체화면 자동 전환(ⓑ)은 코드에 없다 — 사용자 승인 전", () => {
  const files = [...globSync("src/**/*.tsx"), ...globSync("src/**/*.ts")].filter((f) => !f.endsWith(".test.ts"));
  const hits = files.filter((f) => /requestFullscreen\s*\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(hits, []);
});
