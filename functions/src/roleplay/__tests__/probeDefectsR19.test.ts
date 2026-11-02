// ⭐ R19(#485 확인 실측 2026-11-02 (A) S8 · 사용자 결정 "권고대로") — 판정표 A와 G 사이의 틈.
// 포기 단계 첫 턴(G5)에 A는 비켜 가고(옛 A2) G는 아직 끝맺지 않아 다음 단계 요구(신분증 사진)가 그대로 나갔다.
// 수정: A가 포기 단계의 다음 단계 요구도 잡고(A2g) · G가 그 턴에 바로 끝맺는다(G5′). 문구 규칙 추가 0 — 서버가 아는 단계 기준.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SCREEN_GIVE_UP_REPLY,
  SCREEN_GIVE_UP_USER_TURNS,
  decideForcedScreenGiveUp,
  decideStageAdvanceGate,
  screenGiveUpReply,
  type ScreenFact,
} from "../screenAction";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const INSTALL: ScreenFact = { landingId: "child-insurance-install", kind: "install", done: false, offeredAtUserTurns: 1 };
const GIVE_UP_FIRST = 1 + SCREEN_GIVE_UP_USER_TURNS; // 포기 단계 첫 턴(G5)
// #485 (A) S8(예비 모델) 실측 원문.
const S8 = "휴, 다행이다... 이제 마지막으로 보험 접수하려면 엄마 신분증 사진이 필요하대. 찍어서 여기로 보내 줘.";

test("[R19 A2g] 포기 단계 첫 턴의 다음 단계 요구 · 새 칩 → 막는다(giveUpStage) · 포기 대사 · 현 단계 이야기는 그대로", () => {
  const base = { messengerStage: true, facts: [INSTALL], userTurns: GIVE_UP_FIRST, chipLandingIds: [] as string[] };
  assert.deepEqual(decideStageAdvanceGate({ ...base, replyText: S8 }), { blocked: true, kind: "install", giveUpStage: true });
  assert.equal(decideStageAdvanceGate({ ...base, replyText: "잠깐만", chipLandingIds: ["child-bank-transfer"] }).blocked, true, "새 화면 칩");
  assert.equal(decideStageAdvanceGate({ ...base, replyText: SCREEN_GIVE_UP_REPLY.casual }).blocked, false, "포기 대사");
  assert.equal(decideStageAdvanceGate({ ...base, replyText: "엄마 아직도 허용 안 눌렀어? 진짜 급해" }).blocked, false, "현 단계 재촉");
  assert.equal(decideStageAdvanceGate({ ...base, messengerStage: false, replyText: S8 }).blocked, false, "A1 통화 단계");
  // 포기 단계 둘째 턴도 같다(G6이 어차피 끝맺는다 · 재촉 단계와 겹치면 재촉 단계가 먼저 — A3).
  assert.equal(decideStageAdvanceGate({ ...base, userTurns: GIVE_UP_FIRST + 1, replyText: S8 }).blocked, true);
});

test("[R19 G5′] 포기 단계 첫 턴 · 다음 단계 요구 → 이 턴에 서버 끝맺음 · G1~G4는 그대로 우선 · 요구 없는 첫 턴은 종전(G5)", () => {
  const base = { escalatedCall: false, messengerStage: true, endCall: undefined, hangupSignalAllowed: true, facts: [INSTALL], userTurns: GIVE_UP_FIRST };
  assert.equal(decideForcedScreenGiveUp({ ...base, advanceDemand: true }), true, "G5′");
  assert.equal(decideForcedScreenGiveUp(base), false, "G5 요구 없음 = 모델에 한 번 맡김");
  assert.equal(decideForcedScreenGiveUp({ ...base, advanceDemand: true, endCall: "give_up" }), false, "G2 모델 끝맺음");
  assert.equal(decideForcedScreenGiveUp({ ...base, advanceDemand: true, hangupSignalAllowed: false }), false, "G3 끊을 수 없는 칸");
  assert.equal(decideForcedScreenGiveUp({ ...base, advanceDemand: true, messengerStage: false }), false, "G1");
  assert.equal(decideForcedScreenGiveUp({ ...base, advanceDemand: true, facts: [{ ...INSTALL, done: true }] }), false, "G4");
});

test("[R19 배선] sendMessage — A의 포기 단계 판정을 G에 넘긴다 · 모델 give_up이면 재촉 대신 포기 1줄 · G 교체가 마지막", () => {
  const roleplay = read("roleplay/index.ts");
  assert.ok(roleplay.includes("advanceDemand: advanceGate.blocked && advanceGate.giveUpStage,"));
  const gate = roleplay.indexOf("const advanceGate = decideStageAdvanceGate({");
  const forced = roleplay.indexOf("const forcedScreenGiveUp = decideForcedScreenGiveUp({");
  const giveUpLine = roleplay.indexOf(': advanceGate.giveUpStage && endCallSignal === "give_up"\n        ? screenGiveUpReply(farewellGuard.text)');
  const last = roleplay.indexOf("const shapedReplyText = forcedScreenGiveUp ? screenGiveUpReply(");
  assert.ok(gate > 0 && forced > gate && giveUpLine > forced && last > giveUpLine, JSON.stringify([gate, forced, giveUpLine, last]));
  // 포기 1줄은 다시 A에 걸리지 않는다(다음 단계 요구 어휘 0).
  for (const line of Object.values(SCREEN_GIVE_UP_REPLY)) {
    assert.equal(decideStageAdvanceGate({ messengerStage: true, facts: [INSTALL], userTurns: GIVE_UP_FIRST, replyText: line, chipLandingIds: [] }).blocked, false, line);
  }
  assert.equal(screenGiveUpReply(S8), SCREEN_GIVE_UP_REPLY.casual);
});
