// G641 — 브라우저 다크 모드 안내(UX D-139 · docs/Architecture.md §95.6 · 사용자 결정 2026-10-21 "1번으로 가고").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WEB_DARK_BROWSERS, decideWebDarkNotice, matchWebDarkBrowser, type WebDarkBrowserRule } from "./webDarkNotice.ts";

const WHALE = "Mozilla/5.0 (Linux; Android 15; SM-S931N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Whale/4.33.1.2 Mobile Safari/537.36";
const SAMSUNG = "Mozilla/5.0 (Linux; Android 15; SM-S931N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36";
const CHROME = "Mozilla/5.0 (Linux; Android 15; SM-S931N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
const never = () => false;

test("[G641] 판정표 — 웨일 ∧ 기기 다크 ∧ 미확인일 때만 안내", () => {
  assert.equal(decideWebDarkNotice({ userAgent: WHALE, prefersDark: true, dismissed: never })?.id, "whale");
  assert.equal(decideWebDarkNotice({ userAgent: WHALE, prefersDark: false, dismissed: never }), null, "라이트면 반전 없음");
  assert.equal(decideWebDarkNotice({ userAgent: WHALE, prefersDark: true, dismissed: (id) => id === "whale" }), null, "기기에서 확인함");
  assert.equal(decideWebDarkNotice({ userAgent: CHROME, prefersDark: true, dismissed: never }), null);
  assert.equal(decideWebDarkNotice({ userAgent: SAMSUNG, prefersDark: true, dismissed: never }), null, "삼성 인터넷은 실기 확인 전 꺼져 있다");
  assert.equal(matchWebDarkBrowser(SAMSUNG)?.id, "samsung", "감지 행은 있다(켜기만 하면 된다)");
});

test("[G641] 켜진 행은 실기 확인된 웨일뿐 · 켜진 행은 문면 · 설정 경로가 비어 있지 않다 · 표 확장 시 같은 함수로 동작", () => {
  assert.deepEqual(WEB_DARK_BROWSERS.filter((r) => r.enabled).map((r) => r.id), ["whale"]);
  for (const r of WEB_DARK_BROWSERS.filter((x) => x.enabled)) {
    assert.ok(r.title && r.body && r.settingsPath.length >= 2, `${r.id} 문면 · 경로 없음`);
  }
  const whale = WEB_DARK_BROWSERS.find((r) => r.id === "whale")!;
  assert.ok(whale.settingsPath.some((s) => s.includes("웹 페이지를 다크 모드로 표시")), "사용자가 실기로 확인한 설정 이름");
  const samsungOn: WebDarkBrowserRule[] = WEB_DARK_BROWSERS.map((r) =>
    r.id === "samsung" ? { ...r, enabled: true, title: "t", body: "b", settingsPath: ["a", "b"] } : r,
  );
  assert.equal(decideWebDarkNotice({ userAgent: SAMSUNG, prefersDark: true, dismissed: never }, samsungOn)?.id, "samsung");
});

test("[G641] 배선 — 세션 전 화면 2곳에만(메신저 시작 고지 · 벨 직전 고지) · 세션 중 화면 0 · 진단 패널 유지", () => {
  const uses = (f: string) => readFileSync(f, "utf8").includes("<WebDarkModeNotice />");
  assert.ok(uses("src/components/MessengerStartNotice.tsx"));
  assert.ok(uses("src/components/CallStartNotice.tsx"));
  for (const f of ["src/app/session/messenger/page.tsx", "src/app/session/play/page.tsx", "src/components/InCallSmsOverlay.tsx", "src/components/MessengerFakeLanding.tsx"]) {
    assert.equal(uses(f), false, `${f} — 세션 중 화면에 안내를 두지 않는다`);
  }
  const comp = readFileSync("src/components/WebDarkModeNotice.tsx", "utf8");
  assert.ok(comp.includes("WEB_DARK_NOTICE_STORAGE_PREFIX + rule.id"), "확인 기록은 기기 저장(브라우저별 키)");
  assert.ok(comp.includes('"(prefers-color-scheme: dark)"'));
  assert.ok(readFileSync("src/app/session/layout.tsx", "utf8").includes("ThemeDebugPanel"), "?themedebug=1 진단 패널 유지");
});
