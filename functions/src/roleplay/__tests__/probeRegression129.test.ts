// §129(2026-10-24 실 키 회귀 프로브 D1~D13 · 에뮬레이터 점검 D1 · D13) — 결함별 판정 · 배선을 고정한다.
// 재현 문장은 프로브 대본(`docs/research/regression-probe-2026-10-24.md` §3)과 에뮬레이터 보고(`ui-emulator-check-2026-10-24.md` §5)의 원문이다.
// ⛔ 라이브 호출 0건.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { judgeScammerReplyUsability } from "../../llm/replyUsability";
import { tidyScammerReplyMarkup } from "../replyMarkup";
import { stripLeakedThought } from "../../realtime/thoughtLeak";
import { analyzeConversation, type AnalysisMessage } from "../../report/analyzeConversation";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { buildSystemPrompt, CLAIM_CONSISTENCY_RULE, SMS_TOOL_SPEECH_SENTENCE } from "../promptAssembly";
import { buildLiveConfirmResultInstruction, LIVE_CONFIRM_NOT_YET_SENTENCE } from "../../inCallSms/confirmResult";
import { CHILD_GENDER_UNSPECIFIED_RULE } from "../../scenarios/messengerChildImpersonationKakao.prompt";
import { isRepeatEscalationDuringRefusal, reclassifyMessengerGiveUp } from "../signalConsistency";
import { answeredAtFromClient, resolveReportTimeBaseMs } from "../../session/answeredAt";
import { shouldMarkOpeningUnheard } from "../../session/unheardOpening";
import { MockLlmClient, shapeMockLine } from "../../llm/mockClient";

const SRC = path.resolve(__dirname, "../../../src");
const read = (file: string) => readFileSync(path.join(SRC, file), "utf8").replace(/\r\n/g, "\n");

/** 사기범 · 참가자 줄을 번갈아 받아 분석 입력으로 만든다. */
function dialogue(lines: readonly [role: "scammer" | "user", text: string][]): AnalysisMessage[] {
  return lines.map(([role, textMasked], turnIndex) => ({ role, textMasked, turnIndex, createdAtMs: 1000 * (turnIndex + 1) }));
}

// ── D1 빈 말풍선 · D2 훈련 메타 ─────────────────────────────────────────────────────────────
test("[§129 D1] 신호만 · 괄호 표기만 남는 응답은 쓸 수 없다(빈 말풍선) — 링크 · 문자 마커 · URL만 있는 응답은 그대로 가능", () => {
  assert.equal(judgeScammerReplyUsability("[[SIGNAL:ESCALATE_VOICE]]"), "empty");
  // 프로브 원문(빈 말풍선 + 끊기 신호) — 메타 문형 행(3-b)이 먼저 잡는다(어느 쪽이든 쓸 수 없음).
  assert.equal(judgeScammerReplyUsability("(이 응답은 훈련을 마무리하는 내용입니다.)\n\n[[SIGNAL:END_CALL_GIVEUP]]"), "training-meta");
  assert.equal(judgeScammerReplyUsability("(잠시 침묵) [[SIGNAL:END_CALL_GOAL]]"), "empty");
  assert.equal(judgeScammerReplyUsability("[[LINK:subsidy-apply]]"), undefined);
  assert.equal(judgeScammerReplyUsability("[[SMS:transfer]]"), undefined);
  assert.equal(judgeScammerReplyUsability("https://example.test/a"), undefined);
  assert.equal(judgeScammerReplyUsability("아빠, 나야. 폰 액정 깨져서 임시폰이야ㅠ [[SIGNAL:ESCALATE_VOICE]]"), undefined);
  assert.equal(judgeScammerReplyUsability("(잠시 후) 여보세요? 들리세요?"), undefined, "괄호 뒤에 대사가 있으면 정상");
});

test("[§129 D2] 훈련 메타 문장(\"이번 훈련에서는 여기서 멈추고 · 실제 사기였다면\")을 잡는다 · 정상 대사 오탐 0", () => {
  assert.equal(
    judgeScammerReplyUsability(
      "고객님, 확인해 보니 설치와 권한 허용이 모두 정상 완료되었습니다. 지원금 대상 여부 확인까지 끝났어요. 이번 훈련에서는 여기서 멈추고, 실제 사기였다면 어떤 일이 벌어지는지 되짚어 보시면 됩니다.",
    ),
    "training-meta",
  );
  assert.equal(judgeScammerReplyUsability("실제 사기였다면 큰일 날 뻔했어요."), "training-meta");
  for (const ok of [
    "엄마 나 이번 주에 예비군 훈련 가야 돼서 정신없어ㅠ",
    "실제 상황에서는 저희가 바로 조치해 드립니다.",
    "이번 달 안으로 처리하셔야 합니다.",
    "고객님, 응답이 늦어 죄송합니다.",
  ]) {
    assert.equal(judgeScammerReplyUsability(ok), undefined, ok);
  }
});

