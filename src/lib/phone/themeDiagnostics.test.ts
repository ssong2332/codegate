// G637 — `?themedebug=1` 색 진단 · 훈련 화면 라이트 고정(UX D-137 (B) · docs/Architecture.md §94 · 웨일 다크 실기 신고 2026-10-21).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  describeAttributes,
  describeSheet,
  isThemeDebugEnabled,
  themeSwatches,
  whaleMajorVersion,
} from "./themeDiagnostics.ts";
import { TRAINING_SCREEN_THEME, useDeviceTheme } from "./deviceTheme.ts";
import { MESSENGER_CHAT_TOKENS, callTokensFor } from "./skinTokens.ts";

test("[G637] themedebug=1일 때만 켠다", () => {
  assert.equal(isThemeDebugEnabled("?themedebug=1"), true);
  assert.equal(isThemeDebugEnabled("?a=b&themedebug=1"), true);
  for (const s of ["", "?themedebug=0", "?themedebug=true", "?audiodebug=1"]) assert.equal(isThemeDebugEnabled(s), false);
});

test("[G637] 웨일 주 버전 · 시트 · 속성 설명은 짧고 출처만", () => {
  assert.equal(whaleMajorVersion("Mozilla/5.0 (Linux; Android 15) Chrome/138.0 Whale/4.33.311.12 Mobile"), "4");
  assert.equal(whaleMajorVersion("Mozilla/5.0 Chrome/138.0 Mobile Safari/537.36"), null);
  const origin = "https://voicefishing-ff47f.web.app";
  assert.equal(describeSheet({ tag: "link", href: `${origin}/_next/static/css/a.css?x=1` }, origin), "link:/_next/static/css/a.css");
  assert.equal(describeSheet({ tag: "link", href: "https://cdn.jsdelivr.net/x.css" }, origin), "link:cdn.jsdelivr.net");
  assert.equal(describeSheet({ tag: "style", id: "dm", text: "  html {\n filter: invert(1) }  " }, origin), 'style#dm len=26 "html { filter: invert(1) }"');
  assert.equal(describeAttributes([]), "-");
  assert.equal(describeAttributes([{ name: "class", value: "h-full antialiased whale-dark-mode-on" }]), "class=h-full antialiased whale");
});

test("[G637] 견본 색 = 화면 토큰(카톡 노랑 · 바탕 · One UI 라이트)", () => {
  const byKey = Object.fromEntries(
    themeSwatches(MESSENGER_CHAT_TOKENS, callTokensFor("samsung", "light")).map((s) => [s.key, s.hex]),
  );
  assert.equal(byKey.kakaoOut, "#FEE500");
  assert.equal(byKey.kakaoBg, "#BACEE0");
  assert.equal(byKey.oneUiBg, callTokensFor("samsung", "light").bg);
});

test("[G637] 훈련 화면 테마는 기기 다크와 무관하게 라이트 고정(사용자 결정 2026-10-21)", () => {
  assert.equal(TRAINING_SCREEN_THEME, "light");
  assert.equal(useDeviceTheme(), "light");
  const src = readFileSync("src/lib/phone/deviceTheme.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.ok(!src.includes("matchMedia"), "deviceTheme.ts가 OS 다크 설정을 다시 읽는다");
});

test("[G637] 진단 패널 — 쿼리 없으면 DOM 0(첫 분기) · 탭 가로채지 않음 · 훈련 화면 묶음에 1곳 배선", () => {
  const panel = readFileSync("src/components/ThemeDebugPanel.tsx", "utf8");
  assert.match(panel, /if \(!enabled\) return null;/);
  assert.match(panel, /pointer-events-none/);
  assert.match(panel, /themeSwatches\(MESSENGER_CHAT_TOKENS, callTokensFor\("samsung", "light"\)\)/, "견본이 화면 토큰과 다른 값을 쓴다");
  assert.match(readFileSync("src/app/session/layout.tsx", "utf8"), /<ThemeDebugPanel \/>/);
});
