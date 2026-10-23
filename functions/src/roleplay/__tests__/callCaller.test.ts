// §123(실기 신고 2026-10-23 *"내가 보이스톡을 했는데, AI가 전화를 본인이 했다고 이야기하는 것도 수정하자"*) — 통화를 건 쪽 판정과
// 그 값이 Live 맥락 · 폴백 턴 지시 · 전환 기록에 실리는지 고정한다. ⛔ 라이브 호출 0건.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { currentCallCaller, PARTICIPANT_CALLED_INSTRUCTION } from "../callCaller";
import { buildPriorChatContext } from "../../realtime/priorChatContext";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const toVoice = (caller?: "participant") => ({ from: "messenger" as const, to: "voice" as const, ...(caller ? { caller } : {}) });
const toChat = { from: "voice" as const, to: "messenger" as const };

test("[§123 표] 가장 최근 메신저→통화 전환의 caller가 건 쪽 — 기록 없음 · 필드 없음 = 사기범", () => {
  assert.equal(currentCallCaller(undefined), "scammer");
  assert.equal(currentCallCaller([]), "scammer");
  assert.equal(currentCallCaller([toVoice()]), "scammer");
  assert.equal(currentCallCaller([toVoice("participant")]), "participant");
  // 사용자가 건 뒤 끊고 돌아왔다가 사기범이 다시 걸었다 → 가장 최근 전환을 본다.
  assert.equal(currentCallCaller([toVoice("participant"), toChat, toVoice()]), "scammer");
  assert.equal(currentCallCaller([toVoice(), toChat, toVoice("participant"), toChat]), "participant");
});

test("[§123 Live 맥락] 참가자가 건 통화 — '너에게 건 보이스톡' · '내가 전화했어' 금지 · 받는 사람 첫마디. 사기범이 건 통화 = 종전 문면", () => {
  const messages = [{ role: "scammer" as const, channel: "messenger", textMasked: "아빠 나 폰 깨졌어" }];
  const participant = buildPriorChatContext(messages, [], "participant")!;
  assert.ok(participant.includes("상대(참가자)가 너에게 건 보이스톡이고, 너는 방금 받았다"));
  assert.ok(participant.includes("'내가 전화했어'"));
  assert.ok(participant.includes("어, 전화했네? 나 지금…"));
  assert.ok(!participant.includes("네가 건 전화다]"));
  const scammer = buildPriorChatContext(messages)!;
  assert.equal(scammer, buildPriorChatContext(messages, [], "scammer"));
  assert.ok(scammer.startsWith("[이 통화 전까지의 대화 — 이 통화는 아래 메시지 대화에 이어서 네가 건 전화다]"));
  assert.ok(scammer.includes("메시지로 하던 이야기 때문에 전화했다는 뜻"));
});

test("[§123 배선] 보이스톡 발신 = 전환 기록 caller · Live 맥락 · 폴백 턴 지시(참가자가 건 통화에서만)", () => {
  const session = read("session/index.ts");
  assert.match(session, /via === "voice_talk_dial" \? \{ caller: "participant" \} : undefined,/);
  assert.match(read("session/channelTransition.ts"), /\.\.\.\(options\?\.caller \? \{ caller: options\.caller \} : \{\}\),/);
  assert.match(read("realtime/index.ts"), /currentCallCaller\(session\.channelHistory\),\n\s*\);/);
  const roleplay = read("roleplay/index.ts");
  assert.match(
    roleplay,
    /escalatedCall && currentCallCaller\(session\.channelHistory\) === "participant" \? PARTICIPANT_CALLED_INSTRUCTION : undefined;/,
  );
  assert.match(roleplay, /\[turnInstructionWithSms, photoTurnInstruction\(isPhotoTurn\), participantCalledInstruction\]/);
  assert.ok(PARTICIPANT_CALLED_INSTRUCTION.includes("네가 전화한 것이 아니다"));
});
