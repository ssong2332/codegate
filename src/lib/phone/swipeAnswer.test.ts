// G632 — 수신 벨 밀어서 받기 판정 · 순서 + 배선(docs/Architecture.md §89.5 ⓑ · UX D-132 (5) ⓑ · 독립 QA Major 2026-10-20).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SWIPE_ACCEPT_MIN_PX, createSwipeAnswer, isSwipeAccept } from "./swipeAnswer.ts";
import { themeFromMatch } from "./deviceTheme.ts";

test("[G632] 48px 이상 움직이면 밀기 · 덜 움직이면 아니다(방향 무관)", () => {
  assert.equal(SWIPE_ACCEPT_MIN_PX, 48);
  assert.equal(isSwipeAccept(0, -48), true);
  assert.equal(isSwipeAccept(40, 30), true);
  assert.equal(isSwipeAccept(-30, 0), false);
  assert.equal(isSwipeAccept(0, 0), false);
});

test("[G632] 밀기: pointermove에서는 받지 않고 pointerup(활성화 이벤트)에서 1회 받는다 · 뒤따르는 click은 무시", () => {
  const c = createSwipeAnswer();
  const calls: string[] = [];
  const answer = (from: string) => () => calls.push(from);
  c.down(100, 400);
  c.move(100, 380);
  c.move(100, 340); // 60px — 판정만
  assert.deepEqual(calls, [], "pointermove에서 받으면 오디오 잠금 해제를 놓친다");
  c.up(answer("up"));
  assert.deepEqual(calls, ["up"]);
  c.click(answer("click")); // 밀기 뒤 브라우저가 보내는 click
  assert.deepEqual(calls, ["up"], "밀기 뒤 click이 다시 받으면 이중 호출이다");
});

test("[G632] 누르기 · 키보드: 움직임 없는 up은 받지 않고 click이 1회 받는다(종전 경로)", () => {
  const c = createSwipeAnswer();
  const calls: string[] = [];
  c.down(100, 400);
  c.move(103, 398);
  c.up(() => calls.push("up"));
  c.click(() => calls.push("click"));
  assert.deepEqual(calls, ["click"]);
  // 키보드(Enter/Space)는 포인터 없이 click만 온다.
  c.click(() => calls.push("key"));
  assert.deepEqual(calls, ["click", "key"]);
});

test("[G632] 취소(pointercancel)되면 받지 않는다 · 다음 누르기는 정상", () => {
  const c = createSwipeAnswer();
  const calls: string[] = [];
  c.down(0, 0);
  c.move(0, -60);
  c.cancel();
  c.up(() => calls.push("up"));
  assert.deepEqual(calls, []);
  c.click(() => calls.push("click"));
  assert.deepEqual(calls, ["click"]);
});

test("[G632] 받기 버튼 배선 — move는 판정만 · up과 click이 handleAnswer · touch-none", () => {
  const page = readFileSync("src/app/session/play/page.tsx", "utf8");
  const start = page.indexOf('aria-label="전화 받기"');
  assert.ok(start > 0, "받기 버튼을 못 찾았다");
  const button = page.slice(page.lastIndexOf("<button", start), page.indexOf("</button>", start));
  assert.match(button, /onClick=\{\(\) => swipeAnswerRef\.current\.click\(handleAnswer\)\}/, "누르기 · 키보드 경로가 사라졌다");
  assert.match(button, /onPointerUp=\{\(\) => swipeAnswerRef\.current\.up\(handleAnswer\)\}/, "밀기 받기는 pointerup에서");
  const move = button.slice(button.indexOf("onPointerMove="), button.indexOf("onPointerUp="));
  assert.ok(move.length > 0 && !move.includes("handleAnswer"), "pointermove가 handleAnswer를 부른다(활성화 아님)");
  assert.match(button, /\btouch-none\b/, "밀기 중 스크롤이 가져가지 않게 touch-none이 있어야 한다");
});

test("[G632] 기기 테마 — 라이트 일치일 때만 light, 모르면 dark(종전 화면)", () => {
  assert.equal(themeFromMatch(true), "light");
  assert.equal(themeFromMatch(false), "dark");
  assert.equal(themeFromMatch(null), "dark");
});
