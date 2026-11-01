// §133(DECISIONS #249 · UX D-162) — 사이트 기본 요소: robots.txt · sitemap · 한국어 404 · 공개 페이지 제목 · 설명 · 자주 묻는 질문.
// 점검 보고서 `docs/research/site-essentials-audit-2026-10-24.md`(라이브: robots · sitemap 404 · 404 영문 · 제목 전부 같음 · FAQ 없음).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  APP_ROUTE_PATHS,
  DISALLOW_PREFIXES,
  isKnownAppPath,
  NOT_FOUND_TITLE,
  PUBLIC_PAGE_META,
  SITE_URL,
  SITEMAP_PATHS,
} from "./publicPages.ts";
import { INFO_PATHS, LEGAL_PATHS } from "../auth/anonymousScope.ts";
import { resolveAuthInvalidationMode } from "../authinvalidation/authInvalidation.ts";
import { FAQ_ITEMS, FAQ_LINK_EXPIRY_DAYS, FAQ_RETENTION_DAYS } from "../faq/faqContent.ts";
import { CHALLENGE_LINK_EXPIRY_DAYS, CHALLENGE_RETENTION_DAYS } from "../legal/legalContent.ts";

const read = (f: string) => readFileSync(f, "utf8");
const codeOnly = (f: string) => read(f).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");

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

const PUBLIC_PATHS = ["/", "/login", "/challenge/join", ...LEGAL_PATHS, ...INFO_PATHS];

test("[§133] 앱 라우트 목록(APP_ROUTE_PATHS)이 파일 시스템과 같다 — 새 화면을 만들면 여기도 넣어야 404로 빠지지 않는다", () => {
  assert.deepEqual([...APP_ROUTE_PATHS].sort(), listAppRoutes().sort());
});

test("[§133] 앱 라우트는 공개 · robots 차단 둘 중 정확히 하나다", () => {
  const blocked = (p: string) => DISALLOW_PREFIXES.some((d) => p === d || p.startsWith(`${d}/`));
  for (const route of APP_ROUTE_PATHS) {
    const isPublic = PUBLIC_PATHS.includes(route);
    assert.notEqual(isPublic, blocked(route), `${route}: 공개=${isPublic} · 차단=${blocked(route)}`);
  }
  // RouteGuard의 실제 목록과 이 테스트의 목록이 같다.
  assert.match(codeOnly("src/lib/auth/RouteGuard.tsx"), /const PUBLIC_PATHS = \["\/", "\/login", "\/challenge\/join", \.\.\.LEGAL_PATHS, \.\.\.INFO_PATHS\]/);
});

test("[§133] robots.ts · sitemap.ts — 정적 export · 목록 단일 출처 · sitemap 위치", () => {
  const robots = codeOnly("src/app/robots.ts");
  assert.match(robots, /export const dynamic = "force-static";/);
  assert.match(robots, /disallow: \[\.\.\.DISALLOW_PREFIXES\]/);
  assert.match(robots, /sitemap: `\$\{SITE_URL\}\/sitemap\.xml`/);
  const sitemap = codeOnly("src/app/sitemap.ts");
  assert.match(sitemap, /export const dynamic = "force-static";/);
  assert.match(sitemap, /SHOW_LEGAL_LINKS \? \[\.\.\.SITEMAP_PATHS, \.\.\.LEGAL_PATHS\] : SITEMAP_PATHS/);
  assert.deepEqual([...SITEMAP_PATHS], ["/", ...INFO_PATHS]);
  assert.match(read("src/app/layout.tsx"), new RegExp(`const SITE_URL = "${SITE_URL.replace(/[.]/g, "\\.")}";`));
});

test("[§133] 없는 주소 판정 — 있는 라우트 · 끝 빗금은 앎, 모르는 주소는 404", () => {
  for (const p of ["/", "/faq", "/scenarios/", "/session/play", "/challenge/join"]) assert.equal(isKnownAppPath(p), true, p);
  for (const p of ["/no-such-page-xyz", "/_not-found", "/scenario", "/faq/x"]) assert.equal(isKnownAppPath(p), false, p);
  const guard = codeOnly("src/lib/auth/RouteGuard.tsx");
  assert.match(guard, /const isUnknownPath = !isKnownAppPath\(pathname\);/);
  assert.match(guard, /const isPublicPath = PUBLIC_PATHS\.includes\(pathname\) \|\| isUnknownPath;/);
  assert.match(guard, /user !== null && !isUnknownPath && isAnonymousOutsideRecipientFlow\(user\.isAnonymous, pathname\)/);
});

test("[§133] 한국어 404 — 탭 제목 · canonical 제거 · 처음으로 버튼(56px · 18px) · 영문 0", () => {
  const nf = codeOnly("src/app/not-found.tsx");
  assert.match(nf, /title: NOT_FOUND_TITLE/);
  assert.match(nf, /alternates: \{ canonical: null \}/);
  assert.equal(/robots:/.test(nf), false, "noindex는 Next가 붙인다 — 직접 넣으면 메타가 두 번");
  assert.match(nf, /<Link\s+href="\/"\s+className="[^"]*min-h-\[56px\][^"]*text-\[18px\][^"]*"\s*>\s*처음으로\s*<\/Link>/);
  assert.equal(/could not be found/i.test(nf), false);
  assert.match(NOT_FOUND_TITLE, /^페이지를 찾을 수 없습니다/);
});

