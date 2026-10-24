// §104(2026-10-22 · 전수 검수 2차 — docs/research/full-scenario-live-audit-2026-10.md 남은 결함) — 결함별 고정 테스트.
//
// 대본은 실 키 프로브 결과 JSON의 사기범 턴을 줄여 옮겼다(참가자 응답 유형 = 보고서 §1.3). 대본 테스트가 보이는 것은 **결정론적 층**
// (서버 턴 지시 · 신호 판정)이 언제 발동하는가다 — 모델이 그 지시를 따르는지는 실 키 프로브로만 잴 수 있다(보고서 §2.2와 같은 한계).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  decideRepeatBreak,
  bigramSimilarity,
  REPEAT_BREAK_IDENTITY_INSTRUCTION,
  REPEAT_BREAK_SIMILAR_INSTRUCTION,
  repeatBreakInstruction,
} from "../repeatBreak";
import { judgeEndCallSignal, judgeEscalationSignal } from "../signalConsistency";
import { buildSystemPrompt, LIVE_NO_IDLE_RULE, SMS_NOT_YET_SENT_SENTENCE } from "../promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { listFlowVariants, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { DIFFICULTY_LEVELS } from "../../shared/difficulty";
import { maskFictionalInstitutionNames } from "../../scenarios/__tests__/harmlessnessPatterns";

const SRC = path.join(__dirname, "..", "..", "..", "src");
// 작업 트리는 CRLF일 수 있다(core.autocrlf) — 소스 스캔 정규식은 LF 기준이라 줄바꿈을 맞춘다.
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

/** 대본 전체를 한 턴씩 진행하며, 각 사기범 턴 **직전**에 서버가 지시를 싣는지(= 그 앞 두 대답으로 판정) 기록한다. */
function instructionsBeforeEachTurn(scammerTurns: readonly string[]): (string | null)[] {
  return scammerTurns.map((_, i) => decideRepeatBreak(scammerTurns.slice(0, i)));
}