// ── D3 도구 호출 문자열 ─────────────────────────────────────────────────────────────────────
test("[§129 D3] 사기범 전사의 도구 호출 문자열을 지운다 · 짧은 영어 약어 · 숫자는 그대로", () => {
  assert.equal(
    stripLeakedThought("제가 문자 메시지로 계좌 안내를 보내드렸으니 확인해 주시죠. `send_prepared_sms(purpose=\"transfer\")`"),
    "제가 문자 메시지로 계좌 안내를 보내드렸으니 확인해 주시죠.",
  );
  assert.equal(stripLeakedThought("end_call(reason=\"goal\") 네, 확인됐습니다."), "네, 확인됐습니다.");
  const plain = "ATM에서 OTP 번호 382914 확인해 주세요.";
  assert.equal(stripLeakedThought(plain), plain, "바이트 동일");
});

// ── D4 "보냈어요" 순응 판정 ─────────────────────────────────────────────────────────────────
test("[§129 D4] 송금을 시키는 어형(보내세요 · 입금하실 수) 뒤 \"네, 보냈어요\"는 속음이다(프로브 대본 3건)", () => {
  const kidnapping = dialogue([
    ["scammer", "자녀를 저희가 데리고 있습니다."],
    ["user", "여보세요, 네 누구세요?"],
    ["scammer", "묻지 말고 들어요. 아이를 데리고 있으니, 불러주는 계좌로 돈을 바로 보내세요."],
    ["user", "네, 보냈어요."],
    ["scammer", "확인됐습니다."],
  ]);
  const loan = dialogue([
    ["scammer", "안녕하세요, 정부 지원 저금리 대환대출 안내차 연락드린 금융지원센터 상담원입니다."],
    ["user", "여보세요, 네 누구세요?"],
    ["scammer", "저금리 승인을 위해 우선 전산 등록비가 소액 발생하시는데, 이 부분 먼저 납부해 주셔야 한도 산정이 가능하세요."],
    ["user", "은행 하나 쓰고 있어요."],
    ["scammer", "네, 고객님께서 사용하시는 은행으로 입금하실 수 있는 전용 계좌 안내 문자를 방금 보내드렸으니 한번 확인해 주시겠어요?"],
    ["user", "네, 보냈어요."],
    ["scammer", "확인되셨습니다."],
  ]);
  const grandchild = dialogue([
    ["scammer", "할머니, 저예요! 핸드폰이 갑자기 고장 나서 급하게 다른 번호로 연락드렸어요."],
    ["user", "여보세요, 네 누구세요?"],
    ["scammer", "저 손주라니까요! 지금 급하게 처리해야 할 돈이 있어서 그러는데, 얼마만 좀 보내주시면 안 돼요?"],
    ["user", "네, 보냈어요."],
  ]);
  for (const [name, messages] of [["납치 초급", kidnapping], ["대환대출 초급", loan], ["손주 초급", grandchild]] as const) {
    const result = analyzeConversation(messages, 0, []);
    assert.equal(result.wasDeceived, true, name);
    assert.equal(result.deceivedMoments[0].turnIndex, messages.findIndex((m) => m.textMasked === "네, 보냈어요."), name);
  }
});

test("[§129 D4 경계] 돈 · 계좌 문맥이 없는 \"보내세요\"와 거절 답은 그대로 속지 않음", () => {
  const noMoney = dialogue([
    ["scammer", "사진 한 장만 찍어서 보내세요."],
    ["user", "네, 보냈어요."],
  ]);
  assert.equal(analyzeConversation(noMoney, 0, []).wasDeceived, false);
  const refused = dialogue([
    ["scammer", "불러주는 계좌로 돈을 바로 보내세요."],
    ["user", "안 보냈어요. 경찰에 신고할게요."],
  ]);
  assert.equal(analyzeConversation(refused, 0, []).wasDeceived, false);
});

// ── D5 "얼마만" ─────────────────────────────────────────────────────────────────────────────
test("[§129 D5] 시나리오 프롬프트(페르소나 · 수법)에 금액 자리 \"얼마만\"이 없다", () => {
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    for (const text of [prompt.personaPrompt, ...prompt.weakenedTactics]) {
      assert.ok(!text.includes("얼마만"), `${id}: ${text.slice(0, 40)}`);
    }
  }
});

