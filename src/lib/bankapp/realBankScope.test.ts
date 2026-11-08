// ⭐ 2026-11-09 사용자 결정 — 내 출금 계좌에 실제 은행 이름 허용 · **'내 계좌' 줄에만 글자로**(로고 · 브랜드 색 0) · 사기 쪽은 가상 이름 그대로 ·
// 카드 값은 그 훈련 한 번만. 판정표 정본 = `withdrawAccounts.ts`(표 R · A1′ · A3a · A3b · P · H) · `bankApp.ts`(S2′ · S2″).
// 신고: '은행 사칭(직접 확인)' 고급 보호계좌 이체 화면 — 출금 계좌 선택 시트에 해담은행 · 가온은행 · 미르은행(가상 3개)만 있어 현실과 다르다.
//
// | # | 고정하는 것 |
// |---|---|
// | RB1 | 재현 — 값 0이면 종전 가상 3개 / 카드에 실제 은행 → 그 계좌 하나만 · 계좌 줄에 실제 이름 · 머리 · 꼬리말 · 속성에는 0(판정표 P · H) |
// | RB2 | 판정표 A1′ · A3a · A3b 행 + 역검증(실제 은행을 카드에서 거르는 사본 · 알아본 이름을 버리는 사본은 걸린다) |
// | RB3 | 판정표 S2′ — 표 R 전 행 알아봄 · 일반어 · 카드사 · 택배 · 앞 경계 오탐 0 · 고쳐 말하면 마지막 · 알아보기 함수 없으면 종전(S2″) |
// | RB4 | 판정표 H — 가상 · 주거래은행 = 종전 표기 / 실제 은행 = 이름 뺀 중립 표기 |
// | RB5 | 가드 범위 — src 전체(시험 · 주석 제외)에 실제 은행 표기 · 별칭 글자 = 표 R 블록 · 자막 가드 사본 두 곳뿐 + 역검증(다른 파일에 섞이면 걸린다) |
// | RB6 | 렌더 역검증 — 머리띠 · 꼬리말 · 인증 시트 · 송금 앱 머리를 실제 이름 그대로 쓰는 사본은 RB1 판정에 걸린다 |
// | RB7 | 배선 — 카드 고르기 칸 = 실제 → 가상 묶음 · 말한 실제 은행 이름은 서버 · 요청 · 콜백 0(판정표 P6) |
// ⚠️ 소스를 읽는 단언은 줄 끝(CRLF/LF)과 무관하다(읽은 뒤 `\r\n` → `\n`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { poisonedComponentSource, renderLandingScreen } from "../mockscreenrender/renderHarness.ts";
import { FICTIONAL_BANK_NAMES, fictionalBalanceFor, myBankNameFor, spokenAccountFrom } from "./bankApp.ts";
import {
  CARD_ACCOUNT_BANK_GROUPS,
  CARD_ACCOUNT_BANK_OPTIONS,
  MY_BANK_NEUTRAL_APP_NAME,
  NAMELESS_BANK_NAME,
  REAL_BANK_NAMES,
  loadCardAccount,
  myBankAppName,
  myBankBrand,
  readCardAccountForm,
  realBankMentionsIn,
  resolveMyAccount,
  saveCardAccount,
  withdrawAccountsFor,
} from "./withdrawAccounts.ts";

const ROOT = new URL("../../../", import.meta.url);
const readRel = (relative: string) => readFileSync(new URL(relative, ROOT), "utf8").replace(/\r\n/g, "\n");
const user = (text: string) => ({ role: "user" as const, text });
const scammer = (text: string) => ({ role: "scammer" as const, text });

const LEDGER = "real-bank-scope-01";
const FIXED_BANK = myBankNameFor(LEDGER);
const FIXED_BALANCE = fictionalBalanceFor(LEDGER);
const REAL = "KB국민은행";

