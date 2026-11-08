// ⭐ 2026-11-08(라이브 재시험 7 · 사용자 결정 "말한 값에 맞추기") — 앱 안 현금 출금 예약 화면의 출금 계좌 은행 · 잔액 = 참가자가 통화에서 말한 값.
// 실측: 참가자 "거래 은행은 새솔은행이고요. 1,200만 원쯤 있어요" → 화면 "늘봄은행 300-****-8317 · 24,820,000원"(세션 고정 값).
//
// | # | 고정하는 것 |
// |---|---|
// | SA1 | 재현 대사 → 새솔은행 · 12,000,000원 / 아무 말 없으면 고정 값(판정표 S1 · S3 · S4 · S11) |
// | SA2 | 실제 은행명은 쓰지 않는다 — 마지막 언급이 실제 은행이면 고정 가상 은행 · 금액만 반영(S2) |
// | SA3 | 사기범이 말한 금액 · 되묻기 · 보내기 말 금액은 잔액이 아니다 / 앞 질문이 잔액을 물었으면 숫자만 답해도 잔액(S5 ~ S7 · S10) |
// | SA4 | 비정상 금액(1만 원 미만 · 10억 원 초과)은 건너뜀 · 여러 번 말하면 마지막 유효 값(S8 · S9) |
// | SA5 | 실제 렌더 — 출금 예약 화면 머리띠 · 출금 계좌 줄 · 출금 가능 금액이 말한 값 / 말하지 않았으면 종전 고정 값 |
// | SA6 | 배선 — 페이지가 대사(참가자 · 사기범 순서 그대로)로 화면을 여는 순간 값을 만들고, 값은 화면 안에서만 쓴다(네트워크 · 콜백 0 · G138) |
// | SA7 | 금 거래소 화면도 같은 규칙(S12 · 2026-11-08 사용자 결정) — 결제 계좌 은행 · 출금 가능 금액 = 말한 값 / 말 없으면 고정 값 |
// | SA8 | 100만 원 미만 잔액은 그대로 두고 출금 예약은 최소 금액에 걸린다(S8 · 2026-11-08 사용자 결정 "그대로 둠") |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderLandingScreen } from "../mockscreenrender/renderHarness.ts";
import { FICTIONAL_BANK_NAMES, fictionalBalanceFor, myBankNameFor, spokenAccountFrom } from "./bankApp.ts";
import { withdrawAccountsFor } from "./withdrawAccounts.ts";
import { cashReserveError } from "./cashWithdraw.ts";

const scammer = (text: string) => ({ role: "scammer" as const, text });
const user = (text: string) => ({ role: "user" as const, text });

// 라이브 재시험 7 대사(참가자 대사는 실측 원문 · 앞 사기범 질문은 대표 문형).
const LIVE_TURNS = [scammer("본인 자산 확인을 위해 거래하시는 은행과 잔액을 말씀해 주시겠습니까?"), user("거래 은행은 새솔은행이고요. 1,200만 원쯤 있어요.")];

test("[SA1] 재현 — 새솔은행 · 1,200만 원 → 새솔은행 · 12,000,000원 / 말 없으면 고정 값", () => {
  assert.deepEqual(spokenAccountFrom(LIVE_TURNS), { bankName: "새솔은행", balance: 12_000_000 });
  const seed = "spoken-seed-1";
  const spoken = spokenAccountFrom(LIVE_TURNS);
  const main = withdrawAccountsFor({ seed, appBankName: spoken.bankName ?? myBankNameFor(seed), primaryBalance: spoken.balance ?? fictionalBalanceFor(seed) })[0]!;
  assert.equal(main.bankName, "새솔은행");
  assert.equal(main.balance, 12_000_000);
  // S3 · 둘 다 없음.
  assert.deepEqual(spokenAccountFrom([]), {});
  assert.deepEqual(spokenAccountFrom([scammer("거래 은행이 어디세요?"), user("그건 왜요?")]), {});
  // S11 · 한쪽만.
  assert.deepEqual(spokenAccountFrom([user("새솔 은행이에요.")]), { bankName: "새솔은행" }, "띄어 써도 같은 이름");
  assert.deepEqual(spokenAccountFrom([user("통장에 천이백만 원 있어요.")]), { balance: 12_000_000 }, "한글 수사");
  for (const name of FICTIONAL_BANK_NAMES) assert.equal(spokenAccountFrom([user(`${name} 써요.`)]).bankName, name);
});