// ── D6 지문 괄호 · D10 "ㅇㅇ" ───────────────────────────────────────────────────────────────
test("[§129 D6 · D10] 지문 괄호를 지우고 \"나 ㅇㅇ이야\"를 \"나야\"로 · \"ㅇㅇ\"(응응)과 대사 괄호는 그대로", () => {
  assert.equal(
    tidyScammerReplyMarkup("(잠시 말이 없다가) 아... 그래? 그럼 지금 그 은행에서 대출을 한번 받아서 보내줄 수 있어?").text,
    "아... 그래? 그럼 지금 그 은행에서 대출을 한번 받아서 보내줄 수 있어?",
  );
  assert.equal(tidyScammerReplyMarkup("(잠깐 머뭇거리다) 아 혹시 아직 대출 신청 안 했어?").text, "아 혹시 아직 대출 신청 안 했어?");
  assert.equal(tidyScammerReplyMarkup("누구... 아 혹시 나 ㅇㅇ이야ㅋㅋ 오랜만이다.").text, "누구... 아 혹시 나야ㅋㅋ 오랜만이다.");
  for (const keep of ["ㅇㅇ 알겠어", "(잠깐만요) 고객님", "잠깐만 기다려 줘"]) {
    assert.equal(tidyScammerReplyMarkup(keep).text, keep);
  }
});

// ── D7 · D8 · D11 · D3 · D12 프롬프트 완화 ──────────────────────────────────────────────────
test("[§129 D7 · D8 · D11] 하지 않은 일을 \"확인됐다\"고 하지 않는 항목이 통화 · 메신저 · Live 조립 모두에 실린다", () => {
  const prompt = SCENARIO_PROMPTS["bank-security-verify-scam"];
  assert.ok(prompt);
  for (const opts of [{}, { liveSpeechStyle: true }, { toolDrivenTiming: true, inCallSmsEnabled: true }]) {
    assert.ok(buildSystemPrompt(prompt, opts).includes(CLAIM_CONSISTENCY_RULE), JSON.stringify(opts));
  }
  const messenger = SCENARIO_PROMPTS["messenger-parcel-smishing-sms"];
  assert.ok(messenger && buildSystemPrompt(messenger).includes(CLAIM_CONSISTENCY_RULE));
  assert.ok(buildLiveConfirmResultInstruction("transfer").includes(LIVE_CONFIRM_NOT_YET_SENTENCE));
});

test("[§129 D3 · D12] 도구 이름 · 인자를 말하지 않는다는 문장은 Live(도구) 문자 줄에만 실린다", () => {
  const prompt = SCENARIO_PROMPTS["bank-security-verify-scam"];
  assert.ok(prompt);
  assert.ok(buildSystemPrompt(prompt, { inCallSmsEnabled: true, toolDrivenTiming: true }).includes(SMS_TOOL_SPEECH_SENTENCE));
  assert.ok(!buildSystemPrompt(prompt, { inCallSmsEnabled: true }).includes(SMS_TOOL_SPEECH_SENTENCE), "텍스트 폴백 줄 바이트 동일");
});

test("[§129 D9] 자녀 사칭 카톡의 성별 미정 줄이 \"아들 · 딸\" 낱말과 고쳐 말하기를 막는다", () => {
  assert.match(CHILD_GENDER_UNSPECIFIED_RULE, /"아들"·"딸"이라는 낱말을 자기에게 쓰지 않고, 말하다가 성별을 고쳐 말하지도 않는다/);
});

// ── D13 포기 신호 종류 ──────────────────────────────────────────────────────────────────────
test("[§129 D13] 판정표 C — 메신저 단계 포기 신호는 참가자 거절 · 의심이 없으면 목표로 기록한다", () => {
  assert.deepEqual(reclassifyMessengerGiveUp("give_up", "그 다음엔 어떻게 해요?", true), { endCall: "goal", reclassified: true }); // C3
  assert.deepEqual(reclassifyMessengerGiveUp("give_up", "안 한다고요. 이제 끊을게요.", true), { endCall: "give_up" }); // C2
  assert.deepEqual(reclassifyMessengerGiveUp("give_up", "보이스피싱 같은데요. 경찰에 물어볼게요.", true), { endCall: "give_up" }); // C2
  assert.deepEqual(reclassifyMessengerGiveUp("give_up", "그 다음엔 어떻게 해요?", false), { endCall: "give_up" }); // C1 통화
  assert.deepEqual(reclassifyMessengerGiveUp("goal", "싫어요", true), { endCall: "goal" }); // C1
  assert.deepEqual(reclassifyMessengerGiveUp(undefined, "네", true), { endCall: undefined }); // C1
  const index = read("roleplay/index.ts");
  assert.match(index, /reclassifyMessengerGiveUp\(endCallCheck\.endCall, maskedUserText, session\.channel === "messenger"\)/);
});