// ── RB1 재현 · 렌더 판정 ───────────────────────────────────────────────────────────────────────────────────────
const baseProps = (extra: Record<string, unknown>) => ({
  landingKind: "credential-form",
  entrySurface: "in-call-sms",
  onHide: () => {},
  onClose: () => {},
  bankIdentity: { myBankName: FIXED_BANK, ledgerKey: LEDGER },
  ...extra,
});
const transferProps = (landingId: string, title: string) =>
  baseProps({
    title,
    landingId,
    bankIdentity: undefined,
    prefilledAccount: "100-2043-7788-21",
    prefilledTransfer: { bankName: "새솔은행", holder: "문성호", myBankName: FIXED_BANK, ledgerKey: LEDGER },
  });
const SCREENS: [string, Record<string, unknown>][] = [
  ["보호계좌 이체(신고 화면)", transferProps("protect-account-transfer", "보호계좌 이체")],
  ["대출금 보관 이체", transferProps("loan-safe-transfer", "보관 계좌 이체")],
  ["상품권", baseProps({ title: "문화상품권 구매", landingId: "voucher-purchase" })],
  ["금 거래소", baseProps({ title: "골드바 구매", landingId: "gold-buy" })],
  ["출금 예약", baseProps({ title: "예탁금 현금 · 수표 출금 예약", landingId: "cash-withdraw" })],
];

/** 계좌 줄 꼴(판정표 P1 · P2) — `accountLabel` "{은행} 123-****-4567" · 시트 "{은행} 입출금통장". */
const ALLOWED_LINE = (name: string) => new RegExp(`^${name} (?:\\d{3}-\\*{4}-\\d{4}|입출금통장|급여통장)$`);

/** 판정표 P — 렌더에서 실제 은행 이름이 나온 곳이 전부 '내 계좌' 줄인가. 위반 목록을 돌려준다. */
function scopeViolations(markup: string, text: string, name: string): string[] {
  const violations = text.split("\n").filter((line) => line.includes(name) && !ALLOWED_LINE(name).test(line));
  const inText = text.split(name).length - 1;
  const inMarkup = markup.split(name).length - 1;
  if (inMarkup !== inText) violations.push(`속성 · 숨은 글자에 ${inMarkup - inText}회(aria-label · title 등 — 판정표 P4)`);
  return violations;
}

test("[RB1] 재현 — 값 0 = 종전 가상 3개 / 카드 실제 은행 = 그 계좌 하나 · 계좌 줄에만 실제 이름(머리 · 꼬리말 · 속성 0)", () => {
  // 신고 그대로: 값이 없으면 가상 은행 3개(실제 은행 0).
  const before = resolveMyAccount({ fixedBankName: FIXED_BANK, fixedBalance: FIXED_BALANCE });
  const list = withdrawAccountsFor({ seed: LEDGER, appBankName: before.bankName, primaryBalance: before.balance, single: before.single });
  assert.equal(list.length, 3);
  assert.ok(list.every((account) => FICTIONAL_BANK_NAMES.includes(account.bankName)), "값 0 = 가상 은행만(종전)");

  const card = () => ({ bankName: REAL, balance: 7_350_000 });
  for (const [name, props] of SCREENS) {
    const silent = renderLandingScreen(props);
    assert.equal(REAL_BANK_NAMES.some((real) => silent.text.includes(real)), false, `${name}: 값 0이면 실제 은행 이름 0`);

    const carded = renderLandingScreen({ ...props, cardAccountNow: card });
    assert.ok(new RegExp(`^${REAL} \\d{3}-\\*{4}-\\d{4}$`, "m").test(carded.text), `${name}: 출금 · 결제 계좌 줄 = 실제 은행`);
    assert.ok(carded.text.includes("7,350,000원"), `${name}: 카드 잔액`);
    assert.deepEqual(scopeViolations(carded.markup, carded.text, REAL), [], `${name}: 실제 이름은 계좌 줄에만`);
    assert.equal(carded.text.includes(FIXED_BANK), false, `${name}: 고정 가상 은행이 남지 않는다('내 은행' 둘 0)`);
    assert.equal(FICTIONAL_BANK_NAMES.filter((bank) => bank !== "새솔은행").some((bank) => carded.text.includes(bank)), false, `${name}: 다른 가상 계좌 숨김(C1)`);
    if (name.includes("이체")) assert.ok(carded.markup.includes("100-2043-7788-21"), `${name}: 받는 계좌(사기 쪽)는 그대로`);
  }
  // 출금 예약 = 내 은행 사이트 머리 · 꼬리말 — 실제 은행이면 이름을 뺀 중립 표기(판정표 H2).
  const cash = renderLandingScreen({ ...SCREENS[4]![1], cardAccountNow: card }).text.split("\n");
  assert.ok(cash.filter((line) => line === MY_BANK_NEUTRAL_APP_NAME).length >= 2, "머리띠 · 꼬리말 = '모바일뱅킹'");
  // 가상 은행 카드면 종전 그대로(H1).
  const fictional = renderLandingScreen({ ...SCREENS[4]![1], cardAccountNow: () => ({ bankName: "보담은행" }) }).text;
  assert.ok(fictional.includes("보담은행 모바일뱅킹"), "가상 은행 = 종전 머리띠");
});

