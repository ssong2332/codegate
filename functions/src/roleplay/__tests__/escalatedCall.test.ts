// A-1 ⑧(2026-10-19 · audit-B 1일차 #2) — 메신저→voice 에스컬레이션 뒤 폴백 턴에서 전화 예고를 되풀이하지 않게.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Timestamp } from "firebase-admin/firestore";
import { ESCALATED_CALL_CONTEXT_INSTRUCTION, isEscalatedVoiceCall } from "../escalatedCall";
import { MOCK_INSTALL_CONSENT_INSTRUCTION, MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL } from "../../scenarios/mockScreens";
import type { ChannelTransitionEntry } from "../../shared/types";

const at = Timestamp.fromMillis(0);
const ESCALATED: ChannelTransitionEntry[] = [{ from: "messenger", to: "voice", at, trigger: "structured_signal" }];

test("[A-1/⑧ 판정표] voice + messenger→voice 전이 기록만 참 — 메신저 단계 · 처음부터 통화 · 역전이 뒤 메신저는 거짓", () => {
  assert.equal(isEscalatedVoiceCall("voice", ESCALATED), true);
  assert.equal(isEscalatedVoiceCall("messenger", ESCALATED), false, "메신저 단계(전이 전/역전이 뒤)");
  assert.equal(isEscalatedVoiceCall("voice", undefined), false, "처음부터 통화로 시작한 세션");
  assert.equal(isEscalatedVoiceCall("voice", []), false);
  assert.equal(isEscalatedVoiceCall(undefined, ESCALATED), false, "채널 미표기(옛 보이스 세션)");
  assert.equal(
    isEscalatedVoiceCall("voice", [...ESCALATED, { from: "voice", to: "messenger", at, trigger: "manual_button" }, { from: "messenger", to: "voice", at, trigger: "structured_signal" }]),
    true,
    "역전이 뒤 다시 통화로 넘어온 세션",
  );
});

test("[A-1/⑧ 문면] 통화 중 응낙 변형 · 맥락 1줄 — 전화 예고 지시 0, 이미 통화 중임을 알린다(원문은 바이트 동일 유지)", () => {
  // 원문(메신저 단계 응낙)은 그대로다 — 이 단언이 깨지면 메신저 단계의 에스컬레이션 연결 문장이 사라진 것이다.
  assert.ok(MOCK_INSTALL_CONSENT_INSTRUCTION.includes("이제 담당자가 전화로 이어서 안내하겠다고 말하라"));
  for (const text of [MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL, ESCALATED_CALL_CONTEXT_INSTRUCTION]) {
    assert.equal(text.includes("전화로 이어서 안내하겠다고 말하라"), false, `통화 중 변형에 전화 예고 지시가 남았다: ${text}`);
    assert.equal(/[0-9]/.test(text), false);
    assert.equal(/["“”'‘’]/.test(text), false, "따옴표 대사 예시 0");
  }
  assert.ok(MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL.includes("이미 통화 중이니 전화하겠다는 말 없이"));
  assert.ok(ESCALATED_CALL_CONTEXT_INSTRUCTION.includes("이미 전화 통화로 넘어와 있다"));
  assert.ok(ESCALATED_CALL_CONTEXT_INSTRUCTION.includes("다시 하지 말고"));
});

test("[A-1/⑧ 역방향] 옛 배선(통화 중에도 원문 응낙 지시)은 위 문면 검사에 걸린다", () => {
  assert.ok(
    MOCK_INSTALL_CONSENT_INSTRUCTION.includes("전화로 이어서 안내하겠다고 말하라"),
    "역검증 전제 — 원문은 전화 예고를 지시한다(이것이 통화 중에 실리면 '곧 전화드리겠습니다'가 반복된다)",
  );
});

test("[A-1/⑧ 배선] sendMessage — 응낙 지시를 통화 중 변형으로 고르고, 다른 턴 지시가 없는 턴에만 맥락 1줄을 싣는다(소스 스캔)", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/roleplay/index.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /const escalatedCall = isEscalatedVoiceCall\(session\.channel, session\.channelHistory\);/);
  assert.match(
    src,
    /turnInstruction = escalatedCall \? MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL : MOCK_INSTALL_CONSENT_INSTRUCTION;/,
  );
  assert.match(src, /escalatedCall && turnChoice === "none" \? ESCALATED_CALL_CONTEXT_INSTRUCTION : undefined;/);
  // 채널 전이 판정(구조화 신호 · max-turn 폴백)은 무접촉 — 기존 조건식이 그대로 있다.
  assert.match(src, /if \(signalEscalate\) \{\n\s*escalationTrigger = "structured_signal";/);
});