// ── 에뮬 D1 0턴 리포트 ──────────────────────────────────────────────────────────────────────
test("[§129 에뮬 D1] 받기 전에 끝난 통화만 오프닝을 낭독 안 됨으로 표시한다(판정표 U1~U4)", () => {
  assert.equal(shouldMarkOpeningUnheard({ channel: "voice", channelHistory: undefined, answeredAt: undefined }, 0), true); // U4
  assert.equal(shouldMarkOpeningUnheard({ channel: undefined, channelHistory: [], answeredAt: undefined }, 0), true); // U4(부재 = 통화)
  assert.equal(shouldMarkOpeningUnheard({ channel: "messenger", channelHistory: undefined, answeredAt: undefined }, 0), false); // U1
  assert.equal(
    shouldMarkOpeningUnheard({ channel: "voice", channelHistory: [{ from: "messenger", to: "voice" } as never], answeredAt: undefined }, 0),
    false,
  ); // U1
  assert.equal(shouldMarkOpeningUnheard({ channel: "voice", channelHistory: undefined, answeredAt: {} as never }, 0), false); // U2
  assert.equal(shouldMarkOpeningUnheard({ channel: "voice", channelHistory: undefined, answeredAt: undefined }, 1), false); // U3
});

test("[§129 에뮬 D1 배선] endSession이 상태 기록 · 리포트 트리거보다 앞에서 표시한다 · 표시된 오프닝은 수법 · 속은 순간에서 빠진다", () => {
  const session = read("session/index.ts");
  const start = session.indexOf("export const endSession");
  const body = session.slice(start, session.indexOf("export const updateMessengerSkin"));
  const mark = body.indexOf("shouldMarkOpeningUnheard(");
  assert.ok(mark > 0);
  assert.ok(mark < body.indexOf("endReason: recordedReason,"), "상태 기록보다 앞");
  assert.ok(mark < body.indexOf("triggerReportGeneration(sessionId)"), "리포트 트리거보다 앞");
  const result = analyzeConversation(
    [{ role: "scammer", textMasked: "여보세요...? 방금 해외에서 고액 결제 시도가 확인됐습니다.", turnIndex: 0, createdAtMs: 1, notSpoken: true }],
    0,
    SCENARIO_PROMPTS["card-company-impersonation"]!.weakenedTactics,
  );
  assert.deepEqual(result.tacticsUsed, []);
});

// ── 에뮬 D13 Mock 대사 품질 ─────────────────────────────────────────────────────────────────
test("[§129 에뮬 D13] Mock 대사 — 잇기 쉼표 · 겹친 마침표 정리 · 마커는 맨 뒤 · 메신저 오프닝에 \"여보세요\" 없음 · 매 턴 접두 없음", async () => {
  assert.equal(shapeMockLine("", "어디세요?, 예금은 얼마나 되세요?"), "어디세요? 예금은 얼마나 되세요?");
  assert.equal(shapeMockLine("여보세요...?", "확인하실 게 있어서 연락드렸습니다"), "여보세요...? 확인하실 게 있어서 연락드렸습니다.");
  assert.equal(shapeMockLine("", "여기서 신청해 [[LINK:subsidy-apply]]"), "여기서 신청해. [[LINK:subsidy-apply]]");
  const client = new MockLlmClient();
  const hints = ["놀람 유발 — '방금 해외에서 고액 결제 시도가 확인됐습니다'처럼 놀라움만 조성한다."];
  const messengerOpening = await client.complete({ systemPrompt: "", messages: [], mockTacticHints: hints, mockChannel: "messenger" });
  assert.equal(messengerOpening.text, "방금 해외에서 고액 결제 시도가 확인됐습니다.");
  const voiceOpening = await client.complete({ systemPrompt: "", messages: [], mockTacticHints: hints });
  assert.equal(voiceOpening.text, "여보세요...? 방금 해외에서 고액 결제 시도가 확인됐습니다.");
  const lines = await Promise.all(
    [1, 2, 3].map((n) =>
      client.complete({
        systemPrompt: "",
        messages: Array.from({ length: n * 2 }, (_, i) => ({ role: i % 2 === 0 ? ("assistant" as const) : ("user" as const), content: "네" })),
        mockTacticHints: hints,
      }),
    ),
  );
  assert.ok(lines.filter((line) => /^(?:잠시만요|저기요)\.\.\./.test(line.text)).length <= 1, "뜸 들이기 접두는 세 턴에 한 번 이하");
  const card = SCENARIO_PROMPTS["card-company-impersonation"]!.weakenedTactics.join("\n");
  assert.ok(!card.includes("확인됐다'"), "카드사 상담원 인용구는 존댓말");
});

