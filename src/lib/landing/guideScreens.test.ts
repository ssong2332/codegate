// ⭐ 2026-11-08 웹 안의 웹 PR-4(사용자 승인 계획 · 시안 A 기관 · B 환급 · C 택배 · H 설치) — 안내 화면 사이트 계열 입히기.
//
// | # | 고정하는 것 |
// |---|---|
// | GS1 | 안내 화면 색 쌍(글자 4.5:1 · 로고 큰 글자 3:1 · 비텍스트 3:1)이 전부 기준 이상 · 역검증 |
// | GS2 | 판정표 G1 ~ G7 — 기관 4 · 환급 1 · 택배 2 · 맥락 없는 대출 2 · 설치 7 · 이체 14(첫 화면)는 계열 바탕 · 머리 · 꼬리말, 이체 확인 단계(G5′)는 '{내 은행} 모바일뱅킹' · 표 밖 id는 무변경 · 역검증 |
// | GS7 | 이체 화면(사용자 결정 2026-11-08 (가)) — D2 기관형 이체 머리(방패 · 띠 · 공지 상자) · D1 '간편 송금' 로고(사용자 확정) · 받는 사람 원 · 큰 금액 · 화면 숫자 자판(금액 입력 칸 0) |
// | GS3 | 재현 — 기관 띠 · 작은 줄 · 단계 칸 · 공지 상자 / 환급 조회 결과 카드 / 택배 운송장 띠 · 보류 배지 · 타임라인 / 설치 앱 이름 · 권한 목록(사용자 확정 요소) |
// | GS4 | 금지 — 16화면 첫 렌더 · 새 문구에 세션 금지 낱말(G437) · 8자리 이상 숫자열 · 실존 앱 · 스토어 이름 · 서비스 밖 안내 0 · 꼬리말이 주소창 호스트를 품지 않음 |
// | GS5 | 새 조각 — 네트워크 · 저장소 · 권한 API 0 · 설치 응낙 콜백 · 입력 화면 제출 흐름은 종전 그대로 |
// | GS6 | 소스 앵커는 줄 끝 무관(LF · CRLF 둘 다 — PR-3 통합 검증 교훈) |
//
// ⚠️ 한계(정직 고지): 렌더 하네스는 `renderToStaticMarkup` — 첫 화면만 본다(누름 뒤 단계 · 글꼴 실제 모양은 브라우저 확인 몫).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { COMPONENT_PATH, poisonedComponentSource, renderLandingScreen, replaceOnceAnyLineEnding } from "../mockscreenrender/renderHarness.ts";
import {
  GUIDE_SITE_TOKENS,
  PURCHASE_ERROR_TEXT,
  SITE_SKINS,
  footerLines,
  guideFormFamilyOf,
  guidePalette,
  type GuideFamilyId,
  type SiteFamilyId,
} from "./siteSkins.ts";
import {
  AGENCY_SITE_COPY,
  AGENCY_TRANSFER_SITE_COPY,
  SEND_SITE_LOGO,
  INSTALL_APP_NAMES,
  INSTALL_PERMISSIONS,
  INSTALL_PERMISSION_HEADING,
  PARCEL_SITE_COPY,
  REFUND_SITE_COPY,
} from "./guideCopy.ts";
import { pairContrast, type ContrastPair } from "../phone/skinTokens.ts";

type Pair = ContrastPair & { min: number };
const FAMILIES: readonly GuideFamilyId[] = ["agency", "agency-transfer", "refund", "parcel", "send", "install"];

