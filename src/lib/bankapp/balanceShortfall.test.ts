// ⭐ 2026-11-27 사용자 결정(DECISIONS #262 · 판정표 M5) — 잔액을 모르면 요구액의 110 ~ 150%(Z4 · Z5 뒤집음). 2026-11-23 판정표 Z(`withdrawAccounts.ts`)의 나머지 행은 그대로.
// 재현: 실기 — 사용자: *"항상 나는 원하는 금액보다 적은 돈을 가지고 있어 … 요청한 금액보다 적다 라고 이야기를 하면 내가 그 때 할 수 있는 게 없잖아"*(첫 계좌 440,000원 vs 요구 500,000원 등 기준선 29/32판).
// | # | 고정하는 것 |
// |---|---|
// | BS1 | 재현(M5) — 잔액을 말하지 않음 + 요구액 500,000원 · 9,800,000원 → 첫 계좌만으로 보낼 수 있다(W3 통과) |
// | BS2 | Z3 · S13 · S13a — "그런 돈 없어요" → 잔액 0 · 계좌 하나 / "돈 문제는 없어요"는 아님 (M7 무변경) |
// | BS3 | S14 · S9′ — "980만 원은 없어요"는 잔액이 아니다 · '없다' 뒤 금액을 말하면 그 금액 |
// | BS4 | Z1 · Z2 무변경 — 카드 · 말한 잔액이 있으면 그 값(요구액보다 커도 · 작아도 건드리지 않는다 — M6) |
// | BS5 | M5 · Z4′ — 요구액 있음 = 110 ~ 150%(만 원 올림) · 없음 = 고정 값 100만 ~ 500만 원 · 판정 불가 요구액 = 고정 값 · 같은 입력 = 같은 값 |
// | BS6 | 서버 칸 — 말한 금액만 싣고 '돈 없다'는 싣지 않는다(BL3′ B4) |
// | BS7 | 배선 — 이체 화면 · 은행 앱 · 메신저가 요구액을 넘기고, 문자 발송 세 요청(백스톱 · Live 도구 · 텍스트)이 말한 잔액을 싣는다 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fictionalBalanceFor, spokenAccountFrom, spokenBalanceField } from "./bankApp.ts";
import { availableBalance, enoughDemandBalance, resolveMyAccount, withdrawAccountsFor, withdrawError } from "./withdrawAccounts.ts";

const scammer = (text: string) => ({ role: "scammer" as const, text });
const user = (text: string) => ({ role: "user" as const, text });
const read = (file: string) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("[BS1] 재현(M5) — 잔액을 말하지 않았으면 요구액 전액을 첫 계좌만으로 보낼 수 있다", () => {
  for (const demand of ["500,000", "9,800,000"]) {
    for (const seed of ["c5fj-1", "c5fj-2", "c5fj-3", "anything"]) {
      const ledger = `bs1-${seed}`;
      const spoken = spokenAccountFrom([scammer("안전계좌 문자의 링크 화면에서 옮기셔야 합니다."), user("네, 알겠습니다.")]);
      const mine = resolveMyAccount({ spoken, fixedBankName: "새솔은행", fixedBalance: fictionalBalanceFor(ledger), demand });
      assert.ok(mine.balance >= Number(demand.replace(/,/g, "")), `${demand} ${seed}: ${mine.balance}`);
      const [main] = withdrawAccountsFor({ seed: ledger, appBankName: mine.bankName, primaryBalance: mine.balance, single: mine.single });
      assert.equal(withdrawError(ledger, main!, demand), undefined, `${demand} ${seed}`);
      assert.ok(availableBalance(ledger, main!) >= Number(demand.replace(/,/g, "")));
    }
  }
});

test("[BS2] Z3 — '돈 없다'고 말하면 잔액 0 · 계좌 하나 / '돈 문제는 없어요'는 아님", () => {
  for (const said of ["그런 돈 없어요.", "저 돈 없는데요", "통장에 잔액 없어요", "한 푼도 없어요", "통장이 텅 비었어요", "그만한 돈은 없습니다"]) {
    const spoken = spokenAccountFrom([scammer("지금 980만 원을 옮기셔야 합니다."), user(said)]);
    assert.equal(spoken.noMoney, true, said);
    const mine = resolveMyAccount({ spoken, fixedBankName: "새솔은행", fixedBalance: 3_000_000, demand: "9,800,000" });
    assert.deepEqual([mine.balance, mine.single], [0, true], said);
    assert.match(withdrawError(`bs2-${said}`, { id: "main", balance: mine.balance }, "10,000") ?? "", /잔액이 부족합니다\. 출금 가능 금액은 0원입니다\./);
  }
  for (const said of ["돈 문제는 없어요.", "걱정 없어요", "네 없어요"]) {
    assert.equal(spokenAccountFrom([user(said)]).noMoney, undefined, said);
  }
});

