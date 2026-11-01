// ⭐ 실기기 신고(2026-11-01 저녁 · main af97126e) A3 · A4 · B6 · B7 + #466 실측 관찰 Q1~Q4 — 화면 제출 뒤 첫 메시지 금액 판정표 T ·
// 통화 넘김 맥락의 이미 보낸 계좌 · 송금 비교 · 설치 끝까지 안 하면 포기 · 메신저 포기 말투 · 계좌 문자 이체 화면 통일.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SCREEN_SUBMIT_FOLLOW_UP_INSTRUCTION,
  SCREEN_TRANSFER_FOLLOW_UP_INSTRUCTION,
  SCREEN_TRANSFER_SHORT_FOLLOW_UP_INSTRUCTION,
  screenFollowUpInstruction,
} from "../screenActionFollowUp";
import { accountSentInChat, buildPriorChatContext, PRIOR_CHAT_ACCOUNT_SENT_RULE, priorChatActions } from "../../realtime/priorChatContext";
import { buildScreenStatusLine, SCREEN_PRESSURE_SENTENCES, type ScreenFact } from "../screenAction";
import { isBankTransferLanding } from "../../scenarios/mockScreens";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

test("[A4 T] 화면 제출 뒤 첫 메시지 — 이체 화면은 송금(적음 = 모자란 금액 요구) · 그 밖 화면은 종전 입력 확인", () => {
  assert.ok(screenFollowUpInstruction("submit", "child-bank-transfer", false, "less").endsWith(SCREEN_TRANSFER_SHORT_FOLLOW_UP_INSTRUCTION), "T1");
  assert.ok(screenFollowUpInstruction("submit", "child-bank-transfer", false, "equal").endsWith(SCREEN_TRANSFER_FOLLOW_UP_INSTRUCTION), "T2");
  assert.ok(screenFollowUpInstruction("submit", "child-bank-transfer", false).endsWith(SCREEN_TRANSFER_FOLLOW_UP_INSTRUCTION), "T2 — 모름");
  assert.ok(!isBankTransferLanding("child-insurance-install"));
  assert.ok(screenFollowUpInstruction("submit", "parcel-redelivery-form", false, "less").endsWith(SCREEN_SUBMIT_FOLLOW_UP_INSTRUCTION), "T3");
  assert.ok(SCREEN_TRANSFER_SHORT_FOLLOW_UP_INSTRUCTION.includes("다 받았다거나 고맙다고 끝내지 말고"), "신고 원문 '잘 받았어 고마워' 차단");
  for (const t of [SCREEN_TRANSFER_SHORT_FOLLOW_UP_INSTRUCTION, SCREEN_TRANSFER_FOLLOW_UP_INSTRUCTION]) assert.ok(!/\d/.test(t) && !/["“”]/.test(t));
  const src = read("roleplay/screenActionFollowUp.ts");
  assert.ok(src.includes("turnInstruction: screenFollowUpInstruction(kind, landingId, canEscalateNow, screenAmountComparison),"));
});

test("[A3] 통화 넘김 맥락 — 대화방으로 계좌를 보냈으면(대사 숫자 · 이체 칩) 그 계좌를 가리키고 못 보낸다는 핑계 금지", () => {
  const chat = [
    { role: "scammer" as const, textMasked: "가온은행 948-2716-5093-27로 200만 원만 보내 줘.", channel: "messenger" },
    { role: "user" as const, textMasked: "알겠어", channel: "messenger" },
  ];
  assert.equal(accountSentInChat(chat), true);
  assert.ok(buildPriorChatContext(chat)!.includes(PRIOR_CHAT_ACCOUNT_SENT_RULE));
  const chipOnly = [{ role: "scammer" as const, textMasked: "여기로 보내 줘", channel: "messenger", attachments: [{ accountNumber: "948-2716-5093-27" }] }];
  assert.equal(accountSentInChat(chipOnly), true, "칩에만 계좌");
  const noAccount = [{ role: "scammer" as const, textMasked: "엄마 나 폰 고장 났어", channel: "messenger" }];
  assert.ok(!buildPriorChatContext(noAccount)!.includes(PRIOR_CHAT_ACCOUNT_SENT_RULE), "계좌를 안 보냈으면 싣지 않는다");
  const voiceOnly = [{ role: "scammer" as const, textMasked: "948-2716-5093-27로 보내세요", channel: "voice" }];
  assert.equal(accountSentInChat(voiceOnly), false, "통화로 부른 계좌는 대화방으로 보낸 것이 아니다");
  assert.ok(PRIOR_CHAT_ACCOUNT_SENT_RULE.includes("메시지를 보낼 수 없다는 핑계는 대지 마라") && !/["“”]/.test(PRIOR_CHAT_ACCOUNT_SENT_RULE));
  // A4 — 대화방 화면 기록이 이체 비교를 싣는다(통화에서도 모자란 금액을 안다).
  assert.deepEqual(priorChatActions([{ submittedAt: 1, amountComparison: "less" }]), ["링크로 연 이체 화면에서 송금했지만 요구한 금액보다 적게 보냈다(모자란 금액이 남았다)"]);
  assert.deepEqual(priorChatActions([{ submittedAt: 1 }]), ["링크로 연 화면에 정보를 입력해 제출했다"], "비교 없음 = 종전");
});

test("[Q1 · Q2 · Q3 · Q4] 재촉 문면 — 메신저 포기 말투 · 기다리라는 말 금지 · 문장 뼈대 · 설치도 포기로", () => {
  const install: ScreenFact = { landingId: "child-insurance-install", kind: "install", done: false, offeredAtUserTurns: 1 };
  const messenger = buildScreenStatusLine(true, [install], { userTurns: 7, messenger: true })!;
  assert.ok(messenger.includes(SCREEN_PRESSURE_SENTENCES.giveUpMessenger), "Q3 · Q1");
  assert.ok(!messenger.includes(SCREEN_PRESSURE_SENTENCES.installRelease), "Q3 — 설치 없이 넘어가지 않는다");
  assert.ok(SCREEN_PRESSURE_SENTENCES.giveUpMessenger.includes("전화를 끊는다는 말은 하지 말고") && SCREEN_PRESSURE_SENTENCES.giveUpMessenger.includes("다시 요구를 남기지 마라"));
  const voice = buildScreenStatusLine(true, [install], { userTurns: 7 })!;
  assert.ok(voice.includes(SCREEN_PRESSURE_SENTENCES.giveUp) && !voice.includes(SCREEN_PRESSURE_SENTENCES.giveUpMessenger), "통화는 종전 포기 문장");
  assert.ok(SCREEN_PRESSURE_SENTENCES.transferPending.includes("기다려 보라는 말은 하지 마라"), "Q2");
  assert.ok(SCREEN_PRESSURE_SENTENCES.switch.includes("앞서 쓴 문장 뼈대도 되풀이하지 마라"), "Q4");
  for (const sentence of Object.values(SCREEN_PRESSURE_SENTENCES)) assert.ok(!/["'“”‘’]/.test(sentence) && !/\d/.test(sentence), sentence);
  assert.ok(read("roleplay/index.ts").includes('messenger: session.channel === "messenger",'));
});

test("[B6 · B7] 계좌 문자가 여는 이체 화면 전부 = 훈련용 이체 흐름(검찰 자산 검수 사이트 제외)", () => {
  for (const id of ["card-relief-transfer", "safe-account-transfer", "protect-account-transfer"]) assert.ok(isBankTransferLanding(id), id);
  for (const id of ["asset-check-wallet", "asset-check-site"]) assert.equal(isBankTransferLanding(id), false, `${id} — 코인 · 지갑 단계 화면`);
});
