// ⭐ R17 · R18(#482 확인 실측 2026-11-01 · 사용자 결정 "권고대로" — 문구 규칙이 아니라 서버가 단계 진행 · 포기를 정한다).
// R17 판정표 A(마치지 않은 화면 재촉 단계에서 다음 단계 요구 차단) · R18 판정표 G 메신저 단계 확장.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SCREEN_GIVE_UP_USER_TURNS,
  STAGE_HOLD_REPLY,
  decideForcedScreenGiveUp,
  decideStageAdvanceGate,
  stageHoldReply,
  type ScreenFact,
} from "../screenAction";
import { decideFallbackHangup } from "../../scammerHangup/fallback";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const INSTALL: ScreenFact = { landingId: "child-insurance-install", kind: "install", done: false, offeredAtUserTurns: 1 };
const TRANSFER: ScreenFact = { landingId: "child-bank-transfer", kind: "transfer", done: false, offeredAtUserTurns: 7 };

test("[R17 A] 설치 재촉 단계 — 완료를 말하지 않고 다음 요구로 넘어가도 막는다(#482 (A) S5 원문) · 현 단계 재촉은 그대로", () => {
  const base = { messengerStage: true, facts: [INSTALL], userTurns: 4, chipLandingIds: [] as string[] };
  // 단정 문구가 없는 실측 원문 — 판정표 I는 못 잡았다.
  assert.deepEqual(
    decideStageAdvanceGate({ ...base, replyText: "어휴 다행이다... 이제 보험 접수하려면 엄마 신분증 사진이 필요하대. 지금 바로 찍어서 여기로 보내 줘." }),
    { blocked: true, kind: "install", giveUpStage: false },
  );
  assert.equal(decideStageAdvanceGate({ ...base, replyText: "엄마 200만 원만 급하게 보내줘" }).blocked, true, "송금 요구");
  assert.equal(decideStageAdvanceGate({ ...base, replyText: "인증번호 6자리 불러 줘" }).blocked, true, "인증번호");
  assert.equal(decideStageAdvanceGate({ ...base, replyText: "잠깐만", chipLandingIds: ["child-bank-transfer"] }).blocked, true, "새 화면 칩");
  assert.equal(decideStageAdvanceGate({ ...base, replyText: "엄마 설치 화면에서 허용이랑 계속하기 눌러 줘" }).blocked, false, "A4 현 단계 재촉");
  assert.equal(decideStageAdvanceGate({ ...base, replyText: "허용 눌러 줘", chipLandingIds: ["child-insurance-install"] }).blocked, false, "A4 같은 화면 칩");
  assert.equal(decideStageAdvanceGate({ ...base, messengerStage: false, replyText: "신분증 보내 줘" }).blocked, false, "A1 통화 단계");
});

test("[R17 A2] 재촉 단계가 아니면 무변경 — 마침 · 설치 뒤 다른 화면을 이미 보냄(SP1 release) · 포기 단계는 R19 A2g(probeDefectsR19)", () => {
  const text = "이제 신분증 사진 보내 줘";
  assert.equal(decideStageAdvanceGate({ messengerStage: true, facts: [{ ...INSTALL, done: true }], userTurns: 4, replyText: text, chipLandingIds: [] }).blocked, false);
  // R19(2026-11-02) — 포기 단계의 다음 단계 요구도 막는다(G가 끝맺음 · 예전 기대값 false).
  assert.deepEqual(
    decideStageAdvanceGate({ messengerStage: true, facts: [INSTALL], userTurns: 1 + SCREEN_GIVE_UP_USER_TURNS, replyText: text, chipLandingIds: [] }),
    { blocked: true, kind: "install", giveUpStage: true },
    "포기 단계",
  );
  assert.deepEqual(
    decideStageAdvanceGate({ messengerStage: true, facts: [INSTALL, TRANSFER], userTurns: 9, replyText: "인증번호 불러 줘", chipLandingIds: [] }),
    { blocked: true, kind: "transfer", giveUpStage: false },
    "설치 release · 이체 재촉 단계",
  );
});

test("[R17 A] 이체 재촉 단계 — 신분증 · 인증번호 · 설치 요구 차단 · 같은 이체 재촉 · 금액 이야기는 그대로", () => {
  const base = { messengerStage: true, facts: [TRANSFER], userTurns: 9, chipLandingIds: [] as string[] };
  assert.equal(decideStageAdvanceGate({ ...base, replyText: "그거 됐으면 인증번호 불러 줘" }).blocked, true);
  assert.equal(decideStageAdvanceGate({ ...base, replyText: "앱 하나 더 깔아야 돼" }).blocked, true);
  assert.equal(decideStageAdvanceGate({ ...base, replyText: "200만 원 링크 화면에서 이체 마저 해 줘" }).blocked, false);
});

