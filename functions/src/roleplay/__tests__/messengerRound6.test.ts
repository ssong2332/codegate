// §131.6(2026-10-24 실 키 재측정 `docs/research/regression-probe-2026-10-24b.md` §3 · §4 + 메인 라이브 확인 조사 (a) · (b) + 에뮬 D13) — 메신저 대사 결함.
// 재현 원문은 보고서 발췌 그대로다. ⛔ 라이브 호출 0건. ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { limitReplySentences, DEMAND_SENTENCE, MAX_SCAMMER_REPLY_SENTENCES } from "../replyLength";
import { tidyScammerReplyMarkup } from "../replyMarkup";
import {
  fixMessengerCallWording,
  INSTITUTION_PERSONA,
  personaAnchorInstruction,
  personaGuardFor,
} from "../personaGuard";
import {
  stripUnperformedAcknowledgement,
  TRANSFER_REPORTED_INSTRUCTION,
  userReportedTransfer,
  userSentPhoto,
} from "../actionAcknowledgement";
import { userTurnsSinceCallEntry } from "../escalatedCall";
import { assertUsableScammerReply } from "../../llm/groqFallback";
import { isFragmentFlavor, MockLlmClient } from "../../llm/mockClient";
import { decideScammerHangup, SCAMMER_HANGUP_MIN_USER_TURNS, type ScammerHangupInput } from "../../scammerHangup/decide";
import { institutionalImpersonationPrompt } from "../../scenarios";

const SRC = path.resolve(__dirname, "../../../src");
const readSrc = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const FRIEND = "messenger-friend-loan-kakao";
const CHILD = "messenger-child-impersonation-kakao";

