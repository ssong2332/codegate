// ⭐ 2026-11-08 웹 안의 웹 PR-3(사용자 승인 계획 · 시안 E 금 · F 상품권 · I 내 은행 출금 · G 대출) — 구매 화면 4종 사이트 계열 입히기.
//
// | # | 고정하는 것 |
// |---|---|
// | PS1 | 구매 화면 색 쌍(글자 4.5:1 · 비텍스트 3:1)이 전부 기준 이상 — 시안에서 3:1 미만이던 테두리 3개는 바꾼 값(판정표 P C1) · 역검증 |
// | PS2 | 판정표 P1 ~ P6 — 6화면(금 2 · 출금 2 · 상품권 · 맥락 있는 대출)만 계열 바탕 · 머리 · 꼬리말, P5(맥락 없는 대출 · 대환 · 그 밖)는 무변경 · 역검증 |
// | PS3 | 판정표 B1 · B2 — 금 · 상품권 첫 화면의 아래 고정 결제 막대(제출 버튼 1개 · 꼬리말 뒤) · iOS형 틀이면 주소 막대 위로 · 출금 · 대출은 막대 없음 · 역검증 |
// | PS4 | 재현 — 금 시세 띠(1g · 1돈 같은 단가 계산) · 금괴 카드 4개 · 상품권 카드 · 즉시 발송 배지 · 대출 진행 칩(흐름 단계마다 켜지는 칩) |
// | PS5 | 금지 — 6화면 첫 렌더에 세션 금지 낱말(G437) · 8자리 이상 숫자열 · 서비스 밖 안내(매장 · 수령 · 방문 · 영업점 · 금 보관 · 현금인출기) 0 |
// | PS6 | 새 조각(머리 · 꼬리말 · 결제 막대) — 네트워크 · 저장소 0 · 결제 막대 버튼 = 종전 "다음" 동작 그대로(무인자) |
// | PS7 | 오염 치환 헬퍼 = 줄 끝 무관(LF · CRLF 체크아웃 둘 다 — `core.autocrlf=true` 새 체크아웃 통합 검증 실패 재현) · 역검증 |
//
// ⚠️ 한계(정직 고지): 렌더 하네스는 `renderToStaticMarkup` — 누름 · sticky 실제 위치 · 그라데이션 모양은 보지 않는다(실기기 · 브라우저 확인 몫).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { COMPONENT_PATH, poisonedComponentSource, renderLandingScreen, replaceOnceAnyLineEnding } from "../mockscreenrender/renderHarness.ts";
import { PURCHASE_ERROR_TEXT, PURCHASE_SITE_TOKENS, SITE_SKINS, footerLines, purchaseFamilyOf, purchasePalette, type PurchaseFamilyId } from "./siteSkins.ts";
import { pairContrast, type ContrastPair } from "../phone/skinTokens.ts";
import { GOLD_PRICE_PER_GRAM, GOLD_PRODUCTS, GOLD_SITE_COPY } from "../bankapp/goldBuy.ts";
import { VOUCHER_SITE_COPY } from "../bankapp/voucher.ts";
import { LOAN_SITE_STEPS } from "../bankapp/loanFlow.ts";