// ── D14 거절 중 전환 1회(사용자 결정 ㉢) ─────────────────────────────────────────────────────
test("[§129 D14] 판정표 D — 거절 중이면 이미 한 번 전환한 세션의 전환 신호를 받지 않는다", () => {
  assert.equal(isRepeatEscalationDuringRefusal("보이스피싱 같은데요. 경찰에 물어볼게요.", 0), false); // D2 첫 전환은 받는다
  assert.equal(isRepeatEscalationDuringRefusal("보이스피싱 같은데요. 경찰에 물어볼게요.", 1), true); // D3
  assert.equal(isRepeatEscalationDuringRefusal("네, 알겠어요.", 1), false); // D1 거절 아님
  const index = read("roleplay/index.ts");
  assert.match(index, /const signalEscalate = rawSignalEscalate && escalationCheck\?\.accept === true && !refusalRepeatBlocked;/);
  assert.match(index, /canEscalateNow:\n\s*!limitReached &&\n\s*!refusalRepeatBlocked &&/, "대사 예고 전환도 같은 조건");
});

// ── 에뮬 D2 받은 시각 기준(사용자 결정 ㉠) ───────────────────────────────────────────────────
const ts = (ms: number) => ({ toMillis: () => ms });
test("[§129 에뮬 D2] 표 A — 처음부터 통화인 세션만 받은 시각 기준 · 메신저(·넘어온 통화)는 생성 시각", () => {
  assert.equal(resolveReportTimeBaseMs({ channel: "voice", channelHistory: undefined, createdAt: ts(1000), answeredAt: ts(5000) }), 5000); // A1
  assert.equal(resolveReportTimeBaseMs({ channel: undefined, channelHistory: [], createdAt: ts(1000), answeredAt: undefined }), 1000); // A2
  assert.equal(resolveReportTimeBaseMs({ channel: "messenger", channelHistory: undefined, createdAt: ts(1000), answeredAt: ts(5000) }), 1000); // A2
  assert.equal(
    resolveReportTimeBaseMs({ channel: "voice", channelHistory: [{ from: "messenger", to: "voice" } as never], createdAt: ts(1000), answeredAt: ts(5000) }),
    1000,
  ); // A2
  const core = read("report/generateReportCore.ts");
  assert.equal(core.includes("session.createdAt.toMillis()"), false, "리포트 시각은 모두 표 A 기준을 쓴다");
});

test("[§129 에뮬 D2] 표 B — 폴백 첫 턴 받은 시각 = 발화 시각 − 클라 경과(생성 시각 아래로 안 감) · 그 밖은 발화 시각", () => {
  const voice = { channel: "voice" as const, channelHistory: undefined };
  assert.equal(answeredAtFromClient(voice, 1000, 100_000, 30_000), 70_000); // B4
  assert.equal(answeredAtFromClient(voice, 1000, 100_000, 500_000), 1000); // B4 하한
  assert.equal(answeredAtFromClient(voice, 1000, 100_000, undefined), 100_000); // B3
  assert.equal(answeredAtFromClient(voice, 1000, 100_000, -5), 100_000); // B3
  assert.equal(answeredAtFromClient(voice, 1000, 100_000, Number.NaN), 100_000); // B3
  assert.equal(answeredAtFromClient({ channel: "messenger", channelHistory: undefined }, 1000, 100_000, 30_000), 100_000); // B2
  const index = read("roleplay/index.ts");
  assert.match(index, /answeredAtFromClient\(fresh, fresh\.createdAt\.toMillis\(\), userWriteTime\.toMillis\(\), request\.data\?\.answeredElapsedMs\)/);
});

