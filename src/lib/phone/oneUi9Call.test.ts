// 2026-10-27 — One UI 9 통화 화면(`samsung` 스킨) 재현: 부제 표 · 토큰 · 배선(종전 스킨 무변경 포함).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { oneUi9CallerSubtitle } from "./oneUi9Call.ts";
import { callTokensFor, contrastViolations, oneUi9Pairs, voiceTalkCallTokens } from "./skinTokens.ts";

test("[One UI 9] 부제 — 휴대전화 · 전화 · 그 밖 없음", () => {
  assert.equal(oneUi9CallerSubtitle("010-1234-5678"), "휴대전화");
  assert.equal(oneUi9CallerSubtitle("02-6478-2718"), "전화");
  assert.equal(oneUi9CallerSubtitle("031-123-4567"), "전화");
  assert.equal(oneUi9CallerSubtitle("070-1234-5678"), "전화");
  assert.equal(oneUi9CallerSubtitle("1588-1234"), "전화");
  assert.equal(oneUi9CallerSubtitle("발신번호 표시제한"), null);
  assert.equal(oneUi9CallerSubtitle("+82 10-1234-5678"), null);
});

test("[One UI 9] samsung만 oneui9 — 라이트 · 다크 같은 화면 · iOS · 기본 · 보이스톡은 classic", () => {
  assert.equal(callTokensFor("samsung").controls, "oneui9");
  assert.deepEqual(callTokensFor("samsung", "light"), callTokensFor("samsung", "dark"));
  assert.ok(callTokensFor("samsung").shellGradient?.includes("gradient("));
  assert.equal(callTokensFor("samsung").hasAvatar, false);
  for (const skin of ["ios", "default"] as const) {
    assert.equal(callTokensFor(skin).controls, "classic");
    assert.equal(callTokensFor(skin).shellGradient, null);
  }
  for (const skin of ["ios", "samsung", "default"] as const) assert.equal(voiceTalkCallTokens(skin).controls, "classic");
  // 보이스톡 통화의 samsung 바탕 아래 버튼은 종전 One UI형(판) 그대로.
  assert.equal(voiceTalkCallTokens("samsung").gridPanelBg, "#1E252C");
});

test("[One UI 9 · G456] 띠 두 끝 대비 — 흰 라벨 4.5:1 · 어두운 눌림 3:1 · 역검증(실기 밝은 띠 #78798D는 라벨에서 실패)", () => {
  const call = callTokensFor("samsung");
  const pairs = oneUi9Pairs("samsung", call);
  assert.equal(pairs.length, 8);
  assert.deepEqual(contrastViolations(pairs), []);
  const poisoned = { ...call, gridBandStops: ["#5C5E7A", "#78798D"] as const };
  assert.ok(contrastViolations(oneUi9Pairs("samsung", poisoned)).some((v) => v.startsWith("samsung.call9.label@light ")));
  assert.deepEqual(oneUi9Pairs("ios", callTokensFor("ios")), []);
});

test("[One UI 9] 배선 — 통화 셸이 oneui9일 때만 새 버튼 묶음 · 그라데이션 · 장식 버튼은 aria-hidden", () => {
  const play = readFileSync("src/app/session/play/page.tsx", "utf8");
  assert.match(play, /const oneUi9 = callTokens\.controls === "oneui9";/);
  assert.match(play, /\) : oneUi9 \? \(\s*<OneUiCallControls/);
  assert.match(play, /callTokens\.shellGradient \?\? callTokens\.bg/);
  // 종료 버튼 이름(G441)은 그대로 — 스킨과 무관하게 한 버튼.
  assert.equal(play.split('aria-label={returnsToMessengerOnHangup ? "통화 종료" : "통화 종료 — 훈련 종료"}').length, 2);
  const controls = readFileSync("src/components/OneUiCallControls.tsx", "utf8");
  for (const word of ["녹음", "블루투스", "통화 자막", "통화 대기", "연락처 보기"]) assert.ok(controls.includes(word), word);
  assert.match(controls, /const decorative = [\s\S]*?<div aria-hidden="true"/);
  assert.ok(!/samsung|galaxy|갤럭시|삼성/i.test(controls.replace(/\/\/.*$/gm, "")), "상표 표기 0");
});
