// 2026-11-09 사용자 결정 — 시작 전 카드 '거래 은행 · 통장 잔액'을 사기범이 아는 값으로(`session/personaCard.ts` 판정표 BK · BL).
// 재현: 재시험 14(PR #564) — 은행 사칭 고급 fv-62q8 · 카드 = 실제 은행 · 2,000만 원인데 첫마디 "저희 새솔은행 금융사고대응팀"
// (세션 은행 = 보호계좌 예금주 문성호의 고정 은행 U3).
// | # | 시험 |
// |---|---|
// | AC1 | 재현 — 은행 사칭 세션 은행이 카드와 무관하게 새솔은행으로 고정돼 있던 전제 · BK2로 카드 가상 은행이 세션 은행이 된다 |
// | AC2 | 입력 판정 — bank(가상 8 ∪ "real") · balance(1만 원 단위 · 1만 ~ 10억) · 실제 은행 이름 · 목록 밖 · 범위 밖 = 거부 |
// | AC3 | 대상 판정 — 기관형 8종 = 받음 · 협박형 2종 · 받는 분 카드(챌린지) = not-applicable(BK6 · BL4) |
// | AC4 | 카드 행 · 프롬프트 — BK2 ~ BK5 · BL2 문면 · 실존 금융사명 0 · 잔액 줄은 잔액 행이 있을 때만 |
// | AC5 | 세션 은행 BK1 ~ BK5(`sessionBankNameForCard`) |
// | AC6 | 리포트 대조 — 가상 은행 = 이름 토큰 · 실제 은행 = 0 · 잔액 토큰 · 사기범이 먼저 말함(R-1) |
// | AC7 | 배선 — createSession이 BK2 함수를 거쳐 세션 은행을 고른다 · 잔액 값 왕복(BL3 자리) |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildPersonaCard,
  readPersonaCardInput,
  resolvePersonaCardRequest,
  sessionBankNameForCard,
  PERSONA_CARD_NOT_APPLICABLE_REASON,
} from "../personaCard";
import {
  personaBalanceText,
  personaBalanceWon,
  personaCardPromptValue,
  PERSONA_BANK_UNNAMED_VALUE,
  PERSONA_CARD_KIND,
  PERSONA_CARD_SCENARIOS,
} from "../../scenarios/personaCardCatalog";
import { pickSessionBankName } from "../../inCallSms/smsGate";
import { FICTIONAL_BANK_NAMES } from "../../shared/fictionalBank";
import { buildPersonaCardBlock, buildSystemPrompt, PERSONA_CARD_BALANCE_RULE } from "../../roleplay/promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { replaceRealFinancialNames } from "../../guardrails/realFinancialNames";
import { personaMatchTokens, resolvePersonaFirstMentions } from "../../report/personaBlock";
import { buildInCallSmsDoc } from "../../inCallSms/buildDoc";
import { findInCallSmsItem, IN_CALL_SMS } from "../../scenarios/inCallSms";
import { extractTransferAmount } from "../../shared/fictionalBank";
import { demandAmountFrom } from "../../roleplay/linkMarker";
import { BALANCE_FIT_SOURCE_AMOUNTS, cardBalanceWonFrom, fitPromptAmounts, fitSmsBodyAmount, fittedDemandWon } from "../cardBalanceFit";

const BANK = "bank-security-verify-scam";
const NOW_YEAR = 2026;
const ADV = { difficultyLevel: "advanced" as const, channel: undefined };
const SRC = path.resolve(__dirname, "../../../src");
const readSrc = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

