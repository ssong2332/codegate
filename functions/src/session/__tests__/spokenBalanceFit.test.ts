// ⭐ 2026-11-23 사용자 결정 2b — 참가자가 통화에서 말한 잔액에 맞춰 잔액형 문자 금액을 바꾼다(판정표 BL3′ · `session/cardBalanceFit.ts`).
// 재현: 실기(검찰 고급) — 안전계좌 문자 980만 원을 참가자가 말한 적 없는 잔액으로 그대로 보냄. 서버는 참가자가 "300만 원 있어요"라고 해도 980만 원을 보냈다.
// | # | 시험 |
// |---|---|
// | SB1 | 검증 — 정수 · 1만 ~ 10억 원 · 만 원 단위 내림 · 밖 = 없음 |
// | SB2 | 발송 통로 B2 · B3 — 말한 잔액 300만 원 → 문자 '금액:' 줄 · `transferAmount` 3,000,000원 + 도착 지시 끝 새 금액 1줄 |
// | SB3 | B1 — 카드 잔액이 먼저(말한 잔액 무시 · 도착 지시 1줄 없음) · B4 말한 잔액 없음 = 종전 9,800,000원 · B5 고정형 금액 문자 = 무변경 |
// | SB4 | 배선 — 두 콜러블이 요청 값을 `spokenBalanceWonFrom`으로 검증해 발송 통로에 넘긴다 · 프롬프트 맞춤(`fitPromptAmounts`)은 카드 잔액만 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { spokenBalanceWonFrom, spokenFitAnnounceLine } from "../cardBalanceFit";
import { deliverSmsThroughGate, type SmsStore } from "../../inCallSms/smsDelivery";
import type { FlowVariantSms } from "../../scenarios/flowVariants";
import type { InCallSmsDoc } from "../../shared/types";

const SRC = path.resolve(__dirname, "../../../src");
const read = (file: string) => readFileSync(path.join(SRC, file), "utf8").replace(/\r\n/g, "\n");

function memoryStore(): SmsStore & { docs: Map<string, InCallSmsDoc> } {
  const docs = new Map<string, InCallSmsDoc>();
  return {
    docs,
    transact: async (fn) =>
      fn({
        listDelivered: async () => [...docs.values()].map((d) => ({ smsId: d.smsId, userTurnsAtArrival: d.userTurnsAtArrival })),
        create: (smsId, doc) => {
          docs.set(smsId, doc);
        },
      }),
  };
}
const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as FirebaseFirestore.Timestamp;
// fv-c5fj 고급 안전계좌 문자(금액 줄 9,800,000원 · 잔액형).
const SAFE: FlowVariantSms = { purpose: "transfer", smsId: "institution-asset-safe-account", required: true, notBeforeUserTurns: 1 };
const deliver = (extra: { cardBalanceWon?: number; spokenBalanceWon?: number }) => {
  const store = memoryStore();
  return deliverSmsThroughGate(store, {
    scenarioId: "institutional-impersonation",
    declared: [SAFE],
    purpose: "transfer",
    userTurns: 5,
    anchorScammerTurn: 5,
    trigger: "model_tool",
    fictionalBankName: "새솔은행",
    now: () => ts(1),
    ...extra,
  }).then((result) => ({ result, doc: store.docs.get(SAFE.smsId)! }));
};

test("[SB1] 말한 잔액 검증 — 정수 · 1만 ~ 10억 원 · 만 원 단위 내림 · 밖 = 없음", () => {
  assert.equal(spokenBalanceWonFrom(3_000_000), 3_000_000);
  assert.equal(spokenBalanceWonFrom(3_456_789), 3_450_000);
  assert.equal(spokenBalanceWonFrom(10_000), 10_000);
  assert.equal(spokenBalanceWonFrom(1_000_000_000), 1_000_000_000);
  for (const bad of [9_999, 1_000_000_001, 0, -5, 1.5, Number.NaN, "3000000", null, undefined, {}]) {
    assert.equal(spokenBalanceWonFrom(bad), undefined, String(bad));
  }
});

test("[SB2] 재현 — 말한 잔액 300만 원이면 안전계좌 문자 금액 · 요구액 · 도착 지시가 3,000,000원", async () => {
  const { result, doc } = await deliver({ spokenBalanceWon: 3_000_000 });
  assert.equal(result.status, "delivered");
  assert.match(doc.body, /^금액: 3,000,000원$/m);
  assert.doesNotMatch(doc.body, /9,800,000/);
  assert.equal(doc.transferAmount, "3000000");
  assert.ok(result.status === "delivered" && result.item.announceInstruction.endsWith(spokenFitAnnounceLine(3_000_000)), "B3 도착 지시 끝 1줄");
  assert.match(spokenFitAnnounceLine(3_000_000), /300만 원/);
  // F3 — 1회 한도 1,000만 원을 넘는 잔액은 한도로
  const big = await deliver({ spokenBalanceWon: 25_000_000 });
  assert.match(big.doc.body, /^금액: 10,000,000원$/m);
});

test("[SB3] 카드 잔액이 먼저 · 말한 잔액 없음 = 종전 · 고정형 금액 = 무변경", async () => {
  const card = await deliver({ cardBalanceWon: 5_000_000, spokenBalanceWon: 3_000_000 });
  assert.match(card.doc.body, /^금액: 5,000,000원$/m, "B1");
  assert.ok(card.result.status === "delivered" && !card.result.item.announceInstruction.includes("상대가 말한 잔액"), "B1 — 1줄 없음(프롬프트가 이미 맞춤)");
  const none = await deliver({});
  assert.match(none.doc.body, /^금액: 9,800,000원$/m, "B4");
  assert.ok(none.result.status === "delivered" && !none.result.item.announceInstruction.includes("상대가 말한 잔액"));
  // B5 — 금액 줄이 없는 문자(인증번호)는 말한 잔액이 있어도 도착 지시 무변경
  const otp: FlowVariantSms = { purpose: "identity", smsId: "institution-otp", required: false, notBeforeUserTurns: 1 };
  const store = memoryStore();
  const r = await deliverSmsThroughGate(store, {
    scenarioId: "institutional-impersonation",
    declared: [otp],
    purpose: "identity",
    userTurns: 5,
    anchorScammerTurn: 5,
    trigger: "model_tool",
    spokenBalanceWon: 3_000_000,
    now: () => ts(1),
  });
  assert.ok(r.status === "delivered" && !r.item.announceInstruction.includes("상대가 말한 잔액"));
});

test("[SB4] 배선 — 두 콜러블 · 발송 통로 · 프롬프트는 카드 잔액만", () => {
  const realtime = read("inCallSms/index.ts");
  assert.match(realtime, /spokenBalanceWon: spokenBalanceWonFrom\(request\.data\?\.spokenBalanceWon\)/);
  const fallback = read("roleplay/index.ts");
  assert.match(fallback, /spokenBalanceWon: spokenBalanceWonFrom\(request\.data\?\.spokenBalanceWon\)/);
  const delivery = read("inCallSms/smsDelivery.ts");
  assert.match(delivery, /input\.cardBalanceWon === undefined \? input\.spokenBalanceWon : undefined/);
  assert.match(read("roleplay/promptAssembly.ts"), /fitPromptAmounts\(withBank, cardBalanceWonFrom\(opts\.personaCard\)\)/, "프롬프트 = 카드만(바이트 고정 변형 무변경)");
});
