// firebase.json 보안 헤더 · 404 가드 — 외부 점검 2026-10-21(C+ 62/100) 대응.
//
// 지키는 것:
//  1. 모든 응답에 보안 헤더가 붙는다(nosniff · 프레임 금지 · Referrer · Permissions · COOP · CSP).
//  2. Permissions-Policy — 통화에 필요한 마이크는 self 허용, 카메라 · 위치는 금지.
//  3. COOP는 Google 로그인 팝업과 호환되는 값이다(same-origin이면 팝업 결과를 못 받는다).
//  4. CSP가 통화 · 로그인 · 글꼴 출처를 허용한다(빠지면 강제 전환 때 통화 · 로그인이 깨진다).
//  4-1. SEC-04(외부 점검 2026-11-01) — 출처 목록이 필요 없는 4개 지시문만 강제 CSP로 낸다. 출처 목록
//       (default-src · script-src · connect-src 등)은 위반 수집 전이라 Report-Only에만 둔다.
//  5. 모든 경로를 404.html로 보내는 catch-all rewrite가 없다 — 있으면 없는 경로도 200이 나와(soft 404)
//     점검 도구가 `/_next/webpack-hmr` 200을 보고 "개발 서버가 돈다"로 오판한다.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hosting = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "firebase.json"), "utf8")).hosting;
const globalRule = hosting.headers.find((h) => h.source === "**");
const header = (key) => globalRule?.headers.find((h) => h.key === key)?.value;

test("전 경로(**) 보안 헤더가 있다", () => {
  assert.ok(globalRule, 'source "**" 헤더 규칙이 없다');
  assert.equal(header("X-Content-Type-Options"), "nosniff");
  assert.equal(header("X-Frame-Options"), "DENY");
  assert.equal(header("Referrer-Policy"), "strict-origin-when-cross-origin");
});

test("Permissions-Policy — 마이크는 self, 카메라 · 위치는 금지", () => {
  const pp = header("Permissions-Policy") ?? "";
  assert.match(pp, /(^|, )microphone=\(self\)/);
  assert.match(pp, /(^|, )camera=\(\)/);
  assert.match(pp, /(^|, )geolocation=\(\)/);
});

test("COOP는 로그인 팝업과 호환되는 same-origin-allow-popups다", () => {
  assert.equal(header("Cross-Origin-Opener-Policy"), "same-origin-allow-popups");
});

test("CSP Report-Only는 통화 · 로그인 · 글꼴 출처를 허용한다", () => {
  const csp = header("Content-Security-Policy-Report-Only") ?? "";
  const directive = (name) => (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "").split(/\s+/).slice(1);
  for (const origin of [
    "wss://generativelanguage.googleapis.com",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://firestore.googleapis.com",
    "https://*.cloudfunctions.net",
    "https://firebasestorage.googleapis.com",
  ]) {
    assert.ok(directive("connect-src").includes(origin), `connect-src에 ${origin} 없음`);
  }
  assert.ok(directive("frame-src").includes("https://voicefishing-ff47f.firebaseapp.com"), "로그인 iframe(authDomain) 없음");
  assert.ok(directive("script-src").includes("https://apis.google.com"), "로그인 팝업 스크립트 없음");
  assert.ok(directive("script-src").includes("'unsafe-inline'"), "정적 export 인라인 스크립트(self.__next_f)가 막힌다");
  assert.ok(directive("style-src").includes("https://fonts.googleapis.com"));
  assert.ok(directive("style-src").includes("https://cdn.jsdelivr.net"));
  assert.ok(directive("font-src").includes("https://fonts.gstatic.com"));
  assert.ok(directive("media-src").includes("blob:"), "녹음 미리듣기(blob:)가 막힌다");
  assert.deepEqual(directive("object-src"), ["'none'"]);
  assert.deepEqual(directive("frame-ancestors"), ["'none'"]);
});

test("SEC-04 — 강제 CSP는 출처 목록 없는 4개 지시문뿐이고 Report-Only는 그대로 남는다", () => {
  const enforced = header("Content-Security-Policy");
  assert.ok(enforced, "강제 Content-Security-Policy 헤더가 없다");
  const directives = enforced.split(";").map((d) => d.trim()).filter(Boolean).sort();
  assert.deepEqual(directives, ["base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'"]);
  // 통화 · 로그인을 깨뜨릴 수 있는 출처 지시문이 강제 쪽으로 새어 들어오면 안 된다.
  assert.doesNotMatch(enforced, /default-src|script-src|connect-src|frame-src|style-src|img-src|media-src/);
  assert.ok(header("Content-Security-Policy-Report-Only"), "Report-Only 헤더가 사라졌다");
});

test("catch-all → /404.html rewrite가 없다(soft 404 금지)", () => {
  const catchAll = (hosting.rewrites ?? []).filter((r) => r.source === "**" && r.destination === "/404.html");
  assert.deepEqual(catchAll, []);
});
