// T190-1 — G456 스킨 토큰 대비 하한 자동 집행 (docs/Architecture.md §74.14 G456 · UX D-96 (3) · PRD AC-095 (b)).
//
// 측정값(§74.17 P-6)으로 토큰을 바꿔도 이 테스트가 그대로 막는다 — 하한(글자 4.5:1 · 비텍스트 3:1)이 정밀
// 재현보다 우선한다. 미달이면 "하한을 지키는 가장 가까운 값"을 쓰고 편차 목록을 남긴다(D-96 (3)).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTRAST_MINIMUM,
  bannerTokensFor,
  callTokensFor,
  compositeHex,
  compositeOver,
  contrastRatio,
  contrastViolations,
  gridPressedPairs,
  pairContrast,
  panelPairs,
  parseColor,
  skinContrastPairs,
  type ContrastPair,
} from "./skinTokens.ts";

const SKINS = ["ios", "samsung", "default"] as const;

test("[T190/G456] 세 스킨의 모든 (글자/아이콘, 바탕) 쌍이 WCAG 하한 이상이다", (t) => {
  const pairs = SKINS.flatMap((skin) => skinContrastPairs(skin));
  assert.ok(pairs.length >= 30, `대비 쌍이 ${pairs.length}개뿐이다 — 수집이 죽었다`);
  const report = pairs.map((pair) => `${pair.name}=${pairContrast(pair).toFixed(2)}`).join(" · ");
  t.diagnostic(`[G456] ${pairs.length}쌍 — ${report}`);
  assert.deepEqual(contrastViolations(pairs), []);
});

test("[T190/G456] 대비 공식 기준점 — 흑/백 21:1 · 같은 색 1:1 · 반투명 합성", () => {
  assert.equal(contrastRatio(parseColor("#000000"), parseColor("#FFFFFF")).toFixed(2), "21.00");
  assert.equal(contrastRatio(parseColor("#777777"), parseColor("#777777")).toFixed(2), "1.00");
  assert.deepEqual(compositeOver("rgba(255,255,255,0)", "#101418"), parseColor("#101418"));
  assert.deepEqual(compositeOver("rgba(255,255,255,1)", "#101418"), parseColor("#FFFFFF"));
  assert.throws(() => parseColor("white"), /읽을 수 없는 색 형식/);
});

test("[T190/G456 역검증] iOS 발신 말풍선 옛 값 #0B84FF + 흰 글(UX 손계산 약 3.6:1)은 실패한다", (t) => {
  const poisoned: ContrastPair[] = [
    { name: "ios.bubble.outgoing(옛 값)", fg: "#FFFFFF", bg: "#0B84FF", kind: "text" },
  ];
  const ratio = pairContrast(poisoned[0]);
  const violations = contrastViolations(poisoned);
  t.diagnostic(`[G456 역검증] #0B84FF/흰 글 = ${ratio.toFixed(2)}:1 → 위반 ${violations.length}건`);
  assert.ok(ratio < CONTRAST_MINIMUM.text);
  assert.equal(violations.length, 1);
  // 같은 함수로 비텍스트 하한도 실제로 일한다 — 받기 원 위 아이콘을 흐린 사본.
  const dimAccept: ContrastPair = { name: "accept-dim", fg: "#9BCFA9", bg: "#1E8E3E", kind: "nonText" };
  assert.equal(contrastViolations([dimAccept]).length, 1);
});

test("[UX D-129/G456] 그리드 눌림 원 — 세 스킨 모두 ⓐ 눌림 원(합성)↔call.bg · ⓑ 아이콘↔눌림 원(합성) 둘 다 3:1 이상", (t) => {
  for (const skin of SKINS) {
    const call = callTokensFor(skin);
    const pairs = gridPressedPairs(skin, call);
    assert.deepEqual(
      pairs.map((p) => p.name),
      [`${skin}.call.gridPressedIndicator`, `${skin}.call.gridIconPressed`],
    );
    // 본 게이트(skinContrastPairs)가 이 두 쌍을 실제로 수집한다 — 수집에서 빠지면 위 전수 테스트가 못 잡는다.
    const collected = skinContrastPairs(skin).map((p) => p.name);
    for (const p of pairs) assert.ok(collected.includes(p.name), `${p.name}이 G456 수집에서 빠졌다`);
    t.diagnostic(
      `[D-129] ${skin} 눌림 원 ${pairs[0].fg} ↔ ${call.bg} = ${pairContrast(pairs[0]).toFixed(2)}:1 · ` +
        `아이콘 = ${pairContrast(pairs[1]).toFixed(2)}:1`,
    );
    assert.deepEqual(contrastViolations(pairs), []);
  }
  // 기본 = 0.40 (D-129 (1)) · iOS형 무변경. One UI형(2026-10-27 One UI 9 화면) = 어두운 채움 — 띠 어두운 끝 대비(`oneUi9Pairs`).
  assert.equal(callTokensFor("default").gridButtonPressedBg, "rgba(255,255,255,0.40)");
  assert.equal(callTokensFor("samsung").gridButtonPressedBg, "#0E0D11");
  assert.equal(callTokensFor("ios").gridButtonPressedBg, "#FFFFFF");
  assert.equal(callTokensFor("ios").gridIconPressed, "#1C1C1E");
  assert.equal(compositeHex("rgba(255,255,255,0.40)", "#101418"), "#707274");
});