test("[AC1] 재현 — 은행 사칭 고급 세션 은행 = 새솔은행 고정(U3) → BK2로 카드 가상 은행이 세션 은행 · 자기소개 자리표시가 그 이름으로", () => {
  const picked = pickSessionBankName(BANK, "fv-62q8", () => 0);
  assert.equal(picked, "새솔은행", "전제: 보호계좌 예금주 문성호의 고정 은행");
  const card = resolvePersonaCardRequest({ bank: "해담은행", balance: 20_000_000 }, { scenarioId: BANK, ...ADV }, "self", NOW_YEAR);
  assert.ok(card.ok && card.personaCard);
  const bank = sessionBankNameForCard(BANK, card.personaCard, picked);
  assert.equal(bank, "해담은행");
  const prompt = buildSystemPrompt(SCENARIO_PROMPTS[BANK]!, { difficultyLevel: "advanced", fictionalBankName: bank, personaCard: card.personaCard.items, turnInstruction: "OO은행 금융사고대응팀으로 소개한다." });
  assert.ok(prompt.includes("해담은행 금융사고대응팀"), "자리표시가 카드 은행으로");
  assert.equal(prompt.includes("새솔은행"), false, "고정 은행 0");
  assert.ok(prompt.includes("- 거래 은행: 해담은행") && prompt.includes("- 통장 잔액: 약 2,000만 원"));
});

test("[AC2] 입력 판정 — bank · balance 규칙(앞 행 순서 무관 · 거부 = invalid)", () => {
  const ok = (raw: unknown) => {
    const read = readPersonaCardInput(raw, NOW_YEAR);
    assert.ok(read.ok, JSON.stringify(raw));
    return read.input;
  };
  const bad = (raw: unknown) => assert.equal(readPersonaCardInput(raw, NOW_YEAR).ok, false, JSON.stringify(raw));
  for (const name of FICTIONAL_BANK_NAMES) assert.deepEqual(ok({ bank: name }), { bank: name });
  assert.deepEqual(ok({ bank: "real" }), { bank: "real" });
  assert.deepEqual(ok({ bank: "", balance: null }), undefined, "빈 값 = 카드 0");
  assert.deepEqual(ok({ balance: 10_000 }), { balance: 10_000 });
  assert.deepEqual(ok({ balance: 1_000_000_000 }), { balance: 1_000_000_000 });
  for (const realName of ["KB국민은행", "신한은행", "카카오뱅크", "국민은행"]) bad({ bank: realName }); // ⛔ 실제 은행 이름은 받지 않는다
  bad({ bank: "주거래은행" });
  bad({ bank: 3 });
  for (const balance of [0, 9_999, 15_000, 1_000_010_000, 12_345.5, "20000000", -10_000]) bad({ balance });
});

test("[AC3] 대상 — 기관형 8종 받음 · 협박형 2종 · 받는 분 카드 = not-applicable", () => {
  let identity = 0;
  for (const scenarioId of PERSONA_CARD_SCENARIOS) {
    const result = resolvePersonaCardRequest({ bank: "real", balance: 5_000_000 }, { scenarioId, ...ADV }, "self", NOW_YEAR);
    if (PERSONA_CARD_KIND[scenarioId] === "identity") {
      identity += 1;
      assert.ok(result.ok && result.personaCard, scenarioId);
      assert.deepEqual(result.personaCard.items.map((i) => i.key), ["bank", "balance"]);
    } else {
      assert.deepEqual(result, { ok: false, reason: PERSONA_CARD_NOT_APPLICABLE_REASON }, scenarioId);
    }
    if (PERSONA_CARD_KIND[scenarioId] === "identity") {
      const sender = resolvePersonaCardRequest({ name: "홍길동", bank: "새솔은행" }, { scenarioId, ...ADV }, "sender", NOW_YEAR);
      assert.deepEqual(sender, { ok: false, reason: PERSONA_CARD_NOT_APPLICABLE_REASON }, `${scenarioId} 챌린지`);
      const senderName = resolvePersonaCardRequest({ name: "홍길동" }, { scenarioId, ...ADV }, "sender", NOW_YEAR);
      assert.ok(senderName.ok && senderName.personaCard, "은행 · 잔액 없는 받는 분 카드는 종전대로");
    }
  }
  assert.equal(identity, 8);
});