function guidePairs(family: GuideFamilyId): Pair[] {
  const skin = SITE_SKINS[family];
  const t = GUIDE_SITE_TOKENS[family];
  const p = guidePalette(family);
  const text = (name: string, fg: string, bg: string, min = 4.5): Pair => ({ name: `${family}.${name}`, fg, bg, kind: "text", min });
  const non = (name: string, fg: string, bg: string): Pair => ({ name: `${family}.${name}`, fg, bg, kind: "nonText", min: 3 });
  const pairs: Pair[] = [
    text("headline/page", p.headline, skin.pageBg),
    text("headline/surface", p.headline, t.surface),
    text("body/page", p.body, skin.pageBg),
    text("body/surface", p.body, t.surface),
    text("body/note", p.body, t.noteBg),
    text("headline/note", p.headline, t.noteBg),
    text("error/surface", PURCHASE_ERROR_TEXT, t.surface),
    text("error/page", PURCHASE_ERROR_TEXT, skin.pageBg),
    text("hint/surface", p.hintText, t.surface),
    text("button", skin.buttonText, skin.buttonBg),
    // 로고 — 큰 글자 전용 계열(택배 주황)만 3:1(굵게 20px · WCAG 큰 글자).
    text("logo", skin.headerText, skin.headerBg, skin.headerLargeTextOnly ? 3 : 4.5),
    text("footer", skin.footerText, skin.footerBg),
    non("border/surface", t.border, t.surface),
    non("border/page", t.border, skin.pageBg),
  ];
  if (skin.band) pairs.push(text("band", skin.band.text, skin.band.bg));
  if (t.headerSub) pairs.push(text("headerSub", t.headerSub, skin.headerBg));
  if (t.invoiceBand) pairs.push(text("invoiceBand", t.invoiceBand.text, t.invoiceBand.bg));
  if (t.holdBadge) pairs.push(text("holdBadge", t.holdBadge.text, t.holdBadge.bg));
  if (t.timeline) {
    pairs.push(
      text("timeline.holdText", t.timeline.holdText, t.surface),
      text("timeline.sub", t.timeline.sub, t.surface),
      non("timeline.done", t.timeline.done, t.surface),
      non("timeline.hold", t.timeline.hold, t.surface),
    );
  }
  if (t.resultAmount) pairs.push(text("resultAmount", t.resultAmount, t.surface));
  if (t.resultTag) pairs.push(text("resultTag", t.resultTag.text, t.resultTag.bg));
  if (t.permissionIcon) pairs.push(non("permissionIcon", t.permissionIcon.fg, t.permissionIcon.bg));
  if (t.avatar) pairs.push(text("avatar", t.avatar.text, t.avatar.bg));
  if (t.keypadText) pairs.push(text("keypad", t.keypadText, t.surface));
  if (t.amountPlaceholder) pairs.push(text("amountPlaceholder", t.amountPlaceholder, t.surface));
  if (family === "agency" || family === "agency-transfer") pairs.push(text("steps.on", skin.buttonText, skin.accent), text("steps.off", skin.accent, skin.headerBg));
  return pairs;
}

const failures = (pairs: Pair[]) =>
  pairs.flatMap((p) => {
    const ratio = pairContrast(p);
    return ratio >= p.min ? [] : [`${p.name} ${ratio.toFixed(2)} < ${p.min}`];
  });

test("[GS1] 안내 화면 색 쌍이 전부 기준 이상(글자 4.5:1 · 로고 큰 글자 3:1 · 비텍스트 3:1)", (t) => {
  const all = FAMILIES.flatMap(guidePairs);
  assert.deepEqual(failures(all), []);
  t.diagnostic(`[GS1] ${all.length}쌍 — ${all.map((p) => `${p.name}=${pairContrast(p).toFixed(2)}`).join(" · ")}`);
});

test("[GS1 역검증] 종전 설치 화면 테두리(#C9C2B6) · 시안 환급 테두리 바탕(#DCE4EF 입력 테두리) · 18px 주황 로고(4.5 기준)는 잡힌다", () => {
  const dim = failures([
    { name: "install.border(종전)", fg: "#C9C2B6", bg: "#FFFFFF", kind: "nonText", min: 3 },
    { name: "refund.border(카드선)", fg: "#DCE4EF", bg: "#FFFFFF", kind: "nonText", min: 3 },
    { name: "parcel.logo(작은 글자)", fg: SITE_SKINS.parcel.headerText, bg: "#FFFFFF", kind: "text", min: 4.5 },
  ]);
  assert.equal(dim.length, 3, dim.join(" · "));
});

// ── GS2 판정표 G ──────────────────────────────────────────────────────────────────────────────────────

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
const install = (landingId: string) => ({ ...base(landingId), landingKind: "app-install", onInstallConsent: () => {} });
const bgOf = (color: string) => `background-color:${color}`;
const OLD_BAR = "#1F3A5F";