test("[UX D-129/G456 역검증] 옛 값 0.24 사본은 ⓐ 눌림 원↔바탕 쌍에서 실패한다(아이콘 쌍은 통과 — 옛 게이트가 못 잡은 이유)", (t) => {
  // 2026-10-27 — One UI형이 One UI 9 화면으로 바뀌어 옛 바탕(#101418)은 기본 스킨에 남았다(같은 값 · 같은 역검증).
  const poisonedCall = { ...callTokensFor("default"), gridButtonPressedBg: "rgba(255,255,255,0.24)" };
  const [indicator, icon] = gridPressedPairs("samsung", poisonedCall);
  const violations = contrastViolations([indicator, icon]);
  t.diagnostic(
    `[D-129 역검증] 0.24 = ${indicator.fg} ↔ ${poisonedCall.bg} ${pairContrast(indicator).toFixed(2)}:1 · ` +
      `아이콘 ${pairContrast(icon).toFixed(2)}:1 → 위반 ${violations.join(" | ")}`,
  );
  assert.equal(indicator.fg, "#494C4F");
  assert.ok(pairContrast(indicator) < CONTRAST_MINIMUM.nonText);
  assert.ok(pairContrast(icon) >= CONTRAST_MINIMUM.nonText);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /^samsung\.call\.gridPressedIndicator /);
});

test("[T190/UX-014 v1.33 (5)] 스킨 차이표 근사값 — 받기 초록 · 종료 빨강 · iOS형 아바타 없음 · 기본 = One UI형 골격", () => {
  for (const skin of SKINS) {
    assert.equal(callTokensFor(skin).accept, "#1E8E3E", "받기 = call.accept(앱 청록 #0E6B62는 Superseded)");
    // 2026-10-27 — One UI형(One UI 9 화면)만 실기 종료 원 색 #DB3D34. iOS형 · 기본은 #C6392F 유지.
    // 2026-10-27 — iOS형(iOS 26 화면)은 시스템 빨강 #FF3B30.
    assert.equal(callTokensFor(skin).end, skin === "samsung" ? "#DB3D34" : skin === "ios" ? "#FF3B30" : "#C6392F");
    assert.equal(callTokensFor(skin).textSecondary, "#C9D4DB");
  }
  assert.equal(callTokensFor("ios").hasAvatar, false);
  assert.equal(callTokensFor("ios").bg, "#1C1C1E");
  // 2026-10-27 — One UI형 = One UI 9 화면(블러 그라데이션 · 위 끝 #0E0D15). 기본은 종전 One UI형 골격 그대로.
  assert.equal(callTokensFor("samsung").bg, "#0E0D15");
  assert.equal(callTokensFor("default").bg, "#101418");
  assert.equal(bannerTokensFor("ios").radiusPx, 18);
  assert.equal(bannerTokensFor("samsung").radiusPx, 22);
});

// 2026-10-21 사용자 실기 신고 *"iOS형과 One UI형의 전화 화면이 차이가 없네"* — 색만이 아니라 화면 골격이 갈린다.
test("[실기 신고 2026-10-21] 스킨 골격 — iOS형 = ios(판 없음 · 원 키패드) · 기본 = oneui(판) · One UI형 = oneui + One UI 9(판 없음)", () => {
  assert.equal(callTokensFor("ios").layout, "ios");
  assert.equal(callTokensFor("ios").gridPanelBg, null);
  assert.equal(callTokensFor("default").layout, "oneui");
  assert.ok(callTokensFor("default").gridPanelBg, "default 화면에 버튼 판이 없다");
  // 2026-10-27(사용자 요청 — One UI 9 실기 스크린샷) — One UI형은 판 없이 그라데이션 위 둥근 사각 버튼(받기 · 거절 배치는 oneui 그대로).
  assert.equal(callTokensFor("samsung").layout, "oneui");
  assert.equal(callTokensFor("samsung").gridPanelBg, null);
  assert.equal(callTokensFor("samsung", "light").gridPanelBg, null);
  // iOS형 라이트 테마 요청도 어두운 iOS형 그대로(§89.5 ⓒ — 라이트 통화 화면은 One UI형에만).
  assert.deepEqual(callTokensFor("ios", "light"), callTokensFor("ios"));
});

test("[실기 신고 2026-10-21 · G456] 판이 있는 스킨은 판 위 라벨 · 아이콘 · 눌림 쌍을 수집한다(판 없는 iOS형은 0쌍)", () => {
  const names = (skin: (typeof SKINS)[number]) => skinContrastPairs(skin).map((p) => p.name);
  for (const skin of ["default"] as const) {
    for (const suffix of ["panelLabel", "panelIcon", "panelPressedIndicator", "panelIconPressed", "keypadLetters"]) {
      assert.ok(names(skin).includes(`${skin}.call.${suffix}`), `${skin}.call.${suffix}이 G456 수집에서 빠졌다`);
    }
  }
  assert.equal(names("ios").some((n) => n.includes(".call.panel")), false);
  // One UI 9(판 없음) — 판 쌍 대신 띠 쌍(`oneUi9Pairs`)을 수집한다.
  assert.equal(names("samsung").some((n) => n.includes(".call.panel")), false);
  assert.ok(names("samsung").includes("samsung.call9.label@light"));
  assert.ok(names("ios").includes("ios.call.keypadLetters"));
});

test("[실기 신고 2026-10-21 · G456 역검증] 판을 바탕과 거의 같은 밝은 회색으로 바꾼 사본은 흰 라벨에서 실패한다", () => {
  const poisoned = { ...callTokensFor("default"), gridPanelBg: "#C9D4DB" };
  const violations = contrastViolations(panelPairs("default", poisoned));
  assert.ok(violations.some((v) => v.startsWith("default.call.panelLabel ")), violations.join(" | "));
});