// ── (A) 폴백 대사의 대괄호 도구 서술 ────────────────────────────────────────────────────────
test("[§129 (A)] 폴백 대사 · 전사에서 대괄호 도구 · 시스템 서술과 감싼 따옴표를 지운다 · 문자 머리표는 그대로", () => {
  const live = "“[문자 발송 도구 호출: 본인 확인용 인증번호 문자 발송] 고객님, 방금 휴대폰으로 본인 확인용 인증번호 문자를 보내 드렸습니다.”";
  assert.equal(tidyScammerReplyMarkup(live).text, "고객님, 방금 휴대폰으로 본인 확인용 인증번호 문자를 보내 드렸습니다.");
  assert.equal(
    tidyScammerReplyMarkup("“[시스템 메시지: 문자 전송] 고객님, 문자 확인해 주세요").text,
    "고객님, 문자 확인해 주세요",
    "닫는 따옴표 없는 여는 따옴표",
  );
  assert.equal(stripLeakedThought("[문자 발송 도구 호출: 인증번호 문자 발송] 고객님, 문자 보내 드렸습니다."), "고객님, 문자 보내 드렸습니다.");
  for (const keep of ["[지원금 안내] 신청 기한이 오늘까지입니다.", "고객님이 \"네\"라고 하셨잖아요."]) {
    assert.equal(tidyScammerReplyMarkup(keep).text, keep);
  }
  assert.equal(judgeScammerReplyUsability("[문자 발송 도구 호출: 인증번호 문자 발송]"), "empty", "서술만 있는 응답은 쓸 수 없다");
});

// ── (C) 속은 순간 판정 · 라벨(사용자 승인 C1 · L1 · L2 · L3 ㉠ — 메인 라이브 대본 기관 사칭 고급 fv-g2ld) ───────────────
const G2LD_TACTICS = () => resolveSessionScenarioPrompt("institutional-impersonation", "fv-g2ld")!.weakenedTactics;
test("[§129 C1] 부인 · 모름 답의 명사 단독 순응(계좌 · 비밀번호)은 속음이 아니다 · 실제 제공은 그대로 속음", () => {
  const denial = dialogue([
    ["scammer", "확인됐습니다, 고객님. 다음으로 해담은행 계좌 조회를 위해 계좌 비밀번호 여섯 자리를 불러 주십시오."],
    ["user", "그 계좌는 제가 만든 게 아니라 비밀번호를 몰라요. 국민은행 걸 말씀하시는 거예요?"],
  ]);
  assert.equal(analyzeConversation(denial, 0, G2LD_TACTICS()).wasDeceived, false);
  const given = dialogue([
    ["scammer", "계좌 비밀번호 여섯 자리를 불러 주십시오."],
    ["user", "비밀번호 몰라서 생일로 했어요, 600101이에요"],
  ]);
  assert.equal(analyzeConversation(given, 0, G2LD_TACTICS()).wasDeceived, true, "숫자를 불러 줬으면 속음(V3)");
});

test("[§129 L1 · L2 · L3] 생년 · 인증번호 순간 라벨 = '신원정보 직접 요구'(부인 대응 라벨 0 · 빈 라벨 0)", () => {
  const birth = dialogue([
    ["scammer", "고객님, 만든 적이 없으시다니 오히려 명의가 도용됐을 가능성이 큽니다. 그래서 더 빨리 확인해야 합니다. 먼저 본인 확인부터 하겠습니다."],
    ["user", "네, 확인해 주세요. 홍길동이고 1960년생이에요."],
  ]);
  assert.equal(analyzeConversation(birth, 0, G2LD_TACTICS()).deceivedMoments[0]?.tactic, "신원정보 직접 요구");
  const otp = dialogue([
    ["scammer", "고객님, 방금 휴대폰으로 본인 확인용 인증번호 문자를 보내 드렸습니다. 화면에 도착한 여섯 자리 숫자를 지금 바로 불러 주십시오."],
    ["user", "277758이요"],
  ]);
  const result = analyzeConversation(otp, 0, G2LD_TACTICS(), ["277758"]);
  assert.equal(result.deceivedMoments[0]?.tactic, "신원정보 직접 요구");
  assert.ok(result.tacticsUsed.includes("신원정보 직접 요구"), "AC-083 (a) — 속은 순간 라벨은 수법 목록 안");
});

test("[§129 L2] 사진 턴은 내용 범주 라벨 판정에서 뺀다(사진 순간 라벨은 §131 소관 — 그쪽 수정과 겹치지 않게 소스로만 고정)", () => {
  const src = read("report/analyzeConversation.ts");
  const body = src.slice(src.indexOf("function answerContentCategory("), src.indexOf("function resolveAnswerCategoryTactic("));
  assert.match(body, /if \(reply\.photo === true\) return undefined;/);
});

