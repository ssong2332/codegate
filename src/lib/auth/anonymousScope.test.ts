import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  ANONYMOUS_LOGIN_NOTICE,
  ANONYMOUS_RECIPIENT_PATHS,
  isAnonymousOutsideRecipientFlow,
} from "./anonymousScope.ts";
import { RECOVERABLE_PATHS, TRAINING_PATHS } from "../authinvalidation/authInvalidation.ts";

// OQ-A84 회귀(라이브 2026-10-17, Android Whale): 챌린지 링크로 생긴 익명 세션이 남은 브라우저가
// /scenarios → 난이도까지 들어가 `createSession`의 `permission-denied`(T176 게이트)를 매번 맞았다.
// 에뮬레이터 재현: 익명 createSession → permission-denied 8~10ms(라이브 403 5~70ms와 일치).

const ROUTE_GUARD = "src/lib/auth/RouteGuard.tsx";
const LOGIN_PAGE = "src/app/(auth)/login/page.tsx";

// 모든 앱 라우트를 파일 시스템에서 열거한다(라우트 그룹 `(x)`는 URL에서 빠진다). 손으로 쓴 목록이면
// 새 본인 훈련 라우트가 생겨도 이 테스트가 놓친다(reviewer Minor-3).
function listAppRoutes(dir = "src/app", segments: string[] = []): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === "page.tsx") routes.push("/" + segments.join("/"));
    if (!entry.isDirectory()) continue;
    const isGroup = /^\(.+\)$/.test(entry.name);
    routes.push(...listAppRoutes(path.join(dir, entry.name), isGroup ? segments : [...segments, entry.name]));
  }
  return routes;
}

const ALL_ROUTES = listAppRoutes();
// 수신 흐름 밖 = 본인 훈련·발신자 화면(§68.4 거부 경로 화면 포함) — 전체 − 수신 목록 − /login.
const SELF_TRAINING_PATHS = ALL_ROUTES.filter(
  (r) => r !== "/login" && !(ANONYMOUS_RECIPIENT_PATHS as readonly string[]).includes(r),
);

test("라우트 열거가 실제로 동작한다(공회전 방지) — 난이도 화면·홈·로그인이 보인다", () => {
  for (const r of ["/", "/login", "/scenarios/difficulty", "/history", "/scenarios/voice/clone"]) {
    assert.ok(ALL_ROUTES.includes(r), `${r} 가 열거되지 않았다: ${ALL_ROUTES.join(", ")}`);
  }
  assert.ok(SELF_TRAINING_PATHS.includes("/scenarios/difficulty"));
});

test("익명 세션은 본인 훈련 경로(난이도 화면 포함)에서 수신 흐름 밖으로 판정된다 → /login", () => {
  for (const pathname of SELF_TRAINING_PATHS) {
    assert.equal(isAnonymousOutsideRecipientFlow(true, pathname), true, pathname);
  }
});

test("익명 세션은 /login에 머문다 — 거기서 다시 튕기면 Google 로그인을 할 곳이 없다", () => {
  assert.equal(isAnonymousOutsideRecipientFlow(true, "/login"), false);
});

test("익명 세션은 수신 흐름 전 경로에서 그대로 통과한다(AC-048 무회귀)", () => {
  for (const pathname of ANONYMOUS_RECIPIENT_PATHS) {
    assert.equal(isAnonymousOutsideRecipientFlow(true, pathname), false, pathname);
  }
});

test("계정형(Google) 사용자는 어떤 경로에서도 이 판정에 걸리지 않는다", () => {
  for (const pathname of [...SELF_TRAINING_PATHS, ...ANONYMOUS_RECIPIENT_PATHS, "/login"]) {
    assert.equal(isAnonymousOutsideRecipientFlow(false, pathname), false, pathname);
  }
});

test("수신 흐름 목록은 훈련 화면 전부와 리포트 계열(아카이브 제외)·동의 랜딩을 포함한다", () => {
  const recipient = ANONYMOUS_RECIPIENT_PATHS as readonly string[];
  for (const pathname of TRAINING_PATHS) assert.ok(recipient.includes(pathname), pathname);
  for (const pathname of RECOVERABLE_PATHS) {
    if (pathname === "/report/archive") continue; // 누적 아카이브는 계정 기능이다(UX-030).
    assert.ok(recipient.includes(pathname), pathname);
  }
  assert.ok(recipient.includes("/challenge/join"));
});

test("수신 흐름 목록의 각 경로는 실제 라우트(src/app/**/page.tsx)다 — 오타·이동 드리프트 가드", () => {
  for (const pathname of ANONYMOUS_RECIPIENT_PATHS) {
    const file = `src/app${pathname}/page.tsx`;
    assert.ok(existsSync(file), `${pathname} → ${file} 가 없다. 라우트가 옮겨졌으면 목록을 함께 고쳐라.`);
  }
});

// §68.3 클래스 D(익명 거부) 콜러블 — 수신 흐름 화면이 이것을 직접 import하면 익명이 막다른 오류를 본다.
const DENY_CALLABLES = [
  "createVoiceClone",
  "createSession",
  "getBeginnerBriefing",
  "createChallenge",
  "deleteChallenge",
  "listMyChallenges",
];

