// ⭐ R15 · R16(#479 확인 실측 2026-11-01 · 사용자 결정 "권고대로") — 설치 기록 없는 설치 완료 단정 · 신분증 요구 역할 뒤집힘 · 이체 칩 미완료 작별.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  INSTALL_NOT_CONFIRMED_REPLY,
  TRANSFER_NOT_CONFIRMED_REPLY,
  assertsInstallDone,
  guardFarewellWhileTransferPending,
  guardUnconfirmedInstall,
} from "../actionAcknowledgement";
import { fixPersonaIdRequest } from "../personaGuard";
import { decideFallbackHangup, resolveFallbackHangupEffect } from "../../scammerHangup/fallback";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const CHILD = "messenger-child-impersonation-kakao";

// #479 ② S5(예비 모델) 실측 원문.
const S5 = "설치 끝난 거 맞지? 고마워, 엄마. 이제 보험 접수해야 하는데, 거기 내 신분증 사진이 필요하대. 엄마 휴대폰으로 내 주민등록증 사진 찍어서 카톡으로 바로 좀 보내줄래?";

test("[R15 ⓐ I] 설치 화면 미완료 · 설치 완료 단정 → 설치 미확인 1줄 · 재촉 · 조건 · 질문은 그대로", () => {
  assert.deepEqual(guardUnconfirmedInstall(S5, true), { text: INSTALL_NOT_CONFIRMED_REPLY.casual, replaced: true });
  assert.equal(guardUnconfirmedInstall("설치 완료됐습니다. 이제 신분증을 보내 주세요.", true).text, INSTALL_NOT_CONFIRMED_REPLY.polite);
  assert.deepEqual(guardUnconfirmedInstall(S5, false), { text: S5, replaced: false }, "I2 설치 기록 있음 · 대상 아님");
  for (const text of [
    "엄마 지금 설치는 됐는데 허용을 아직 안 누른 것 같아.",
    "설치 끝나면 바로 다음 단계 알려줄게.",
    "앱이 아직 완료됐다는 알림이 안 떠서 그러는데",
    "설치 다 됐어? 확인되면 말해줘",
  ]) {
    assert.equal(assertsInstallDone(text), false, text);
  }
  for (const line of Object.values(INSTALL_NOT_CONFIRMED_REPLY)) assert.ok(!/["“”\d]/.test(line), line);
});

test("[R15 ⓑ P4] 자녀 · 지인 사칭의 '내 신분증' 요구 → 소유 낱말만 뺀다 · 요구 없는 절 · 다른 시나리오는 그대로", () => {
  assert.deepEqual(fixPersonaIdRequest(CHILD, "거기 내 신분증 사진이 필요하대. 엄마 휴대폰으로 내 주민등록증 사진 찍어서 보내줄래?"), {
    text: "거기 신분증 사진이 필요하대. 엄마 휴대폰으로 주민등록증 사진 찍어서 보내줄래?",
    fixed: true,
  });
  assert.equal(fixPersonaIdRequest("messenger-friend-loan-kakao", "제 신분증 사진 좀 보내 주세요").text, "신분증 사진 좀 보내 주세요");
  assert.equal(fixPersonaIdRequest(CHILD, "내 신분증은 잃어버려서 없어.").fixed, false, "P5 요구 없음");
  assert.equal(fixPersonaIdRequest("card-company-impersonation", "내 신분증 사진 보내줘").fixed, false, "P5 대상 밖");
});

test("[R16 F] 메신저 이체 칩 미완료 · 작별 · 나중 연락 → 이체 미확인 재촉 1줄 · 포기 끝맺음 · 통화 단계 · 재촉은 그대로", () => {
  // #479 ② S12 · S13 실측 원문(S13은 R13 교정 뒤 "이제 갈게").
  const s12 = "응, 고마워 엄마ㅠㅠ 지금 이체 기록이 바로 확인이 안 돼서 나중에 다시 연락할게. 이 얘기는 아빠한테는 비밀로 해 줘, 알았지?";
  const on = { messengerStage: true, transferChipPending: true, givingUp: false };
  assert.deepEqual(guardFarewellWhileTransferPending(s12, on), { text: TRANSFER_NOT_CONFIRMED_REPLY.casual, replaced: true });
  assert.equal(guardFarewellWhileTransferPending("고마워 엄마, 진짜 살았다ㅠㅠ 이제 갈게.", on).replaced, true);
  assert.equal(guardFarewellWhileTransferPending(s12, { ...on, givingUp: true }).replaced, false, "F2 포기 끝맺음");
  assert.equal(guardFarewellWhileTransferPending(s12, { ...on, messengerStage: false }).replaced, false, "F2 통화 단계");
  assert.equal(guardFarewellWhileTransferPending(s12, { ...on, transferChipPending: false }).replaced, false, "F2 이체 마침");
  assert.equal(guardFarewellWhileTransferPending("엄마 링크 화면에서 이체 완료만 눌러줘.", on).replaced, false, "재촉");
});

test("[R16 근거] 이 상태의 goal 끊기는 4-c가 막아 대화가 이어진다(끊기 효과 end=false · 응답 ended=한도뿐)", () => {
  const facts = {
    status: "active" as const,
    channel: "messenger" as const,
    verifyEnabled: false,
    transferPlaced: false,
    transferReachable: true,
    goalActionDone: false,
    followUpPending: false,
    decisionScreenPending: true,
    userTurns: 12,
    limitReached: false,
    alreadyAccepted: false,
    relay: undefined,
    smsDeclared: false,
    smsDeliveredLoaded: true,
  };
  const pre = decideFallbackHangup(facts, [], false);
  const post = decideFallbackHangup(facts, [], false, "goal");
  assert.equal(post.row, "4-c");
  assert.equal(resolveFallbackHangupEffect({ endCall: "goal", hangupMode: "signal", pre, post }).end, false);
  assert.equal(decideFallbackHangup(facts, [], false, "give_up").status, "accepted", "포기 끝맺음은 통과(F2)");
  const roleplay = read("roleplay/index.ts");
  assert.ok(roleplay.includes("ended: limitReached || finalize.hangupEnded,"));
});

test("[R15 · R16 배선] sendMessage — 메신저 단계 · 이체 칩 판정 공유 · 순서(비밀번호 → 설치 → 소유 낱말 → 통화 말 → 작별)", () => {
  const roleplay = read("roleplay/index.ts");
  assert.ok(roleplay.includes("messengerTransferChipPending = transferChips.length > 0 &&"));
  assert.ok(roleplay.includes('session.channel === "messenger" && screenFacts.some((f) => f.kind === "install") &&'));
  const order = [
    "const passwordGuard = stripPasswordRequests(",
    "const installGuard = guardUnconfirmedInstall(passwordGuard.text, installScreenPending);",
    "const personaIdFix = fixPersonaIdRequest(session.scenarioId, installGuard.text);",
    "fixMessengerCallWording(personaIdFix.text)",
    "const farewellGuard = guardFarewellWhileTransferPending(wordingFixedReplyText, {",
    "const limitedReplyText = farewellGuard.text;",
  ].map((needle) => roleplay.indexOf(needle));
  assert.ok(order.every((at, k) => at > 0 && (k === 0 || at > order[k - 1]!)), JSON.stringify(order));
});