/** 판정표 G1 ~ G4 · G6 행 → 기대 계열 · 꼬리말 ⓒ 줄(카탈로그 `issuerLabel`). */
const GUIDE_ROWS: readonly { row: string; props: Record<string, unknown>; family: SiteFamilyId; copyright: string }[] = [
  { row: "G1", props: base("case-record-view"), family: "agency", copyright: "ⓒ 사건조회 안내센터" },
  { row: "G1", props: base("asset-check-site"), family: "agency", copyright: "ⓒ 사건자산 검수 안내센터" },
  { row: "G1", props: base("asset-check-wallet"), family: "agency", copyright: "ⓒ 사건자산 검수센터" },
  { row: "G1", props: base("asset-custody-apply"), family: "agency", copyright: "ⓒ 자산보호 보관접수 안내" },
  { row: "G2", props: base("tax-refund-claim"), family: "refund", copyright: "ⓒ 환급금 지급 안내센터" },
  { row: "G3", props: base("parcel-redelivery"), family: "parcel", copyright: "ⓒ 종합물류 재배송 접수처" },
  { row: "G3", props: base("courier-customs-check"), family: "parcel", copyright: "ⓒ 국제통관지원센터" },
  { row: "G4", props: base("loan-apply"), family: "loan", copyright: "ⓒ 비대면 대출센터" },
  { row: "G4", props: base("loan-refinance-apply"), family: "loan", copyright: "ⓒ 대환대출 전환심사팀" },
  { row: "G6", props: install("subsidy-install"), family: "install", copyright: "ⓒ 업무처리 확인센터" },
  { row: "G6", props: install("parcel-install"), family: "install", copyright: "ⓒ 종합물류 배송확인센터" },
  { row: "G6", props: install("child-insurance-install"), family: "install", copyright: "ⓒ 휴대폰 파손보험 접수센터" },
  { row: "G6", props: install("card-guard-app-install"), family: "install", copyright: "ⓒ 카드 명의보호 안내센터" },
  { row: "G6", props: install("card-remote-support-install"), family: "install", copyright: "ⓒ 원격 지원 도우미" },
  { row: "G6", props: install("loan-check-app-install"), family: "install", copyright: "ⓒ 대출심사 보안점검 안내" },
  { row: "G6", props: install("card-delivery-app-install"), family: "install", copyright: "ⓒ 카드 사고접수 안내" },
];

/** G5 — 이체 화면 14종(첫 화면 = 계열 머리 · 확인 뒤 = 내 은행 머리띠 — 사용자 결정 2026-11-08 (가)). */
const TRANSFER_IDS = [
  "loan-repay-transfer",
  "asset-deposit-transfer",
  "blackmail-hush-transfer",
  "courier-fee-transfer",
  "courier-safe-transfer",
  "child-bank-transfer",
  "friend-bank-transfer",
  "tax-refund-fee-transfer",
  "card-relief-transfer",
  "safe-account-transfer",
  "protect-account-transfer",
  "card-safe-transfer",
  "loan-safe-transfer",
  "kidnap-ransom-transfer",
];

test("[GS2] 판정표 G1 ~ G4 · G6 — 16화면은 계열 바탕 · 진행 막대 · 머리 · 꼬리말 · ⓒ 줄 / 종전 남색 머리띠 0", (t) => {
  const lines: string[] = [];
  for (const item of GUIDE_ROWS) {
    const skin = SITE_SKINS[item.family];
    const { markup, text } = renderLandingScreen(item.props);
    const id = String(item.props.landingId);
    assert.ok(markup.includes(bgOf(skin.pageBg)), `${item.row} ${id}: 페이지 바탕 ${skin.pageBg}`);
    assert.ok(markup.includes(bgOf(skin.accent)), `${item.row} ${id}: 진행 막대 = 사이트 색 ${skin.accent}`);
    assert.ok(markup.includes(bgOf(skin.headerBg)), `${item.row} ${id}: 머리 바탕 ${skin.headerBg}`);
    assert.ok(markup.includes(bgOf(skin.footerBg)) && markup.includes("<footer"), `${item.row} ${id}: 꼬리말`);
    for (const line of footerLines(skin.footer!)) assert.ok(text.includes(line), `${item.row} ${id}: 꼬리말 줄 "${line}"`);
    assert.ok(text.split("\n").includes(item.copyright), `${item.row} ${id}: ⓒ 줄 "${item.copyright}"`);
    assert.equal(text.split("\n").filter((line) => line === item.copyright).length, 1, `${item.row} ${id}: ⓒ 줄은 한 번`);
    assert.equal(markup.includes(bgOf(OLD_BAR)), false, `${item.row} ${id}: 종전 남색 머리띠 · 진행 막대가 남았다`);
    if (item.row !== "G6") assert.equal(guideFormFamilyOf(id), item.family, `${id} 매핑`);
    lines.push(`${item.row} ${id}=${item.family}`);
  }
  t.diagnostic(lines.join(" | "));
});

