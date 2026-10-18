// T190-3 — 통화 경과 시간 표기 (UX-014 v1.33 (3) · D-86 · docs/Architecture.md §74.6 (3)).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCallElapsed, spokenCallElapsed } from "./callClock.ts";

test("[T190/UX-014 v1.33 (3)] mm:ss · 1시간 이상 h:mm:ss(예전 m:ss는 60분을 넘어도 분만 커졌다)", () => {
  assert.equal(formatCallElapsed(0), "00:00");
  assert.equal(formatCallElapsed(207), "03:27");
  assert.equal(formatCallElapsed(3599), "59:59");
  assert.equal(formatCallElapsed(3600), "1:00:00");
  assert.equal(formatCallElapsed(3725), "1:02:05");
  assert.equal(formatCallElapsed(-5), "00:00");
  assert.equal(formatCallElapsed(61.9), "01:01");
});

test("[T190/UX-014 v1.33 (3)] 접근 이름 — 숫자를 매초 읽지 않고 포커스 시 '통화 중, 경과 m분 s초'", () => {
  assert.equal(spokenCallElapsed(207), "통화 중, 경과 3분 27초");
  assert.equal(spokenCallElapsed(3725), "통화 중, 경과 1시간 2분 5초");
});