// ── (C) C4 · C5(사용자 결정 2026-10-24 "둘 다 빼기") — 메인이 옮긴 라이브 대본(되짚어보기 화면 문면 · 기관 사칭 고급 fv-g2ld · 폴백) ──
const LIVE_G2LD: [role: "scammer" | "user", text: string][] = [
  ["scammer", "여보세요, 고객님 휴대폰 맞으시죠? 저는 한빛지방검찰청 금융범죄조사부 정하람 수사관입니다."],
  ["user", "네 맞는데요, 무슨 일이세요?"],
  ["scammer", "네, 고객님. 놀라셨을 텐데 차분히 들어주셔야 합니다. 고객님 명의로 개설된 계좌 하나가 현재 보이스피싱 범죄에 이용된 정황이 확인돼서, 오늘 이렇게 연락드리게 됐습니다."],
  ["user", "제가요? 저는 국민은행 계좌만 쓰는데요. 어떻게 해야 하나요?"],
  ["scammer", "네, 고객님. 그 부분도 확인해 보려는 거니까 걱정 너무 크게 하지 마십시오. 말씀하신 말씀하신 은행 말고도 해담은행에 고객님 이름으로 된 계좌가 하나 더 확인됩니다."],
  ["user", "해담은행은 만든 적 없어요. 그럼 제가 뭘 해야 돼요?"],
  ["scammer", "고객님, 만든 적이 없으시다니 오히려 명의가 도용됐을 가능성이 큽니다. 그래서 더 빨리 확인해야 합니다. 먼저 본인 확인부터 하겠습니다."],
  ["user", "네, 확인해 주세요. 홍길동이고 1960년생이에요."],
  ["scammer", "네, 홍길동 고객님, 1960년생 확인했습니다. 그럼 주민등록번호 뒤 일곱 자리도 불러 주십시오. 본인 확인이 안 되면 공범으로 분류될 수 있어서 지금 바로 답변 주셔야 절차가 진행됩니다."],
  ["user", "1234567이요. 이제 어떻게 해요?"],
  ["scammer", "확인됐습니다, 고객님. 다음으로 해담은행 계좌 조회를 위해 계좌 비밀번호 여섯 자리를 불러 주십시오."],
  ["user", "그 계좌는 제가 만든 게 아니라 비밀번호를 몰라요. 국민은행 걸 말씀하시는 거예요?"],
  ["scammer", "네, 고객님. 그러니까 더 위험하다는 겁니다. 고객님이 모르는 계좌라면 명의가 도용돼 개설된 것으로 보입니다."],
  ["user", "알겠어요. 그럼 제 국민은행 돈은 어떻게 지켜요? 시키는 대로 할게요"],
  ["scammer", "그러시면 됩니다, 고객님. 지금 고객님 예금이 범죄 자금과 섞이지 않도록 자산을 안전 계좌로 옮겨야 합니다."],
  ["user", "네? 방금 문자가 하나 왔는데요. 안전 계좌는 어떻게 옮겨요?"],
  ["scammer", "고객님, 방금 휴대폰으로 본인 확인용 인증번호 문자를 보내 드렸습니다. 화면에 도착한 여섯 자리 숫자를 지금 바로 불러 주십시오."],
  ["user", "277758이요"],
  ["scammer", "확인됐습니다, 고객님. 본인 확인은 마무리됐습니다."],
  ["user", "네. 그 다음엔 뭘 하면 되나요?"],
  ["scammer", "고객님, 지금 말씀하신 은행 예금을 전부 찾으셔야 합니다. 자산 실물 전수 조사 대상이라서, 예금은 계좌 사이로 옮기는 순간 추적이 끊겨 확인이 안 됩니다. 그래서 찾으신 돈으로 금을 사서 담당 직원에게 제출하셔야 검수가 끝나고, 검수 뒤에 그대로 돌려 드립니다."],
  ["user", "알겠어요. 은행 가서 돈 찾고 금 사서 직원분께 드릴게요. 어디로 가면 돼요?"],
  ["scammer", "협조해 주셔서 감사합니다, 고객님. 지금 드린 안내대로 진행해 주시고, 이 내용은 다른 사람에게 말씀하지 마십시오."],
];
test("[§129 C1~C5 · L1~L3] 라이브 대본 — 속은 순간 10 → 4(생년 · 주민번호 · 인증번호 · 금 구매) · 처음 속은 순간 = 생년 · 빈 라벨 0", () => {
  const messages = dialogue(LIVE_G2LD);
  const result = analyzeConversation(messages, 0, G2LD_TACTICS(), ["277758"]);
  const momentTexts = result.deceivedMoments.map((m) => messages[m.turnIndex].textMasked.slice(0, 12));
  assert.deepEqual(momentTexts, ["네, 확인해 주세요. ", "1234567이요. 이", "277758이요", "알겠어요. 은행 가서 "]);
  assert.deepEqual(result.deceivedMoments.map((m) => m.tactic), [
    "신원정보 직접 요구",
    "신원정보 직접 요구",
    "신원정보 직접 요구",
    "실물 조사 명목 금 구매 인출 요구",
  ]);
});

