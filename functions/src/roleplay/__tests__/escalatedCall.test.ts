// A-1 ⑧(2026-10-19 · audit-B 1일차 #2) — 메신저→voice 에스컬레이션 뒤 폴백 턴에서 전화 예고를 되풀이하지 않게.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Timestamp } from "firebase-admin/firestore";
import { ESCALATED_CALL_CONTEXT_INSTRUCTION, isEscalatedVoiceCall } from "../escalatedCall";
import {
  IN_CALL_INSTALL_CONSENT_INSTRUCTION,
  installConsentInstructionFor,
  MOCK_INSTALL_CONSENT_INSTRUCTION,
  MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL,
} from "../../scenarios/mockScreens";
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
  // T194-c-1 G607(§84.15.4) — 옛 선택식(`escalatedCall ? …_IN_CALL : …`)은 같은 커밋에 **선택 함수 1개**로 대체됐다(진입 표면을 함께 본다).
  // 메신저 행의 값은 그대로다(아래 G607 진리표 1 · 2행이 고정). 함수가 `escalatedCall`을 그대로 받는지까지 여기서 본다.
  assert.match(
    src,
    /turnInstruction = installConsentInstructionFor\(\{\n\s*entrySurface: mockConsentSurface \?\? "messenger-link",\n\s*escalatedCall,\n\s*path: "fallback",\n\s*transferPlaced: verifyState\?\.placed === true,\n\s*\.\.\.\(mockConsentLandingId !== undefined \? \{ landingId: mockConsentLandingId \} : \{\}\),\n\s*\}\);/,
  );
  assert.match(src, /escalatedCall && turnChoice === "none" \? ESCALATED_CALL_CONTEXT_INSTRUCTION : undefined;/);
  // 채널 전이 판정(구조화 신호 · max-turn 폴백)은 무접촉 — 기존 조건식이 그대로 있다.
  assert.match(src, /if \(signalEscalate\) \{\n\s*escalationTrigger = "structured_signal";/);
});

// ── T194-c-1 G607(docs/Architecture.md §84.15.4 진리표 · Q-X4) — 설치 응낙 지시 선택 함수 ─────────────────────────────

test("[T194-c-1 G607] installConsentInstructionFor 진리표 — 메신저 2행 현행 · 통화 중(Q2) 폴백 = 통화 중 변형 재사용 · 실시간 = 조건형 · 호 전환 뒤 = undefined", () => {
  const rows: [string, Parameters<typeof installConsentInstructionFor>[0], string | undefined][] = [
    ["메신저 · 전이 전 · 폴백", { entrySurface: "messenger-link", escalatedCall: false, path: "fallback", transferPlaced: false }, MOCK_INSTALL_CONSENT_INSTRUCTION],
    ["메신저 · 전이 뒤 · 폴백", { entrySurface: "messenger-link", escalatedCall: true, path: "fallback", transferPlaced: false }, MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL],
    ["통화 중 문자 · 전이 무관(거짓) · 폴백", { entrySurface: "in-call-sms", escalatedCall: false, path: "fallback", transferPlaced: false }, MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL],
    ["통화 중 문자 · 전이 무관(참) · 폴백", { entrySurface: "in-call-sms", escalatedCall: true, path: "fallback", transferPlaced: false }, MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL],
    ["통화 중 문자 · 실시간", { entrySurface: "in-call-sms", escalatedCall: false, path: "realtime", transferPlaced: false }, IN_CALL_INSTALL_CONSENT_INSTRUCTION],
    ["통화 중 문자 · 폴백 · 호 전환 뒤", { entrySurface: "in-call-sms", escalatedCall: false, path: "fallback", transferPlaced: true }, undefined],
    ["통화 중 문자 · 실시간 · 호 전환 뒤", { entrySurface: "in-call-sms", escalatedCall: false, path: "realtime", transferPlaced: true }, undefined],
  ];
  for (const [label, input, expected] of rows) assert.equal(installConsentInstructionFor(input), expected, label);
  // 통화 중 행 전부 "전화로 이어서" 0 · 실시간 정본은 조건형(§84.5.4 정본 그대로) · 전화 새로 걸기 금지 문장.
  for (const [label, input] of rows) {
    if (input.entrySurface !== "in-call-sms") continue;
    const text = installConsentInstructionFor(input) ?? "";
    assert.equal(text.includes("전화로 이어서"), false, `${label}: 통화 중 행에 "전화로 이어서"`);
  }
  assert.ok(IN_CALL_INSTALL_CONSENT_INSTRUCTION.includes("상대의 말에 대답할 때 그 대답 안에서"));
  assert.ok(IN_CALL_INSTALL_CONSENT_INSTRUCTION.includes("전화를 새로 걸겠다거나 다른 사람이 연락하겠다는 말은 하지 마라"));
  assert.equal(/[0-9]/.test(IN_CALL_INSTALL_CONSENT_INSTRUCTION), false);
  assert.equal(/["“”'‘’]/.test(IN_CALL_INSTALL_CONSENT_INSTRUCTION), false);
});

test("[T194-c-1 G607 · R-d] 처음부터 통화인 Q2 세션의 폴백 응낙 — 옛 선택식 사본은 '전화로 이어서'를 싣고(실패 재현), 선택 함수는 싣지 않는다", (t) => {
  // 처음부터 통화로 시작한 세션 = 전이 기록 0 ⇒ isEscalatedVoiceCall 거짓.
  const escalatedCall = isEscalatedVoiceCall("voice", undefined);
  const before = escalatedCall ? MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL : MOCK_INSTALL_CONSENT_INSTRUCTION; // 옛 선택식 사본
  const after = installConsentInstructionFor({ entrySurface: "in-call-sms", escalatedCall, path: "fallback", transferPlaced: false });
  t.diagnostic(`[G607 · R-d] 옛 선택식 "전화로 이어서" 포함=${before.includes("전화로 이어서")} · 선택 함수 포함=${(after ?? "").includes("전화로 이어서")}`);
  assert.equal(before.includes("전화로 이어서"), true, "R-d 사본이 거짓 문면을 내야 역방향이 성립한다");
  assert.equal((after ?? "").includes("전화로 이어서"), false);
});

test("[T194-c-1 G607 배선] roleplay/index.ts는 응낙 지시를 이 함수로만 고른다 — 응낙 상수 직접 참조 0(소스 스캔)", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/roleplay/index.ts"), "utf8").replace(/\r\n/g, "\n");
  const code = src.replace(/\/\/[^\n]*/g, "");
  assert.equal((code.match(/installConsentInstructionFor\(/g) ?? []).length, 1);
  for (const name of ["MOCK_INSTALL_CONSENT_INSTRUCTION", "IN_CALL_INSTALL_CONSENT_INSTRUCTION"]) {
    assert.equal(new RegExp(`\\b${name}\\b`).test(code), false, `${name}을 직접 참조한다 — 선택이 두 곳이 된다`);
  }
  assert.match(code, /mockConsentSurface = findMockScreenItem\(session\.scenarioId, pending\.id\)\?\.entrySurface;/);
});
