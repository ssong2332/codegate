// ⭐ #468 확인 실측 결함(2026-11-01 · 메인 "권고대로") — R9 비밀번호 입력 유도 차단(판정표 P) · R8 메신저 이체 칩 미완료 goal 끊기 대기 ·
// R10 메신저 포기 단계에서 새 요구 · 새 화면 칩 금지.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PASSWORD_FREE_REPLY, stripPasswordRequests } from "../actionAcknowledgement";
import { anyScreenGiveUp, SCREEN_PRESSURE_SENTENCES, SCREEN_GIVE_UP_USER_TURNS, type ScreenFact } from "../screenAction";
import { decideScammerHangup } from "../../scammerHangup/decide";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

test("[R9 P] 비밀번호 입력 · 불러 달라는 절을 뺀다 · 다 빠지면 버튼 1줄 · 인증번호 · 그 밖은 그대로", () => {
  // #468 ③ S11 · S12 원문.
  const s11 = "아직 입금이 확인이 안 되네. 그 링크 화면에서 이체 버튼을 누르고 비밀번호까지 확실히 입력했는지 한 번만 더 확인해 줄래?";
  assert.deepEqual(stripPasswordRequests(s11), { text: "아직 입금이 확인이 안 되네.", stripped: true }, "P1");
  const s12 = "그 링크 화면 맨 아래 '이체하기' 버튼을 누르고, 나온 비밀번호 여섯 자리를 입력하면 돼.";
  assert.deepEqual(stripPasswordRequests(s12), { text: PASSWORD_FREE_REPLY.casual, stripped: true }, "P2 — 반말");
  assert.deepEqual(stripPasswordRequests("계좌 비밀번호를 불러 주세요."), { text: PASSWORD_FREE_REPLY.polite, stripped: true }, "P2 — 존댓말");
  assert.equal(stripPasswordRequests("문자로 온 인증번호 여섯 자리를 불러 줘.").stripped, false, "인증번호는 대상 아님");
  assert.equal(stripPasswordRequests("엄마 지금 200만 원만 보내 줘ㅠㅠ").stripped, false, "P3");
  assert.ok(SCREEN_PRESSURE_SENTENCES.transferPending.includes("비밀번호 · 인증번호를 입력하라거나 불러 달라고 하지 마라"), "지시 문면(실시간 · 폴백)");
  assert.ok(read("roleplay/index.ts").includes("const passwordGuard = stripPasswordRequests(factCheckedReplyText);"));
  assert.ok(read("roleplay/screenActionFollowUp.ts").includes("finalizeScammerReplyText(stripPasswordRequests(factChecked).text)"));
});

test("[R8] 메신저 이체 칩 미완료 · 적게 보냄 = 결정 화면 대기 → goal 끊기 4-c 막힘 · give_up 통과", () => {
  const src = read("roleplay/index.ts");
  // R16(2026-11-01) — 같은 판정을 변수로 들어 작별 대사 교체(판정표 F)와 나눠 쓴다(결정 화면 대기 반영은 그대로).
  assert.ok(src.includes('messengerTransferChipPending = transferChips.length > 0 && (!transferChips.some((f) => f.done) || latestTransferAmount(chipFacts) === "less");'));
  assert.ok(src.includes("if (messengerTransferChipPending) decisionScreenPending = true;"));
  const base = {
    status: "active" as const,
    channel: "messenger" as const,
    messengerStageAllowed: true,
    isMockTurn: false,
    verifyEnabled: false,
    transferPlaced: false,
    transferReachable: true,
    goalActionDone: false,
    followUpPending: false,
    decisionScreenPending: true,
    userTurns: 15,
    pendingInstruction: false,
    smsAwaitingUser: false,
    limitReached: false,
    alreadyAccepted: false,
    relay: undefined,
  };
  assert.equal(decideScammerHangup({ ...base, hangupKind: "goal" }).status, "blocked_decision");
  assert.equal(decideScammerHangup({ ...base, hangupKind: "give_up" }).hangup, true);
});

test("[R10] 메신저 포기 단계 — 이번 대답에서 끝 · 새 요구 금지 문면 · 포기 단계면 새 화면 칩 0", () => {
  assert.ok(SCREEN_PRESSURE_SENTENCES.giveUpMessenger.includes("이번 대답에서 포기로 끝내라"));
  assert.ok(SCREEN_PRESSURE_SENTENCES.giveUpMessenger.includes("신분증 · 송금 같은 새 요구를 꺼내지 말고"));
  const install: ScreenFact = { landingId: "child-insurance-install", kind: "install", done: false, offeredAtUserTurns: 1 };
  assert.equal(anyScreenGiveUp([install], 1 + SCREEN_GIVE_UP_USER_TURNS - 1), false);
  assert.equal(anyScreenGiveUp([install], 1 + SCREEN_GIVE_UP_USER_TURNS), true);
  assert.equal(anyScreenGiveUp([{ ...install, done: true }], 20), false, "마친 화면은 포기 대상 아님");
  const src = read("roleplay/index.ts");
  assert.ok(src.includes("const giveUpStage = screenApplies && anyScreenGiveUp(screenFacts, userTurnsNow);"));
  assert.ok(src.includes("screenFacts.some((f) => f.landingId === attachment.fakeLandingId)"), "이미 보낸 화면 칩만 남긴다");
});