test("[SA2] 실제 은행명 — 마지막 언급이 실제 은행이면 은행은 고정 가상 은행 · 금액만 반영", () => {
  // ⭐ 2026-11-08(판정표 A3) — 실제 은행 언급은 `realBank` 표식만 남는다(이름은 0 · 화면은 이름 없는 표기). 종전 기대값 `{ balance }` · `{}`에 표식을 더했다.
  assert.deepEqual(spokenAccountFrom([user("국민은행이고요, 잔액은 800만 원 정도요.")]), { realBank: true, balance: 8_000_000 });
  for (const real of ["신한은행", "KB국민은행", "농협", "카카오뱅크", "토스뱅크", "케이뱅크", "우체국", "새마을금고", "하나은행", "우리은행"]) {
    // "은행" · "뱅크"가 붙은 꼴만 언급으로 센다(S2 한계) — 농협 · 우체국 · 새마을금고는 언급 아님 = 표식 0.
    assert.deepEqual(spokenAccountFrom([user(`${real}이에요.`)]), /(?:은행|뱅크)$/.test(real) ? { realBank: true } : {}, real);
  }
  for (const real of ["신한은행", "KB국민은행", "카카오뱅크", "토스뱅크", "케이뱅크", "하나은행", "우리은행", "농협은행"]) {
    assert.deepEqual(spokenAccountFrom([user("새솔은행이요."), user(`아 아니다, ${real}이에요.`)]), { realBank: true }, `${real}로 고쳐 말함 → 이름 없는 표기`);
  }
  // ⚠️ 한계(판정표 S2 주석) — 실제 은행 이름 목록을 두지 않아 "은행" · "뱅크"가 붙지 않은 단독 이름으로 고쳐 말하면 앞의 가상 은행이 남는다.
  assert.deepEqual(spokenAccountFrom([user("새솔은행이요."), user("아 아니다, 농협이에요.")]), { bankName: "새솔은행" }, "한계 고정 — 바꾸면 이 줄과 주석을 함께 고칠 것");
  assert.deepEqual(spokenAccountFrom([user("새솔은행이요."), user("그럼 은행 가야 돼요?")]), { bankName: "새솔은행" }, "띄어 쓴 일반 '은행'은 언급 아님");
  assert.deepEqual(spokenAccountFrom([user("거래은행은 통장은새솔은행이에요.")]), { bankName: "새솔은행" }, "붙여 쓴 일반어 앞말 · 앞에 붙은 낱말");
  assert.deepEqual(spokenAccountFrom([user("신한은행 말고 새솔은행이에요.")]), { bankName: "새솔은행" }, "같은 대사 안 마지막 언급");
  assert.deepEqual(spokenAccountFrom([user("우리 은행은 새솔은행이에요.")]), { bankName: "새솔은행" }, "'우리 은행'(띄어 쓴 일반어)은 실제 은행 아님");
  // 사기범이 말한 은행은 참가자 은행이 아니다(S10과 같은 규칙).
  assert.deepEqual(spokenAccountFrom([scammer("새솔은행 계좌로 확인됩니다.")]), {});
});

test("[SA3] 사기범 금액 · 되묻기 · 보내기 말은 잔액 아님 / 잔액 질문 뒤 숫자 답은 잔액", () => {
  assert.deepEqual(spokenAccountFrom([scammer("잔액 1,200만 원 전부 현금으로 찾으셔야 합니다."), user("네.")]), {}, "S10 사기범 금액");
  assert.deepEqual(spokenAccountFrom([scammer("오늘 300만 원 이체하셔야 합니다."), user("300만 원이요?")]), {}, "S7 되묻기");
  assert.deepEqual(spokenAccountFrom([user("500만 원 보내면 되나요?")]), {}, "S5 보내기 말");
  assert.deepEqual(spokenAccountFrom([user("1,200만 원 있는데 300만 원만 찾으면 되나요?")]), { balance: 12_000_000 }, "같은 문장 — 금액마다 가까운 말");
  assert.deepEqual(spokenAccountFrom([scammer("현재 통장 잔액이 얼마나 되십니까?"), user("1,500만 원이요.")]), { balance: 15_000_000 }, "S6 앞 질문");
  assert.deepEqual(spokenAccountFrom([scammer("얼마나 있으세요?"), user("한 이천만 원.")]), { balance: 20_000_000 }, "S6 앞 질문 · 한글 수사");
});

