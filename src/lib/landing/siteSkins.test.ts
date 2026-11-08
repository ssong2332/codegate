// ⭐ 2026-11-08 웹 안의 웹 PR-2 — 사이트 계열 데이터(`siteSkins.ts`) 단언 · 역검증.
// 사용자 승인 계획(시안 8절 PR-2): 35종 전부 매핑(빠짐 0 · 서버 카탈로그 landingId 목록과 대조) · 모든 (글자, 바탕) 쌍 4.5:1 ·
// 꼬리말 규칙(사업자번호 앞 3자리 < 101 · 가운데 00 · 검증식 불일치 / 전화 국번 첫 자리 0 · 저장소 번호와 중복 0 / '누리달' / .invalid /
// \d{8,} 0 / G437 낱말 0) · 각 규칙 역검증(실재 형식 값을 넣으면 실패).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { SITE_FAMILY_BY_LANDING, SITE_SKINS, footerLines, siteSkinFor, type SiteFooter, type SiteSkin } from "./siteSkins.ts";
import { pairContrast, type ContrastPair } from "../phone/skinTokens.ts";

const ROOT = new URL("../../../", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, ROOT), "utf8");

// ── ① 매핑 — 서버 카탈로그 landingId 전수와 양방향 대조 · 계열 10개 모두 쓰임 ─────────────────────────────────

function catalogLandingIds(catalog: string): string[] {
  return [...new Set([...catalog.matchAll(/landingId: "([a-z0-9-]+)"/g)].map((m) => m[1]))].sort();
}

function mappingViolations(catalogIds: string[], mapping: Readonly<Record<string, string>>): string[] {
  const keys = Object.keys(mapping).sort();
  return [
    ...catalogIds.filter((id) => !keys.includes(id)).map((id) => `매핑 빠짐: ${id}`),
    ...keys.filter((id) => !catalogIds.includes(id)).map((id) => `카탈로그에 없는 키: ${id}`),
    ...Object.entries(mapping).filter(([, family]) => !(family in SITE_SKINS)).map(([id, family]) => `없는 계열: ${id} → ${family}`),
  ];
}

test("[PR-2 매핑] 서버 카탈로그 landingId 35종 = 매핑표 키(양방향) · 계열 10개가 모두 쓰인다", (t) => {
  const ids = catalogLandingIds(read("functions/src/scenarios/mockScreens.ts"));
  assert.equal(ids.length, 35, "카탈로그 landingId 수가 바뀌었다 — 새 랜딩이면 계열을 정해 매핑표에 넣을 것");
  assert.deepEqual(mappingViolations(ids, SITE_FAMILY_BY_LANDING), []);
  const used = new Set(Object.values(SITE_FAMILY_BY_LANDING));
  assert.deepEqual([...used].sort(), Object.keys(SITE_SKINS).sort());
  const counts = Object.keys(SITE_SKINS).map((f) => `${f} ${Object.values(SITE_FAMILY_BY_LANDING).filter((v) => v === f).length}`);
  t.diagnostic(`[PR-2 매핑] ${counts.join(" · ")}`);
});

test("[PR-2 매핑 역검증] 키를 하나 빼거나 없는 id를 넣은 사본은 실패한다 · 매핑 밖 id는 스킨 없음(기본 화면)", () => {
  const ids = catalogLandingIds(read("functions/src/scenarios/mockScreens.ts"));
  const { ["gold-buy"]: _gone, ...missing } = SITE_FAMILY_BY_LANDING;
  assert.deepEqual(mappingViolations(ids, missing), ["매핑 빠짐: gold-buy"]);
  assert.deepEqual(mappingViolations(ids, { ...SITE_FAMILY_BY_LANDING, "zz-unknown": "gold" }), ["카탈로그에 없는 키: zz-unknown"]);
  assert.equal(siteSkinFor("zz-unknown"), undefined);
  assert.equal(siteSkinFor(undefined), undefined);
  assert.equal(siteSkinFor("toString"), undefined, "프로토타입 이름이 계열로 새면 안 된다");
  assert.equal(siteSkinFor("gold-buy")?.id, "gold");
});