/** G5 이체 첫 화면 공통 대조(D2 = 꼬리말 있음 · D1 = 꼬리말 없음 — 시안). ⓒ 줄은 한 번. */
function transferFirstScreen(id: string, props: Record<string, unknown>) {
  const family = guideFormFamilyOf(id);
  assert.ok(family === "agency-transfer" || family === "send", `${id}: 이체 계열 ${family}`);
  const skin = SITE_SKINS[family!];
  const { markup, text } = renderLandingScreen(props);
  assert.ok(markup.includes(bgOf(skin.accent)), `${id}: 진행 막대 = 사이트 색`);
  assert.equal(markup.includes(bgOf(OLD_BAR)), false, `${id}: 첫 화면에 종전 남색 머리띠가 남았다`);
  assert.equal(text.includes("모바일뱅킹 송금 요청") ? false : text.includes(" 모바일뱅킹"), false, `${id}: 첫 화면에 은행 앱 머리띠가 남았다`);
  assert.equal(text.split("\n").filter((line) => line.startsWith("ⓒ ")).length, 1, `${id}: ⓒ 줄 한 번`);
  assert.equal(markup.includes("<footer"), family === "agency-transfer", `${id}: 꼬리말 = D2만`);
  return { family, markup, text };
}

const BANK = { bankName: "누리은행", holder: "노은채", myBankName: "새솔은행", ledgerKey: "guide-screen-session-01" };
const transferProps = (id: string, extra: Record<string, unknown> = {}) =>
  base(id, { prefilledAccount: "302-1184-5527-61", prefilledTransfer: { ...BANK, ...extra } });

test("[GS2] 판정표 G5 · G7 — 이체 14화면 첫 화면은 계열 머리 · 색 / 표 밖 id는 종전 그대로", (t) => {
  const lines: string[] = [];
  for (const id of TRANSFER_IDS) {
    const { family } = transferFirstScreen(id, transferProps(id));
    lines.push(`${id}=${family}`);
  }
  assert.equal(guideFormFamilyOf("no-such-landing"), undefined);
  assert.equal(guideFormFamilyOf(undefined), undefined);
  const generic = renderLandingScreen(base("no-such-landing")).markup;
  assert.ok(generic.includes(bgOf(OLD_BAR)) && !generic.includes("<footer"), "G7 표 밖 id = 종전 범용 화면");
  t.diagnostic(lines.join(" · "));
});

/** 확인 단계로 바로 그린 사본(이체 흐름 단계 state 초기값만 바꾼다 — loanScreens S5와 같은 방법). */
const confirmStage = () =>
  poisonedComponentSource(
    'const [bankStage, setBankStage] = useState<"form" | "confirm" | "auth">("form");',
    'const [bankStage, setBankStage] = useState<"form" | "confirm" | "auth">("confirm");',
  );

test("[GS2] 판정표 G5′ — 이체 확인 단계는 종전 '{내 은행} 모바일뱅킹' 머리띠 · 색(사이트 머리 · 꼬리말 0)", () => {
  const { poisoned, original, overrides } = confirmStage();
  assert.notEqual(poisoned, original, "단계 state 앵커를 찾지 못했다");
  for (const id of ["safe-account-transfer", "friend-bank-transfer"]) {
    const { markup, text } = renderLandingScreen(transferProps(id, { amount: "3000000" }), overrides);
    assert.ok(text.split("\n").includes("새솔은행 모바일뱅킹"), `${id}: 확인 단계 머리띠 = 내 은행`);
    assert.ok(markup.includes(bgOf(OLD_BAR)), `${id}: 확인 단계 = 종전 남색 머리띠`);
    assert.equal(markup.includes("<footer"), false, `${id}: 확인 단계에 사이트 꼬리말 0`);
    assert.equal(text.includes(SEND_SITE_LOGO), false, `${id}: 확인 단계에 '간편 송금' 로고 0`);
    assert.ok(text.includes("받는 분") && text.includes("노은채") && text.includes("보내는 금액"), `${id}: 확인 단계 행 그대로`);
  }
});

