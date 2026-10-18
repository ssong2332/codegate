// T190-1 — G456 스킨 토큰 대비 하한 자동 집행 (docs/Architecture.md §73.14 G456 · UX D-96 (3) · PRD AC-095 (b)).
//
// 측정값(§73.17 P-6)으로 토큰을 바꿔도 이 테스트가 그대로 막는다 — 하한(글자 4.5:1 · 비텍스트 3:1)이 정밀
// 재현보다 우선한다. 미달이면 "하한을 지키는 가장 가까운 값"을 쓰고 편차 목록을 남긴다(D-96 (3)).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTRAST_MINIMUM,
  bannerTokensFor,
  callTokensFor,
  compositeOver,
  contrastRatio,
  contrastViolations,
  pairContrast,
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

test("[T190/UX-014 v1.33 (5)] 스킨 차이표 근사값 — 받기 초록 · 종료 빨강 · iOS형 아바타 없음 · 기본 = One UI형 골격", () => {
  for (const skin of SKINS) {
    assert.equal(callTokensFor(skin).accept, "#1E8E3E", "받기 = call.accept(앱 청록 #0E6B62는 Superseded)");
    assert.equal(callTokensFor(skin).end, "#C6392F");
    assert.equal(callTokensFor(skin).textSecondary, "#C9D4DB");
  }
  assert.equal(callTokensFor("ios").hasAvatar, false);
  assert.equal(callTokensFor("ios").bg, "#1C1C1E");
  assert.equal(callTokensFor("samsung").bg, "#101418");
  assert.deepEqual(callTokensFor("default"), callTokensFor("samsung"));
  assert.equal(bannerTokensFor("ios").radiusPx, 18);
  assert.equal(bannerTokensFor("samsung").radiusPx, 22);
});