// ── RB2 판정표 A′ ────────────────────────────────────────────────────────────────────────────────────────────
const A_ROWS: { row: string; card?: { bankName?: string }; spoken?: Parameters<typeof resolveMyAccount>[0]["spoken"]; bank: string; single: boolean }[] = [
  { row: "A1′ 카드 실제 은행", card: { bankName: REAL }, bank: REAL, single: true },
  { row: "A1′ 카드 실제 > 말한 실제", card: { bankName: REAL }, spoken: { realBank: true, realBankName: "신한은행" }, bank: REAL, single: true },
  { row: "A1′ 카드 가상 > 말한 실제", card: { bankName: "보담은행" }, spoken: { realBank: true, realBankName: "신한은행" }, bank: "보담은행", single: true },
  { row: "A3a 말한 실제 은행(표 R)", spoken: { realBank: true, realBankName: "NH농협은행" }, bank: "NH농협은행", single: true },
  { row: "A3b 표 R이 모르는 은행", spoken: { realBank: true }, bank: NAMELESS_BANK_NAME, single: true },
  { row: "표 R 밖 표기는 이름으로 쓰지 않는다(A3b로)", spoken: { realBank: true, realBankName: "국민은행" }, bank: NAMELESS_BANK_NAME, single: true },
  { row: "카드 목록 밖 표기 = 없음", card: { bankName: "국민은행" }, bank: FIXED_BANK, single: false },
  { row: "A4 값 0", bank: FIXED_BANK, single: false },
];

function failedRows(resolve: typeof resolveMyAccount): string[] {
  return A_ROWS.flatMap((row) => {
    const got = resolve({ card: row.card, spoken: row.spoken, fixedBankName: FIXED_BANK, fixedBalance: FIXED_BALANCE });
    return got.bankName === row.bank && got.single === row.single ? [] : [`${row.row}: ${JSON.stringify(got)}`];
  });
}

