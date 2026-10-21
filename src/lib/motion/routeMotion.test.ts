// UX D-134 — 사이트 모션 판정 · 배선(훈련 화면 제외 · 가짜 진행률 금지 · transform 잔류 금지).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SESSION_PREP_HINTS, isTrainingSurfacePath, pickLoadingHint } from "./routeMotion.ts";

test("[D-134] 훈련 화면(통화 · 채팅 · 메신저)만 페이지 진입 모션에서 뺀다", () => {
  for (const p of ["/session/play", "/session/play/", "/session/chat", "/session/messenger", "/session/play/x"]) {
    assert.equal(isTrainingSurfacePath(p), true, p);
  }
  for (const p of ["/", "/scenarios", "/scenarios/difficulty", "/session/end", "/report", "/challenge/join", "/session/player", null, undefined]) {
    assert.equal(isTrainingSurfacePath(p), false, String(p));
  }
});

test("[D-134] 대기 안내는 경과 시간에 맞는 마지막 문구 하나만 고른다", () => {
  const hints = [
    { afterMs: 0, text: "a" },
    { afterMs: 5000, text: "b" },
  ];
  assert.equal(pickLoadingHint(hints, 0), "a");
  assert.equal(pickLoadingHint(hints, 4999), "a");
  assert.equal(pickLoadingHint(hints, 5000), "b");
  assert.equal(pickLoadingHint([{ afterMs: 3000, text: "c" }], 1000), null);
});

test("[D-134] 세션 준비 문구 — 시간 오름차순 · 진행률/단계 완료 표현 없음", () => {
  const times = SESSION_PREP_HINTS.map((h) => h.afterMs);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.equal(times[0], 0, "대기 시작부터 무엇을 하는지 말해야 한다");
  for (const { text } of SESSION_PREP_HINTS) {
    assert.doesNotMatch(text, /%|\d+\s*\/\s*\d+|단계|완료|거의 다/, `가짜 진행 표현: ${text}`);
  }
});

test("[D-134] 배선 — template은 훈련 화면 판정을 쓰고, layout은 motion.css를 불러온다", () => {
  const template = readFileSync("src/app/template.tsx", "utf8");
  assert.match(template, /isTrainingSurfacePath\(pathname\)/);
  assert.match(template, /page-enter/);
  // 재마운트 없는 이동(같은 최상위 구간)에서도 페이드가 돌도록 경로마다 건다 · reduced-motion이면 건너뛴다 · opacity만.
  assert.match(template, /\}, \[pathname, animate\]\);/);
  assert.match(template, /prefers-reduced-motion: reduce/);
  assert.match(template, /el\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\]/);
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /import "\.\/motion\.css";/);
});

test("[D-134] motion.css는 끝난 뒤 transform을 남기지 않는다(fill-mode forwards/both 금지)", () => {
  const code = readFileSync("src/app/motion.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of code.matchAll(/animation\s*:([^;]+);/g)) {
    assert.doesNotMatch(m[1], /\b(forwards|both)\b/, `잔류 위험: ${m[1].trim()}`);
  }
});

test("[D-134] 훈련 화면 파일에는 사이트 진입 모션 클래스를 쓰지 않는다", () => {
  for (const f of ["src/app/session/play/page.tsx", "src/app/session/chat/page.tsx", "src/app/session/messenger/page.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /page-enter|motion-reveal|check-pop/, f);
  }
});
