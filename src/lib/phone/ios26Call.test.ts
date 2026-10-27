// 2026-10-27(사용자 지시) — iOS형(`ios`) 통화 화면 = iOS 26 근사(`IosCallControls` · `IOS_26_CALL`). 종전 값 유지 · 보이스톡 무변경 · 단일 종료 버튼.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { callTokensFor, contrastViolations, ios26Pairs, voiceTalkCallTokens } from "./skinTokens.ts";

const play = readFileSync("src/app/session/play/page.tsx", "utf8");
const ios = readFileSync("src/components/IosCallControls.tsx", "utf8");

test("[iOS 26] 토큰 — controls ios26 · 종전 iOS형 값 유지 · 보이스톡은 classic · 대비 하한", () => {
  const call = callTokensFor("ios");
  assert.equal(call.controls, "ios26");
  assert.equal(call.layout, "ios");
  assert.equal(call.bg, "#1C1C1E");
  assert.equal(call.gridButtonPressedBg, "#FFFFFF");
  assert.ok(call.shellGradient?.startsWith("linear-gradient("));
  assert.deepEqual(callTokensFor("ios", "light"), call);
  assert.equal(voiceTalkCallTokens("ios").controls, "classic");
  const pairs = ios26Pairs("ios", call);
  assert.equal(pairs.length, 4);
  assert.deepEqual(contrastViolations(pairs), []);
  assert.deepEqual(ios26Pairs("default", callTokensFor("default")), []);
});

test("[iOS 26] 배치 — 위 줄 스피커 · 영상 통화 · 소리 끔 / 아래 줄 더 보기 · (종료 자리) · 키패드", () => {
  const order = ["aria-label=\"스피커\"", "aria-label=\"영상 통화\"", "\"음소거 해제\" : \"음소거\"", "더 보기 — 미확인", "종료 자리", "키패드 — 텍스트로 입력"];
  let at = -1;
  for (const mark of order) {
    const next = ios.indexOf(mark, at + 1);
    assert.ok(next > at, `${mark} 순서`);
    at = next;
  }
  // 종료 버튼은 play에 하나뿐(G441) — iOS 26은 그 버튼을 아래 줄 가운데로 끌어올린다.
  assert.equal(play.split('aria-label={returnsToMessengerOnHangup ? "통화 종료" : "통화 종료 — 훈련 종료"}').length, 2);
  assert.match(play, /const iosEndLifted = ios26 && !showTextInput && !callPanel;/);
  assert.match(play, /iosEndLifted \? "pointer-events-none mt-\[-102px\]"/);
});

test("[iOS 26] 상표 0 — FaceTime · Apple · iPhone 낱말을 그리지 않는다", () => {
  const code = ios.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const word of ["FaceTime", "Apple", "iPhone"]) assert.ok(!code.includes(word), word);
});
