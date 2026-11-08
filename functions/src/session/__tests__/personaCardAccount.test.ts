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
