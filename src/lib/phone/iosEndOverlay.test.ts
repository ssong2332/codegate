// 2026-10-27 실기 신고(라이브 main 382bf7d8) — iOS형 통화 화면에서 키패드를 눌러도 반응이 없었다.
// 원인: 종료 원을 아래 줄 가운데로 끌어올린 `call-compact-end` 줄(폭 전체 · DOM상 버튼 묶음 뒤)이 `mt-[-102px]`로 아래 줄을 덮어
// 더 보기 · 키패드 칸의 누름을 가로챘다(에뮬레이터 elementFromPoint — 두 칸 모두 `DIV.call-compact-end`가 받음).
// 고정: 끌어올린 동안 줄은 누름을 통과시키고(pointer-events-none) 종료 원만 받는다(pointer-events-auto).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const play = readFileSync("src/app/session/play/page.tsx", "utf8");

/** `call-compact-end` 줄의 여는 태그부터 종료 버튼의 className까지. */
function endRowSource(): string {
  const start = play.indexOf("call-compact-end");
  assert.ok(start > 0, "call-compact-end 줄");
  const end = play.indexOf("<PhoneIcon name=\"end-call\"", start);
  assert.ok(end > start, "종료 아이콘");
  return play.slice(start, end);
}

test("[iOS 끌어올린 종료 줄] 음수 여백은 pointer-events-none과 함께만 쓴다", () => {
  const row = endRowSource();
  const margins = row.match(/"[^"]*mt-\[-\d+px\][^"]*"/g) ?? [];
  assert.ok(margins.length >= 1, "끌어올림 여백");
  for (const cls of margins) assert.match(cls, /pointer-events-none/, cls);
});

test("[iOS 끌어올린 종료 줄] 종료 원은 끌어올린 동안 pointer-events-auto로 누름을 받는다", () => {
  const row = endRowSource();
  const button = row.slice(row.indexOf("ref={endCallButtonRef}"));
  assert.match(button, /iosEndLifted \? "pointer-events-auto" : ""/);
});

test("[iOS 끌어올린 종료 줄] 끌어올림 조건은 하나 — 키패드 · 시트가 열리면 종전 자리", () => {
  assert.equal(play.split("const iosEndLifted = ios26 && !showTextInput && !callPanel;").length, 2);
  const row = endRowSource();
  assert.match(row, /iosEndLifted \? "pointer-events-none mt-\[-102px\]"/);
});
