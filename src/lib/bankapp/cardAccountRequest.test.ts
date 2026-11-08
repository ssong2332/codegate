// ⭐ 2026-11-09 사용자 결정 — 시작 전 카드 '거래 은행 · 통장 잔액'을 서버로(사기범이 아는 값 · 서버 판정표 BK · BL = `functions/src/session/personaCard.ts`).
// | # | 고정하는 것 |
// |---|---|
// | CR1 | 판정표 RQ 전 행 — 협박형 · 값 없음 = 0 · 가상 은행 = 이름 · 실제 은행 = "real" · 잔액 = 원 |
// | CR2 | 표 R 실제 은행 21곳 전부 — 요청 값에 실제 이름 0(판정표 P6) + 역검증(이름을 그대로 넘기는 사본은 걸린다) |
// | CR3 | 드리프트 — "real" 표시 · 가상 은행 목록 · 잔액 범위가 서버와 같다 |
// | CR4 | 배선 — 난이도 화면이 기관형에서만 싣고(`personaKind === "identity"`) 안내 문구도 그 조건으로 바꾼다 |
// ⚠️ 소스를 읽는 단언은 줄 끝(CRLF/LF)과 무관하다(읽은 뒤 `\r\n` → `\n`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CARD_ACCOUNT_BANK_OPTIONS,
  CARD_ACCOUNT_COPY,
  CARD_BANK_REAL_REQUEST,
  REAL_BANK_NAMES,
  cardAccountRequestFields,
  isRealBankName,
  type CardAccount,
} from "./withdrawAccounts.ts";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("[CR1] 판정표 RQ 전 행", () => {
  assert.equal(cardAccountRequestFields(undefined, true), undefined, "RQ1 값 없음");
  assert.equal(cardAccountRequestFields({ bankName: "새솔은행", balance: 20_000_000 }, false), undefined, "RQ1 협박형");
  assert.deepEqual(cardAccountRequestFields({ bankName: "새솔은행" }, true), { bank: "새솔은행" }, "RQ2");
  assert.deepEqual(cardAccountRequestFields({ bankName: "KB국민은행", balance: 20_000_000 }, true), { bank: "real", balance: 20_000_000 }, "RQ3 · RQ4 (재시험 14 카드)");
  assert.deepEqual(cardAccountRequestFields({ balance: 10_000 }, true), { balance: 10_000 }, "RQ4만");
  assert.equal(cardAccountRequestFields({ bankName: "없는은행", balance: 5 }, true), undefined, "목록 밖 · 범위 밖 = 0");
});

test("[CR2] 실제 은행 21곳 — 요청 값에 실제 이름 0 + 역검증", () => {
  assert.equal(REAL_BANK_NAMES.length, 21);
  for (const bankName of REAL_BANK_NAMES) {
    const fields = cardAccountRequestFields({ bankName }, true);
    assert.deepEqual(fields, { bank: CARD_BANK_REAL_REQUEST }, bankName);
    assert.equal(JSON.stringify(fields).includes(bankName), false, bankName);
  }
  // 역검증 — 이름을 그대로 넘기는 사본은 위 단언에 걸린다.
  const leaky = (card: CardAccount) => ({ bank: card.bankName });
  assert.equal(REAL_BANK_NAMES.filter((bankName) => JSON.stringify(leaky({ bankName })).includes(bankName)).length, 21);
  for (const bankName of CARD_ACCOUNT_BANK_OPTIONS.filter((name) => !isRealBankName(name))) {
    assert.deepEqual(cardAccountRequestFields({ bankName }, true), { bank: bankName }, `가상 ${bankName}`);
  }
});

test("[CR3] 드리프트 — 서버 판정 값과 같다", () => {
  const catalog = read("../../../functions/src/scenarios/personaCardCatalog.ts");
  assert.ok(catalog.includes(`export const PERSONA_BANK_REAL_INPUT = "${CARD_BANK_REAL_REQUEST}";`));
  assert.ok(catalog.includes("export const PERSONA_BALANCE_MIN = 10_000;") && catalog.includes("export const PERSONA_BALANCE_MAX = 1_000_000_000;"));
  const server = read("../../../functions/src/session/personaCard.ts");
  assert.ok(server.includes("readOptionField(bank, [...FICTIONAL_BANK_NAMES, PERSONA_BANK_REAL_INPUT])"), "서버는 가상 은행 ∪ real만 받는다");
});

test("[CR4] 배선 — 난이도 화면 · 안내", () => {
  const page = read("../../app/scenarios/difficulty/page.tsx");
  assert.ok(page.includes('const accountFields = cardAccountRequestFields(cardAccount, personaKind === "identity");'));
  assert.ok(page.includes("...(personaRequest ? { personaCardInput: personaRequest } : {}),"));
  assert.ok(page.includes('known={personaKind === "identity"}'));
  const fields = read("../../components/CardAccountFields.tsx");
  assert.ok(fields.includes("{known ? CARD_ACCOUNT_COPY.hintKnown : CARD_ACCOUNT_COPY.hint}"));
  assert.ok(CARD_ACCOUNT_COPY.hintKnown.includes("상대도 이미 알고"));
  assert.equal(/모의|훈련용/.test(CARD_ACCOUNT_COPY.hintKnown), false);
});