test("[§133] 공개 페이지 제목 · 설명이 저마다 다르고 첫 화면(루트 기본값)과도 다르다 · 각 화면이 단일 출처를 쓴다", () => {
  const layout = read("src/app/layout.tsx");
  const rootTitle = layout.match(/const SITE_TITLE = "([^"]+)";/)?.[1];
  assert.ok(rootTitle);
  const metas = Object.values(PUBLIC_PAGE_META);
  const titles = new Set([rootTitle, ...metas.map((m) => m.title)]);
  assert.equal(titles.size, metas.length + 1, "제목이 겹친다");
  assert.equal(new Set(metas.map((m) => m.description)).size, metas.length, "설명이 겹친다");
  assert.match(codeOnly("src/app/(auth)/login/layout.tsx"), /export const metadata: Metadata = PUBLIC_PAGE_META\["\/login"\];/);
  assert.match(codeOnly("src/app/challenge/join/layout.tsx"), /\.\.\.PUBLIC_PAGE_META\["\/challenge\/join"\], robots: \{ index: false, follow: false \}/);
  assert.match(codeOnly("src/app/faq/page.tsx"), /export const metadata: Metadata = PUBLIC_PAGE_META\["\/faq"\];/);
  for (const p of LEGAL_PATHS) {
    assert.match(codeOnly(`src/app${p}/page.tsx`), new RegExp(`\\.\\.\\.PUBLIC_PAGE_META\\["\\${p}"\\], robots: LEGAL_ROBOTS`));
  }
});

test("[§133 · UX D-162] 자주 묻는 질문 5문항 — 순서 · 빈 답 0 · 근거 값 대조 · 첫 화면 연결", () => {
  assert.deepEqual(
    FAQ_ITEMS.map((i) => i.question),
    ["진짜 전화가 오나요?", "돈이 나가나요?", "녹음과 사진은 어디로 가나요?", "가족에게 어떻게 보내나요?", "무료인가요?"],
  );
  for (const item of FAQ_ITEMS) assert.ok(item.answer.length > 0 && item.answer.every((l) => l.trim().length > 0), `${item.question} 답이 비었다`);
  const all = FAQ_ITEMS.flatMap((i) => i.answer).join("\n");
  // 실존 기관 · 회사 이름 0.
  assert.equal(/금융감독원|금감원|검찰|경찰|은행연합|국민은행|신한|우리은행|하나은행|카카오뱅크|Google|구글|Gemini|Groq|ElevenLabs/.test(all), false);
  const photo = FAQ_ITEMS[2].answer.join("\n");
  assert.ok(photo.includes("서버로 보내지 않습니다"));
  // 근거: 대화방은 사진을 업로드하지 않는다(§113.2 게이트와 같은 검사).
  assert.equal(/firebase\/storage|uploadBytes|FormData|FileReader|readAsDataURL/.test(read("src/components/MessengerChatRoom.tsx")), false);
  assert.equal(FAQ_RETENTION_DAYS, CHALLENGE_RETENTION_DAYS);
  assert.equal(FAQ_LINK_EXPIRY_DAYS, CHALLENGE_LINK_EXPIRY_DAYS);
  assert.ok(photo.includes(`${CHALLENGE_RETENTION_DAYS}일`));
  assert.ok(FAQ_ITEMS[3].answer.join("\n").includes(`${CHALLENGE_LINK_EXPIRY_DAYS}일 뒤 만료`));
  assert.match(read("src/app/scenarios/experience-select/page.tsx"), /title: "지인에게 보내기"/);
  // UX D-162 — 머리줄 안(첫 화면 높이 0 추가 · 412×780 넘침 0 실측).
  assert.match(codeOnly("src/app/page.tsx"), /<header[^>]*>[\s\S]*<Link href="\/faq"[^>]*min-h-\[48px\][^>]*>\s*자주 묻는 질문\s*<\/Link>\s*<\/header>/);
});

// 사용자 신고 2026-11-01 "로그아웃하는 기능은 없는 거 같네" — 훈련 유형 선택 화면 하단 로그아웃(익명 제외).
test("로그아웃 — /scenarios 하단에 있고, 익명에게는 숨기며, 무효화 배너 대상 경로가 아니다", () => {
  const button = codeOnly("src/components/LogoutButton.tsx");
  assert.match(button, /if \(!user \|\| user\.isAnonymous\) return null;/);
  assert.match(button, /await signOut\(auth\);\s*router\.replace\("\/"\);/);
  assert.match(codeOnly("src/app/scenarios/page.tsx"), /<LogoutButton\b/);
  assert.equal(resolveAuthInvalidationMode({ pathname: "/scenarios", signedOut: true, hadUser: true, unauthenticatedCallable: false, wasAnonymous: false }), "none");
});
