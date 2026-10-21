// 법적 고지 초안 가드 — 외부 점검 2026-10-21. 지키는 것: ① 초안 표식 · 자리표시 유지(운영자 정보 지어내기 금지)
// ② 보존 기간이 서버 상수와 같다 ③ 고지 화면이 공개 경로이고 익명도 열 수 있다 ④ 첫 화면 · 로그인 화면에 링크가 있다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHALLENGE_LINK_EXPIRY_DAYS,
  CHALLENGE_RETENTION_DAYS,
  CONTACT_INFO,
  DRAFT_NOTICE,
  PLACEHOLDER,
  PRIVACY_POLICY,
  TERMS_OF_SERVICE,
} from "./legalContent.ts";
import { isAnonymousOutsideRecipientFlow, LEGAL_PATHS } from "../auth/anonymousScope.ts";

const allText = (doc: typeof PRIVACY_POLICY) =>
  [doc.intro, ...doc.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.items ?? [])])].join("\n");

test("초안 표식이 있고 운영자 정보는 자리표시 그대로다", () => {
  assert.match(DRAFT_NOTICE, /초안/);
  assert.match(DRAFT_NOTICE, /법률 검토 전/);
  for (const value of Object.values(PLACEHOLDER)) assert.match(value, /^\[.+\]$/, `자리표시가 아니다: ${value}`);
  assert.ok(allText(PRIVACY_POLICY).includes(PLACEHOLDER.officer));
  assert.ok(allText(PRIVACY_POLICY).includes(PLACEHOLDER.effectiveDate));
  assert.ok(allText(TERMS_OF_SERVICE).includes(PLACEHOLDER.email));
  assert.ok(allText(CONTACT_INFO).includes(PLACEHOLDER.operator));
  // 지어낸 연락처가 끼어들지 않았다(이메일 · 일반 전화번호 형태 0건 — 112 · 1332만 허용).
  for (const doc of [PRIVACY_POLICY, TERMS_OF_SERVICE, CONTACT_INFO]) {
    assert.doesNotMatch(allText(doc), /[\w.+-]+@[\w-]+\.[\w.]+/);
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

test("첫 화면 · 로그인 화면 하단에 고지 링크가 있다", () => {
  for (const f of ["src/app/page.tsx", "src/app/(auth)/login/page.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /<LegalLinks\b/, `${f}에 LegalLinks가 없다`);
  }
  const links = readFileSync("src/components/LegalLinks.tsx", "utf8");
  for (const p of LEGAL_PATHS) assert.ok(links.includes(`href: "${p}"`), `${p} 링크가 없다`);
});
