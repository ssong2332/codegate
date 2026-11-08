// 2026-11-09 사용자 결정 "고치기"(라이브 재시험 15 E2) — 은행 사칭 고급 · 카드 = 실제 은행(BK3)인데 넘김 창구가 "새솔은행 금융사고대응 확인창구".
// `session/cardBankDesk.ts` 판정표 BD.
// | # | 시험 |
// |---|---|
// | BD-1 | 재현 · 수정 — BK3 카드: 창구 문서 · 첫 담당자 안내 · 수신 표시 · 넘겨받은 담당자 지시 · 전환 상태 줄 · 리포트 문구 = "금융사고대응 확인창구"(세션 은행 이름 0) |
// | BD-2 | 카드 0 · 가상 은행(BK2) · 은행 칸 없는 카드 = 종전 바이트 그대로(기본 인자 = 종전) |
// | BD-3 | 보호계좌 문자 · 프롬프트의 다른 "○○은행"은 세션 가상 은행 그대로 / 다른 시나리오 창구는 BK3여도 무변경 |
// | BD-4 | 배선 — 확인 창구 콜러블 3곳 · 프롬프트 조립이 같은 판정 함수를 쓴다 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { applySessionBankText, cardBankUnnamed, NAMELESS_BANK_DESK_LABEL } from "../cardBankDesk";
import { buildPersonaCard } from "../personaCard";
import { buildVerifyInterceptDoc, buildVerifyOfferResponse, buildVerifyReconnectParts } from "../../verifyIntercept/buildDoc";
import { VERIFY_INTERCEPT } from "../../scenarios/verifyIntercept";
import { applyFictionalBank } from "../../shared/fictionalBank";
import { deriveVerifyEvents } from "../../report/verifyTimeline";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { buildInCallSmsDoc } from "../../inCallSms/buildDoc";
import { findInCallSmsItem } from "../../scenarios/inCallSms";

const BANK = "bank-security-verify-scam";
const ITEM = VERIFY_INTERCEPT[BANK]!;
const SESSION_BANK = "새솔은행";
const TS = {} as FirebaseFirestore.Timestamp;
const SRC = path.resolve(__dirname, "../../../src");
const readSrc = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const realCard = buildPersonaCard({ input: { bank: "real", balance: 20_000_000 }, inputBy: "self" })!.items;
const virtualCard = buildPersonaCard({ input: { bank: "해담은행" }, inputBy: "self" })!.items;
const nameCard = buildPersonaCard({ input: { name: "홍길동" }, inputBy: "self" })!.items;

test("[BD-1] 재현 · 수정 — BK3 카드면 창구 이름 · 대사 지시 · 수신 표시 · 리포트가 이름 없는 표기", () => {
  // 재현(종전 경로) — 세션 은행으로 바뀐 창구 이름.
  assert.equal(applyFictionalBank(ITEM.deskLabel, SESSION_BANK), "새솔은행 금융사고대응 확인창구");
  assert.equal(cardBankUnnamed(realCard), true);
  const doc = buildVerifyInterceptDoc(ITEM, TS, 3, SESSION_BANK, true);
  assert.equal(doc.deskLabel, NAMELESS_BANK_DESK_LABEL);
  const offer = buildVerifyOfferResponse(ITEM, { placed: false, fictionalBankName: SESSION_BANK, unnamedCardBank: true });
  const parts = buildVerifyReconnectParts(ITEM, SESSION_BANK, true);
  assert.equal(parts.reconnectedCallerLabel, NAMELESS_BANK_DESK_LABEL);
  for (const text of [offer.announceInstruction!, parts.reconnectInstruction, parts.transferStateLine]) {
    assert.ok(text.includes(NAMELESS_BANK_DESK_LABEL), text);
    assert.equal(text.includes(SESSION_BANK), false, text);
  }
  const events = deriveVerifyEvents({ offerId: ITEM.offerId, deskLabel: doc.deskLabel, offeredAtMs: 1, placedAtMs: 2 }, "placed_and_complied");
  assert.ok(events.length > 0 && events.every((e) => !JSON.stringify(e).includes(SESSION_BANK)));
  assert.ok(events.some((e) => JSON.stringify(e).includes(NAMELESS_BANK_DESK_LABEL)), "리포트 넘김 문구");
  // 텍스트 경로 — 프롬프트에 실린 넘김 지시도 같은 값.
  const prompt = buildSystemPrompt(SCENARIO_PROMPTS[BANK]!, {
    difficultyLevel: "advanced",
    fictionalBankName: SESSION_BANK,
    personaCard: realCard,
    turnInstruction: ITEM.reconnectInstruction,
  });
  assert.ok(prompt.includes(`'${NAMELESS_BANK_DESK_LABEL}'의 **다른 담당자**`));
  assert.equal(prompt.includes(`${SESSION_BANK} 금융사고대응`), false);
});

