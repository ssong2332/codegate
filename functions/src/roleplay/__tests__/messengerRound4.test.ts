// §128(2026-10-24 메인 세션 라이브 실측 — 자녀 사칭 카톡 고급 · 텍스트 폴백) — 메신저 결함 1 · 3 · 4 · 7의 서버 판정표 · 배선을 고정한다.
// ⛔ 라이브 호출 0건.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { announcesIncomingCall, decideCallAnnouncement } from "../callAnnouncement";
import { fixParticipantCalledReply, resolveParticipantCalledPersona } from "../callCaller";
import { CHAT_DURING_CALL_GIVEUP_INSTRUCTION, CHAT_DURING_CALL_INSTRUCTION } from "../chatDuringCall";
import {
  decideScreenFollowUp,
  SCREEN_ACTION_FOLLOW_UP_PREFIX,
  SCREEN_SUBMIT_FOLLOW_UP_INSTRUCTION,
  screenFollowUpInstruction,
} from "../screenActionFollowUp";
import {
  installConsentInstructionFor,
  MOCK_INSTALL_CONSENT_INSTRUCTION,
  MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL,
  MOCK_INSTALL_CONSENT_INSTRUCTION_NO_CALL,
} from "../../scenarios/mockScreens";
import { CHILD_CALL_PHASE_RULE, messengerChildImpersonationKakaoPrompt } from "../../scenarios/messengerChildImpersonationKakao.prompt";
import { judgeScammerReplyUsability } from "../../llm/replyUsability";

const SRC = path.resolve(__dirname, "../../../src");
const read = (file: string) => readFileSync(path.join(SRC, file), "utf8").replace(/\r\n/g, "\n");

// 메인 세션 실측 대사(2026-10-24).
const LIVE_ANNOUNCE = "고마워 아빠! 이제 보험 담당자가 전화로 이어서 안내해줄 거야. 담당자 연결되면 바로 받아줘";

test("[§128(1) 표 C] 신호 없는 전화 예고 — 실측 대사는 예고다 · 나중 · 불가 표현은 예고가 아니다", () => {
  assert.equal(announcesIncomingCall(LIVE_ANNOUNCE), true);
  for (const line of ["그럼 내가 지금 전화할게", "곧 전화 갈 거야", "전화 오면 꼭 받아", "상담원이 곧 연락드릴 거예요"]) {
    assert.equal(announcesIncomingCall(line), true, line);
  }
  for (const line of [
    "나중에 전화할게",
    "지금 통화가 안 돼 톡으로 해줘",
    "엄마 신분증 사진 찍어서 보내 줘",
    "전화하지 마 폰 고장났어",
    "아까 전화했잖아",
  ]) {
    assert.equal(announcesIncomingCall(line), false, line);
  }
});

test("[§128(1) 표 C] C0 신호 수락 = none · C1 전환 가능 = escalate · C2 전환 불가 = 예고 문장만 지움 · C3 예고 없음 = none", () => {
  assert.deepEqual(decideCallAnnouncement({ replyText: LIVE_ANNOUNCE, signalAccepted: true, canEscalateNow: true }), { action: "none" });
  assert.deepEqual(decideCallAnnouncement({ replyText: LIVE_ANNOUNCE, signalAccepted: false, canEscalateNow: true }), { action: "escalate" });
  assert.deepEqual(decideCallAnnouncement({ replyText: LIVE_ANNOUNCE, signalAccepted: false, canEscalateNow: false }), {
    action: "strip",
    text: "고마워 아빠!",
  });
  assert.deepEqual(decideCallAnnouncement({ replyText: "담당자 연결되면 바로 받아줘", signalAccepted: false, canEscalateNow: false }), {
    action: "none",
  }, "지우면 남는 문장이 없으면 그대로");
  assert.deepEqual(decideCallAnnouncement({ replyText: "아빠 신분증 사진 보내 줘", signalAccepted: false, canEscalateNow: true }), { action: "none" });
});