test("[BS3] S14 · S9′ — 금액 뒤 '없다'는 잔액 아님 · 나중에 말한 금액이 이긴다", () => {
  const asked = scammer("통장에 잔액이 얼마나 있으십니까?");
  assert.equal(spokenAccountFrom([asked, user("천만 원은 없어요.")]).balance, undefined);
  assert.equal(spokenAccountFrom([asked, user("980만 원은 없고요")]).balance, undefined);
  const later = spokenAccountFrom([asked, user("돈 없어요."), scammer("조금이라도 있으시죠?"), user("300만 원 있어요.")]);
  assert.deepEqual([later.balance, later.noMoney], [3_000_000, undefined]);
  const back = spokenAccountFrom([asked, user("300만 원 있어요."), user("아니다, 사실 돈 없어요.")]);
  assert.deepEqual([back.balance, back.noMoney], [undefined, true]);
});

test("[BS4] Z1 · Z2 무변경(M6) — 카드 · 말한 잔액은 그대로(요구액보다 커도 작아도)", () => {
  const card = resolveMyAccount({ card: { balance: 20_000_000 }, fixedBankName: "새솔은행", fixedBalance: 3_000_000, demand: "9,800,000" });
  assert.equal(card.balance, 20_000_000);
  const spoken = resolveMyAccount({ spoken: { balance: 15_000_000 }, fixedBankName: "새솔은행", fixedBalance: 3_000_000, demand: "9,800,000" });
  assert.equal(spoken.balance, 15_000_000);
  assert.equal(withdrawError("bs4", { id: "main", balance: spoken.balance }, "9,800,000"), undefined);
  const less = resolveMyAccount({ spoken: { balance: 300_000 }, fixedBankName: "새솔은행", fixedBalance: 3_000_000, demand: "500,000" });
  assert.equal(less.balance, 300_000, "말한 잔액이 요구액보다 적으면 그대로 부족(M6)");
});

test("[BS5] M5 요구액의 110 ~ 150% · Z4′ 고정 값 100만 ~ 500만 · 판정 불가 = 고정 값", () => {
  for (let i = 0; i < 300; i += 1) {
    const value = fictionalBalanceFor(`bs5-${i}`);
    assert.ok(value >= 1_000_000 && value <= 5_000_000 && value % 10_000 === 0, String(value));
  }
  assert.equal(enoughDemandBalance(4_000_000, undefined), 4_000_000, "요구액 없음 = 고정 값(Z4′)");
  assert.equal(enoughDemandBalance(4_000_000, "원"), 4_000_000, "판정 불가 요구액 = 고정 값");
  for (const demand of ["9,800,000", "4,120,000", "2,340,000", "7,600,000", "500,000", "10,000"]) {
    const won = Number(demand.replace(/,/g, ""));
    for (let i = 0; i < 50; i += 1) {
      const fixed = fictionalBalanceFor(`bs5-${demand}-${i}`);
      const balance = enoughDemandBalance(fixed, demand);
      assert.ok(balance >= won * 1.1 && balance <= Math.ceil((won * 1.5) / 10_000) * 10_000 && balance % 10_000 === 0, `${demand} ${fixed}: ${balance}`);
      assert.equal(balance, enoughDemandBalance(fixed, demand), "결정적");
    }
  }
});

test("[BS6] 서버 칸 — 말한 금액만 · '돈 없다'는 칸 없음", () => {
  assert.deepEqual(spokenBalanceField(spokenAccountFrom([user("300만 원 있어요.")]).balance), { spokenBalanceWon: 3_000_000 });
  assert.deepEqual(spokenBalanceField(spokenAccountFrom([user("돈 없어요.")]).balance), {});
  assert.deepEqual(spokenBalanceField(undefined), {});
});

test("[BS7] 배선 — 요구액 · 말한 잔액이 각 호출부에 실린다", () => {
  const landing = read("src/components/MessengerFakeLanding.tsx");
  assert.match(landing, /const demand = landingId === LOAN_SAFE_TRANSFER_LANDING_ID \? undefined : \(prefilledTransfer\?\.requestedAmount \?\? prefilledTransfer\?\.amount\);/);
  assert.match(landing, /fixedBalance: fictionalBalanceFor\(ledger\),\n\s+demand,\n/);
  const page = read("src/app/session/play/page.tsx");
  assert.match(page, /demand: target\.requestedAmount \?\? target\.amount,/);
  assert.match(page, /\.\.\.spokenBalanceField\(spokenBalanceNowRef\.current\(\)\),\n\s+\}\);/, "백스톱");
  assert.match(page, /sendMessage\(\{ sessionId, userText: text, \.\.\.spokenBalanceField\(/, "텍스트 폴백");
  assert.match(page, /getSpokenBalanceWon=\{getSpokenBalanceWon\}/);
  assert.match(read("src/lib/realtime/GeminiVoiceSession.tsx"), /trigger: "model_tool",\n\s+\.\.\.spokenBalanceField\(handlersRef\.current\.getSpokenBalanceWon\?\.\(\)\),/, "Live 도구");
  assert.match(read("src/components/MessengerChatRoom.tsx"), /balance=\{enoughDemandBalance\(fictionalBalanceFor\(sessionId \?\? ""\), fakeLanding\.transferAmount\)\}/);
});