test("수신 흐름 화면은 익명 거부(D) 콜러블을 직접 import하지 않는다(과소차단 드리프트 가드)", () => {
  // ⚠️ 한계: 화면 파일의 직접 import만 본다. 하위 컴포넌트를 거친 간접 호출은 잡지 못한다.
  let parsedImports = 0;
  for (const pathname of ANONYMOUS_RECIPIENT_PATHS) {
    const src = readFileSync(`src/app${pathname}/page.tsx`, "utf8");
    for (const m of src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"@\/lib\/api[^"]*"/g)) {
      const names = m[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0]);
      parsedImports += names.length;
      for (const deny of DENY_CALLABLES) {
        assert.ok(!names.includes(deny), `${pathname}: 익명 거부 콜러블 ${deny}를 import한다(§68.3 클래스 D).`);
      }
    }
  }
  assert.ok(parsedImports > 0, "@/lib/api import를 하나도 읽지 못했다 — 정규식이 공회전한다");
});

// RouteGuard는 React 컴포넌트라 루트 러너로 렌더링할 수 없다 — 배선은 소스로 확인한다
// (선례: authInvalidation.test.ts [T128/G10]).
test("RouteGuard 배선 — 익명 판정으로 /login 리다이렉트·언마운트하고, 배너 보류를 존중하며, 익명은 /login에서 튕기지 않는다", () => {
  const code = readFileSync(ROUTE_GUARD, "utf8").replace(/\/\/[^\n]*/g, "");
  assert.ok(code.includes("isAnonymousOutsideRecipientFlow(user.isAnonymous, pathname)"), "익명 판정 호출이 없다");
  const guards = code.match(/anonymousOutOfScope && [^)\n]*/g) ?? [];
  assert.ok(guards.length >= 2, `${ROUTE_GUARD}: 익명 가드(리다이렉트·언마운트)를 찾지 못했다.`);
  for (const g of guards) {
    assert.ok(g.includes("!holdCurrentScreen"), `"${g}" — 배너 보류 조건 없이 끊으면 T128 결함이 돌아온다.`);
  }
  const loginBounces = code.match(/user && [^\n]*pathname === "\/login"/g) ?? [];
  assert.ok(loginBounces.length >= 2, `${ROUTE_GUARD}: /login 바운스 조건을 찾지 못했다.`);
  for (const b of loginBounces) {
    assert.ok(b.includes("!user.isAnonymous"), `"${b}" — 익명을 /login에서 튕기면 /login ↔ 온보딩 루프가 된다.`);
  }
  assert.doesNotMatch(code, /signOut\(/, "RouteGuard는 강제 로그아웃하지 않는다(Google 로그인 성공 시 SDK가 교체)");
});

test("로그인 화면은 익명 세션일 때 User 확정 안내 문구를 띄운다", () => {
  assert.equal(
    ANONYMOUS_LOGIN_NOTICE,
    "지금은 친구가 보낸 체험용 임시 접속 상태입니다. 내 훈련을 하려면 Google로 로그인해 주세요. 로그인하면 방금 본 체험 리포트는 다시 열 수 없습니다.",
    "OQ-U53 ⓑ — 셋째 문장(로그인하면 방금 본 체험 리포트는 다시 열 수 없다)이 빠졌다",
  );
  const login = readFileSync(LOGIN_PAGE, "utf8");
  assert.match(login, /isAnonymousSession && \(/, "안내가 익명 여부로 갈리지 않는다");
  assert.ok(login.includes("{ANONYMOUS_LOGIN_NOTICE}"), "안내 문구를 렌더링하지 않는다");
});

// AC-090 (b) — 안내는 스크린리더가 늦게 삽입돼도 읽도록 role="status"로 띄운다(PRD v1.19).
// 익명일 때만 렌더되는 그 블록 안에 role="status"와 문구가 함께 있어야 한다.
test("AC-090 (b) — 익명 안내 블록은 role=\"status\"로 렌더된다", () => {
  const login = readFileSync(LOGIN_PAGE, "utf8");
  const block = login.match(/isAnonymousSession && \(([\s\S]*?)\)\}/);
  assert.ok(block, "익명 안내 블록(isAnonymousSession && (...))을 찾지 못했다");
  assert.match(block[1], /role="status"/, "안내 블록에 role=\"status\"가 없다(AC-090 (b))");
  assert.ok(block[1].includes("{ANONYMOUS_LOGIN_NOTICE}"), "role=\"status\" 블록 안에 안내 문구가 없다");
});

// AC-090 (e) — 미인증(로그아웃) 경로는 변경 전과 같다: 공개 경로(/login · /challenge/join) 밖이면 /login,
// 배너 보류 중이면 보류. 안내 문구는 익명일 때만이라 미인증에는 뜨지 않는다.
test("AC-090 (e) — 미인증 사용자 경로는 무변경(공개 경로 밖 → /login, 배너 보류 존중, 안내 없음)", () => {
  const code = readFileSync(ROUTE_GUARD, "utf8").replace(/\/\/[^\n]*/g, "");
  assert.match(code, /const PUBLIC_PATHS = \["\/login", "\/challenge\/join"\]/, "공개 경로 목록이 바뀌었다");
  const unauth = code.match(/!user && !isPublicPath && !holdCurrentScreen/g) ?? [];
  assert.equal(unauth.length, 2, "미인증 가드(리다이렉트·언마운트) 2곳이 그대로가 아니다");
  assert.match(code, /if \(!user && !isPublicPath && !holdCurrentScreen\) \{\s*router\.replace\("\/login"\)/, "미인증 → /login 리다이렉트가 없다");
  const login = readFileSync(LOGIN_PAGE, "utf8");
  assert.match(login, /isAnonymousSession = user\?\.isAnonymous === true/, "미인증(user=null)에도 안내가 뜰 수 있다");
});