test("[§128(1) 응낙 지시] 설치 뒤 통화가 아닌 항목(child-insurance-install)은 전화 예고 없는 지시 · 그 밖은 종전 바이트", () => {
  const base = { entrySurface: "messenger-link" as const, escalatedCall: false, path: "fallback" as const, transferPlaced: false };
  assert.equal(installConsentInstructionFor({ ...base, landingId: "child-insurance-install" }), MOCK_INSTALL_CONSENT_INSTRUCTION_NO_CALL);
  assert.equal(installConsentInstructionFor({ ...base, landingId: "subsidy-install" }), MOCK_INSTALL_CONSENT_INSTRUCTION);
  assert.equal(installConsentInstructionFor(base), MOCK_INSTALL_CONSENT_INSTRUCTION, "landingId 부재 = 종전");
  assert.equal(
    installConsentInstructionFor({ ...base, escalatedCall: true, landingId: "child-insurance-install" }),
    MOCK_INSTALL_CONSENT_INSTRUCTION_IN_CALL,
  );
  assert.ok(!MOCK_INSTALL_CONSENT_INSTRUCTION_NO_CALL.includes("전화로 이어서 안내하겠다고 말하라"));
  assert.ok(MOCK_INSTALL_CONSENT_INSTRUCTION_NO_CALL.includes("전화로 연락하겠다는 말은 하지 마라"));
});

test("[§128(1) 배선] sendMessage — 예고 판정은 신호 처리 뒤 · 손질 앞, 전환은 신호 다음 순위 `announced_call`", () => {
  const index = read("roleplay/index.ts");
  const decide = index.indexOf("const announcement =");
  assert.ok(decide > index.indexOf("const endCallSignal = endCallCheck.endCall;"), "끊기 신호 판정 뒤");
  assert.ok(decide < index.indexOf("tidyScammerReplyMarkup(announcementFreeReplyText)"), "손질 앞");
  assert.match(index, /!isEscalationTooEarly\(turnsSinceMessengerEntry\(turnCount, session\.channelHistory\)\)/);
  assert.match(index, /\} else if \(announcement\.action === "escalate"\) \{\n(?:\s*\/\/[^\n]*\n)*\s*escalationTrigger = "announced_call";/);
  assert.ok(index.indexOf('escalationTrigger = "structured_signal"') < index.indexOf('escalationTrigger = "announced_call"'));
  assert.match(index, /landingId: mockConsentLandingId/);
});