/** 같은 판정이 연달아 참인 최장 길이(= 지시 없이 허용되는 반복). */
function longestRunWithoutInstruction(scammerTurns: readonly string[], same: (a: string, b: string) => boolean): number {
  const marks = instructionsBeforeEachTurn(scammerTurns);
  let best = 1;
  let run = 1;
  for (let i = 1; i < scammerTurns.length; i += 1) {
    if (marks[i] !== null) break; // 지시가 실린 턴부터는 모델 몫이다.
    run = same(scammerTurns[i - 1]!, scammerTurns[i]!) ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

// ── 결함 1 · 3(F4 · M4) — 반복 차단 판정표 ──────────────────────────────────────────────────────────
const F4_INSTITUTION_REFUSE = [
  "여보세요, 금융감독원 금융범죄조사팀입니다. 고객님 명의 계좌가 범죄에 연루돼 연락드렸습니다.",
  "본인 확인이 먼저입니다. 성함과 생년월일 불러주십시오.",
  "절차상 필요합니다. 성함과 생년월일 말씀해 주시겠습니까?",
  "지금 확인이 안 되면 공범으로 분류될 수 있습니다. 성함과 생년월일 불러주셔야 합니다.",
  "협조하지 않으시면 불이익이 있을 수 있습니다.",
];
const M4_PARCEL_REFUSE = [
  "[배송 안내] 고객님, 주소지 오류로 배송이 보류됐습니다. 여기서 확인해 주세요.",
  "오늘 확인 안 하시면 반송돼요.",
  "네, 알겠습니다. 직접 확인해 보시지요.",
  "네, 알겠습니다. 직접 확인해 보시지요.",
  "네, 알겠습니다. 직접 확인해 보시지요.",
  "네, 알겠습니다. 직접 확인해 보시지요.",
];
const COMPLY_INSTITUTION = [
  "본인 확인부터 하겠습니다. 성함과 생년월일 불러주십시오.",
  "홍길동님 맞으시죠? 주민번호 뒤 7자리도 불러주셔야 조회가 됩니다.",
  "확인됐습니다. 최근에 통장 개설하신 적 있으세요?",
  "그 계좌가 범죄에 쓰였습니다. 문자로 보낸 안전계좌로 잔액을 옮기셔야 합니다.",
];

test("[§104 결함1 · F4 대본] 기관 사칭 거절형 — 같은 인적사항 요구가 두 턴 이어지면 셋째 턴 직전에 지시가 실린다", () => {
  const marks = instructionsBeforeEachTurn(F4_INSTITUTION_REFUSE);
  // 셋째 같은 요구(대본 s3) 직전부터 지시가 실린다(그 뒤 대본 턴은 지시를 무시한 모델의 대사다).
  assert.deepEqual(marks, [null, null, null, "identity", "identity"]);
  // 이전(지시 없음): 대본 그대로 3연속. 이후: 지시 없이 허용되는 같은 요구는 최대 2턴.
  const sameItems = (a: string, b: string) => decideRepeatBreak([a, b]) === "identity";
  assert.equal(longestRunWithoutInstruction(F4_INSTITUTION_REFUSE, sameItems), 2);
  assert.equal(repeatBreakInstruction("identity"), REPEAT_BREAK_IDENTITY_INSTRUCTION);
});

test("[§104 결함3 · M4 대본] 택배 초급 거절형 — 같은 말이 두 턴 이어지면 다음 턴마다 지시가 실린다(이전 6연속)", () => {
  const marks = instructionsBeforeEachTurn(M4_PARCEL_REFUSE);
  assert.deepEqual(marks, [null, null, null, null, "similar", "similar"]);
  assert.equal(repeatBreakInstruction("similar"), REPEAT_BREAK_SIMILAR_INSTRUCTION);
  assert.equal(bigramSimilarity(M4_PARCEL_REFUSE[2]!, M4_PARCEL_REFUSE[3]!), 1);
});

test("[§104 결함1 역방향] 순순히 따르는 흐름(성함 → 주민번호 → 조회 → 이체)은 한 번도 지시하지 않는다", () => {
  assert.deepEqual(instructionsBeforeEachTurn(COMPLY_INSTITUTION), [null, null, null, null]);
  // 되읽기 확인("○○님 맞으시죠?")은 요구 형태가 아니다 — 성함 항목으로 세지 않는다.
  assert.equal(decideRepeatBreak(["성함과 생년월일 불러주십시오.", "홍길동님 성함 맞으시죠? 확인 감사합니다."]), null);
  // 짧은 대답끼리는 우연한 일치로 보지 않는다.
  assert.equal(decideRepeatBreak(["네.", "네."]), null);
});

test("[§104 배선] sendMessage — 앱 진행 지시가 없는 턴에만 반복 판정을 계산하고 턴 지시 묶음에 합친다", () => {
  const src = read("roleplay/index.ts");
  assert.match(src, /import \{ decideRepeatBreak, repeatBreakInstruction \} from "\.\/repeatBreak";/);
  assert.match(
    src,
    /const repeatBreakKind =\n\s*turnChoice === "none" && !otpCheckInstruction && !confirmPlan\?\.instruction\n\s*\? decideRepeatBreak\(storedHistory\.filter\(\(m\) => m\.role === "scammer"\)\.map\(\(m\) => m\.textMasked\), maskedUserText\)\n\s*: null;/,
  );
  const iKind = src.indexOf("const repeatBreakKind =");
  assert.ok(src.indexOf("const confirmPlan =") < iKind, "확인 결과 판정 뒤에 계산해야 한다");
  assert.ok(iKind < src.indexOf("const completion = await completeWithFallback("), "LLM 호출 앞에서 계산해야 한다");
});

test("[§104 문면] 반복 차단 지시 — 숫자 · 따옴표 대사 · 끊기 어휘 · 반복 유도 문구 0", () => {
  for (const text of [REPEAT_BREAK_IDENTITY_INSTRUCTION, REPEAT_BREAK_SIMILAR_INSTRUCTION]) {
    assert.equal(/[0-9]/.test(text), false, text);
    assert.equal(/["“”'‘’]/.test(text), false, text);
    assert.equal(/끊|종료|마무리/.test(text), false, text);
    assert.equal(/그대로 다시|재촉하라|계속 밀어붙/.test(text), false, text);
  }
});

// ── 결함 4(M2) — 전화 전환 신호 vs 대사 ──────────────────────────────────────────────────────────
test("[§104 결함4 · M2] 통화가 안 된다 · 나중에 연락한다고 말한 턴의 전화 전환 신호는 받아들이지 않는다", () => {
  for (const reply of [
    "폰 고쳐서 얼른 연락할게!",
    "엄마 지금 통화하면 소리도 다 깨져서 들리지도 않아 ㅠㅠ",
    "지금은 통화가 안 돼, 톡으로만 해줘",
    "나중에 전화할게, 일단 급한 것부터 보내줘",
    "이따가 다시 연락할게",
  ]) {
    assert.deepEqual(judgeEscalationSignal(reply), { accept: false, reason: "contradicted" }, reply);
  }
  for (const reply of [
    "그럼 내가 지금 전화할게",
    "답답하네 진짜, 통화가 안 된다니까... 아 그냥 내가 전화 걸게",
    "그럼 배송 상담원이 직접 전화드릴게요",
    "상담원이 직접 전화드리겠습니다",
    "알겠어 엄마 ㅠㅠ", // 신호만 있고 대사 단서가 없으면 종전대로 받아들인다
  ]) {
    assert.deepEqual(judgeEscalationSignal(reply), { accept: true }, reply);
  }
});

// ── 결함 5(M1) — 끊는 턴의 새 송금 요구 ─────────────────────────────────────────────────────────
test("[§104 결함5 · M1] 새 송금을 요구한 턴의 목표 끊기 신호는 받아들이지 않는다 · 인사 · 포기는 그대로", () => {
  assert.deepEqual(judgeEndCallSignal("goal", "엄마 고마워! 근데 30만 원만 더 같은 계좌로 보내줘"), {
    endCall: undefined,
    dropped: "demand_in_goal_turn",
  });
  assert.deepEqual(judgeEndCallSignal("goal", "50만 원만 더 넣어줘, 이따 연락할게"), { endCall: undefined, dropped: "demand_in_goal_turn" });
  assert.deepEqual(judgeEndCallSignal("goal", "보내줘서 고마워 엄마, 이만 들어가 볼게"), { endCall: "goal" });
  assert.deepEqual(judgeEndCallSignal("goal", "확인됐습니다. 수고하셨습니다."), { endCall: "goal" });
  assert.deepEqual(judgeEndCallSignal("give_up", "알겠어요, 그럼 다른 데서 알아볼게요. 보내 주시면 좋았을 텐데요"), { endCall: "give_up" });
  assert.deepEqual(judgeEndCallSignal(undefined, "30만 원만 더 보내줘"), { endCall: undefined });
});

test("[§104 배선] sendMessage — 신호는 대사 판정을 거친 값만 전이 · 끊기 효과에 쓰인다", () => {
  const src = read("roleplay/index.ts");
  assert.match(src, /escalate: rawSignalEscalate,\n\s*endCall: rawEndCallSignal,\n\s*\} = extractEscalationSignal\(smsMarkerFreeText\);/);
  assert.match(src, /const signalEscalate = rawSignalEscalate && escalationCheck\?\.accept === true;/);
  assert.match(src, /const endCallSignal = endCallCheck\.endCall;/);
  // 날것 신호가 판정 밖에서 쓰이지 않는다(선언 1 + 판정 입력 1).
  assert.equal((src.match(/rawSignalEscalate/g) ?? []).length, 3);
  assert.equal((src.match(/rawEndCallSignal/g) ?? []).length, 2);
});

// ── 결함 1 · 7 — 페르소나 · 수법 문면 ──────────────────────────────────────────────────────────
const REFUSAL_SENTENCE =
  "다만 상대가 정보를 불러 주기를 거절했으면 그것은 부인이 아니다 — 바로 다음 차례에 같은 요구를 되풀이하지 말고 불이익 암시나 확인 절차 차단 같은 다른 수법으로 넘어간다.";

test("[§104 결함1] 기관 사칭 · 검찰 — 신원 요구 수법에 '거절은 부인이 아니다' 1문장 · T92 무조건성 명시구 유지", () => {
  for (const id of ["institutional-impersonation", "prosecution-cooperation-call"]) {
    const tactics = SCENARIO_PROMPTS[id]!.weakenedTactics.join("\n");
    assert.equal(tactics.split(REFUSAL_SENTENCE).length - 1, 1, id);
    assert.ok(tactics.includes("이 요구는 상대가 무엇을 부인하든 꺼낼 수 있다."), `${id}: T92 명시구`);
  }
  const persona = SCENARIO_PROMPTS["institutional-impersonation"]!.personaPrompt;
  assert.ok(persona.includes("상대가 정보를 불러 주기를 **거절하면** 그 요구를 바로 다음 차례에 다시 꺼내지 않는다"));
});

test("[§104 결함1] 공통 [진행 강제] — 거절된 요구는 바로 다음 대답에서 다시 꺼내지 않는다 · '새 근거' 구절 0(전 시나리오 · 전 변형)", () => {
  for (const [id] of Object.entries(SCENARIO_PROMPTS)) {
    for (const level of DIFFICULTY_LEVELS) {
      for (const variant of listFlowVariants(id, level)) {
        const prompt = resolveSessionScenarioPrompt(id, variant.variantId);
        assert.ok(prompt);
        const assembled = buildSystemPrompt(prompt, { difficultyLevel: level });
        assert.ok(assembled.includes("거절된 요구는 그 사이에 다른 카드를 쓴 뒤에만 다시 꺼낸다."), `${id}/${variant.variantId}`);
        assert.equal(assembled.includes("새 근거를 댄다"), false, `${id}/${variant.variantId}`);
      }
    }
  }
});

test("[§104 결함7] 실존 지역 · 부서 결합 기관명 0 — 전 시나리오 · 전 변형 · Live 조립 · 기관 사칭 페르소나에 OO 명칭 규칙", () => {
  const REAL_INSTITUTION = /서울중앙지|중앙지검|대검찰청|[가-힣]{2}지방검찰청|[가-힣]{2}지검|금융범죄수사부|사이버수사대|[가-힣]{2}경찰서/;
  for (const [id] of Object.entries(SCENARIO_PROMPTS)) {
    for (const level of DIFFICULTY_LEVELS) {
      for (const variant of listFlowVariants(id, level)) {
        const prompt = resolveSessionScenarioPrompt(id, variant.variantId);
        assert.ok(prompt);
        const assembled = buildSystemPrompt(prompt, { difficultyLevel: level, liveSpeechStyle: true, toolDrivenTiming: true });
        // §109(DECISIONS #224) — 허용 목록의 가상 기관명(정확 일치)만 가리고 검사한다. 다른 지역명 + "지방검찰청"은 그대로 걸린다.
        const hit = maskFictionalInstitutionNames(assembled).match(REAL_INSTITUTION);
        assert.equal(hit, null, `${id}/${variant.variantId}: ${hit?.[0]}`);
      }
    }
  }
  const persona = SCENARIO_PROMPTS["institutional-impersonation"]!.personaPrompt;
  // §118(DECISIONS #233) — 가림 "OO지방검찰청"·"금융감독원 OO팀" → 가상 고유명(검찰은 열람본과 같은 이름 · 금융감독원은 가상 팀 · 조사관).
  assert.ok(persona.includes('"한빛지방검찰청 금융범죄조사부 정하람 수사관"'));
  assert.ok(persona.includes('"금융감독원 계좌안전점검팀 권도하 조사관"'));
  assert.equal(persona.includes('"OO지방검찰청"'), false);
  assert.equal(persona.includes("금융감독원 OO팀"), false);
});

// ── 결함 2(F11) · 6(F7) — Live 전용 공통 항목 ───────────────────────────────────────────────────────
test("[§104 결함2] '대기 말로 시간을 끌지 않는다'는 끊을 수 없는 Live 조립에만 1회 — 폴백 · 오프닝 · TOOL 변형은 0", () => {
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const live = buildSystemPrompt(prompt, { difficultyLevel: "advanced", liveSpeechStyle: true });
    assert.equal(live.split(LIVE_NO_IDLE_RULE).length - 1, 1, `${id}: Live NONE`);
    assert.ok(live.indexOf("\"확인 중\"이라며 붙잡아 두지 않는다") < live.indexOf(LIVE_NO_IDLE_RULE), `${id}: NO_STALL 바로 뒤`);
    assert.equal(buildSystemPrompt(prompt, { difficultyLevel: "advanced" }).includes(LIVE_NO_IDLE_RULE), false, `${id}: 폴백`);
    assert.equal(
      buildSystemPrompt(prompt, { difficultyLevel: "advanced", liveSpeechStyle: true, hangupMode: "tool" }).includes(LIVE_NO_IDLE_RULE),
      false,
      `${id}: TOOL(끊을 수 있는 세션)`,
    );
    assert.ok(live.trimEnd().endsWith(prompt.guardrailPreamble.trimEnd()), `${id}: 가드레일 최후미`);
  }
  // 문면 — 끊기 어휘 · 숫자 0(이 항은 끊기를 허락하지 않는다 · G130).
  assert.equal(/끊|종료하|마무리/.test(LIVE_NO_IDLE_RULE), false);
  assert.equal(/[0-9]/.test(LIVE_NO_IDLE_RULE), false);
});

test("[§104 결함6 · F7] 문자 도구 줄 — 보내기 전 · 거절 뒤에는 '문자로 보내 드린'이라고 말하지 않는다(Live 도구 줄에만)", () => {
  const prompt = resolveSessionScenarioPrompt("prosecution-cooperation-call", listFlowVariants("prosecution-cooperation-call", "advanced")[0]!.variantId);
  assert.ok(prompt);
  const live = buildSystemPrompt(prompt, { difficultyLevel: "advanced", inCallSmsEnabled: true, toolDrivenTiming: true, liveSpeechStyle: true });
  assert.equal(live.split(SMS_NOT_YET_SENT_SENTENCE).length - 1, 1, "Live 도구 줄 1회");
  assert.ok(live.includes("**도구를 부르지 않은 채 문자를 보냈다고 말하지 않는다.**" + SMS_NOT_YET_SENT_SENTENCE));
  const fallback = buildSystemPrompt(prompt, { difficultyLevel: "advanced", inCallSmsEnabled: true });
  assert.equal(fallback.includes(SMS_NOT_YET_SENT_SENTENCE), false, "텍스트 폴백 줄은 바이트 동일");
  assert.equal(/[0-9]/.test(SMS_NOT_YET_SENT_SENTENCE), false);
});

// ── 결함 8 — 리포트 참가자 발화 수 ─────────────────────────────────────────────────────────────────
test("[§104 결함8] 리포트 문서에 참가자 발화 수를 같은 스냅샷에서 센다(표시 전용 · 추가 read 0)", () => {
  const src = read("report/generateReportCore.ts");
  assert.ok(src.includes('userTurnCount: messages.filter((message) => message.role === "user").length,'));
  const types = read("shared/types.ts");
  assert.ok(types.includes("userTurnCount?: number;"));
});

// ══ §104 2차 지시(2026-10-22 메인 세션 — 사용자 결정 "AI가 먼저 끊기" · 실기 대본 검찰 고급 · 문자 미도착 신고) ══════════════════
import {
  HANGUP_EXHAUSTED_SENTENCE,
  HANGUP_NO_NEW_DEMAND_SENTENCE,
  HANGUP_RULE_NONE,
  HANGUP_RULE_SIGNAL,
  HANGUP_RULE_TOOL,
  OFF_TOPIC_REPLY_SENTENCE,
} from "../promptAssembly";
import { EXHAUSTED_DECLARATION, REPEAT_BREAK_EXHAUSTED_INSTRUCTION } from "../repeatBreak";
import { planSmsBackstop } from "../../inCallSms/smsGate";
import { resolveDeclaredSms } from "../../inCallSms/smsGate";

// 사용자 실기 대본(검찰 고급 · 리포트 되짚어보기) — 참가자 발화.
const PROSECUTION_EXHAUSTED_SCRIPT = [
  "나은 자산이 얼마였는데 내가?",
  "그래서 전환했다는 거나 2만 원밖에 없다니까.",
  "15만 원까지 했어. 이제 탈탈 털렸어. 나도 이제 없어. 돈 없어.",
];

test("[§104 자금 소진 · 대본] 참가자가 돈이 더 없다고 분명히 말한 턴에 지시 1줄(사기범 대답 수와 무관) · 끊을지는 끊기 항목에 맡긴다", () => {
  assert.equal(decideRepeatBreak([], PROSECUTION_EXHAUSTED_SCRIPT[0]), null);
  assert.equal(decideRepeatBreak(["남은 예금 적금까지 검수해야 합니다."], PROSECUTION_EXHAUSTED_SCRIPT[2]), "exhausted");
  for (const t of ["돈 없어요", "더 이상 보낼 돈이 없어요", "이제 없어", "남은 게 하나도 없어요", "잔고가 없어", "한 푼도 없어요", "전부 다 보냈어요"]) {
    assert.ok(EXHAUSTED_DECLARATION.test(t), t);
  }
  // 오탐 0 — 순순히 따르는 답 · 수량 질문 · 일반 대화.
  for (const t of ["네, 보냈어요.", "다 했어요", "설치 다 했어요", "얼마 있는지 볼게요", "없는 번호인데요?", "괜찮아요"]) {
    assert.equal(EXHAUSTED_DECLARATION.test(t), false, t);
  }
  assert.equal(repeatBreakInstruction("exhausted"), REPEAT_BREAK_EXHAUSTED_INSTRUCTION);
  assert.ok(REPEAT_BREAK_EXHAUSTED_INSTRUCTION.includes("대출처럼 아직 권하지 않은 다른 수단이 있으면 그것만 권하고"));
  assert.ok(REPEAT_BREAK_EXHAUSTED_INSTRUCTION.includes("[진행 강제]의 통화 끝내기 항목이 정한 대로 하라"));
  assert.equal(/[0-9]|["“”'‘’]/.test(REPEAT_BREAK_EXHAUSTED_INSTRUCTION), false);
});

test("[§104 끊기 조건] TOOL · SIGNAL 공통 머리 — 자금 소진 1문장 · 끊는 응답 새 요구 금지 1문장 · NONE에는 0 · 열거는 첫째 · 둘째 그대로", () => {
  for (const [name, text] of [["TOOL", HANGUP_RULE_TOOL], ["SIGNAL", HANGUP_RULE_SIGNAL]] as const) {
    assert.equal(text.split(HANGUP_EXHAUSTED_SENTENCE).length - 1, 1, name);
    assert.equal(text.split(HANGUP_NO_NEW_DEMAND_SENTENCE).length - 1, 1, name);
    assert.ok(text.indexOf("둘째,") < text.indexOf(HANGUP_EXHAUSTED_SENTENCE), `${name}: 두 경우 뒤`);
    assert.equal((text.match(/첫째|둘째|셋째/g) ?? []).filter((w) => w === "셋째").length, 0, `${name}: 셋째 경우 0`);
  }
  assert.equal(HANGUP_RULE_NONE.includes(HANGUP_EXHAUSTED_SENTENCE), false);
  assert.equal(HANGUP_RULE_NONE.includes(HANGUP_NO_NEW_DEMAND_SENTENCE), false);
  for (const s of [HANGUP_EXHAUSTED_SENTENCE, HANGUP_NO_NEW_DEMAND_SENTENCE]) {
    assert.equal(/[0-9]|한 번|번째/.test(s), false, s);
  }
});

test("[§104 받아치기] [대화 방식] 주변 이야기 1문장 — 전 시나리오 · 전 경로 1회", () => {
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    for (const opts of [{ difficultyLevel: "beginner" as const }, { difficultyLevel: "advanced" as const, liveSpeechStyle: true }]) {
      const assembled = buildSystemPrompt(prompt, opts);
      assert.equal(assembled.split(OFF_TOPIC_REPLY_SENTENCE).length - 1, 1, id);
      assert.ok(assembled.indexOf("[대화 방식") < assembled.indexOf(OFF_TOPIC_REPLY_SENTENCE), id);
    }
  }
});

test("[§104 문자 미도착] 사기범이 문자를 보냈다고 말했으면(claimed) 게이트가 열린 순간 보낸다 · 하한 전이면 여전히 대기 · 부재 = 종전", () => {
  const variantId = listFlowVariants("prosecution-cooperation-call", "advanced")[0]!.variantId;
  const { declared } = resolveDeclaredSms("prosecution-cooperation-call", variantId);
  const caseLink = declared.find((d) => d.smsId === "prosecution-case-link")!;
  const delivered = [{ smsId: caseLink.smsId, userTurnsAtArrival: 2 }];
  // 자산 검수 문자: notBeforeUserTurns 5 · 앞 문자 뒤 간격 ⇒ 개방 5.
  assert.equal(planSmsBackstop({ declared, delivered, userTurns: 4, claimed: true }).action, "wait", "하한 전에는 주장이 있어도 보내지 않는다");
  assert.equal(planSmsBackstop({ declared, delivered, userTurns: 5, claimed: true }).action, "deliver", "개방 즉시 발송");
  assert.equal(planSmsBackstop({ declared, delivered, userTurns: 5 }).action, "wait", "주장 없으면 종전(개방 + 넛지 + 발송)");
  assert.equal(planSmsBackstop({ declared, delivered, userTurns: 9 }).action, "deliver", "종전 발송 시점 그대로");
  const src = read("inCallSms/index.ts");
  // §126 — 주장은 백스톱 요청에서만 읽는다(발송 통로의 명시 요청 판정에도 쓴다).
  assert.ok(src.includes('const smsClaimed = trigger === "backstop" && request.data?.smsClaimed === true;'));
  // §115 — 도착 기록을 한 번 읽어 백스톱 계획과 마무리 판정(`planGoalWrapUp`)이 같은 값을 쓴다.
  assert.ok(src.includes("const deliveredNow = await readDeliveredSms(sessionRef);"));
  assert.ok(src.includes("planSmsBackstop({ declared, delivered: deliveredNow, userTurns, claimed: smsClaimed })"));
});

// ══ §104.9 메신저 단계 사기범 종료(대안 A) ══════════════════════════════════════════════════════════════════════════
import { decideScammerHangup, SCAMMER_HANGUP_MIN_USER_TURNS } from "../../scammerHangup/decide";

test("[§104.9] 메신저 단계 — 폴백 경로(messengerStageAllowed)만 끝낼 수 있고, 너무 이른 종료 · 문자 대기 · 한도는 그대로 막는다", () => {
  const base = {
    status: "active" as const,
    channel: "messenger" as const,
    isMockTurn: false,
    verifyEnabled: false,
    transferPlaced: false,
    transferReachable: true,
    goalActionDone: false,
    userTurns: SCAMMER_HANGUP_MIN_USER_TURNS,
    pendingInstruction: false,
    smsAwaitingUser: false,
    limitReached: false,
    alreadyAccepted: false,
    relay: undefined,
  };
  assert.equal(decideScammerHangup(base).status, "wrong_channel", "실시간 콜러블(표시 없음) = 종전");
  assert.equal(decideScammerHangup({ ...base, messengerStageAllowed: true }).status, "accepted");
  assert.equal(decideScammerHangup({ ...base, messengerStageAllowed: true, userTurns: SCAMMER_HANGUP_MIN_USER_TURNS - 1 }).status, "too_early");
  assert.equal(decideScammerHangup({ ...base, messengerStageAllowed: true, smsAwaitingUser: true }).status, "blocked_pending");
  assert.equal(decideScammerHangup({ ...base, messengerStageAllowed: true, isMockTurn: true }).status, "mock_turn");
  const fallbackSrc = read("scammerHangup/fallback.ts");
  assert.ok(fallbackSrc.includes("messengerStageAllowed: true,"), "폴백이 메신저 단계 경로를 켠다");
  const commitSrc = read("scammerHangup/commit.ts");
  assert.equal(commitSrc.includes("messengerStageAllowed"), false, "실시간 콜러블은 켜지 않는다");
  const index = read("roleplay/index.ts");
  assert.ok(index.includes("finalize.stillActive &&\n      !finalize.hangupEnded &&\n      session.channel === \"messenger\" &&"), "끝낸 턴에는 통화로 옮기지 않는다");
});

// ══ §104 실측(16세션) 반영 ══════════════════════════════════════════════════════════════════════════════════════════
test("[§104 실측 ①] 인적사항 항목은 요구 형태가 있는 같은 문장에서만 센다 — 감사 인사 속 항목 낱말은 요구가 아니다", () => {
  // 실측 대출 중급 따름형: 앞 턴 생년월일 요구 → 이번 턴 "생년월일 확인 감사합니다. … 몇 건인지 확인 부탁드립니다"(다른 요구).
  assert.equal(
    decideRepeatBreak([
      "정확한 한도 조회를 위해 생년월일 여섯 자리도 말씀해 주시겠어요?",
      "네, 생년월일 확인 감사합니다. 혹시 현재 이용 중이신 기존 대출이 몇 건이나 되시는지 확인 부탁드립니다.",
    ]),
    null,
  );
  // 같은 문장에서 다시 요구하면 그대로 잡는다(F4 대본).
  assert.equal(decideRepeatBreak(["성함과 생년월일 불러주십시오.", "절차상 필요합니다. 성함과 생년월일 말씀해 주시겠습니까?"]), "identity");
});

test("[§104 실측 ②] 목표 끊기 신호 응답에 송금 밖 요청(화면 캡처 등)이 있어도 받아들이지 않는다 · '보내줘서 고마워'는 그대로", () => {
  assert.deepEqual(
    judgeEndCallSignal("goal", "아, 나머지는 이제 정리하면 될 것 같아. 혹시 지금 그 앱에서 결제 내역 화면 좀 캡처해서 보내줄 수 있어?"),
    { endCall: undefined, dropped: "demand_in_goal_turn" },
  );
  assert.deepEqual(judgeEndCallSignal("goal", "보내줘서 고마워 엄마, 이만 들어가 볼게"), { endCall: "goal" });
  assert.deepEqual(judgeEndCallSignal("goal", "이체 확인되었고, 대출 승인 절차 정상적으로 진행되었습니다."), { endCall: "goal" });
});
