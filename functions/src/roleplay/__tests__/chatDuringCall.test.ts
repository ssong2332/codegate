// §121.7 PR-3(메인 결정 ⓑⓒ) — 통화 중 대화방 카톡의 서버 경로. 판정표 · 지시 문면 · 배선(소스 스캔)을 고정한다.
// ⛔ 라이브 호출 0건.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { canChatDuringCall, CHAT_DURING_CALL_INSTRUCTION } from "../chatDuringCall";
import { judgeScammerReplyUsability } from "../../llm/replyUsability";

const SRC = path.resolve(__dirname, "../../../src/roleplay");
const read = (file: string) => readFileSync(path.join(SRC, file), "utf8").replace(/\r\n/g, "\n");
const escalated = [{ from: "messenger", to: "voice", trigger: "manual_button", at: null }] as never;

test("[§121.7 표] 메신저에서 넘어온 진행 중 통화에서만 받는다", () => {
  assert.equal(canChatDuringCall({ status: "active", channel: "voice", channelHistory: escalated }), true);
  assert.equal(canChatDuringCall({ status: "active", channel: "voice", channelHistory: [] }), false, "처음부터 통화");
  assert.equal(canChatDuringCall({ status: "active", channel: "messenger", channelHistory: escalated }), false, "이미 대화방 단계");
  assert.equal(canChatDuringCall({ status: "ended", channel: "voice", channelHistory: escalated }), false, "종료");
});

test("[§121.7 지시] 짧게 · 통화와 어긋나지 않게 · 끊자는 말 금지 — 지시문 자체가 메타 판정에 걸리지 않는다", () => {
  for (const phrase of ["통화가 연결된 채로", "짧게(1~2문장)", "어긋나지 않게", "끊자거나"]) {
    assert.ok(CHAT_DURING_CALL_INSTRUCTION.includes(phrase), phrase);
  }
  assert.ok(!/훈련|시뮬레이션/.test(CHAT_DURING_CALL_INSTRUCTION));
  assert.equal(judgeScammerReplyUsability("응 아빠 통화하면서 톡도 볼게. 보증금 계좌 다시 보내줄게"), undefined);
});

test("[§121.7 배선] sendMessage는 duringCall이면 시나리오 확인 직후 별도 경로로 넘기고, 그 경로는 messenger 채널 · 합성 0", () => {
  const index = read("index.ts");
  const route = index.indexOf("if (request.data?.duringCall === true) {");
  assert.ok(route > index.indexOf("const scenarioPrompt = resolveSessionScenarioPrompt("), "시나리오 프롬프트 확인 뒤");
  assert.ok(route < index.indexOf("const claim = await db.runTransaction("), "일반 턴 확보 앞");
  assert.match(index, /return replyChatDuringCall\(\{ db, sessionRef, sessionId, session, scenarioPrompt, userText, isPhotoTurn \}\);/);

  const chat = read("chatDuringCall.ts");
  assert.equal((chat.match(/channel: "messenger",/g) ?? []).length, 2, "사용자 · 사기범 둘 다 messenger");
  // §128(3) — 끊기 규칙은 사전 판정 값(G1 none · G2 signal)이다(고정 "none" 아님).
  assert.match(chat, /const hangupMode = fallbackHangupMode\(hangupPre\);/);
  assert.match(chat, /\n\s*hangupMode,\n/);
  assert.match(chat, /callPhaseMockTacticHints\(scenarioPrompt\.weakenedTactics, true\)/, "Mock 대사에도 '통화가 안 돼' 0");
  assert.match(chat, /tx\.update\(sessionRef, \{ turnCount: fresh\.turnCount \+ 1 \}\);/, "ⓒ 턴 수 합산");
  assert.ok(!chat.includes("getVoiceProvider"), "음성 합성 0");
  assert.ok(!chat.includes("transitionChannel"), "전환 0");
  assert.ok(!chat.includes("deliverSmsThroughGate"), "문자 0");
  // §128(3) G3 — 세션을 끝내는 것은 포기 신호 · 사후 판정 accepted · 트랜잭션 재확인일 때뿐이다.
  assert.match(chat, /const end = giveUp && fresh\?\.status === "active";/);
  assert.match(chat, /endCall === "give_up" &&\n\s*hangupMode === "signal" &&\n\s*decideFallbackHangup\(hangupFacts, delivered, completion\.isMock, endCall\)\.status === "accepted"/); // P1 M1 — 사후 판정에 신호 사유(4-c행)
});