test("[BD-2] 카드 0 · 가상 은행 · 은행 칸 없음 = 종전 바이트", () => {
  for (const items of [undefined, virtualCard, nameCard]) {
    const unnamed = cardBankUnnamed(items);
    assert.equal(unnamed, false);
    assert.deepEqual(buildVerifyInterceptDoc(ITEM, TS, 3, SESSION_BANK, unnamed), buildVerifyInterceptDoc(ITEM, TS, 3, SESSION_BANK));
    assert.equal(buildVerifyInterceptDoc(ITEM, TS, 3, SESSION_BANK).deskLabel, "새솔은행 금융사고대응 확인창구");
    assert.deepEqual(buildVerifyReconnectParts(ITEM, SESSION_BANK, unnamed), {
      reconnectedCallerLabel: applyFictionalBank(ITEM.reconnectedCallerLabel, SESSION_BANK),
      reconnectInstruction: applyFictionalBank(ITEM.reconnectInstruction, SESSION_BANK),
      transferStateLine: applyFictionalBank(ITEM.transferStateLine, SESSION_BANK),
    });
    assert.deepEqual(
      buildVerifyOfferResponse(ITEM, { placed: false, fictionalBankName: SESSION_BANK, unnamedCardBank: unnamed }),
      { offerId: ITEM.offerId, announceInstruction: applyFictionalBank(ITEM.announceInstruction, SESSION_BANK) },
    );
  }
  assert.equal(applySessionBankText(ITEM.deskLabel, undefined, false), ITEM.deskLabel, "은행명 부재 = 카탈로그 원문(종전)");
});

test("[BD-3] 보호계좌 · 다른 창구는 무변경", () => {
  const sms = buildInCallSmsDoc(findInCallSmsItem(BANK, "bank-protect-account")!, TS, 1, BANK, SESSION_BANK);
  assert.ok(sms.body.includes(`${SESSION_BANK} 100-2043-7788-21`) && sms.bankName === SESSION_BANK, "보호계좌 = 가상 은행 그대로");
  const prompt = buildSystemPrompt(SCENARIO_PROMPTS[BANK]!, { difficultyLevel: "advanced", fictionalBankName: SESSION_BANK, personaCard: realCard, turnInstruction: "OO은행 948-2716-5093-27로 안내한다." });
  assert.ok(prompt.includes(`${SESSION_BANK} 948-2716-5093-27`), "프롬프트의 다른 ○○은행 = 세션 은행");
  for (const [scenarioId, item] of Object.entries(VERIFY_INTERCEPT)) {
    if (scenarioId === BANK) continue;
    assert.equal(buildVerifyInterceptDoc(item, TS, 3, SESSION_BANK, true).deskLabel, buildVerifyInterceptDoc(item, TS, 3, SESSION_BANK).deskLabel, scenarioId);
  }
});

test("[BD-4] 배선 — 콜러블 3곳 · 프롬프트 조립", () => {
  const index = readSrc("verifyIntercept/index.ts");
  assert.equal((index.match(/cardBankUnnamed\(session\.personaCard\?\.items\)/g) ?? []).length, 3);
  const assembly = readSrc("roleplay/promptAssembly.ts");
  assert.ok(assembly.includes("const withBank = applySessionBankText(withAccount, opts.fictionalBankName, cardBankUnnamed(opts.personaCard));"));
});