test("[GS2 역검증] 입력 화면의 계열 판정을 끊은 사본은 종전 머리띠로 돌아가 검사에 걸린다", () => {
  const { poisoned, original, overrides } = poisonedComponentSource(
    "  const guideFamily = guideFormFamilyOf(landingId);\n",
    "  const guideFamily = undefined as ReturnType<typeof guideFormFamilyOf>;\n",
  );
  assert.notEqual(poisoned, original, "오염 지점(입력 화면 계열 판정)을 찾지 못했다");
  const { markup } = renderLandingScreen(base("tax-refund-claim"), overrides);
  assert.ok(markup.includes(bgOf(OLD_BAR)), "오염 사본 = 종전 남색 머리띠");
  assert.equal(markup.includes("<footer"), false, "오염 사본에는 사이트 꼬리말이 없다");
});

// ── GS3 재현 ──────────────────────────────────────────────────────────────────────────────────────────

test("[GS3] 기관(G1) — 띠 · 원형 엠블럼 · 명조 기관명 · 작은 줄 · 단계 칸(본인 확인 켜짐) · 공지 상자 안 본문", () => {
  for (const [id, copy] of Object.entries(AGENCY_SITE_COPY)) {
    const { text, markup } = renderLandingScreen(base(id));
    const lines = text.split("\n");
    assert.ok(lines.includes(copy.band) && lines.includes(copy.sub), `${id}: 띠 · 작은 줄`);
    assert.ok(markup.includes(`border-bottom:3px solid ${SITE_SKINS.agency.accent}`), `${id}: 굵은 남색 밑줄`);
    assert.ok(/role="note"[^>]*>(?:(?!<\/div>).)*<p/s.test(markup), `${id}: 본문이 공지 상자 안에`);
  }
  const record = renderLandingScreen(base("case-record-view")).markup;
  const steps = AGENCY_SITE_COPY["case-record-view"]!.steps!;
  assert.ok(record.includes(`aria-current="step"`) && record.indexOf(steps[0]) < record.indexOf(steps[1]), "단계 칸 순서 · 켜진 칸");
  assert.ok(/aria-current="step"[^>]*>1 본인 확인</.test(record), "첫 화면 = 1 본인 확인이 켜짐");
});

test("[GS3] 환급(G2) — 조회 결과 카드(금액 · 내역 · 당일 지급 태그)가 제목보다 앞", () => {
  const copy = REFUND_SITE_COPY["tax-refund-claim"]!;
  const { text } = renderLandingScreen(base("tax-refund-claim"));
  const at = (s: string) => text.indexOf(s);
  for (const s of [copy.label, copy.amount, ...copy.rows.flat(), copy.tag]) assert.ok(at(s) >= 0, `카드: ${s}`);
  assert.ok(at(copy.amount) < at("환급금 받으실 계좌를 등록해 주세요"), "카드가 제목보다 앞");
});

test("[GS3] 택배(G3) — 운송장 띠(사용자 확정) · 보류 배지 · 단계 타임라인(완료 → 완료 → 보류) · 큰 주황 로고", () => {
  for (const [id, copy] of Object.entries(PARCEL_SITE_COPY)) {
    const { text, markup } = renderLandingScreen(base(id));
    const lines = text.split("\n");
    assert.ok(lines.includes(copy.invoiceLabel) && lines.includes(copy.invoice), `${id}: 운송장 띠`);
    assert.ok(lines.indexOf(copy.invoice) < lines.indexOf(copy.status), `${id}: 띠 → 배지`);
    let last = -1;
    for (const step of copy.steps) {
      const index = lines.indexOf(step.sub);
      assert.ok(index > last, `${id}: 타임라인 순서 ${step.label}`);
      last = index;
    }
    assert.ok(markup.includes("font-size:20px"), `${id}: 로고 20px(큰 글자)`);
    assert.ok(markup.includes(bgOf(SITE_SKINS.parcel.footerBg)), `${id}: 검은 꼬리말`);
  }
});