test("[SA4] 비정상 금액 건너뜀 · 여러 번 말하면 마지막 유효 값", () => {
  assert.deepEqual(spokenAccountFrom([user("통장에 5,000원 있어요.")]), {}, "1만 원 미만");
  assert.deepEqual(spokenAccountFrom([user("통장에 20억 원 있어요.")]), {}, "10억 원 초과");
  assert.deepEqual(spokenAccountFrom([user("통장에 10억 원 있어요.")]), { balance: 1_000_000_000 }, "10억 원 = 경계 안");
  assert.deepEqual(spokenAccountFrom([user("통장에 0원 있어요.")]), {});
  assert.deepEqual(
    spokenAccountFrom([user("새솔은행에 1,200만 원 있어요."), user("아 해담은행이에요. 900만 원 있어요."), user("통장에 20억 원 있어요.")]),
    { bankName: "해담은행", balance: 9_000_000 },
  );
});

// ── 실제 렌더 ───────────────────────────────────────────────────────────────────────────────────────────────────
const LEDGER = "spoken-account-render-01";
const cashProps = (extra: Record<string, unknown> = {}) => ({
  title: "예탁금 현금 · 수표 출금 예약",
  landingId: "cash-withdraw",
  landingKind: "credential-form",
  entrySurface: "in-call-sms",
  onHide: () => {},
  onClose: () => {},
  bankIdentity: { myBankName: "늘봄은행", ledgerKey: LEDGER },
  ...extra,
});
const won = (value: number) => `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;

test("[SA5] 렌더 — 말한 은행 · 잔액이 머리띠 · 출금 계좌 줄에 / 말 없으면 종전 고정 값", () => {
  for (const id of ["cash-withdraw", "asset-cash-withdraw"]) {
    const spoken = renderLandingScreen(cashProps({ landingId: id, spokenAccountNow: () => spokenAccountFrom(LIVE_TURNS) })).text;
    assert.ok(spoken.includes("새솔은행 모바일뱅킹"), `${id}: 머리띠 = 말한 은행`);
    assert.ok(spoken.includes("12,000,000원"), `${id}: 출금 가능 금액 = 말한 잔액`);
    assert.equal(spoken.includes("늘봄은행 모바일뱅킹"), false, `${id}: 고정 은행 머리띠가 남으면 안 된다`);
    assert.equal(spoken.includes(won(fictionalBalanceFor(LEDGER))), false, `${id}: 고정 잔액이 남으면 안 된다`);

    const silent = renderLandingScreen(cashProps({ landingId: id, spokenAccountNow: () => spokenAccountFrom([]) })).text;
    assert.ok(silent.includes("늘봄은행 모바일뱅킹"), `${id}: 말 없으면 종전 머리띠`);
    assert.ok(silent.includes(won(fictionalBalanceFor(LEDGER))), `${id}: 말 없으면 종전 고정 잔액`);
    const absent = renderLandingScreen(cashProps({ landingId: id })).text;
    assert.equal(absent, silent, `${id}: 값 공급원이 없을 때(메신저 진입 등) = 말 없음과 같다`);
  }
});

test("[SA6] 배선 — 참가자 · 사기범 대사 순서대로 · 화면 안에서만(G138)", () => {
  const page = readFileSync(new URL("../../app/session/play/page.tsx", import.meta.url), "utf8");
  assert.ok(
    // ⭐ 2026-11-09 S2′ — 실제 은행 알아보기 함수(`realBankMentionsIn`)를 함께 넘긴다.
    page.includes("spokenAccountNow={() => spokenAccountFrom([...messages, ...transcriptRef.current], realBankMentionsIn)}"),
    "페이지 — 올린 대사 + 실시간 전사(역할 포함)로 여는 순간 값을 만든다",
  );
  const overlay = readFileSync(new URL("../../components/InCallSmsOverlay.tsx", import.meta.url), "utf8");
  assert.ok(overlay.includes("spokenAccountNow={spokenAccountNow}"), "문자 오버레이 → 화면으로 그대로");
  const landing = readFileSync(new URL("../../components/MessengerFakeLanding.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = landing.indexOf("function CashWithdrawMockup(");
  const component = landing.slice(start, landing.indexOf("\nfunction ", start + 10));
  assert.ok(component.includes("const [spoken] = useState<SpokenAccount>(() => spokenAccountNow?.() ?? {});"), "여는 순간 한 번 읽는다");
  // 값은 계좌 목록 · 머리띠에만 — 콜백 인자 · 네트워크 0(CW6이 콜백 무인자 · 네트워크 0을 함께 본다).
  for (const call of component.match(/(onCredentialSubmit|onHeld)\([^)]*\)/g) ?? []) assert.ok(call === "onCredentialSubmit()" || call === "onHeld()", call);
  // 판정표 S12(2026-11-08 사용자 결정 "금 거래소 구매 화면에도 같은 규칙") — 금 화면도 같은 게터 · 같은 함수.
  const goldStart = landing.indexOf("function GoldBuyMockup(");
  const gold = landing.slice(goldStart, landing.indexOf("\nfunction ", goldStart + 10));
  assert.ok(gold.includes("const [spoken] = useState<SpokenAccount>(() => spokenAccountNow?.() ?? {});"), "금 화면도 여는 순간 한 번 읽는다");
  for (const call of gold.match(/(onCredentialSubmit|onHeld)\([^)]*\)/g) ?? []) assert.ok(call === "onCredentialSubmit()" || call === "onHeld()", call);
  // 2026-11-08(사용자 결정 D2 — 출금 계좌가 나오는 화면 전부) — 종전 2곳(출금 예약 · 금) → 5곳(+ 대출 신청 · 상품권 · 이체 화면).
  assert.equal((landing.match(/spokenAccountNow=\{spokenAccountNow\}/g) ?? []).length, 5, "출금 계좌가 나오는 화면 5곳에 넘긴다");
});

const goldProps = (extra: Record<string, unknown> = {}) => cashProps({ title: "골드바 구매", landingId: "gold-buy", ...extra });

test("[SA7] 금 거래소 화면(S12) — 결제 계좌 = 말한 은행 · 잔액 / 말 없으면 종전 고정 값", () => {
  for (const id of ["gold-buy", "asset-gold-buy"]) {
    const spoken = renderLandingScreen(goldProps({ landingId: id, spokenAccountNow: () => spokenAccountFrom(LIVE_TURNS) })).text;
    assert.ok(spoken.includes("새솔은행"), `${id}: 결제 계좌 은행 = 말한 은행`);
    assert.ok(spoken.includes("12,000,000원"), `${id}: 출금 가능 금액 = 말한 잔액`);
    assert.equal(spoken.includes("늘봄은행"), false, `${id}: 고정 은행이 남으면 안 된다`);
    assert.equal(spoken.includes(won(fictionalBalanceFor(LEDGER))), false, `${id}: 고정 잔액이 남으면 안 된다`);

    const silent = renderLandingScreen(goldProps({ landingId: id, spokenAccountNow: () => spokenAccountFrom([]) })).text;
    assert.ok(silent.includes("늘봄은행"), `${id}: 말 없으면 종전 은행`);
    assert.ok(silent.includes(won(fictionalBalanceFor(LEDGER))), `${id}: 말 없으면 종전 고정 잔액`);
    assert.equal(renderLandingScreen(goldProps({ landingId: id })).text, silent, `${id}: 공급원 없음 = 말 없음`);
  }
});

test("[SA8] 판정표 S8(2026-11-08 사용자 결정 \"그대로 둠\") — 100만 원 미만 잔액도 그대로 보이고 출금 예약은 최소 금액에 걸린다(현실처럼 예약 불가)", () => {
  const turns = [user("통장에 50만 원 있어요.")];
  assert.deepEqual(spokenAccountFrom(turns), { balance: 500_000 });
  const text = renderLandingScreen(cashProps({ spokenAccountNow: () => spokenAccountFrom(turns) })).text;
  assert.ok(text.includes("500,000원"), "출금 가능 금액 = 말한 잔액 그대로");
  // "전액"을 눌러도 최소 금액 안내(잔액 판정보다 먼저 — `cashReserveError`).
  assert.match(cashReserveError("500,000", "cash") ?? "", /1,000,000원부터/);
});