test("[§128(4)] 참가자가 건 통화 — 페르소나 문장 교체 · '전화 받아줘서' 교정 · 그 밖 무변경", () => {
  // A2 ㉠(2026-11-01) — 자녀 사칭 페르소나에는 이제 통화 단계 규칙이 없다(통화 넘김 없음 → 참가자 보이스톡은 받지 않음) ⇒ 교체 대상 0.
  // 교체 함수 자체는 통화 단계 규칙 문면으로 고정한다.
  assert.equal(resolveParticipantCalledPersona(messengerChildImpersonationKakaoPrompt.personaPrompt), messengerChildImpersonationKakaoPrompt.personaPrompt);
  const persona = CHILD_CALL_PHASE_RULE;
  const swapped = resolveParticipantCalledPersona(persona);
  assert.notEqual(swapped, persona);
  assert.ok(!swapped.includes("통화는 네가 먼저 건 전화다"));
  assert.ok(swapped.includes("참가자가 너에게 건 보이스톡"));
  assert.equal(resolveParticipantCalledPersona("다른 시나리오 페르소나"), "다른 시나리오 페르소나");
  assert.equal(fixParticipantCalledReply("아빠 전화 받아줘서 고마워"), "아빠 전화해 줘서 고마워");
  assert.equal(fixParticipantCalledReply("전화 받아 주셔서 감사해요"), "전화해 주셔서 감사해요");
  assert.equal(fixParticipantCalledReply("응 아빠 나야"), "응 아빠 나야");
  const index = read("roleplay/index.ts");
  assert.match(index, /systemPrompt: buildSystemPrompt\(turnScenarioPrompt, \{/);
  assert.match(index, /const shapedReplyText = participantCalled \? fixParticipantCalledReply\(limitedReplyText\) : limitedReplyText;/);
});

test("[§128(3)] 통화 중 카톡 포기 지시 — 포기 신호만 · 목표 신호 금지 · 메타 판정에 걸리지 않음", () => {
  assert.ok(CHAT_DURING_CALL_GIVEUP_INSTRUCTION.includes("포기 신호"));
  assert.ok(CHAT_DURING_CALL_GIVEUP_INSTRUCTION.includes("목표 달성 신호는 이 카톡에서 쓰지 않는다"));
  assert.ok(!CHAT_DURING_CALL_GIVEUP_INSTRUCTION.includes("끊자거나"), "종전 금지 문구는 G2 변형에서 빠진다");
  assert.ok(CHAT_DURING_CALL_INSTRUCTION.includes("끊자거나"), "G1 종전 문면 유지");
  assert.ok(!/훈련|시뮬레이션/.test(CHAT_DURING_CALL_GIVEUP_INSTRUCTION));
  const chat = read("roleplay/chatDuringCall.ts");
  assert.match(chat, /update\.scammerHangup = \{ acceptedAt: endedAt, kind: "give_up", path: "fallback" \};/);
  assert.match(chat, /await triggerReportGeneration\(sessionId\);/);
});

test("[§128(7) 표 S] 화면 행동 뒤 먼저 보내기 — 응낙 · 제출만 · 메신저 링크만 · 1회", () => {
  const at = {} as FirebaseFirestore.Timestamp;
  assert.equal(decideScreenFollowUp(undefined, "messenger-link"), undefined, "S0 문서 없음");
  assert.equal(decideScreenFollowUp({ kind: "app-install", consentedAt: at }, "in-call-sms"), undefined, "S0 통화 중 문자 표면");
  assert.equal(decideScreenFollowUp({ kind: "app-install", consentedAt: at, screenFollowUpAt: at }, "messenger-link"), undefined, "S0 이미 보냄");
  assert.equal(decideScreenFollowUp({ kind: "app-install", consentedAt: at }, "messenger-link"), "consent", "S1");
  assert.equal(decideScreenFollowUp({ kind: "app-install", consentedAt: at, consentAnnouncedAt: at }, "messenger-link"), undefined, "S1 이미 언급");
  assert.equal(decideScreenFollowUp({ kind: "credential-form", submittedAt: at }, "messenger-link"), "submit", "S2");
  assert.equal(decideScreenFollowUp({ kind: "credential-form" }, "messenger-link"), undefined, "S3 열기만");
  assert.equal(decideScreenFollowUp({ kind: "app-install" }, "messenger-link"), undefined, "S3 응낙 전");
});

test("[§128(7) 지시] 설치 뒤 통화가 설계인 항목만 · 지금 전환할 수 있을 때만 전화 예고형", () => {
  assert.equal(
    screenFollowUpInstruction("consent", "subsidy-install", true),
    `${SCREEN_ACTION_FOLLOW_UP_PREFIX}\n${MOCK_INSTALL_CONSENT_INSTRUCTION}`,
  );
  assert.equal(
    screenFollowUpInstruction("consent", "subsidy-install", false),
    `${SCREEN_ACTION_FOLLOW_UP_PREFIX}\n${MOCK_INSTALL_CONSENT_INSTRUCTION_NO_CALL}`,
  );
  assert.equal(
    screenFollowUpInstruction("consent", "child-insurance-install", true),
    `${SCREEN_ACTION_FOLLOW_UP_PREFIX}\n${MOCK_INSTALL_CONSENT_INSTRUCTION_NO_CALL}`,
  );
  assert.equal(
    screenFollowUpInstruction("submit", "child-insurance-install", true),
    `${SCREEN_ACTION_FOLLOW_UP_PREFIX}\n${SCREEN_SUBMIT_FOLLOW_UP_INSTRUCTION}`,
  );
  for (const text of [SCREEN_ACTION_FOLLOW_UP_PREFIX, SCREEN_SUBMIT_FOLLOW_UP_INSTRUCTION]) {
    assert.ok(!/훈련|시뮬레이션/.test(text));
  }
  assert.equal(judgeScammerReplyUsability("아빠 설치했구나 고마워! 이제 보험 접수에 신분증 사진이 필요하대"), undefined);
});

test("[§128(7) 배선] 콜러블 export · 메시지는 트랜잭션 재확인 뒤 1건 · 응낙 언급 시각도 함께 기록", () => {
  assert.match(read("index.ts"), /export \{ requestScreenActionFollowUp \} from "\.\/roleplay\/screenActionFollowUp";/);
  const src = read("roleplay/screenActionFollowUp.ts");
  assert.match(src, /if \(freshHistory\.size !== history\.length\) return undefined;/);
  assert.match(src, /tx\.update\(screenRef, \{ screenFollowUpAt: now, \.\.\.\(kind === "consent" \? \{ consentAnnouncedAt: now \} : \{\}\) \}\);/);
  assert.match(src, /if \(completion\.isMock\) return \{\};/);
  assert.match(src, /channel: "messenger",/);
  assert.ok(!/userText|inputValue|formData/.test(src), "화면 입력값 0(AC-045)");
});
