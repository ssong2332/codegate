// 법적 고지 초안 가드 — 외부 점검 2026-10-21. 지키는 것: ① 초안 표식 · 운영자 정보는 사용자 제공 값만(지어내기 금지)
// ② 보존 기간이 서버 상수와 같다 ③ 고지 화면이 공개 경로이고 익명도 열 수 있다 ④ 첫 화면 · 로그인 화면에 링크가 있다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHALLENGE_LINK_EXPIRY_DAYS,
  CHALLENGE_RETENTION_DAYS,
  CONTACT_INFO,
  DRAFT_NOTICE,
  LEGAL_ROBOTS,
  OPERATOR_INFO,
  SHOW_LEGAL_LINKS,
  PRIVACY_POLICY,
  splitOperatorEmail,
  TERMS_OF_SERVICE,
} from "./legalContent.ts";
import { isAnonymousOutsideRecipientFlow, LEGAL_PATHS } from "../auth/anonymousScope.ts";

const allText = (doc: typeof PRIVACY_POLICY) =>
  [doc.intro, ...doc.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.items ?? [])])].join("\n");

// 2026-11-01 사용자 제공 값(운영자명 · 문의 이메일 · 보호책임자 · 시행일). 값이 바뀌면 사용자에게 받은 값으로만 고친다.
test("초안 표식이 있고 운영자 정보는 사용자가 준 값 그대로다(자리표시 0)", () => {
  assert.match(DRAFT_NOTICE, /초안/);
  assert.match(DRAFT_NOTICE, /법률 검토 전/);
  assert.deepEqual(
    { ...OPERATOR_INFO },
    { operator: "박수홍", email: "asg21274@gmail.com", officer: "박수홍(운영자)", effectiveDate: "2026년 11월 1일" },
  );
  assert.ok(allText(PRIVACY_POLICY).includes(OPERATOR_INFO.officer));
  assert.ok(allText(PRIVACY_POLICY).includes(OPERATOR_INFO.effectiveDate));
  assert.ok(allText(TERMS_OF_SERVICE).includes(OPERATOR_INFO.email));
  assert.ok(allText(CONTACT_INFO).includes(OPERATOR_INFO.operator));
  for (const doc of [PRIVACY_POLICY, TERMS_OF_SERVICE, CONTACT_INFO]) {
    // 대괄호 자리표시가 남지 않았다.
    assert.doesNotMatch(allText(doc), /\[[^\]]+\]/);
    // 지어낸 연락처가 끼어들지 않았다(이메일은 운영자 이메일 하나뿐 · 일반 전화번호 형태 0건 — 112 · 1332만 허용).
    const emails = new Set(allText(doc).match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []);
    for (const e of emails) assert.equal(e, OPERATOR_INFO.email);
    assert.doesNotMatch(allText(doc), /\d{2,4}-\d{3,4}-\d{4}/);
  }
});

test("챌린지 링크 만료 · 보존 기간이 서버 상수와 같다", () => {
  const src = readFileSync("functions/src/shared/constants.ts", "utf8");
  const days = (name: string) => {
    const m = src.match(new RegExp(`${name} = (\\d+) \\* 24 \\* 60 \\* 60 \\* 1000`));
    assert.ok(m, `${name}을(를) 찾지 못했다`);
    return Number(m[1]);
  };
  assert.equal(days("CHALLENGE_FREE_LINK_EXPIRY_MS"), CHALLENGE_LINK_EXPIRY_DAYS);
  assert.equal(days("CHALLENGE_DEFAULT_RETENTION_MS"), CHALLENGE_RETENTION_DAYS);
});

test("검토가 필요한 절(보유 기간 · 국외 이전)에 표식이 붙어 있다", () => {
  const flagged = PRIVACY_POLICY.sections.filter((s) => s.reviewNeeded).map((s) => s.heading);
  assert.ok(flagged.some((h) => h.includes("보유 기간")));
  assert.ok(flagged.some((h) => h.includes("국외 이전")));
});

test("고지 화면은 공개 경로이고 익명 사용자도 /login으로 튕기지 않는다", () => {
  assert.deepEqual([...LEGAL_PATHS], ["/privacy", "/terms", "/contact"]);
  for (const p of LEGAL_PATHS) {
    assert.equal(isAnonymousOutsideRecipientFlow(true, p), false, p);
    assert.ok(readFileSync(`src/app${p}/page.tsx`, "utf8").includes("LegalDocumentView"), `${p} 화면이 없다`);
  }
  assert.equal(isAnonymousOutsideRecipientFlow(true, "/scenarios"), true, "익명 범위 밖 판정이 느슨해졌다");
});

// 사용자 결정 2026-10-21(DECISIONS #205)로 숨겼다가 2026-11-01 운영자 정보를 받아 다시 켰다 — 링크 노출 · 검색 허용.
test("링크 노출 중 — 스위치 한 곳으로 켜지고, 고지 화면 3개는 noindex가 풀렸다", () => {
  assert.equal(SHOW_LEGAL_LINKS, true);
  assert.equal(LEGAL_ROBOTS, undefined);
  const links = readFileSync("src/components/LegalLinks.tsx", "utf8");
  assert.match(links, /if \(!SHOW_LEGAL_LINKS\) return null;/, "숨김 스위치가 LegalLinks에 없다");
  for (const p of LEGAL_PATHS) {
    assert.match(readFileSync(`src/app${p}/page.tsx`, "utf8"), /robots: LEGAL_ROBOTS/, `${p}에 noindex 스위치 배선이 없다`);
  }
});

test("첫 화면 · 로그인 화면 하단에 고지 링크 자리가 있다(스위치로 켜진다)", () => {
  for (const f of ["src/app/page.tsx", "src/app/(auth)/login/page.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /<LegalLinks\b/, `${f}에 LegalLinks가 없다`);
  }
  const links = readFileSync("src/components/LegalLinks.tsx", "utf8");
  for (const p of LEGAL_PATHS) assert.ok(links.includes(`href: "${p}"`), `${p} 링크가 없다`);
});

// UX-03(외부 보안 점검 2026-11-01) — /contact 이메일이 mailto: 링크다.
test("UX-03 — 문의 화면의 운영자 이메일 줄은 mailto: 링크로 나뉘고 LegalDocumentView가 그 href를 그린다", () => {
  const line = CONTACT_INFO.sections.flatMap((s) => [...(s.paragraphs ?? []), ...(s.items ?? [])]).find((t) => t.includes(OPERATOR_INFO.email));
  assert.ok(line, "문의 화면에 운영자 이메일 줄이 없다");
  const parts = splitOperatorEmail(line);
  assert.ok(parts);
  assert.equal(parts.href, `mailto:${OPERATOR_INFO.email}`);
  assert.equal(parts.before + parts.email + parts.after, line, "나눈 뒤 이어 붙이면 원문과 같아야 한다");
  assert.equal(splitOperatorEmail("이메일이 없는 줄"), null);
  const view = readFileSync("src/components/LegalDocumentView.tsx", "utf8");
  assert.match(view, /<a href=\{parts\.href\}/);
  assert.match(view, /<li key=\{item\}>\{withMailtoLink\(item\)\}<\/li>/);
});