test("[GS3] 설치(G6) — 앱 이름 · 만든 곳 · 요청하는 권한 목록(사용자 확정 · 순서) · 파란 버튼 · 꼬리말", () => {
  for (const [id, name] of Object.entries(INSTALL_APP_NAMES)) {
    const { text, markup } = renderLandingScreen(install(id));
    const lines = text.split("\n");
    assert.ok(lines.includes(name), `${id}: 앱 이름 ${name}`);
    assert.ok(lines.includes(INSTALL_PERMISSION_HEADING), `${id}: 권한 제목`);
    let last = lines.indexOf(INSTALL_PERMISSION_HEADING);
    for (const permission of INSTALL_PERMISSIONS) {
      const index = lines.indexOf(permission.label);
      assert.ok(index > last, `${id}: 권한 순서 ${permission.label}`);
      last = index;
    }
    assert.ok(lines.indexOf("설치 진행하기") > last, `${id}: 버튼은 권한 목록 뒤`);
    assert.ok(markup.includes(bgOf(SITE_SKINS.install.buttonBg)), `${id}: 파란 버튼`);
    assert.equal(markup.includes("📱"), false, `${id}: 종전 📱 원 대신 앱 아이콘`);
  }
  // 만든 곳 = 앱 이름과 같으면 한 번만(원격 지원 도우미).
  const same = renderLandingScreen(install("card-remote-support-install")).text.split("\n");
  assert.equal(same.filter((line) => line === "원격 지원 도우미").length, 2, "앱 이름 1 + 꼬리말 이름 1(만든 곳 줄 중복 0)");
  const differ = renderLandingScreen(install("subsidy-install")).text.split("\n");
  assert.ok(differ.indexOf("업무처리 확인센터") === differ.indexOf("업무처리 확인 앱") + 1, "만든 곳 줄 = 앱 이름 바로 아래");
});

test("[GS3] 앱 이름 표 = 설치 화면 표와 같은 키 · 각 이름은 그 화면 제목에 이미 있는 글자", () => {
  const file = readFileSync(resolvePath(COMPONENT_PATH), "utf8").replace(/\r\n/g, "\n");
  const start = file.indexOf("const INSTALL_LANDING_COPY");
  const table = file.slice(start, file.indexOf("\n};", start));
  const keys = [...table.matchAll(/^ {2}"([a-z0-9-]+)":/gm)].map((m) => m[1]!).sort();
  assert.deepEqual(Object.keys(INSTALL_APP_NAMES).sort(), keys);
  for (const [id, name] of Object.entries(INSTALL_APP_NAMES)) {
    const { text } = renderLandingScreen(install(id));
    assert.ok(text.split("\n").some((line) => line !== name && line.includes(name) && line.includes("설치")), `${id}: 제목에 "${name}"`);
  }
});

// ── GS4 금지 ─────────────────────────────────────────────────────────────────────────────────────────

const NEW_COPY_TEXT = JSON.stringify([AGENCY_TRANSFER_SITE_COPY, SEND_SITE_LOGO, AGENCY_SITE_COPY, REFUND_SITE_COPY, PARCEL_SITE_COPY, INSTALL_APP_NAMES, INSTALL_PERMISSION_HEADING, INSTALL_PERMISSIONS]);

test("[GS4] 16화면 첫 렌더 · 새 문구 — 세션 금지 낱말 · 8자리 이상 숫자열 · 실존 앱 · 스토어 이름 · 서비스 밖 안내 0", (t) => {
  const lines: string[] = [];
  const check = (label: string, text: string) => {
    assert.deepEqual(text.match(/모의|훈련|가상|재현/g) ?? [], [], `${label}: G437`);
    assert.deepEqual(text.match(/\d{8,}/g) ?? [], [], `${label}: 8자리 이상 숫자열`);
    assert.deepEqual(text.match(/카카오|토스|네이버|정부24|AnyDesk|TeamViewer|플레이스토어|앱스토어|구글|애플/g) ?? [], [], `${label}: 실존 이름`);
    assert.deepEqual(text.match(/방문|영업점|현금인출기|매장|대리점|편의점/g) ?? [], [], `${label}: 서비스 밖 안내`);
  };
  check("새 문구", NEW_COPY_TEXT);
  for (const item of GUIDE_ROWS) {
    const id = String(item.props.landingId);
    check(id, renderLandingScreen(item.props).text);
    lines.push(`${id}=0`);
  }
  for (const id of TRANSFER_IDS) {
    check(id, renderLandingScreen(transferProps(id)).text);
    lines.push(`${id}=0`);
  }
  t.diagnostic(lines.join(" · "));
});