const FAMILIES: readonly PurchaseFamilyId[] = ["gold", "bank", "gift", "loan"];
const won = (value: number) => `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;

type Pair = ContrastPair & { min: number };

function purchasePairs(family: PurchaseFamilyId): Pair[] {
  const skin = SITE_SKINS[family];
  const t = PURCHASE_SITE_TOKENS[family];
  const p = purchasePalette(family);
  const text = (name: string, fg: string, bg: string): Pair => ({ name: `${family}.${name}`, fg, bg, kind: "text", min: 4.5 });
  const non = (name: string, fg: string, bg: string): Pair => ({ name: `${family}.${name}`, fg, bg, kind: "nonText", min: 3 });
  const pairs: Pair[] = [
    text("headline/page", p.headline, skin.pageBg),
    text("headline/surface", p.headline, t.surface),
    text("body/page", p.body, skin.pageBg),
    text("body/surface", p.body, t.surface),
    text("body/note", p.body, t.noteBg),
    text("headline/note", p.headline, t.noteBg),
    text("error/page", p.errorText, skin.pageBg),
    text("error/surface", p.errorText, t.surface),
    text("hint/page", p.hintText, skin.pageBg),
    text("hint/surface", p.hintText, t.surface),
    text("selected", t.selectedText, t.selectedBg),
    text("button", skin.buttonText, skin.buttonBg),
    text("logo", skin.headerText, skin.headerBg),
    text("footer", skin.footerText, skin.footerBg),
    non("border/surface", t.border, t.surface),
    non("border/page", t.border, skin.pageBg),
    non("selectedBorder/surface", t.selectedBorder, t.surface),
  ];
  if (t.badge) pairs.push(text("badge", t.badge.text, t.badge.bg));
  if (t.payBar) {
    pairs.push(text("payBar.text", t.payBar.text, t.payBar.bg), text("payBar.amount", t.payBar.amount, t.payBar.bg), text("payBar.error", t.payBar.error, t.payBar.bg));
  }
  if (t.headerSub) pairs.push(text("headerSub", t.headerSub, skin.headerBg));
  if (skin.band) pairs.push(text("band.amount", t.payBar?.amount ?? skin.band.text, skin.band.bg));
  if (family === "gold") pairs.push(text("kicker/page", t.heroMuted!, skin.pageBg), text("footerName", skin.headerText, skin.footerBg));
  if (family === "loan") {
    pairs.push(
      text("heroMuted", t.heroMuted!, skin.headerBg),
      text("heroChipOff", t.heroChipOff!.text, t.heroChipOff!.bg),
      text("heroChipOn", t.heroChipOnText!, skin.highlight!),
      text("heroTitle", skin.headerText, skin.headerBg),
    );
  }
  return pairs;
}

const failures = (pairs: Pair[]) =>
  pairs.flatMap((p) => {
    const ratio = pairContrast(p);
    return ratio >= p.min ? [] : [`${p.name} ${ratio.toFixed(2)} < ${p.min}`];
  });

test("[PS1] 구매 화면 색 쌍이 전부 기준 이상(글자 4.5:1 · 비텍스트 3:1) · 시안 3:1 미만 테두리는 바꾼 값", (t) => {
  const all = FAMILIES.flatMap(purchasePairs);
  assert.deepEqual(failures(all), []);
  assert.equal(PURCHASE_ERROR_TEXT, "#C0262D", "오류 글자 = 기본 토큰과 같은 빨강");
  // 판정표 P C1 — 시안 원래 값(#E7DEC8 · #9CA3AF · #D9A9BB)은 쓰지 않는다.
  assert.deepEqual(
    FAMILIES.map((f) => PURCHASE_SITE_TOKENS[f].border).filter((c) => ["#E7DEC8", "#9CA3AF", "#D9A9BB"].includes(c)),
    [],
  );
  t.diagnostic(`[PS1] ${all.length}쌍 — ${all.map((p) => `${p.name}=${pairContrast(p).toFixed(2)}`).join(" · ")}`);
});

test("[PS1 역검증] 시안 원래 테두리 · 흐린 결제 막대 글자를 넣은 사본은 실패한다", () => {
  const dimGold = failures([{ name: "gold.border", fg: "#E7DEC8", bg: "#FFFFFF", kind: "nonText", min: 3 }]);
  const dimBank = failures([{ name: "bank.border", fg: "#9CA3AF", bg: "#FFFFFF", kind: "nonText", min: 3 }]);
  const dimGift = failures([{ name: "gift.border", fg: "#D9A9BB", bg: "#FFFFFF", kind: "nonText", min: 3 }]);
  const dimBar = failures([{ name: "gold.payBar.error", fg: "#C0262D", bg: "#15120D", kind: "text", min: 4.5 }]);
  assert.equal(dimGold.length + dimBank.length + dimGift.length + dimBar.length, 4, "네 사본 모두 잡혀야 한다");
});

// ── PS2 판정표 P ──────────────────────────────────────────────────────────────────────────────────────────

const LEDGER = "purchase-screen-session-01";
const base = (landingId: string, extra: Record<string, unknown> = {}) => ({
  title: "링크",
  landingKind: "credential-form",
  landingId,
  entrySurface: "in-call-sms",
  onHide: () => {},
  onClose: () => {},
  onCredentialSubmit: () => {},
  ...extra,
});
const loanContext = { ledgerKey: LEDGER, lenderName: "가온캐피탈" };

/** 판정표 P1 ~ P4 행 → 기대 계열 · 꼬리말 ⓒ 줄. */
const PURCHASE_ROWS: readonly { row: string; props: Record<string, unknown>; family: PurchaseFamilyId; copyright: string }[] = [
  { row: "P1", props: base("gold-buy"), family: "gold", copyright: "ⓒ 해담골드" },
  { row: "P1", props: base("asset-gold-buy"), family: "gold", copyright: "ⓒ 해담골드 주문센터" },
  { row: "P2", props: base("cash-withdraw"), family: "bank", copyright: "ⓒ 모바일뱅킹 출금 예약 · 예탁" },
  { row: "P2", props: base("asset-cash-withdraw"), family: "bank", copyright: "ⓒ 모바일뱅킹 출금 예약 · 보관" },
  { row: "P3", props: base("voucher-purchase"), family: "gift", copyright: "ⓒ 한올기프트" },
  { row: "P4", props: base("loan-apply", { loanContext }), family: "loan", copyright: "ⓒ 가온캐피탈" },
];
/** 판정표 P5 · 그 밖 — 계열을 입히지 않는다(지금 모양). */
const UNCHANGED: readonly { row: string; props: Record<string, unknown> }[] = [
  // PR-4(2026-11-08) — P5 맥락 없는 대출 · 대환 · 택배는 PR-4 안내형 판정표 G(G4 · G3)가 계열을 입힌다(`guideScreens.test.ts` GS2가 고정).
  // 이체 화면(G5 — 머리 결정 대기)만 여기서 "구매 계열이 새지 않는다"를 계속 본다.
  { row: "그 밖 이체", props: base("safe-account-transfer") },
];

const bgOf = (color: string) => `background-color:${color}`;

test("[PS2] 판정표 P1 ~ P6 — 구매 6화면만 계열 바탕 · 머리 · 꼬리말 · 진행 막대 색 / P5 · 그 밖은 무변경", (t) => {
  const lines: string[] = [];
  for (const item of PURCHASE_ROWS) {
    const skin = SITE_SKINS[item.family];
    const { markup, text } = renderLandingScreen(item.props);
    const id = String(item.props.landingId);
    assert.ok(markup.includes(bgOf(skin.pageBg)), `${item.row} ${id}: 페이지 바탕 ${skin.pageBg}`);
    assert.ok(markup.includes(bgOf(skin.accent)), `${item.row} ${id}: 진행 막대 = 사이트 색 ${skin.accent}`);
    assert.ok(markup.includes(bgOf(skin.headerBg)), `${item.row} ${id}: 머리 바탕 ${skin.headerBg}`);
    assert.ok(markup.includes(bgOf(skin.footerBg)) && markup.includes("<footer"), `${item.row} ${id}: 꼬리말`);
    for (const line of footerLines(skin.footer!)) assert.ok(text.includes(line), `${item.row} ${id}: 꼬리말 줄 "${line}"`);
    assert.ok(text.split("\n").includes(item.copyright), `${item.row} ${id}: ⓒ 줄 "${item.copyright}"`);
    assert.equal(markup.includes(bgOf("#1F3A5F")), false, `${item.row} ${id}: 종전 남색 머리띠 · 진행 막대가 남았다`);
    if (item.family !== "loan") assert.equal(purchaseFamilyOf(id), item.family, `${id} 매핑`);
    lines.push(`${item.row} ${id}=${item.family}`);
  }
  for (const item of UNCHANGED) {
    const { markup } = renderLandingScreen(item.props);
    const id = String(item.props.landingId);
    assert.ok(markup.includes(bgOf("#1F3A5F")), `${item.row} ${id}: 종전 남색 머리띠 · 진행 막대 그대로`);
    assert.equal(markup.includes("<footer"), false, `${item.row} ${id}: 사이트 꼬리말이 붙으면 안 된다(PR-4 범위)`);
    for (const family of FAMILIES) {
      const skin = SITE_SKINS[family];
      assert.equal(markup.includes(bgOf(skin.pageBg)) && skin.pageBg !== "#FFFFFF", false, `${item.row} ${id}: ${family} 바탕이 새면 안 된다`);
    }
    lines.push(`${item.row} ${id}=무변경`);
  }
  t.diagnostic(lines.join(" | "));
});

test("[PS2 역검증] 계열 판정을 끊은 사본은 바탕 · 진행 막대가 종전 값으로 돌아가 검사에 걸린다", () => {
  const { poisoned, original, overrides } = poisonedComponentSource("      ? purchaseFamilyOf(landingId)\n", "      ? undefined\n");
  assert.notEqual(poisoned, original, "오염 지점(계열 판정)을 찾지 못했다");
  const { markup } = renderLandingScreen(base("gold-buy"), overrides);
  assert.equal(markup.includes(bgOf(SITE_SKINS.gold.pageBg)), false, "오염 사본에서는 금 바탕이 빠진다");
  assert.ok(markup.includes(bgOf("#1F3A5F")), "오염 사본 = 종전 진행 막대 색");
});

// ── PS3 결제 막대 ────────────────────────────────────────────────────────────────────────────────────

const LIFT = "bottom:calc(66px + env(safe-area-inset-bottom))";
const stickyBar = (markup: string) => /class="sticky z-\[5\][^"]*"[^>]*style="bottom:([^;"]*)/.exec(markup)?.[1];

test("[PS3] 판정표 B1 · B2 — 금 · 상품권 첫 화면 = 아래 고정 결제 막대(꼬리말 뒤 · 제출 1개) · iOS형이면 주소 막대 위 · 출금 · 대출 = 막대 없음", (t) => {
  const lines: string[] = [];
  for (const [id, submit] of [
    ["gold-buy", "골드바 구매하기"],
    ["asset-gold-buy", "금 실물 주문하기"],
    ["voucher-purchase", "상품권 구매하기"],
  ] as const) {
    const android = renderLandingScreen(base(id, { skin: "samsung" }));
    assert.equal(stickyBar(android.markup), "0", `${id}: 안드로이드형 = 맨 아래(bottom 0)`);
    assert.equal(android.text.split(submit).length - 1, 1, `${id}: 제출 버튼은 결제 막대 하나`);
    assert.ok(android.text.indexOf(submit) > android.text.lastIndexOf("고객센터"), `${id}: 결제 막대는 꼬리말 뒤(문서 끝)`);
    const ios = renderLandingScreen(base(id, { skin: "ios", callBarShown: true }));
    assert.ok(ios.markup.includes(LIFT), `${id}: iOS형 = 떠 있는 주소 막대 위로`);
    const sms = renderLandingScreen(base(id, { entrySurface: "messenger", messengerSurface: "kakao" }));
    assert.equal(stickyBar(sms.markup), "0", `${id}: 메신저 안 브라우저 = 맨 아래`);
    lines.push(`${id}=막대(안드로이드 0 · iOS 올림)`);
  }
  for (const props of [base("cash-withdraw", { skin: "ios" }), base("loan-apply", { skin: "ios", loanContext })]) {
    const { markup } = renderLandingScreen(props);
    assert.equal(stickyBar(markup), undefined, `${String(props.landingId)}: 결제 막대 없음(상자 안 버튼)`);
    lines.push(`${String(props.landingId)}=막대 없음`);
  }
  t.diagnostic(lines.join(" | "));
});

test("[PS3 역검증] 올림 판정을 끊은 사본은 iOS형에서도 bottom 0 — 검사에 걸린다", () => {
  const { poisoned, original, overrides } = poisonedComponentSource(
    'const payBarLifted = chrome.frame === "device-bottom";',
    "const payBarLifted = false;",
  );
  assert.notEqual(poisoned, original, "오염 지점을 찾지 못했다");
  const { markup } = renderLandingScreen(base("gold-buy", { skin: "ios", callBarShown: true }), overrides);
  assert.equal(markup.includes(LIFT), false);
  assert.equal(stickyBar(markup), "0");
});

// ── PS4 재현 ─────────────────────────────────────────────────────────────────────────────────────────

/** 초기 상태 값만 바꾼 메모리 사본(치환이 한 곳에서 실제로 일어났는지 단언). */
function overridden(replacements: readonly [string, string][]): Map<string, string> {
  const absolutePath = resolvePath(COMPONENT_PATH);
  let source = readFileSync(absolutePath, "utf8");
  for (const [from, to] of replacements) {
    assert.equal(source.split(from).length - 1, 1, `치환 앵커가 한 곳이어야 한다: ${from}`);
    source = source.replace(from, to);
  }
  return new Map([[absolutePath, source]]);
}

test("[PS4] 재현 — 금 시세 띠 · 금괴 카드 · 상품권 카드 · 즉시 발송 · 대출 진행 칩", () => {
  const gold = renderLandingScreen(base("gold-buy")).text;
  assert.ok(gold.includes(`오늘 판매가 1g\n${won(GOLD_PRICE_PER_GRAM)}`), "시세 띠 1g");
  assert.ok(gold.includes(`${GOLD_SITE_COPY.donLabel}\n${won(GOLD_PRICE_PER_GRAM * 3.75)}`), "1돈 = 같은 단가 × 3.75");
  assert.equal(won(GOLD_PRICE_PER_GRAM * 3.75), "712,500원");
  for (const product of GOLD_PRODUCTS) assert.ok(gold.includes(product.label), `금괴 카드 ${product.label}`);
  assert.equal(gold.split(GOLD_SITE_COPY.cardBadge).length - 1, GOLD_PRODUCTS.length + 1, "카드마다 보증서 배지 + 신뢰 표시 1");
  for (const item of GOLD_SITE_COPY.trust) assert.ok(gold.includes(item), item);
  assert.ok(gold.split("\n").includes("HAEDAM GOLD"), "로고 아래 영문 줄");

  const gift = renderLandingScreen(base("voucher-purchase")).text;
  for (const line of [VOUCHER_SITE_COPY.instantBadge, VOUCHER_SITE_COPY.cardKind, VOUCHER_SITE_COPY.cardPin]) assert.ok(gift.includes(line), line);
  const giftPicked = renderLandingScreen(
    base("voucher-purchase"),
    overridden([["const [denomination, setDenomination] = useState<number | undefined>(undefined);", "const [denomination, setDenomination] = useState<number | undefined>(50000);"]]),
  ).text;
  assert.ok(giftPicked.includes("50,000원"), "고른 권종 금액이 상품권 카드에");
  assert.ok(giftPicked.includes("5만원권 × 1장"), "결제 막대 요약");

  const chipOn = (markup: string) => /<li aria-current="step"[^>]*>([^<]+)<\/li>/.exec(markup)?.[1];
  const intro = renderLandingScreen(base("loan-apply", { loanContext }));
  assert.equal(chipOn(intro.markup), LOAN_SITE_STEPS[0], "안내 = 본인 확인 칩");
  for (const step of LOAN_SITE_STEPS) assert.ok(intro.text.includes(step), step);
  const stage = (value: string) =>
    renderLandingScreen(base("loan-apply", { loanContext }), overridden([['useState<LoanApplyStage>("intro")', `useState<LoanApplyStage>("${value}")`]]));
  assert.equal(chipOn(stage("limit").markup), LOAN_SITE_STEPS[1], "한도 = 신청 칩");
  assert.equal(chipOn(stage("terms").markup), LOAN_SITE_STEPS[2], "약정 = 전자서명 칩");
  assert.equal(chipOn(stage("done").markup), undefined, "접수 = 칩 없음");
  assert.equal(/연 \d/.test(intro.text.replace("연 9.9% ~ 15.9%", "")), false, "금리 문구를 새로 더하지 않는다(종전 안내 줄만)");
});

// ── PS5 금지 ─────────────────────────────────────────────────────────────────────────────────────────

test("[PS5] 6화면 첫 렌더 — 세션 금지 낱말 · 8자리 이상 숫자열 · 서비스 밖 안내 0", (t) => {
  const lines: string[] = [];
  for (const item of PURCHASE_ROWS) {
    const { text } = renderLandingScreen(item.props);
    const id = String(item.props.landingId);
    assert.deepEqual(text.match(/모의|훈련|가상|재현/g) ?? [], [], `${id}: G437`);
    assert.deepEqual(text.match(/\d{8,}/g) ?? [], [], `${id}: 8자리 이상 숫자열`);
    assert.deepEqual(text.match(/매장|수령|방문|영업점|금 보관|현금인출기|신분증/g) ?? [], [], `${id}: 서비스 밖 안내`);
    lines.push(`${id}=0`);
  }
  t.diagnostic(lines.join(" · "));
});

test("[PS5] 꼬리말 줄은 어떤 랜딩의 주소창 호스트도 품지 않는다(렌더 게이트 [T190-2] '호스트는 주소창으로만' 신호 보존) · 역검증", () => {
  const catalog = readFileSync(resolvePath("functions/src/scenarios/mockScreens.ts"), "utf8");
  const hosts = [...catalog.matchAll(/mockHost: "([^"]+)"/g)].map((m) => m[1]!);
  assert.ok(hosts.length >= 30, `카탈로그 호스트 ${hosts.length}개 — 파서가 죽었다`);
  const leaks = Object.values(SITE_SKINS).flatMap((skin) =>
    skin.footer ? footerLines(skin.footer).flatMap((line) => hosts.filter((host) => line.includes(host)).map((host) => `${skin.id}: ${host}`)) : [],
  );
  assert.deepEqual(leaks, []);
  // 역검증 — PR-2 원래 값(help@haedam-gold.invalid)은 금 거래소 호스트를 품어 잡혀야 한다.
  assert.ok(footerLines({ ...SITE_SKINS.gold.footer!, email: "help@haedam-gold.invalid" }).some((line) => hosts.some((host) => line.includes(host))));
});

// ── PS6 새 조각 ──────────────────────────────────────────────────────────────────────────────────────

test("[PS6] 새 조각(머리 · 꼬리말 · 결제 막대) — 네트워크 · 저장소 0 · 결제 막대 버튼 = 종전 다음 동작(무인자)", () => {
  const file = readFileSync(resolvePath(COMPONENT_PATH), "utf8");
  const start = file.indexOf("// ── ⭐ 2026-11-08 웹 안의 웹 PR-3 — 구매 화면 공용 조각");
  const end = file.indexOf("function GoldBuyMockup(");
  assert.ok(start > 0 && end > start, "공용 조각 구간");
  const block = file.slice(start, end).replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(block, /fetch\(|httpsCallable|@\/lib\/api|localStorage|sessionStorage|indexedDB|navigator\./);
  assert.ok(block.includes("onClick={onSubmit}") && block.includes("onSubmit: () => void;"), "결제 막대 버튼 = 무인자 콜백");
  for (const name of ["GoldBuyMockup", "VoucherPurchaseMockup"]) {
    const s = file.indexOf(`function ${name}(`);
    const component = file.slice(s, file.indexOf("\nfunction ", s + 10));
    assert.ok(component.includes("onSubmit={handleNext}"), `${name}: 결제 막대 = 종전 "다음" 판정 그대로`);
  }
});

// ── PS7 오염 치환 헬퍼 줄 끝 무관 ───────────────────────────────────────────────────────────────────────

test("[PS7] 오염 치환 헬퍼 — LF · CRLF 원본 모두 여러 줄 앵커를 한 번 치환 · 없으면 원본 그대로 · 역검증", () => {
  const lf = "a\n      ? purchaseFamilyOf(landingId)\n      : undefined;\n";
  const crlf = lf.replace(/\n/g, "\r\n");
  const from = "      ? purchaseFamilyOf(landingId)\n";
  const to = "      ? undefined\n";
  assert.equal(replaceOnceAnyLineEnding(lf, from, to), "a\n      ? undefined\n      : undefined;\n", "E1 LF");
  assert.equal(replaceOnceAnyLineEnding(crlf, from, to), "a\r\n      ? undefined\r\n      : undefined;\r\n", "E2 CRLF — 줄 끝 형태 유지");
  assert.equal(replaceOnceAnyLineEnding(crlf, "없는 앵커\n", to), crlf, "E3 없으면 그대로");
  assert.ok(replaceOnceAnyLineEnding(crlf, "purchaseFamilyOf", "X").includes("? X(landingId)"), "한 줄 앵커는 CRLF여도 그대로");
  // 역검증 — 종전 방식(글자 그대로 replace)은 CRLF 원본에서 아무것도 바꾸지 못한다(통합 검증 실패의 원인).
  assert.equal(crlf.replace(from, to), crlf);
  // 실제 컴포넌트 파일(이 체크아웃의 줄 끝이 무엇이든)에서도 PS2 앵커가 한 곳 잡힌다.
  const { original, poisoned } = poisonedComponentSource(from, to);
  assert.notEqual(poisoned, original);
});