// ── ② 대비 — 모든 (글자, 바탕) 쌍 4.5:1 · 큰 글씨 로고만 3:1(시안 "주황은 큰 글씨 로고에만") ────────────────────

function skinPairs(skin: SiteSkin): Array<ContrastPair & { min: number }> {
  const pairs: Array<ContrastPair & { min: number }> = [
    { name: `${skin.id}.text`, fg: skin.text, bg: skin.pageBg, kind: "text", min: 4.5 },
    { name: `${skin.id}.logo`, fg: skin.headerText, bg: skin.headerBg, kind: "text", min: skin.headerLargeTextOnly ? 3 : 4.5 },
    { name: `${skin.id}.button`, fg: skin.buttonText, bg: skin.buttonBg, kind: "text", min: 4.5 },
    { name: `${skin.id}.footer`, fg: skin.footerText, bg: skin.footerBg, kind: "text", min: 4.5 },
  ];
  if (skin.band) pairs.push({ name: `${skin.id}.band`, fg: skin.band.text, bg: skin.band.bg, kind: "text", min: 4.5 });
  if (skin.highlight) pairs.push({ name: `${skin.id}.highlight`, fg: skin.highlight, bg: skin.headerBg, kind: "text", min: 4.5 });
  return pairs;
}

function contrastFailures(skins: readonly SiteSkin[]): string[] {
  return skins.flatMap(skinPairs).flatMap((p) => {
    const ratio = pairContrast(p);
    return ratio >= p.min ? [] : [`${p.name} ${ratio.toFixed(2)} < ${p.min}`];
  });
}

test("[PR-2 대비] 계열 10개의 글자 · 로고 · 버튼 · 꼬리말 · 띠 쌍이 기준 이상(G456과 같은 계산)", (t) => {
  const skins = Object.values(SITE_SKINS);
  assert.deepEqual(contrastFailures(skins), []);
  const large = skins.filter((s) => s.headerLargeTextOnly).map((s) => s.id);
  assert.deepEqual(large, ["parcel"], "큰 글씨 3:1 예외는 택배 로고 하나뿐이어야 한다(시안 결정)");
  t.diagnostic(`[PR-2 대비] ${skins.flatMap(skinPairs).length}쌍 · 큰 글씨 예외 ${large.join(",")}`);
});

test("[PR-2 대비 역검증] 버튼 글자를 바탕과 비슷하게 · 큰 글씨 예외를 지운 사본은 실패한다", () => {
  const dim = { ...SITE_SKINS.gift, buttonText: "#E07A9C" };
  assert.ok(contrastFailures([dim]).some((f) => f.startsWith("gift.button")));
  const { headerLargeTextOnly: _x, ...strict } = SITE_SKINS.parcel;
  assert.ok(contrastFailures([strict as SiteSkin]).some((f) => f.startsWith("parcel.logo")));
});

// ── ③ 꼬리말 — 실재 사업자와 겹칠 수 없는 임의 값(사용자 결정 O5 · 시안 4절) ─────────────────────────────────