test("[GS4] 새 문구 · 꼬리말은 어떤 랜딩의 주소창 호스트도 품지 않는다(렌더 게이트 [T190-2]) · 역검증", () => {
  const catalog = readFileSync(resolvePath("functions/src/scenarios/mockScreens.ts"), "utf8");
  const hosts = [...catalog.matchAll(/mockHost: "([^"]+)"/g)].map((m) => m[1]!);
  assert.ok(hosts.length >= 30, `카탈로그 호스트 ${hosts.length}개 — 파서가 죽었다`);
  const leaks = (text: string) => hosts.filter((host) => text.includes(host));
  assert.deepEqual(leaks(NEW_COPY_TEXT), []);
  const installFooter = footerLines(SITE_SKINS.install.footer!).join(" ");
  assert.deepEqual(leaks(installFooter), [], "설치 꼬리말");
  // 역검증 — 같은 검사기가 호스트를 품은 꼬리말 줄(설치 화면 호스트를 이메일로 넣은 사본)을 잡는다.
  const poisoned = footerLines({ ...SITE_SKINS.install.footer!, email: "help@support-app-center.invalid" }).join(" ");
  assert.deepEqual(leaks(poisoned), ["support-app-center.invalid"]);
});

// ── GS5 새 조각 ──────────────────────────────────────────────────────────────────────────────────────