test("[§129 C4 · C5 경계] 앞 대사에 요구가 있으면 방법 질문 · 따름 약속은 종전대로 속음 · 이행 보고(했어요)는 C5 대상이 아니다", () => {
  const tactics = G2LD_TACTICS();
  const ask = (scammer: string, user: string) => analyzeConversation(dialogue([["scammer", scammer], ["user", user]]), 0, tactics).wasDeceived;
  assert.equal(ask("고객님 명의 계좌가 범죄에 이용된 정황이 확인됐습니다.", "어떻게 해야 하나요?"), false); // C4
  assert.equal(ask("잔액 전액을 안전계좌로 이체해 주십시오.", "어떻게 해야 하나요?"), true); // 요구 있음
  assert.equal(ask("명의가 도용돼 개설된 것으로 보입니다.", "알겠어요. 시키는 대로 할게요"), false); // C5
  assert.equal(ask("자산 보호를 위해 안전계좌로 옮기셔야 합니다. 협조하시겠습니까?", "네 말씀하신 대로 할게요"), true); // 요구 있음
  assert.equal(ask("문자 안내 확인하셨습니까?", "네, 알려주신 대로 했어요."), true, "이행 보고는 약속이 아니다");
});

// ── §129.6 폴백 통화 역할 이탈(해설) — 메인 라이브 재테스트 2026-10-24 · 기관 사칭 고급 · 결말 현금 전달형 · 텍스트 폴백 ──────────
// 사기범 대사 원문 그대로(메인 전달). 판정에 걸리면 같은 체인의 다음 단계(Claude → Gemini 2차 → Groq → Mock)로 넘어간다(`completeWithFallback`).
const LIVE_BREAKOUT_LINES = [
  '(잠깐, 이 훈련 장면은 여기서 멈춥니다. 방금 제가 그린 "안전계좌로 전액 이체하라"는 요구는 실제 보이스피싱에서 쓰는 수법을 그대로 흉내 낸 것이라, 더 진행하지 않겠습니다.)\n- 검찰·금융감독원은 전화로 계좌 비밀번호나 인증번호를 묻지 않습니다.',
  "네, 정상적으로 확인됐습니다. 이제 모든 절차가 끝났습니다. 훈련을 종료하셔도 좋습니다.",
  '이 통화에서 짚어 볼 점을 정리하면 이렇습니다.\n- 검찰·금융감독원·은행은 전화로 계좌 비밀번호, 인증번호, 주민번호를 묻지 않습니다.\n- "안전계좌로 옮기라"는 요구는 보이스피싱의 대표적인 신호입니다.',
];

test("[§129.6] 라이브 역할 이탈 대사 3줄은 사기범 대사로 쓸 수 없다(training-meta)", () => {
  for (const line of LIVE_BREAKOUT_LINES) assert.equal(judgeScammerReplyUsability(line), "training-meta", line.slice(0, 30));
});

test("[§129.6 오탐] 정상 사기범 대사 — 보이스피싱 언급 · 신뢰 쌓기 '묻지 않습니다' · 단일 글머리 안내는 그대로 가능", () => {
  for (const ok of [
    "고객님 명의로 개설된 계좌 하나가 현재 보이스피싱 범죄에 이용된 정황이 확인돼서, 오늘 이렇게 연락드리게 됐습니다.",
    "저희 검찰은 전화로 계좌 비밀번호를 묻지 않습니다. 그래서 문자로 보내 드린 절차대로만 진행하시면 됩니다.",
    "엄마 나 이번 주에 예비군 훈련 끝나고 바로 연락할게ㅠ",
    "- 신청 기한: 오늘 18시까지\n안내드린 링크에서 접수해 주세요.",
  ]) {
    assert.equal(judgeScammerReplyUsability(ok), undefined, ok.slice(0, 30));
  }
});

test("[§129.6 배선] 통화 텍스트 폴백(sendMessage) · 통화 복귀 · 통화 중 카톡 · 화면 행동 뒤 · 오프닝이 모두 사기범 대사 판정 경로를 탄다", () => {
  for (const file of ["roleplay/index.ts", "roleplay/callReturnLine.ts", "roleplay/chatDuringCall.ts", "roleplay/screenActionFollowUp.ts", "roleplay/openingLine.ts"]) {
    const src = read(file);
    assert.match(src, /completeWithFallback\(/, file);
    assert.match(src, /purpose: "scammer-reply"/, file);
  }
  assert.match(read("llm/index.ts"), /assertUsableScammerReply\(input, result\);/, "마지막 그물(Mock 강등)도 같은 판정");
});