test("[AC4] 카드 행 · 프롬프트 — BK2 ~ BK5 · BL2 · 실존 금융사명 0 · 잔액 줄 조건", () => {
  const full = buildPersonaCard({ input: { name: "홍길동", birthYear: 1962, region: "경상남도", bank: "real", balance: 120_000_000 }, inputBy: "self" })!;
  assert.equal(full.items.length, 5, "기관형 최대 5행(화면 상한 D-119 안)");
  assert.deepEqual(full.items.slice(3), [
    { key: "bank", label: "거래 은행", value: PERSONA_BANK_UNNAMED_VALUE },
    { key: "balance", label: "통장 잔액", value: "1억 2,000만 원" },
  ]);
  const block = buildPersonaCardBlock(full.items)!;
  assert.ok(block.includes("'저희 은행 금융사고대응팀'") && block.includes("'고객님 거래 은행'"), "BK3 · BK5 문면");
  assert.ok(block.includes("- 통장 잔액: 약 1억 2,000만 원"));
  assert.ok(block.endsWith(PERSONA_CARD_BALANCE_RULE), "BL2 줄");
  assert.equal(replaceRealFinancialNames(block).replacedCount, 0, "실존 금융사명 0");
  const virtualBank = buildPersonaCard({ input: { bank: "미르은행" }, inputBy: "self" })!;
  assert.equal(personaCardPromptValue(virtualBank.items[0]!), "미르은행", "BK2 · BK4 = 이름 그대로");
  const noBalance = buildPersonaCardBlock(virtualBank.items)!;
  assert.equal(noBalance.includes(PERSONA_CARD_BALANCE_RULE), false, "잔액 행 없으면 줄 0");
  const nameOnly = buildPersonaCardBlock([{ key: "name", label: "이름", value: "김영숙" }])!;
  assert.equal(nameOnly.includes("잔액"), false, "종전 카드 블록 무변경");
  for (const [won, text] of [[10_000, "1만 원"], [20_000_000, "2,000만 원"], [100_000_000, "1억 원"], [1_000_000_000, "10억 원"], [123_450_000, "1억 2,345만 원"]] as const) {
    assert.equal(personaBalanceText(won), text);
    assert.equal(personaBalanceWon(text), won, `왕복 ${text}(BL3 자리)`);
  }
  assert.equal(personaBalanceWon("많음"), undefined);
});

test("[AC5] 세션 은행 BK1 ~ BK5", () => {
  const card = (input: Parameters<typeof buildPersonaCard>[0]["input"]) => buildPersonaCard({ input, inputBy: "self" });
  assert.equal(sessionBankNameForCard(BANK, undefined, "새솔은행"), "새솔은행", "BK1 카드 0");
  assert.equal(sessionBankNameForCard(BANK, card({ name: "홍길동" }), "새솔은행"), "새솔은행", "BK1 은행 칸 0");
  assert.equal(sessionBankNameForCard(BANK, card({ bank: "보담은행" }), "새솔은행"), "보담은행", "BK2");
  assert.equal(sessionBankNameForCard(BANK, card({ bank: "real" }), "새솔은행"), "새솔은행", "BK3 = 종전 가상");
  for (const scenarioId of PERSONA_CARD_SCENARIOS.filter((id) => id !== BANK)) {
    assert.equal(sessionBankNameForCard(scenarioId, card({ bank: "보담은행" }), "가온은행"), "가온은행", `BK4 ${scenarioId}`);
  }
});

test("[AC6] 리포트 대조 — 가상 은행 이름 · 실제 은행 0 · 잔액 토큰 · R-1", () => {
  const items = buildPersonaCard({ input: { bank: "해담은행", balance: 20_000_000 }, inputBy: "self" })!.items;
  assert.deepEqual(personaMatchTokens(items[0]!), ["해담은행"]);
  assert.deepEqual(personaMatchTokens(items[1]!), ["2,000만", "2000만"]);
  assert.deepEqual(personaMatchTokens({ key: "bank", label: "거래 은행", value: PERSONA_BANK_UNNAMED_VALUE }), [], "실제 은행 = 대조 0");
  assert.ok(personaMatchTokens({ key: "balance", label: "통장 잔액", value: "1억 2,000만 원" }).includes("1억2000만"));
  const mentions = resolvePersonaFirstMentions(items, [
    { role: "scammer", turnIndex: 0, textMasked: "해담은행 금융사고대응팀입니다. 고객님 통장에 2000만 원 있으시죠?" },
    { role: "user", turnIndex: 1, textMasked: "네 맞아요." },
  ]);
  assert.deepEqual(mentions.map((m) => m.key), ["bank", "balance"]);
});