test("[RB2] 판정표 A1′ · A3a · A3b + 역검증", async () => {
  assert.deepEqual(failedRows(resolveMyAccount), []);
  const source = readFileSync(new URL("./withdrawAccounts.ts", import.meta.url), "utf8");
  const mutations: [string, string, string][] = [
    ["카드에서 실제 은행을 거름(종전)", "return CARD_ACCOUNT_BANK_OPTIONS.includes(bankName);", "return BANKS.includes(bankName);"],
    ["알아본 이름을 버림(종전 A3)", "? spoken.realBankName // A3a", "? undefined // A3a"],
  ];
  const dir = mkdtempSync(join(tmpdir(), "real-bank-scope-"));
  try {
    for (const [name, from, to] of mutations) {
      assert.equal(source.split(from).length - 1, 1, `역검증 앵커가 한 곳: ${from}`);
      const path = join(dir, `${mutations.indexOf(mutations.find((m) => m[0] === name)!)}.ts`);
      writeFileSync(path, source.replace(from, to));
      const mutated = (await import(pathToFileURL(path).href)) as { resolveMyAccount: typeof resolveMyAccount };
      assert.ok(failedRows(mutated.resolveMyAccount).length > 0, `역검증 — "${name}" 사본이 통과하면 표 시험이 무력하다`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── RB3 판정표 S2′ ───────────────────────────────────────────────────────────────────────────────────────────
/** 표 R 전 행 — 참가자가 실제로 말할 꼴(음성 인식 표기 포함) → 표기. */
const SAID: [string, string][] = [
  ["국민은행이고요", "KB국민은행"],
  ["KB 국민은행이요", "KB국민은행"],
  ["신한은행 써요", "신한은행"],
  ["신한이요", "신한은행"],
  ["우리은행이에요", "우리은행"],
  ["하나은행이요", "하나은행"],
  ["농협이에요", "NH농협은행"],
  ["지역농협 통장이요", "NH농협은행"],
  ["기업은행이요", "IBK기업은행"],
  ["IBK요", "IBK기업은행"],
  ["카카오뱅크요", "카카오뱅크"],
  ["카뱅이요", "카카오뱅크"],
  ["토스뱅크 써요", "토스뱅크"],
  ["케이뱅크요", "케이뱅크"],
  ["우체국 통장이요", "우체국"],
  ["우체국이요", "우체국"],
  ["새마을금고요", "새마을금고"],
  ["신협이요", "신협"],
  ["수협이요", "Sh수협은행"],
  ["SC제일은행이요", "SC제일은행"],
  ["씨티은행이요", "한국씨티은행"],
  ["대구은행이요", "iM뱅크"],
  ["아이엠뱅크요", "iM뱅크"],
  ["부산은행이요", "부산은행"],
  ["경남은행이요", "경남은행"],
  ["광주은행이요", "광주은행"],
  ["전북은행이요", "전북은행"],
  ["제주은행이요", "제주은행"],
];
/** 실제 은행 언급이 아닌 말(오탐 0). */
const NOT_SAID = [
  "우리 은행은 어디 있어요?",
  "하나 은행에 물어볼게요",
  "당신한테 왜 말해요",
  "신한카드 쓰는데요",
  "농협카드요",
  "우체국 택배가 왔다고요?",
  "토스로 보냈어요",
  "국민 여러분",
  "인수협의 중이에요",
  "통신협회에서 왔어요?",
];

test("[RB3] 판정표 S2′ — 표 R 전 행 · 오탐 0 · 고쳐 말하면 마지막 · 함수 없으면 종전(S2″)", () => {
  const covered = new Set(SAID.map(([, name]) => name));
  assert.deepEqual(REAL_BANK_NAMES.filter((name) => !covered.has(name)), [], "표 R 전 행에 시험 문장이 있다");
  for (const [text, name] of SAID) {
    assert.deepEqual(spokenAccountFrom([user(text)], realBankMentionsIn), { realBank: true, realBankName: name }, text);
  }
  for (const text of NOT_SAID) assert.equal(spokenAccountFrom([user(text)], realBankMentionsIn).realBankName, undefined, text);

  // 재현 대사(MA3) — 이름 + 잔액.
  const turns = [scammer("거래하시는 은행이랑 잔액이 어떻게 되세요?"), user("국민은행이고요, 800만 원 있어요.")];
  assert.deepEqual(spokenAccountFrom(turns, realBankMentionsIn), { realBank: true, realBankName: REAL, balance: 8_000_000 });
  assert.deepEqual(spokenAccountFrom(turns), { realBank: true, balance: 8_000_000 }, "S2″ — 함수 없으면 종전(이름 0)");
  // 마지막 언급(S9) — 가상 ↔ 실제를 고쳐 말함.
  assert.deepEqual(spokenAccountFrom([user("새솔은행이요."), user("아 아니다, 농협이에요.")], realBankMentionsIn), { realBank: true, realBankName: "NH농협은행" }, "종전 S2 한계가 풀린다");
  assert.deepEqual(spokenAccountFrom([user("신한은행 말고 새솔은행이에요.")], realBankMentionsIn), { bankName: "새솔은행" });
  assert.deepEqual(spokenAccountFrom([user("새솔은행 말고 신한은행이에요.")], realBankMentionsIn), { realBank: true, realBankName: "신한은행" });
  assert.deepEqual(spokenAccountFrom([user("미래은행이에요.")], realBankMentionsIn), { realBank: true }, "표 R이 모르는 '○○은행' = A3b");
  // 사기범이 말한 실제 은행은 참가자 은행이 아니다(S10).
  assert.deepEqual(spokenAccountFrom([scammer("국민은행 계좌가 도용됐습니다.")], realBankMentionsIn), {});
  // 화면 — 말한 실제 은행이 계좌 줄에(머리는 중립).
  const said = renderLandingScreen({ ...SCREENS[4]![1], spokenAccountNow: () => spokenAccountFrom(turns, realBankMentionsIn) });
  assert.ok(said.text.includes(`${REAL} `) && said.text.includes("8,000,000원"));
  assert.deepEqual(scopeViolations(said.markup, said.text, REAL), []);
});

test("[RB4] 판정표 H — 가상 · 주거래은행 = 종전 / 실제 은행 = 이름 뺀 표기", () => {
  for (const bank of FICTIONAL_BANK_NAMES) {
    assert.equal(myBankAppName(bank), `${bank} 모바일뱅킹`, `H1 ${bank}`);
    assert.equal(myBankAppName(bank, "송금"), `${bank} 송금`);
    assert.equal(myBankBrand(bank), bank);
  }
  assert.equal(myBankAppName(NAMELESS_BANK_NAME), `${NAMELESS_BANK_NAME} 모바일뱅킹`, "H1 주거래은행 = 종전 그대로(요청 밖)");
  for (const bank of REAL_BANK_NAMES) {
    assert.equal(myBankAppName(bank), "모바일뱅킹", `H2 ${bank}`);
    assert.equal(myBankAppName(bank, "송금"), "송금");
    assert.equal(myBankBrand(bank), "");
  }
  assert.equal(REAL_BANK_NAMES.some((bank) => FICTIONAL_BANK_NAMES.includes(bank) || bank === NAMELESS_BANK_NAME), false, "표 R · 가상 · 주거래은행 겹침 0");
});

// ── RB5 가드 범위 ───────────────────────────────────────────────────────────────────────────────────────────
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
/** 실제 은행을 가리키는 글자(표기 + 별칭 핵심어 — 표기에서 '은행'을 뗀 이름 포함). */
const REAL_TOKENS = [
  ...REAL_BANK_NAMES,
  "국민은행",
  "농협",
  "기업은행",
  "제일은행",
  "씨티",
  "대구은행",
  "카뱅",
  "K뱅크",
  "아이엠뱅크",
  "수협",
  "신협",
  "새마을",
];
const BLOCK_START = "// ── 실제 은행 표 R 시작";
const BLOCK_END = "// ── 실제 은행 표 R 끝";
/** 실제 은행 이름을 지우는 쪽(통화 자막 가드 사본) — 이름이 있어야 지운다. */
const SCRUBBER = "src/lib/realtime/liveTranscriptGuard.ts";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** 한 파일에서 표 R 블록 밖에 나온 실제 은행 글자(주석 제외). */
function leaksIn(path: string, source: string): string[] {
  let code = source.replace(/\r\n/g, "\n");
  if (path.endsWith("src/lib/bankapp/withdrawAccounts.ts")) {
    const start = code.indexOf(BLOCK_START);
    const end = code.indexOf(BLOCK_END);
    assert.ok(start > 0 && end > start, "표 R 블록 표식");
    code = code.slice(0, start) + code.slice(end);
  }
  const stripped = stripComments(code);
  return REAL_TOKENS.filter((token) => stripped.includes(token)).map((token) => `${path}: ${token}`);
}

test("[RB5] 가드 범위 — 실제 은행 글자는 표 R 블록 · 자막 가드 사본에만 + 역검증", () => {
  const root = new URL("../../", import.meta.url);
  const files = sourceFiles(root.pathname.replace(/^\/([A-Za-z]:)/, "$1").replace(/\/$/, "")).map((path) => path.replace(/\\/g, "/"));
  assert.ok(files.length > 200, `src 파일을 실제로 훑는다(${files.length})`);
  const leaks = files.filter((path) => !path.endsWith(SCRUBBER)).flatMap((path) => leaksIn(path, readFileSync(path, "utf8")));
  assert.deepEqual(leaks, [], "표 R 밖 실제 은행 글자 0(화면 · 문구 · 사기 쪽 · 리포트 · 문자)");
  // 블록 안에는 실제로 있다(표가 비면 이 시험이 무력하다).
  const own = readRel("src/lib/bankapp/withdrawAccounts.ts");
  const block = own.slice(own.indexOf(BLOCK_START), own.indexOf(BLOCK_END));
  assert.ok(REAL_BANK_NAMES.every((name) => block.includes(`"${name}"`)));
  // 역검증 — 다른 파일 · 블록 밖에 섞으면 걸린다.
  const overlay = readRel("src/components/BankAppOverlay.tsx");
  assert.ok(leaksIn("src/components/BankAppOverlay.tsx", overlay.replace('"송금")', '"KB국민은행 송금")')).length > 0, "화면 코드에 섞임");
  assert.ok(leaksIn("src/lib/bankapp/withdrawAccounts.ts", own.replace(BLOCK_END, `const X = "농협";\n${BLOCK_END}`)).length === 0, "블록 안 = 허용");
  assert.ok(leaksIn("src/lib/bankapp/withdrawAccounts.ts", own.replace("export const NAMELESS_BANK_NAME", 'const LEAK = "신한은행";\nexport const NAMELESS_BANK_NAME')).length > 0, "블록 밖 = 걸림");
  // 기존 가드는 그대로 — 사기범 대사 치환 표(서버) · `bankApp.ts`의 실존 은행명 0([BA-1 A5])은 무변경.
  assert.ok(readRel("functions/src/guardrails/realFinancialNames.ts").includes('bank("국민은행"'), "서버 사기범 대사 치환 표 그대로");
});

// ── RB6 렌더 역검증 ─────────────────────────────────────────────────────────────────────────────────────────
test("[RB6] 렌더 역검증 — 머리 · 꼬리말 · 인증 앱 이름을 실제 이름 그대로 쓰는 사본은 걸린다", () => {
  const card = () => ({ bankName: REAL });
  const poisons: [string, string, string, Record<string, unknown>][] = [
    [
      "출금 예약 머리띠",
      "const bankHeaderName = bankIdentity?.myBankName ? myBankAppName(appBankName) : issuerNameOf(copy.issuerLabel);",
      "const bankHeaderName = bankIdentity?.myBankName ? `${appBankName} 모바일뱅킹` : issuerNameOf(copy.issuerLabel);",
      SCREENS[4]![1],
    ],
    [
      "출금 예약 꼬리말",
      "bankIdentity?.myBankName ? myBankBrand(appBankName) || MY_BANK_NEUTRAL_APP_NAME : issuerNameOf(copy.issuerLabel);",
      "bankIdentity?.myBankName ? appBankName : issuerNameOf(copy.issuerLabel);",
      SCREENS[4]![1],
    ],
  ];
  for (const [name, from, to, props] of poisons) {
    const { original, poisoned, overrides } = poisonedComponentSource(from, to);
    assert.notEqual(poisoned, original, `${name}: 오염 지점이 있다`);
    const result = renderLandingScreen({ ...props, cardAccountNow: card }, overrides);
    assert.ok(scopeViolations(result.markup, result.text, REAL).length > 0, `${name}: 사본이 통과하면 판정이 무력하다`);
  }
  // 인증 시트 · 송금 앱 머리(정적 렌더 첫 화면에 없는 곳)는 소스로 고정한다.
  const landing = readRel("src/components/MessengerFakeLanding.tsx");
  assert.equal(landing.includes("`${appBankName} 모바일뱅킹`"), false, "내 은행 이름 + 모바일뱅킹 직접 조립 0");
  assert.equal((landing.match(/appName=\{myBankAppName\(appBankName\)\}/g) ?? []).length, 4, "인증 시트 4곳 = 판정표 H");
  const overlay = readRel("src/components/BankAppOverlay.tsx");
  assert.ok(overlay.includes('{myBankAppName(myBankName, "송금")}') && overlay.includes('aria-label={myBankAppName(myBankName, "송금")}'), "송금 앱 머리 · 이름표");
  assert.ok(overlay.includes("appName={myBankBrand(myBankName) || MY_BANK_NEUTRAL_APP_NAME}"), "송금 앱 인증 시트");
  assert.equal(/\{myBankName\} 송금|`\$\{myBankName\} 송금`|appName=\{myBankName\}/.test(overlay), false, "날 이름 0");
});

// ── RB7 배선 ────────────────────────────────────────────────────────────────────────────────────────────────
test("[RB7] 배선 — 카드 칸 = 실제 → 가상 묶음 · 카드 값 그 훈련 한 번 · 실제 이름은 서버 · 요청 · 콜백 0", () => {
  assert.deepEqual(CARD_ACCOUNT_BANK_GROUPS.map((group) => group.banks), [REAL_BANK_NAMES, FICTIONAL_BANK_NAMES]);
  assert.deepEqual(CARD_ACCOUNT_BANK_OPTIONS, [...REAL_BANK_NAMES, ...FICTIONAL_BANK_NAMES]);
  const fields = readRel("src/components/CardAccountFields.tsx");
  assert.ok(fields.includes("<optgroup key={group.label} label={group.label}>") && !/<input[^>]*bank/i.test(fields), "고르기만(자유 입력 0)");
  for (const name of REAL_BANK_NAMES) assert.deepEqual(readCardAccountForm({ bankName: name, balanceManwon: "" }), { ok: true, card: { bankName: name } }, `K2 ${name}`);
  // K5 · K6 그대로 — 그 세션 한 번만.
  const memory = new Map<string, string>();
  const store = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) };
  saveCardAccount("s-1", { bankName: REAL }, store);
  assert.deepEqual(loadCardAccount("s-1", store), { bankName: REAL });
  assert.equal(loadCardAccount("s-2", store), undefined, "다음 훈련(다른 세션) = 값 없음");

  const page = readRel("src/app/session/play/page.tsx");
  assert.equal((page.match(/spokenAccountFrom\(\[\.\.\.messages, \.\.\.transcriptRef\.current\], realBankMentionsIn\)/g) ?? []).length, 2, "두 여는 길 모두 S2′");
  for (const path of ["src/lib/api/types.ts", "src/lib/realtime/contextInjection.ts"]) {
    assert.equal(/realBankName|cardAccount/i.test(readRel(path)), false, `${path}: 실제 은행 값 0`);
  }
  const landing = readRel("src/components/MessengerFakeLanding.tsx");
  for (const call of landing.match(/(onCredentialSubmit|onHeld|onSubmit|onSubmitted)\([^)]*\)/g) ?? []) assert.ok(!/realBank|bankName|mine/i.test(call), `콜백에 값 0: ${call}`);
  assert.equal(/realBank/.test(readRel("src/components/BankAppOverlay.tsx")), false, "송금 앱은 판정된 이름만 받는다");
});
