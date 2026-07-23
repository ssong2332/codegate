import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMessengerSkin } from "./detectSkin.ts";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const SAMSUNG_SM_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const SAMSUNG_BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/115.0.0.0 Mobile Safari/537.36";
const ANDROID_PIXEL_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

test("detectMessengerSkin(): iPhone UA는 ios/auto로 판정한다(§13.5 규칙 #1, AC-031)", () => {
  assert.deepEqual(detectMessengerSkin(IPHONE_UA), { skin: "ios", source: "auto" });
});

test("detectMessengerSkin(): iPad UA도 ios/auto로 판정한다(§13.5 규칙 #1)", () => {
  assert.deepEqual(detectMessengerSkin(IPAD_UA), { skin: "ios", source: "auto" });
});

test("detectMessengerSkin(): Android + SM- 모델명은 samsung/auto로 판정한다(§13.5 규칙 #2)", () => {
  assert.deepEqual(detectMessengerSkin(SAMSUNG_SM_UA), { skin: "samsung", source: "auto" });
});

test("detectMessengerSkin(): Android + SamsungBrowser도 samsung/auto로 판정한다(§13.5 규칙 #2)", () => {
  assert.deepEqual(detectMessengerSkin(SAMSUNG_BROWSER_UA), { skin: "samsung", source: "auto" });
});

test("detectMessengerSkin(): 삼성 외 Android는 default/auto로 판정한다(§13.5 규칙 #3)", () => {
  assert.deepEqual(detectMessengerSkin(ANDROID_PIXEL_UA), { skin: "default", source: "auto" });
});

test("detectMessengerSkin(): 데스크톱 UA는 default/fallback으로 폴백한다(§13.5 규칙 #4, 침묵 실패 금지)", () => {
  assert.deepEqual(detectMessengerSkin(DESKTOP_UA), { skin: "default", source: "fallback" });
});

test("detectMessengerSkin(): UA가 비어있거나 없으면 default/fallback으로 폴백한다(§13.5 규칙 #4)", () => {
  assert.deepEqual(detectMessengerSkin(""), { skin: "default", source: "fallback" });
  assert.deepEqual(detectMessengerSkin(null), { skin: "default", source: "fallback" });
  assert.deepEqual(detectMessengerSkin(undefined), { skin: "default", source: "fallback" });
});
