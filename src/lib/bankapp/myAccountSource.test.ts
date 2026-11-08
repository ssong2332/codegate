// ⭐ 2026-11-08 실기기 신고 — 검찰 고급 상품권 구매 화면(한올기프트)의 '출금 계좌 선택' 시트에 다온은행 12,220,000원 · 한결은행 2,000,000원 ·
// 새솔은행 4,000,000원(참가자와 무관한 세션 고정 값 3개). 사용자 결정 D1(카드 → 말한 값 → 고정) · D2(출금 계좌가 나오는 화면 전부) · D3(값이 있으면 그 계좌 하나만).
//
// | # | 고정하는 것 |
// |---|---|
// | MA1 | 재현 — 값이 없으면 종전 3개(신고 그대로) / 카드 값이 있으면 그 계좌 하나만 · 카드 은행 · 잔액(판정표 A1 · A5 · C1 · C2) |
// | MA2 | 판정표 A 전 행 · 칸마다 따로 · 범위 밖 값 무시 + 역검증(우선순위를 뒤집은 사본은 걸린다) |
// | MA3 | 실제 은행을 말함 → 이름 없는 표기(A3) · 렌더에 실제 은행 이름 0 · 고정 은행도 남지 않음 |
// | MA4 | 판정표 K — 카드 칸 읽기 · 저장 · 다른 세션 값 0 · 저장소 이상 = 값 없음 |
// | MA5 | 실제 렌더 — 상품권(신고 화면) · 금 · 출금 예약 · 이체 · 대출 신청 화면 모두 카드 값 / 말한 값을 쓴다 |
// | MA6 | 배선 — 페이지 · 문자 오버레이 · 내 은행 송금 화면 · 난이도 화면 / 카드 원값은 요청에 그대로 싣지 않는다(⭐ 2026-11-09 — 판정표 RQ를 거친 값만 · `cardAccountRequest.test.ts`) |
// ⚠️ 소스를 읽는 단언은 줄 끝(CRLF/LF)과 무관하다(읽은 뒤 `\r\n` → `\n`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { COMPONENT_PATH, renderLandingScreen } from "../mockscreenrender/renderHarness.ts";
import { FICTIONAL_BANK_NAMES, fictionalBalanceFor, myBankNameFor, spokenAccountFrom } from "./bankApp.ts";
import {
  CARD_ACCOUNT_BANK_OPTIONS,
  NAMELESS_BANK_NAME,
  REAL_BANK_NAMES,
  loadCardAccount,
  readCardAccountForm,
  resolveMyAccount,
  saveCardAccount,
  withdrawAccountsFor,
} from "./withdrawAccounts.ts";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const won = (value: number) => `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
const scammer = (text: string) => ({ role: "scammer" as const, text });
const user = (text: string) => ({ role: "user" as const, text });

const LEDGER = "my-account-source-01";
const FIXED_BANK = myBankNameFor(LEDGER);
const FIXED_BALANCE = fictionalBalanceFor(LEDGER);
// 카드 값은 고정 값과 겹치지 않게 고른다(겹치면 "카드 값이 쓰였다"와 "고정 값이 남았다"를 가를 수 없다).
const CARD_BANK = FICTIONAL_BANK_NAMES.find((name) => name !== FIXED_BANK)!;
const CARD_BALANCE = 7_350_000;

test("[MA1] 재현 — 값 0이면 종전 3개(신고 화면) / 카드 값이 있으면 그 계좌 하나만", () => {
  const before = resolveMyAccount({ fixedBankName: FIXED_BANK, fixedBalance: FIXED_BALANCE });
  assert.deepEqual(before, { bankName: FIXED_BANK, balance: FIXED_BALANCE, single: false }, "C2 — 값 0");
  const fixedList = withdrawAccountsFor({ seed: LEDGER, appBankName: before.bankName, primaryBalance: before.balance, single: before.single });
  assert.equal(fixedList.length, 3, "신고 그대로 — 무관한 은행 3개(값이 없을 때만 남는다)");
  assert.equal(new Set(fixedList.map((account) => account.bankName)).size, 3);

  const mine = resolveMyAccount({ card: { bankName: CARD_BANK, balance: CARD_BALANCE }, fixedBankName: FIXED_BANK, fixedBalance: FIXED_BALANCE });
  assert.deepEqual(mine, { bankName: CARD_BANK, balance: CARD_BALANCE, single: true });
  const list = withdrawAccountsFor({ seed: LEDGER, appBankName: mine.bankName, primaryBalance: mine.balance, single: mine.single });
  assert.equal(list.length, 1, "C1 — 다른 은행 계좌 숨김");
  assert.equal(list[0]!.id, "main", "장부 열쇠는 종전 첫 계좌와 같다(출금 가능 금액 · 대출 입금 장부 그대로)");
  assert.equal(list[0]!.bankName, CARD_BANK);
  assert.equal(list[0]!.balance, CARD_BALANCE);
});

/** 판정표 A 전 행(입력 → 기대). */
const A_ROWS: { row: string; card?: { bankName?: string; balance?: number }; spoken?: { bankName?: string; balance?: number; realBank?: true }; bank: string; balance: number; single: boolean }[] = [
  { row: "A1 카드 은행 > 말한 은행", card: { bankName: CARD_BANK }, spoken: { bankName: "보담은행" }, bank: CARD_BANK, balance: FIXED_BALANCE, single: true },
  { row: "A1 카드 은행 > 실제 은행 언급", card: { bankName: CARD_BANK }, spoken: { realBank: true }, bank: CARD_BANK, balance: FIXED_BALANCE, single: true },
  { row: "A2 말한 가상 은행", spoken: { bankName: "보담은행" }, bank: "보담은행", balance: FIXED_BALANCE, single: true },
  { row: "A3 실제 은행 → 이름 없는 표기", spoken: { realBank: true }, bank: NAMELESS_BANK_NAME, balance: FIXED_BALANCE, single: true },
  { row: "A4 값 0", bank: FIXED_BANK, balance: FIXED_BALANCE, single: false },
  { row: "A5 카드 잔액 > 말한 잔액", card: { balance: CARD_BALANCE }, spoken: { balance: 30_000_000 }, bank: FIXED_BANK, balance: CARD_BALANCE, single: true },
  { row: "A6 말한 잔액", spoken: { balance: 30_000_000 }, bank: FIXED_BANK, balance: 30_000_000, single: true },
  { row: "칸마다 따로 — 카드 은행 + 말한 잔액", card: { bankName: CARD_BANK }, spoken: { balance: 30_000_000 }, bank: CARD_BANK, balance: 30_000_000, single: true },
  { row: "칸마다 따로 — 말한 은행 + 카드 잔액", card: { balance: CARD_BALANCE }, spoken: { bankName: "보담은행" }, bank: "보담은행", balance: CARD_BALANCE, single: true },
  { row: "목록 밖 카드 은행 · 범위 밖 잔액 = 없음", card: { bankName: "국민은행", balance: 5_000 }, bank: FIXED_BANK, balance: FIXED_BALANCE, single: false },
  { row: "S8과 같은 범위 밖 말한 잔액 = 없음", spoken: { balance: 2_000_000_000 }, bank: FIXED_BANK, balance: FIXED_BALANCE, single: false },
];

function checkRows(resolve: typeof resolveMyAccount): string[] {
  const failed: string[] = [];
  for (const row of A_ROWS) {
    const got = resolve({ card: row.card, spoken: row.spoken, fixedBankName: FIXED_BANK, fixedBalance: FIXED_BALANCE });
    if (got.bankName !== row.bank || got.balance !== row.balance || got.single !== row.single) failed.push(`${row.row}: ${JSON.stringify(got)}`);
  }
  return failed;
}

test("[MA2] 판정표 A · C 전 행 + 역검증(우선순위 · 계좌 수를 뒤집은 사본은 걸린다)", async () => {
  assert.deepEqual(checkRows(resolveMyAccount), []);
  const source = read("./withdrawAccounts.ts");
  const mutations: [string, string, string][] = [
    ["말한 은행이 카드보다 먼저", "cardBank ?? spokenBank ?? namelessBank", "spokenBank ?? cardBank ?? namelessBank"],
    ["말한 잔액이 카드보다 먼저", "cardBalance ?? spokenBalance ?? fixedBalance", "spokenBalance ?? cardBalance ?? fixedBalance"],
    ["실제 은행 언급을 무시", "spoken?.realBank ? NAMELESS_BANK_NAME : undefined", "undefined"],
    ["값이 있어도 3개", ".some((value) => value !== undefined); // C1", ".some(() => false); // C1"],
  ];
  const dir = mkdtempSync(join(tmpdir(), "my-account-source-"));
  try {
    for (const [name, from, to] of mutations) {
      assert.equal(source.split(from).length - 1, 1, `역검증 앵커가 한 곳이어야 한다: ${from}`);
      const path = join(dir, `${name.replace(/\s/g, "_")}.ts`);
      writeFileSync(path, source.replace(from, to));
      const mutated = (await import(pathToFileURL(path).href)) as { resolveMyAccount: typeof resolveMyAccount };
      assert.ok(checkRows(mutated.resolveMyAccount).length > 0, `역검증 — "${name}" 사본이 통과하면 표 시험이 무력하다`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[MA3] 실제 은행을 말함 → '주거래은행' 표기 · 실제 이름 0 · 고정 은행도 0", () => {
  const turns = [scammer("거래하시는 은행이랑 잔액이 어떻게 되세요?"), user("국민은행이고요, 800만 원 있어요.")];
  const spoken = spokenAccountFrom(turns);
  assert.deepEqual(spoken, { realBank: true, balance: 8_000_000 }, "이름은 싣지 않고 표식만");
  assert.equal(FICTIONAL_BANK_NAMES.includes(NAMELESS_BANK_NAME), false, "가상 은행 목록과 겹치지 않는다(목록 은행으로 오인 0)");
  const text = renderLandingScreen(cashProps({ spokenAccountNow: () => spokenAccountFrom(turns) })).text;
  assert.ok(text.includes(`${NAMELESS_BANK_NAME} 모바일뱅킹`), "머리띠 = 이름 없는 표기");
  assert.ok(text.includes("8,000,000원"), "잔액 = 말한 값");
  assert.equal(text.includes("국민"), false, "실제 은행 이름 0");
  assert.equal(text.includes(FIXED_BANK), false, "고정 가상 은행이 남으면 '내 은행'이 둘로 보인다");
});

test("[MA4] 판정표 K — 카드 칸 읽기 · 저장 · 다른 세션 0 · 저장소 이상", () => {
  // ⭐ 2026-11-09 사용자 결정 — 고르기 목록 = 실제 은행(표 R) 다음 가상 은행(종전: 가상 은행만). 자유 입력 0은 그대로.
  assert.deepEqual(CARD_ACCOUNT_BANK_OPTIONS, [...REAL_BANK_NAMES, ...FICTIONAL_BANK_NAMES], "고르기 목록 = 실제 은행 + 가상 은행");
  assert.deepEqual(readCardAccountForm({ bankName: "", balanceManwon: "" }), { ok: true, card: undefined }, "K1");
  assert.deepEqual(readCardAccountForm({ bankName: "새솔은행", balanceManwon: "1,200" }), { ok: true, card: { bankName: "새솔은행", balance: 12_000_000 } }, "K2 · K3");
  assert.deepEqual(readCardAccountForm({ bankName: "", balanceManwon: "100000" }), { ok: true, card: { balance: 1_000_000_000 } }, "K3 상한 = 10억");
  assert.deepEqual(readCardAccountForm({ bankName: "", balanceManwon: "1" }), { ok: true, card: { balance: 10_000 } }, "K3 하한 = 1만");
  for (const balanceManwon of ["0", "100001", "12.5", "천만", "-3"]) assert.deepEqual(readCardAccountForm({ bankName: "", balanceManwon }), { ok: false }, `K4 ${balanceManwon}`);
  assert.deepEqual(readCardAccountForm({ bankName: "국민은행", balanceManwon: "" }), { ok: false }, "K4 목록 밖 은행");

  const memory = new Map<string, string>();
  const store = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) };
  saveCardAccount("s-1", { bankName: "새솔은행", balance: 12_000_000 }, store);
  assert.deepEqual(loadCardAccount("s-1", store), { bankName: "새솔은행", balance: 12_000_000 }, "K5 · K6");
  assert.equal(loadCardAccount("s-2", store), undefined, "K6 다른 세션 값 0");
  saveCardAccount("s-1", undefined, store);
  assert.equal(memory.size, 0, "K1 값 없음 = 지움");
  memory.set("fv.cardAccount.v1", "{망가진");
  assert.equal(loadCardAccount("s-1", store), undefined, "모양 이상 = 값 없음");
  memory.set("fv.cardAccount.v1", JSON.stringify({ sessionId: "s-1", bankName: "국민은행", balance: 5 }));
  assert.equal(loadCardAccount("s-1", store), undefined, "저장된 값도 다시 거른다(목록 밖 · 범위 밖)");
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.doesNotThrow(() => saveCardAccount("s-1", { balance: 10_000 }, broken));
  assert.equal(loadCardAccount("s-1", broken), undefined, "저장소를 못 쓰면 값 없음");
  assert.equal(loadCardAccount("s-1", undefined), undefined);
});

// ── 실제 렌더 ───────────────────────────────────────────────────────────────────────────────────────────────────
const baseProps = (extra: Record<string, unknown>) => ({
  landingKind: "credential-form",
  entrySurface: "in-call-sms",
  onHide: () => {},
  onClose: () => {},
  bankIdentity: { myBankName: FIXED_BANK, ledgerKey: LEDGER },
  ...extra,
});
const cashProps = (extra: Record<string, unknown> = {}) => baseProps({ title: "예탁금 현금 · 수표 출금 예약", landingId: "cash-withdraw", ...extra });
const CARD = () => ({ bankName: CARD_BANK, balance: CARD_BALANCE });
const SAID = () => spokenAccountFrom([user("거래 은행은 보담은행이고요. 3,000만 원 있어요.")]);

const SCREENS: [string, Record<string, unknown>][] = [
  ["상품권(신고 화면)", baseProps({ title: "문화상품권 구매", landingId: "voucher-purchase" })],
  ["금 거래소", baseProps({ title: "골드바 구매", landingId: "gold-buy" })],
  ["출금 예약", cashProps()],
  [
    "이체(대출금 보관)",
    baseProps({
      title: "보관 계좌 이체",
      landingId: "loan-safe-transfer",
      bankIdentity: undefined,
      prefilledAccount: "302-1184-5527-61",
      prefilledTransfer: { bankName: "누리은행", holder: "노은채", myBankName: FIXED_BANK, ledgerKey: LEDGER },
    }),
  ],
];

test("[MA5] 렌더 — 출금 계좌가 나오는 화면 전부 카드 값 → 말한 값 / 값 0 = 종전", () => {
  assert.ok(CARD_BANK !== "보담은행" && FIXED_BANK !== "보담은행", "시험 값끼리 겹치지 않는다");
  for (const [name, props] of SCREENS) {
    const silent = renderLandingScreen(props).text;
    assert.ok(silent.includes(won(FIXED_BALANCE)), `${name}: 값 0 = 종전 고정 잔액`);

    const carded = renderLandingScreen({ ...props, cardAccountNow: CARD, spokenAccountNow: SAID }).text;
    assert.ok(carded.includes(CARD_BANK), `${name}: 카드 은행(말한 은행보다 먼저)`);
    assert.ok(carded.includes(won(CARD_BALANCE)), `${name}: 카드 잔액(말한 잔액보다 먼저)`);
    assert.equal(carded.includes(won(FIXED_BALANCE)), false, `${name}: 고정 잔액이 남으면 안 된다`);
    assert.equal(carded.includes("보담은행"), false, `${name}: 말한 은행은 카드에 밀린다`);

    const said = renderLandingScreen({ ...props, spokenAccountNow: SAID }).text;
    assert.ok(said.includes("보담은행") && said.includes("30,000,000원"), `${name}: 카드 없으면 말한 값`);
  }
  // 대출 신청 — 입금 계좌(= 뒤 이체 화면의 첫 출금 계좌)도 같은 판정. 첫 단계에는 계좌가 없어 한도 단계로 렌더한다.
  const loanSource = read("../../components/MessengerFakeLanding.tsx");
  const anchor = 'useState<LoanApplyStage>("intro")';
  assert.equal(loanSource.split(anchor).length - 1, 1);
  const overrides = new Map([[resolvePath(COMPONENT_PATH), loanSource.replace(anchor, 'useState<LoanApplyStage>("limit")')]]);
  const loanProps = baseProps({ title: "비대면 대출 신청 안내", landingId: "loan-apply", bankIdentity: undefined, loanContext: { ledgerKey: LEDGER, lenderName: "한빛캐피탈" } });
  const loanCarded = renderLandingScreen({ ...loanProps, cardAccountNow: CARD }, overrides).text;
  assert.ok(loanCarded.includes("입금 계좌") && loanCarded.includes(CARD_BANK), "대출 입금 계좌 = 카드 은행");
  const loanSilent = renderLandingScreen(loanProps, overrides).text;
  assert.ok(loanSilent.includes(FIXED_BANK) && !loanSilent.includes(CARD_BANK), "값 0 = 종전 입금 계좌");
});

test("[MA6] 배선 — 페이지 · 문자 오버레이 · 내 은행 송금 · 난이도 화면 · 서버로 가지 않는다", () => {
  const page = read("../../app/session/play/page.tsx");
  assert.ok(page.includes('cardAccountNow={() => loadCardAccount(sessionId ?? "")}'), "통화 화면 → 문자 오버레이");
  assert.ok(page.includes("card: loadCardAccount(sid),") && page.includes("spoken: spokenAccountFrom([...messages, ...transcriptRef.current], realBankMentionsIn),"), "내 은행 송금 화면도 같은 판정");
  assert.ok(page.includes("singleAccount={bankTransfer.mine.single}"), "내 은행 송금 화면 C1");
  const overlay = read("../../components/InCallSmsOverlay.tsx");
  assert.ok(overlay.includes("cardAccountNow={cardAccountNow}"));
  const landing = read("../../components/MessengerFakeLanding.tsx");
  assert.equal((landing.match(/cardAccountNow=\{cardAccountNow\}/g) ?? []).length, 5, "출금 계좌가 나오는 화면 5곳");
  assert.equal((landing.match(/resolveMyAccount\(/g) ?? []).length, 5, "다섯 화면이 같은 판정 함수 하나를 쓴다(복사본 0)");
  for (const call of landing.match(/(onCredentialSubmit|onHeld|onSubmit)\([^)]*\)/g) ?? []) assert.ok(!/card|mine|balance/i.test(call), `콜백에 값 0: ${call}`);

  const difficulty = read("../../app/scenarios/difficulty/page.tsx");
  assert.ok(difficulty.includes("saveCardAccount(sessionId, cardAccount);"), "난이도 화면 — 이 탭에 저장");
  const request = difficulty.slice(difficulty.indexOf("const result = await createSession("), difficulty.indexOf("(stage) => setPrepDone"));
  assert.ok(request.length > 0 && !/cardAccount|balance/i.test(request), "createSession 요청에 카드 원값 0(⭐ 2026-11-09 — 판정표 RQ를 거친 `personaRequest`만)");
  assert.ok(difficulty.includes("extra={<CardAccountFields"), "같은 '내 정보' 블록 안");
  const api = read("../api/types.ts");
  assert.equal(/cardAccount/i.test(api), false, "API 타입에 카드 계좌 필드 0");
});