test("[AC7] 배선 — createSession이 BK2 함수로 세션 은행을 고른다 · 챌린지 동의 경로는 종전", () => {
  const session = readSrc("session/index.ts");
  assert.ok(
    session.includes("const fictionalBankName = sessionBankNameForCard(scenarioId, personaCard, pickSessionBankName(scenarioId, variantAssignment.flowVariantId));"),
  );
  assert.ok(readSrc("challenge/userAccess.ts").includes("const fictionalBankName = pickSessionBankName(scenarioId, flowVariantId);"), "받는 분 카드엔 은행 0 → 종전");
});

// ── ⭐ BL3(2026-11-09 사용자 결정 "카드 잔액 있을 때만 맞춤" · `session/cardBalanceFit.ts` 판정표 F1 ~ F5) ─────────────────────────
// | # | 시험 |
// |---|---|
// | BF1 | 잔액형 표 = 카탈로그(금액 줄이 표 금액인 문자 = 표의 smsId 5개 · 그 밖의 금액 문자는 고정형) |
// | BF2 | 문자 문서 — F1(잔액 0 = 바이트 무변경) · F2(잔액 전부) · F3(1,000만 상한) · F4(고정형 그대로) · `transferAmount`도 같은 값 |
// | BF3 | 프롬프트 — 수법 · 단계의 "980만 원" 등이 같은 값 · 잔액 없는 카드 = 바이트 무변경 |
// | BF4 | N1 기준 일치 — 서버 요구액(`demandAmountFrom`) = 문자 `transferAmount` = 맞춘 금액(클라 W3 · 비교는 `cardAccountRequest.test.ts` CR5) |

const FIT_SMS: Record<string, { scenarioId: string; from: string }> = {
  "bank-protect-account": { scenarioId: BANK, from: "4,120,000" },
  "institution-asset-safe-account": { scenarioId: "institutional-impersonation", from: "9,800,000" },
  "card-safe-account": { scenarioId: "card-company-impersonation", from: "9,800,000" },
  "card-relief-account": { scenarioId: "card-company-impersonation", from: "2,340,000" },
  "courier-safe-account": { scenarioId: "courier-customs-scam", from: "7,600,000" },
};
const TS = {} as FirebaseFirestore.Timestamp;

test("[BF1] 잔액형 표 = 카탈로그", () => {
  const fitIds: string[] = [];
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const item of items) {
      const amount = extractTransferAmount(item.body);
      if (amount !== undefined && BALANCE_FIT_SOURCE_AMOUNTS.includes(Number(amount))) fitIds.push(item.smsId);
      if (FIT_SMS[item.smsId]) assert.equal(FIT_SMS[item.smsId]!.scenarioId, scenarioId, item.smsId);
    }
  }
  assert.deepEqual([...new Set(fitIds)].sort(), Object.keys(FIT_SMS).sort());
  for (const [smsId, { scenarioId }] of Object.entries(FIT_SMS)) {
    assert.equal(PERSONA_CARD_KIND[scenarioId], "identity", `${smsId}: 카드 잔액을 받는 기관형 시나리오`);
  }
});