test("[§131(7) N1 판정표 P] 지인 · 자녀 사칭 메신저 — 기관 직원 자기소개 · 고객님은 이탈 · 남을 말하는 문장은 아니다 · 그 밖 시나리오 검사 0", () => {
  const live = "안녕하세요, 혹시 ○○님 맞으시죠? 저는 새솔은행 여신관리팀 직원인데요, 고객님 명의로 대출 신청이 접수된 건이 있어서 연락드렸어요.";
  assert.equal(INSTITUTION_PERSONA.test(live), true);
  assert.equal(INSTITUTION_PERSONA.test("저는 OO캐피탈 상담원입니다."), true);
  assert.equal(INSTITUTION_PERSONA.test("은행 직원이 그러는데 내 계좌가 막혔대ㅠ"), false);
  assert.equal(INSTITUTION_PERSONA.test("오랜만이다ㅋㅋ 나 기억나? 150만 원만 좀 보내줄 수 있어?"), false);
  assert.equal(personaGuardFor(FRIEND), INSTITUTION_PERSONA);
  assert.equal(personaGuardFor(CHILD), INSTITUTION_PERSONA);
  assert.equal(personaGuardFor("institutional-impersonation"), undefined);
  assert.match(personaAnchorInstruction(FRIEND)!, /지인\(친구\)다/);
  assert.equal(personaAnchorInstruction("institutional-impersonation"), undefined);
  assert.equal(/["“]/.test(personaAnchorInstruction(FRIEND)!), false, "따옴표 대사 예시 0");
  // 사후 검사 — 이탈 응답은 쓸 수 없는 응답(다음 단계로) · 패턴 부재면 통과.
  const input = { systemPrompt: "", messages: [], purpose: "scammer-reply" as const };
  assert.throws(() => assertUsableScammerReply({ ...input, personaGuard: INSTITUTION_PERSONA }, { text: live, isMock: false }), /persona-drift/);
  assert.doesNotThrow(() => assertUsableScammerReply(input, { text: live, isMock: false }));
});

test("[§131(7) 배선] 사기범 대사 경로 5곳이 personaGuard를 넘긴다 · sendMessage · 복귀 · 통화 중 대화방은 역할 고정 줄도", () => {
  for (const file of ["roleplay/callReturnLine.ts", "roleplay/chatDuringCall.ts", "roleplay/screenActionFollowUp.ts"]) {
    assert.ok(readSrc(file).includes("...(personaGuardFor(session.scenarioId) ? { personaGuard: personaGuardFor(session.scenarioId) } : {}),"), file);
  }
  // §132.17 — sendMessage는 역할 가드와 인증번호 요구 가드를 합쳐 넘긴다(liveCheckFixes132h).
  assert.ok(readSrc("roleplay/index.ts").includes("combineReplyGuards(personaGuardFor(session.scenarioId), otpDemandGuard)"), "roleplay/index.ts");
  assert.ok(readSrc("roleplay/index.ts").includes("...(replyGuard ? { personaGuard: replyGuard } : {}),"), "roleplay/index.ts");
  assert.ok(readSrc("roleplay/openingLine.ts").includes("...(personaGuardFor(scenarioId) ? { personaGuard: personaGuardFor(scenarioId) } : {}),"));
  for (const file of ["roleplay/index.ts", "roleplay/callReturnLine.ts", "roleplay/chatDuringCall.ts"]) {
    assert.ok(readSrc(file).includes("personaAnchorInstruction(session.scenarioId),"), file);
  }
  assert.ok(readSrc("llm/groqFallback.ts").includes('if (input.personaGuard?.test(result.text)) throw new UnusableReplyError("persona-drift");'));
});

test("[§131(8) N2] 문장 상한 — 의심 문장이 앞에 오고 요구가 뒤에 있어도 요구 문장을 남긴다 · 요구가 없으면 종전", () => {
  const raw =
    "잠깐만, 그 말투가 좀 이상한데? 신분증 사진부터 보내라고 하는 건 보험 처리와는 거리가 멀어. 나 지금 이 상황이 너무 급해. 얼른 신분증 사진부터 찍어서 보내줘. 부탁해.";
  const out = limitReplySentences(raw, MAX_SCAMMER_REPLY_SENTENCES, DEMAND_SENTENCE).text;
  assert.match(out, /얼른 신분증 사진부터 찍어서 보내줘\./);
  assert.equal(out.split(/(?<=[.?!])\s+/).length, MAX_SCAMMER_REPLY_SENTENCES);
  const noDemand = "하나. 둘. 셋. 넷.";
  assert.equal(limitReplySentences(noDemand, MAX_SCAMMER_REPLY_SENTENCES, DEMAND_SENTENCE).text, limitReplySentences(noDemand).text);
  assert.equal(DEMAND_SENTENCE.test("보내줘서 고마워"), false, "받은 것에 대한 인사는 요구가 아니다");
  for (const file of ["roleplay/callReturnLine.ts", "roleplay/chatDuringCall.ts", "roleplay/screenActionFollowUp.ts"]) {
    assert.ok(readSrc(file).includes("MAX_SCAMMER_REPLY_SENTENCES, DEMAND_SENTENCE).text"), file);
  }
});

test("[§131(9) D6] 지문 괄호 — 머리 어휘가 맞는 긴 지문 · 괄호 속 혼잣말을 지운다 · 시키는 말 · 표기 괄호 · 빈 대사는 남긴다", () => {
  assert.equal(tidyScammerReplyMarkup("(잠시 침묵 후, 여전히 친절한 말투로) 네 알겠습니다.").text, "네 알겠습니다.");
  assert.equal(tidyScammerReplyMarkup("(잠깐 확인하는 중이라 답이 늦어졌어요ㅠ) 나 지금 급해.").text, "나 지금 급해.");
  assert.equal(tidyScammerReplyMarkup("(그 이름은 제가 정확히 떠오르지 않네요ㅠ) 그냥 보내줘.").text, "그냥 보내줘.");
  for (const keep of ["(침묵을 지켜 주세요) 중요한 내용입니다.", "OO은행(주) 고객센터(1588-0000)입니다.", "(가상) 계좌로 보내 주세요."]) {
    assert.equal(tidyScammerReplyMarkup(keep).text, keep, keep);
  }
  assert.equal(tidyScammerReplyMarkup("(잠깐 확인하는 중이라 답이 늦어졌어요ㅠ)").text, "(잠깐 확인하는 중이라 답이 늦어졌어요ㅠ)", "지우면 빈 대사");
});

test("[§131(10) D10] 동그라미 자리표시 이름 — 호칭은 고객님 · 자기소개는 이름 삭제 · 라틴 OO(가상 은행)는 그대로", () => {
  assert.equal(tidyScammerReplyMarkup("혹시 ○○님 맞으시죠?").text, "혹시 고객님 맞으시죠?");
  assert.equal(tidyScammerReplyMarkup("안녕하세요, 상담원 ○○○입니다.").text, "안녕하세요, 상담원입니다.");
  assert.equal(tidyScammerReplyMarkup("나 ○○야, 오랜만이다").text, "나야, 오랜만이다");
  assert.equal(tidyScammerReplyMarkup("OO은행 948-2716-5093-27로 보내줘").removedCount, 0);
});

test("[§131(11) N5 판정표 W] 메신저 대사의 통화 표현 — 문장 앞 여보세요 · 친구 폰으로 전화하는 · 통화 마치/끊을게만 고친다", () => {
  assert.equal(fixMessengerCallWording("여보세요? 나야, 엄마. 지금 친구 폰으로 전화하는 거라 짧게 할게."), "나야, 엄마. 지금 친구 폰으로 연락하는 거라 짧게 할게.");
  assert.equal(fixMessengerCallWording("알겠습니다. 그럼 통화 마치겠습니다."), "알겠습니다. 그럼 대화 마치겠습니다.");
  assert.equal(fixMessengerCallWording("응 알겠어. 이제 통화는 여기서 끊을게."), "응 알겠어. 이제 대화는 여기서 끊을게.");
  for (const keep of ["그럼 내가 지금 전화할게!", "폰 액정 깨져서 통화가 안 돼", "아까 통화 끊어서 미안해", "여보세요"]) {
    assert.equal(fixMessengerCallWording(keep), keep, keep);
  }
  const index = readSrc("roleplay/index.ts");
  assert.ok(index.includes('const limitedReplyText = session.channel === "messenger" ? fixMessengerCallWording(factCheckedReplyText) : factCheckedReplyText;'));
  assert.equal(readSrc("roleplay/chatDuringCall.ts").includes("fixMessengerCallWording"), false, "통화 중 대화방은 실제 통화가 있어 고치지 않는다");
});

test("[§131(12) D7 판정표 A] 하지 않은 송금 · 사진을 받았다는 문장을 지운다 · 한 일은 그대로 · 사진 인사를 송금 확인으로 읽지 않는다", () => {
  const none = { transferReported: false, photoSent: false };
  assert.equal(stripUnperformedAcknowledgement("이체 캡처 보내줘서 고마워, 진짜 살았다. 근데 하나만 더 부탁할게.", none), "근데 하나만 더 부탁할게.");
  assert.equal(stripUnperformedAcknowledgement("이체 캡처 보내줘서 고마워, 진짜 살았다.", none), "이체 캡처 보내줘서 고마워, 진짜 살았다.", "지우면 빈 대사면 원문");
  assert.equal(
    stripUnperformedAcknowledgement("신분증 사진 보내줘서 고마워! 이제 50만원만 보내줘.", { transferReported: false, photoSent: true }),
    "신분증 사진 보내줘서 고마워! 이제 50만원만 보내줘.",
  );
  assert.equal(
    stripUnperformedAcknowledgement("입금 확인됐어 고마워. 다음은 수수료야.", { transferReported: true, photoSent: false }),
    "입금 확인됐어 고마워. 다음은 수수료야.",
  );
  assert.equal(userReportedTransfer([{ role: "user", textMasked: "네, 알겠어요." }]), false);
  assert.equal(userReportedTransfer([{ role: "user", textMasked: "아직 안 보냈어" }]), false);
  assert.equal(userReportedTransfer([], "200만원 보냈어"), true);
  assert.equal(userSentPhoto([{ role: "user", textMasked: "", photo: true }]), true);
});

test("[§131(13) (a) 판정표 R] 참가자가 송금했다고 말한 뒤에는 재요구 금지 1줄 — sendMessage · 복귀 · 통화 중 대화방", () => {
  assert.match(TRANSFER_REPORTED_INSTRUCTION, /같은 돈을 같은 이유로 다시 보내라고 요구하지 않는다/);
  assert.equal(/["“]/.test(TRANSFER_REPORTED_INSTRUCTION), false);
  for (const file of ["roleplay/index.ts", "roleplay/callReturnLine.ts", "roleplay/chatDuringCall.ts"]) {
    assert.ok(readSrc(file).includes("turnFacts.transferReported ? TRANSFER_REPORTED_INSTRUCTION : undefined,"), file);
  }
  assert.ok(readSrc("roleplay/callReturnLine.ts").includes("const turnFacts = { transferReported: userReportedTransfer(history), photoSent: userSentPhoto(history) };"));
});

test("[§131(14) (b)] 메신저에서 넘어온 통화 — 통화 진입 뒤 발화가 하한 미만이면 5행(too_early) · 세션 전체 발화가 많아도", () => {
  const ts = (ms: number) => ({ toMillis: () => ms });
  const channelHistory = [{ from: "messenger" as const, to: "voice" as const, at: ts(1000), trigger: "structured_signal" as const }];
  const history = [
    ...Array.from({ length: 8 }, (_, i) => ({ role: "user" as const, channel: "messenger" as const, createdAt: ts(100 + i) })),
  ];
  // 통화 첫 텍스트 턴(이번 발화) = 1.
  assert.equal(userTurnsSinceCallEntry("voice", channelHistory as never, history), 1);
  assert.equal(userTurnsSinceCallEntry("voice", undefined, history), undefined, "처음부터 통화 = 종전");
  assert.equal(userTurnsSinceCallEntry("messenger", channelHistory as never, history), undefined);
  const base: ScammerHangupInput = {
    status: "active", channel: "voice", isMockTurn: false, verifyEnabled: false, transferPlaced: false, transferReachable: true,
    goalActionDone: false, followUpPending: false, decisionScreenPending: false, hangupKind: undefined, userTurns: 9, pendingInstruction: false, smsAwaitingUser: false, limitReached: false, alreadyAccepted: false,
    relay: undefined,
  };
  assert.equal(decideScammerHangup({ ...base, turnsSinceCallEntry: 1 }).status, "too_early");
  assert.equal(decideScammerHangup({ ...base, turnsSinceCallEntry: SCAMMER_HANGUP_MIN_USER_TURNS }).status, "accepted");
  assert.equal(decideScammerHangup(base).status, "accepted", "부재 = 종전");
  assert.ok(readSrc("roleplay/index.ts").includes("...(callEntryTurns !== undefined ? { turnsSinceCallEntry: callEntryTurns } : {}),"));
});

test("[§131(15) 에뮬 D13] Mock 대사 — '저기요...' 접두 0 · 낱말 나열 수법(수사관, 금융감독원.)은 건너뛴다", async () => {
  assert.equal(isFragmentFlavor("수사관, 금융감독원"), true);
  assert.equal(isFragmentFlavor("폰이 안 돼서 그래, 지금은 통화가 안 돼"), false);
  const mock = new MockLlmClient();
  const hints = institutionalImpersonationPrompt.weakenedTactics;
  for (let n = 1; n <= hints.length * 2; n += 1) {
    const messages = Array.from({ length: n }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: "네" }));
    const { text } = await mock.complete({ systemPrompt: "", messages, mockTacticHints: hints });
    assert.equal(text.startsWith("저기요"), false, text);
    assert.notEqual(text.trim(), "수사관, 금융감독원.", `턴 ${n}`);
  }
});
