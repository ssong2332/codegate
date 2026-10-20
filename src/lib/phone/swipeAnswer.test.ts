// G632 — 수신 벨 밀어서 받기 판정 + 배선(docs/Architecture.md §89.5 ⓑ · UX D-132 (5) ⓑ).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SWIPE_ACCEPT_MIN_PX, isSwipeAccept } from "./swipeAnswer.ts";
import { themeFromMatch } from "./deviceTheme.ts";

test("[G632] 48px 이상 움직이면 받기 · 덜 움직이면 아니다(방향 무관)", () => {
  assert.equal(SWIPE_ACCEPT_MIN_PX, 48);
  assert.equal(isSwipeAccept(0, -48), true);
  assert.equal(isSwipeAccept(40, 30), true);
  assert.equal(isSwipeAccept(-30, 0), false);
  assert.equal(isSwipeAccept(0, 0), false);
});

test("[G632] 받기 버튼은 누르기(onClick)와 밀기(pointer) 둘 다 handleAnswer로 간다", () => {
  const page = readFileSync("src/app/session/play/page.tsx", "utf8");
  const start = page.indexOf('aria-label="전화 받기"');
  assert.ok(start > 0, "받기 버튼을 못 찾았다");
  const button = page.slice(page.lastIndexOf("<button", start), page.indexOf("</button>", start));
  assert.match(button, /onClick=\{handleAnswer\}/, "누르기 경로가 사라졌다");
  assert.match(button, /onPointerMove=/, "밀기 경로가 없다");
  assert.match(button, /\btouch-none\b/, "밀기 중 스크롤이 가져가지 않게 touch-none이 있어야 한다");
  assert.ok(page.includes("isSwipeAccept("), "밀기 판정이 순수 함수를 쓰지 않는다");
});

test("[G632] 기기 테마 — 라이트 일치일 때만 light, 모르면 dark(종전 화면)", () => {
  assert.equal(themeFromMatch(true), "light");
  assert.equal(themeFromMatch(false), "dark");
  assert.equal(themeFromMatch(null), "dark");
});