test("[BF2] 문자 문서 F1 ~ F4", () => {
  for (const [smsId, { scenarioId, from }] of Object.entries(FIT_SMS)) {
    const item = findInCallSmsItem(scenarioId, smsId)!;
    const plain = buildInCallSmsDoc(item, TS, 1, scenarioId, "미르은행");
    assert.deepEqual(buildInCallSmsDoc(item, TS, 1, scenarioId, "미르은행", undefined), plain, `${smsId} F1 무변경`);
    assert.ok(plain.body.includes(`금액: ${from}원`));
    const small = buildInCallSmsDoc(item, TS, 1, scenarioId, "미르은행", 3_000_000);
    assert.ok(small.body.includes("금액: 3,000,000원") && !small.body.includes(from), `${smsId} F2`);
    assert.equal(small.body.replace("금액: 3,000,000원", `금액: ${from}원`), plain.body, `${smsId} 금액 줄만 바뀐다`);
    if (plain.transferAmount !== undefined) assert.equal(small.transferAmount, "3000000", `${smsId} transferAmount`);
    const big = buildInCallSmsDoc(item, TS, 1, scenarioId, "미르은행", 120_000_000);
    assert.ok(big.body.includes("금액: 10,000,000원"), `${smsId} F3 1회 한도`);
  }
  // F4 — 고정형(수수료 · 상환 · 공탁금 · 협박형)은 잔액이 있어도 그대로.
  let fixed = 0;
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const item of items) {
      if (FIT_SMS[item.smsId] || extractTransferAmount(item.body) === undefined) continue;
      fixed += 1;
      assert.equal(fitSmsBodyAmount(item.body, 3_000_000), item.body, `${scenarioId}/${item.smsId} F4`);
    }
  }
  assert.ok(fixed >= 6, `고정형 문자 ${fixed}`);
  assert.equal(fittedDemandWon(10_000_000), 10_000_000);
  assert.equal(fittedDemandWon(10_010_000), 10_000_000);
});

test("[BF3] 프롬프트 — 같은 맞춘 금액 · 잔액 없는 카드 = 바이트 무변경", () => {
  const tactic = "안전계좌 980만 원 · 9,800,000원 · 이관 234만 원 · 국가 안전계좌 760만 원 · 보호계좌 412만 원 · 수수료 78,000원 · 1,980만 원";
  assert.equal(
    fitPromptAmounts(tactic, 3_000_000),
    "안전계좌 300만 원 · 3,000,000원 · 이관 300만 원 · 국가 안전계좌 300만 원 · 보호계좌 300만 원 · 수수료 78,000원 · 1,980만 원",
  );
  assert.equal(fitPromptAmounts(tactic, undefined), tactic);
  const withBalance = buildPersonaCard({ input: { name: "홍길동", balance: 3_000_000 }, inputBy: "self" })!.items;
  const noBalance = buildPersonaCard({ input: { name: "홍길동", bank: "real" }, inputBy: "self" })!.items;
  assert.equal(cardBalanceWonFrom(withBalance), 3_000_000);
  assert.equal(cardBalanceWonFrom(noBalance), undefined);
  const opts = (personaCard: typeof withBalance) => ({ difficultyLevel: "advanced" as const, personaCard, turnInstruction: "잔액 중 980만 원을 안전계좌로 옮기게 한다." });
  const fitted = buildSystemPrompt(SCENARIO_PROMPTS["institutional-impersonation"]!, opts(withBalance));
  assert.ok(fitted.includes("잔액 중 300만 원을 안전계좌로") && !fitted.includes("980만 원"));
  const plain = buildSystemPrompt(SCENARIO_PROMPTS["institutional-impersonation"]!, opts(noBalance));
  assert.ok(plain.includes("잔액 중 980만 원을 안전계좌로"), "잔액 없는 카드 = 종전 금액");
});

test("[BF4] N1 기준 — 서버 요구액 = 문자 transferAmount = 맞춘 금액", () => {
  const item = findInCallSmsItem(BANK, "bank-protect-account")!;
  const doc = buildInCallSmsDoc(item, TS, 1, BANK, "새솔은행", 3_000_000);
  const spoken = fitPromptAmounts("보호계좌로 412만 원 옮기셔야 출금이 막힙니다.", 3_000_000);
  assert.equal(demandAmountFrom(spoken, []), "3,000,000");
  assert.equal(Number(doc.transferAmount ?? extractTransferAmount(doc.body)), 3_000_000);
});