test("[R17] 재촉 1줄 — 말투 맞춤 · 발화 수로 돌려 씀 · 따옴표 · 숫자 · 다른 단계 요구 어휘 0", () => {
  assert.equal(stageHoldReply("install", "엄마 빨리 해줘ㅠㅠ", 3), STAGE_HOLD_REPLY.install.casual[0]);
  assert.equal(stageHoldReply("install", "엄마 빨리 해줘ㅠㅠ", 4), STAGE_HOLD_REPLY.install.casual[1]);
  assert.equal(stageHoldReply("transfer", "진행해 주세요.", 5), STAGE_HOLD_REPLY.transfer.polite[2]);
  for (const kind of ["install", "transfer"] as const) {
    for (const line of [...STAGE_HOLD_REPLY[kind].casual, ...STAGE_HOLD_REPLY[kind].polite]) {
      assert.ok(!/["“”\d]/.test(line), line);
      // 재촉 1줄이 다시 판정표 A에 걸리지 않는다(그 화면 밖 요구 어휘 0).
      assert.equal(decideStageAdvanceGate({ messengerStage: true, facts: [kind === "install" ? INSTALL : TRANSFER], userTurns: 4, replyText: line, chipLandingIds: [] }).blocked, false, line);
    }
  }
});

test("[R18 G] 메신저 단계 — 포기 단계 둘째 턴 · 신호 없음 · 끊기 허용이면 서버 끝맺음 · 4-c는 give_up을 막지 않는다", () => {
  const giveUpAt = TRANSFER.offeredAtUserTurns! + SCREEN_GIVE_UP_USER_TURNS; // 포기 단계 첫 턴
  const base = { escalatedCall: false, messengerStage: true, endCall: undefined, hangupSignalAllowed: true, facts: [TRANSFER] };
  assert.equal(decideForcedScreenGiveUp({ ...base, userTurns: giveUpAt }), false, "G5 첫 턴은 지시로");
  assert.equal(decideForcedScreenGiveUp({ ...base, userTurns: giveUpAt + 1 }), true, "G6");
  assert.equal(decideForcedScreenGiveUp({ ...base, userTurns: giveUpAt + 1, messengerStage: false }), false, "G1 처음부터 통화");
  assert.equal(decideForcedScreenGiveUp({ ...base, userTurns: giveUpAt + 1, hangupSignalAllowed: false }), false, "G3");
  const facts = {
    status: "active" as const,
    channel: "messenger" as const,
    verifyEnabled: false,
    transferPlaced: false,
    transferReachable: true,
    goalActionDone: false,
    followUpPending: false,
    decisionScreenPending: true,
    userTurns: giveUpAt + 1,
    limitReached: false,
    alreadyAccepted: false,
    relay: undefined,
    smsDeclared: false,
    smsDeliveredLoaded: true,
  };
  assert.equal(decideFallbackHangup(facts, [], false, "give_up").status, "accepted", "4-c는 give_up 통과");
  assert.equal(decideFallbackHangup(facts, [], false, "goal").row, "4-c", "goal은 그대로 막힘");
});

test("[R17 · R18 배선] sendMessage — 칩 떼기 · goal 무시 · 재촉 교체 · G 메신저 단계 · 포기가 재촉 교체를 이긴다", () => {
  const roleplay = read("roleplay/index.ts");
  assert.ok(roleplay.includes('messengerStage: session.channel === "messenger" && screenApplies,'));
  assert.ok(roleplay.includes("giveUpStage || advanceGate.blocked ? (keptOnGiveUp && keptOnGiveUp.length > 0 ? keptOnGiveUp : undefined) : replyAttachmentsBeforeGiveUp;"));
  assert.ok(roleplay.includes('(unconfirmedTransferAck || advanceGate.blocked) && rawEndCallSignal === "goal" ? undefined : rawEndCallSignal,'));
  assert.ok(roleplay.includes('      messengerStage: session.channel === "messenger",\n'));
  // R19(2026-11-02) — 재촉 교체가 포기 단계 give_up 분기를 품은 여러 줄 식이 됐다.
  const hold = roleplay.indexOf(": stageHoldReply(advanceGate.kind, farewellGuard.text, userTurnsNow);");
  const giveUp = roleplay.indexOf("const shapedReplyText = forcedScreenGiveUp ? screenGiveUpReply(");
  assert.ok(hold > 0 && giveUp > hold, "포기 1줄 교체가 뒤(이긴다)");
});