test("[GS5] 새 조각(기관 머리 · 설치 소개) — 네트워크 · 저장소 · 권한 API 0 · 설치 응낙 콜백 · 제출 흐름 그대로", () => {
  const file = readFileSync(resolvePath(COMPONENT_PATH), "utf8").replace(/\r\n/g, "\n");
  const slice = (from: string, to: string) => {
    const s = file.indexOf(from);
    const e = file.indexOf(to, s + 10);
    assert.ok(s > 0 && e > s, `구간 ${from}`);
    return file.slice(s, e).replace(/^\s*\/\/.*$/gm, "");
  };
  const header = slice("function AgencySiteHeader(", "\nfunction ");
  const installer = slice("function AppInstallMockup(", "\n}\n");
  for (const block of [header, installer]) {
    assert.doesNotMatch(block, /fetch\(|httpsCallable|@\/lib\/api|localStorage|sessionStorage|indexedDB|navigator\.|Notification\.|requestPermission/);
  }
  assert.ok(installer.includes("onClick={handleConsent}") && installer.includes("onConsent?.();"), "설치 응낙 = 종전 무인자 콜백");
  assert.equal((installer.match(/onConsent\?\.\(/g) ?? []).length, 1, "응낙 콜백은 한 곳");
  const form = slice("function CredentialFormMockup(", "\nfunction ");
  assert.ok(form.includes("<form key={stepIndex} onSubmit={handleSubmit}"), "입력 화면 제출 = 종전 판정");
});

// ── GS6 줄 끝 무관 ───────────────────────────────────────────────────────────────────────────────────

test("[GS6] 이 파일의 여러 줄 소스 앵커는 LF · CRLF 원본 모두에서 한 곳 잡힌다", () => {
  const file = readFileSync(resolvePath(COMPONENT_PATH), "utf8");
  const lf = file.replace(/\r\n/g, "\n");
  const crlf = lf.replace(/\n/g, "\r\n");
  const anchor = "  const guideFamily = guideFormFamilyOf(landingId);\n";
  for (const [label, source] of [["LF", lf], ["CRLF", crlf]] as const) {
    assert.notEqual(replaceOnceAnyLineEnding(source, anchor, "X\n"), source, `${label}: 앵커를 못 찾았다`);
  }
  // 역검증 — 글자 그대로 찾는 종전 방식은 CRLF 원본에서 못 찾는다.
  assert.equal(crlf.includes(anchor), false);
});

// ── GS7 이체 화면(D1 · D2) ────────────────────────────────────────────────────────────────────────────

const D2_IDS = TRANSFER_IDS.filter((id) => guideFormFamilyOf(id) === "agency-transfer");
const D1_IDS = TRANSFER_IDS.filter((id) => guideFormFamilyOf(id) === "send");

test("[GS7] D2 기관형 이체 7종 — 띠 · 방패 엠블럼 · 작은 줄 · 공지 상자 · 미리 채운 계좌 · 출금 계좌 줄 · 한도 안내 그대로", () => {
  assert.equal(D2_IDS.length, 7, `D2 ${D2_IDS.join(", ")}`);
  for (const id of D2_IDS) {
    const { markup, text } = renderLandingScreen(transferProps(id));
    const lines = text.split("\n");
    assert.ok(lines.includes(AGENCY_TRANSFER_SITE_COPY.band) && lines.includes(AGENCY_TRANSFER_SITE_COPY.sub), `${id}: 띠 · 작은 줄`);
    assert.ok(/role="note"/.test(markup), `${id}: 공지 상자`);
    assert.ok(/value="302-1184-5527-61"/.test(markup), `${id}: 계좌 미리 채움`);
    assert.ok(text.includes("출금 계좌") && text.includes("출금 가능 금액"), `${id}: 출금 계좌 줄(결정 — 첫 화면에 그대로)`);
    assert.ok(text.includes("1회"), `${id}: 한도 안내`);
  }
});

test("[GS7] D1 송금 요청 7종 — '간편 송금' 로고 · 받는 사람 원 · 큰 금액(0원) · 화면 숫자 자판 12개 · 금액 입력 칸 0", () => {
  assert.equal(D1_IDS.length, 7, `D1 ${D1_IDS.join(", ")}`);
  for (const id of D1_IDS) {
    const { markup, text } = renderLandingScreen(transferProps(id));
    const lines = text.split("\n");
    assert.ok(lines.includes(SEND_SITE_LOGO), `${id}: 로고`);
    assert.ok(lines.includes("노"), `${id}: 받는 사람 원 = 예금주 첫 글자`);
    assert.ok(lines.includes("0원"), `${id}: 금액 자리`);
    const inputs = markup.match(/<input[^>]*>/g) ?? [];
    assert.equal(inputs.length, 1, `${id}: 입력 칸은 미리 채운 계좌 하나뿐(금액 = 자판 · 기기 자판 0)`);
    assert.ok(/readOnly|readonly/.test(inputs[0]!), `${id}: 남은 입력 칸 = 읽기 전용 계좌`);
    const keys = markup.match(/<button type="button"[^>]*class="flex h-12 items-center justify-center rounded-xl[^"]*"/g) ?? [];
    assert.equal(keys.length, 12, `${id}: 숫자 자판 단추 12개`);
    assert.ok(markup.includes('aria-label="지우기"'), `${id}: 지우기 단추 이름`);
    assert.ok(text.includes("출금 계좌") && text.includes("출금 가능 금액"), `${id}: 출금 계좌 줄 그대로`);
  }
  // 문자 금액 미리 채움 = 큰 금액 · 한글 단위 그대로(검증 경로는 종전 `values` — 같은 값이 그대로 보인다).
  const filled = renderLandingScreen(transferProps("friend-bank-transfer", { amount: "3000000" })).text.split("\n");
  assert.ok(filled.includes("3,000,000원") && filled.includes("300만 원"), "미리 채운 금액 · 한글 단위");
  // 예금주 모름(메신저 칩) = 사람 아이콘(지어낸 이름 0).
  const anonymous = renderLandingScreen(base("friend-bank-transfer", { prefilledAccount: "302-1184-5527-61" })).text.split("\n");
  assert.equal(anonymous.includes("노"), false);
});

test("[GS7] D1 자판 — 값은 같은 `values` · 오류 지우기 그대로 · 단추만(입력 칸 0) · 네트워크 · 저장소 0 · 역검증", () => {
  const file = readFileSync(resolvePath(COMPONENT_PATH), "utf8").replace(/\r\n/g, "\n");
  const s = file.indexOf("function SendAmountPad(");
  const pad = file.slice(s, file.indexOf("\nfunction ", s + 10));
  assert.ok(s > 0, "자판 조각");
  assert.doesNotMatch(pad.replace(/^\s*\/\/.*$/gm, ""), /<input|fetch\(|localStorage|sessionStorage|indexedDB|navigator\./);
  assert.ok(pad.includes('type="button"'), "자판 단추는 제출 단추가 아니다");
  const form = file.slice(file.indexOf("function CredentialFormMockup("));
  assert.ok(form.includes("setValues((current) => ({ ...current, [field.label]: next }));"), "자판 값 = 같은 `values` 칸");
  // 역검증 — 자판 분기를 끊은 사본은 금액 입력 칸이 되살아나 위 단언(입력 칸 1개)에 걸린다.
  const { poisoned, original, overrides } = poisonedComponentSource("if (sendPage && field.amount) {", "if (false) {");
  assert.notEqual(poisoned, original, "자판 분기 앵커");
  const dirty = renderLandingScreen(transferProps("friend-bank-transfer"), overrides).markup;
  assert.equal((dirty.match(/<input[^>]*>/g) ?? []).length, 2, "오염 사본 = 금액 입력 칸이 돌아온다");
});