/** 국세청 사업자등록번호 검증식(가중치 1,3,7,1,3,7,1,3,5 + 9번째 × 5 ÷ 10의 몫). true = 형식상 유효한 번호. */
function businessNumberChecksumValid(number: string): boolean {
  const d = number.replace(/-/g, "").split("").map(Number);
  if (d.length !== 10 || d.some(Number.isNaN)) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = w.reduce((acc, wi, i) => acc + d[i] * wi, 0) + Math.floor((d[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === d[9];
}

function businessNumberViolations(number: string): string[] {
  const out: string[] = [];
  const m = /^(\d{3})-(\d{2})-(\d{5})$/.exec(number);
  if (!m) return [`형식(3-2-5) 아님: ${number}`];
  if (Number(m[1]) >= 101) out.push(`앞 3자리가 101 이상(세무서 코드 범위): ${number}`);
  if (m[2] !== "00") out.push(`가운데가 00이 아님(개인 · 법인 구분 범위): ${number}`);
  if (businessNumberChecksumValid(number)) out.push(`검증식을 통과한다(실재 형식): ${number}`);
  return out;
}

function phoneViolations(phone: string, elsewhere: ReadonlySet<string>): string[] {
  const out: string[] = [];
  if (!/^0\d{1,2}-\d{4}-\d{4}$/.test(phone)) return [`형식(지역-국번-번호) 아님: ${phone}`];
  if (/^1[5-8]/.test(phone)) out.push(`대표번호: ${phone}`);
  if (phone.split("-")[1][0] !== "0") out.push(`국번 첫 자리가 0이 아님(실재 국번 범위): ${phone}`);
  if (elsewhere.has(phone)) out.push(`저장소의 다른 번호와 겹침: ${phone}`);
  return out;
}

const G437_WORDS = ["모의", "훈련용", "AI 훈련용", "가상", "재현"];

function footerViolations(footer: SiteFooter, elsewhere: ReadonlySet<string>): string[] {
  const out: string[] = [];
  if (footer.businessNumber) out.push(...businessNumberViolations(footer.businessNumber));
  out.push(...phoneViolations(footer.phone, elsewhere));
  for (const reg of [footer.mailOrderNumber, footer.lenderNumber]) if (reg && !reg.includes("누리달")) out.push(`신고번호 지명이 '누리달'이 아님: ${reg}`);
  if (footer.address && !footer.address.startsWith("누리달시 ")) out.push(`주소가 '누리달시'로 시작하지 않음: ${footer.address}`);
  if (footer.email && !/@[a-z0-9-]+(\.[a-z0-9-]+)*\.invalid$/.test(footer.email)) out.push(`이메일 도메인이 .invalid가 아님: ${footer.email}`);
  const text = footerLines(footer).join("\n");
  if (/\d{8,}/.test(text)) out.push(`8자리 이상 숫자열: ${text}`);
  for (const word of G437_WORDS) if (text.includes(word)) out.push(`G437 낱말: ${word}`);
  return out;
}

/** 저장소(src · functions/src)의 다른 전화번호 꼴 — 이 모듈 · 이 시험 파일은 뺀다. */
function phonesElsewhere(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: URL) => {
    for (const name of readdirSync(dir)) {
      const url = new URL(name, dir);
      if (statSync(url).isDirectory()) {
        if (name !== "node_modules" && name !== "lib") walk(new URL(`${name}/`, dir));
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name) || /^siteSkins(\.test)?\.ts$/.test(name)) continue;
      for (const m of readFileSync(url, "utf8").matchAll(/\b0\d{1,2}-\d{4}-\d{4}\b/g)) found.add(m[0]);
    }
  };
  walk(new URL("src/", ROOT));
  walk(new URL("functions/src/", ROOT));
  return found;
}

test("[PR-2 꼬리말] 사업자번호 · 전화 · 신고번호 · 주소 · 이메일이 실재 불가 규칙을 지키고 숫자열 · G437 낱말 0", (t) => {
  const elsewhere = phonesElsewhere();
  assert.ok(elsewhere.has("02-0785-6043"), "저장소 번호 수집이 죽었다 — 문자 발신번호를 못 찾았다");
  const footers = Object.values(SITE_SKINS).flatMap((s) => (s.footer ? [s.footer] : []));
  assert.equal(footers.length, 9, "꼬리말 9벌(송금 요청 계열만 없음 — 시안)");
  assert.deepEqual(footers.flatMap((f) => footerViolations(f, elsewhere)), []);
  const phones = footers.map((f) => f.phone);
  assert.equal(new Set(phones).size, phones.length, "계열끼리 전화번호가 겹친다");
  const numbers = footers.flatMap((f) => (f.businessNumber ? [f.businessNumber] : []));
  assert.equal(new Set(numbers).size, numbers.length, "계열끼리 사업자번호가 겹친다");
  t.diagnostic(`[PR-2 꼬리말] 9벌 · 사업자번호 ${numbers.length} · 전화 ${phones.length} · 저장소 다른 번호 ${elsewhere.size}개와 겹침 0`);
});

test("[PR-2 꼬리말 역검증] 실재 형식 값을 넣은 사본은 규칙마다 실패한다", () => {
  const elsewhere = phonesElsewhere();
  const base = SITE_SKINS.gold.footer!;
  // 검증식을 통과하게 끝자리만 고친 번호(앞 3자리 · 가운데 00은 그대로) → 검증식 규칙 하나만 걸린다.
  const fixed = Array.from({ length: 10 }, (_, d) => `072-00-3841${d}`).find(businessNumberChecksumValid)!;
  assert.deepEqual(footerViolations({ ...base, businessNumber: fixed }, elsewhere), [`검증식을 통과한다(실재 형식): ${fixed}`]);
  assert.ok(businessNumberViolations("572-00-38415").includes("앞 3자리가 101 이상(세무서 코드 범위): 572-00-38415"));
  assert.ok(businessNumberViolations("072-81-38415").includes("가운데가 00이 아님(개인 · 법인 구분 범위): 072-81-38415"));
  assert.deepEqual(phoneViolations("02-2345-6789", elsewhere), ["국번 첫 자리가 0이 아님(실재 국번 범위): 02-2345-6789"]);
  assert.deepEqual(phoneViolations("02-0785-6043", elsewhere), ["저장소의 다른 번호와 겹침: 02-0785-6043"]);
  assert.ok(footerViolations({ ...base, mailOrderNumber: "제2026-서울강남-0371호" }, elsewhere).some((v) => v.startsWith("신고번호 지명")));
  assert.ok(footerViolations({ ...base, address: "서울특별시 중구 세종대로 110" }, elsewhere).some((v) => v.startsWith("주소가")));
  assert.ok(footerViolations({ ...base, email: "help@haedam-gold.com" }, elsewhere).some((v) => v.startsWith("이메일")));
  assert.ok(footerViolations({ ...base, representative: "가상 대표" }, elsewhere).includes("G437 낱말: 가상"));
  assert.ok(footerViolations({ ...base, mailOrderNumber: "제2026-누리달-03710000호" }, elsewhere).some((v) => v.startsWith("8자리 이상")));
});

test("[PR-2 검증식] 시안이 걸러 낸 번호 046-00-72591은 검증식을 통과하고(그래서 뺐다) 쓰는 6개는 모두 불일치", () => {
  assert.equal(businessNumberChecksumValid("046-00-72591"), true);
  const used = Object.values(SITE_SKINS).flatMap((s) => (s.footer?.businessNumber ? [s.footer.businessNumber] : []));
  assert.deepEqual(used.filter(businessNumberChecksumValid), []);
  assert.equal(used.length, 6);
});

// ── ④ 낱말 · 숫자 — 모듈 소스 전체(문자열 리터럴)에 G437 낱말 · 8자리 숫자열 0 ────────────────────────────────

test("[PR-2 문자열] 모듈의 문자열 리터럴에 G437 낱말 · 8자리 이상 숫자열 · 실제 도메인이 없다", () => {
  const source = read("src/lib/landing/siteSkins.ts");
  const literals = [...source.matchAll(/"([^"\n]*)"/g)].map((m) => m[1]);
  const hits = literals.flatMap((s) => [
    ...G437_WORDS.filter((w) => s.includes(w)).map((w) => `G437 ${w}: ${s}`),
    ...(/\d{8,}/.test(s) ? [`숫자열: ${s}`] : []),
    ...(/\.(com|net|kr|co\.kr|org)\b/.test(s) ? [`실제 도메인: ${s}`] : []),
  ]);
  assert.deepEqual(hits, []);
  assert.ok(!/^import\s+(?!type\b)/m.test(source), "잎 모듈이어야 한다(값 import 0 — 렌더 하네스 관례)");
  assert.equal(/^import\s+(?!type\b)/m.test(`${source}\nimport { x } from "./y";`), true, "역검증: 값 import를 넣은 사본은 잡혀야 한다");
});
