// ⭐ 2026-10-17 라이브 오판정 회귀 고정 — "인증번호를 불러 준 세션이 '속지 않았습니다'로 나온다".
//
// 관측(voicefishing-ff47f, 기관 사칭 · 중급 · 음성 통화의 텍스트 폴백 경로): 참가자가 아래
// `OBSERVED_ANSWERS` 5개를 답했는데 리포트는 *"속지 않았습니다 · 요구에 응하지 않음 · 시도된 수법
// 0가지"* 였다. 원인은 두 가지였다(코드 근거 — `analyzeConversation.ts`):
//   ① `COMPLIANCE_PATTERN`이 어미 변형("어떻게 하면 **되죠**"), 숫자+어미("048231 **이요**"),
//      한글 숫자(STT "공사팔이삼일"), 정보 제공(생년월일·잔액)을 하나도 잡지 못했다.
//   ② 수법 추정(`findMatchedTactic`)이 인용구를 **이어 붙인 문자열의 앞 8자**가 사기범 발화에
//      그대로 들어 있어야만 인정해, 실 LLM 대사에서는 거의 항상 0가지가 됐다.
//
// 이 파일이 고정하는 것:
//   (1) 관측 답변 5개의 판정 — ③(인증번호 제공)·④(이체 방법 문의)는 **반드시** 속은 순간이다.
//   (2) STT·표기 변형 / 반례(오탐 금지) / 저항 우선 원칙 무변경.
//   (3) ⭐ 역방향 확인 — 수정 전 패턴 사본(`PRE_FIX_COMPLIANCE`)은 같은 입력을 **놓친다**(같은 실행에
//       나란히 보인다). 사본은 **이 테스트 안에서만** 쓰는 동결 픽스처다(제품 코드는 참조하지 않는다).
//   (4) AC-083 — 같은 세션의 문자 이벤트(인증번호 표시·링크 탭)가 있어도 판정은 대화 발화만으로
//       정해지고(§15.6 G22 무변경), 리포트 요약(`wasDeceived`)과 리플레이 주석의 전제(속은 순간 ↔
//       참가자 메시지 1:1)가 서로 어긋나지 않는다.
//   (5) 수법 추정 개선 — 인용구를 **문구 단위**로, 띄어쓰기·문장부호 차이를 무시하고 찾는다.
//   (6) 메신저 세션의 대처법·조언에 통화 전용 문구("전화를 끊고")가 나오지 않는다. 통화 문구는
//       수정 전과 한 글자도 다르지 않다.
//
// ⚠️ 아래 사기범 대사는 **합성 픽스처**다(라이브 전사를 복사하지 않았다). 실 LLM 대사가 이 표현을
// 그대로 쓴다는 보장은 없으며, 수법 추정은 여전히 "저작된 문구가 대사에 남아 있을 때"만 성립한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyzeConversation,
  buildPreventionAdvice,
  COMPLIANCE_PATTERN,
  pickCorrectAction,
  RESISTANCE_PATTERN,
  type AnalysisMessage,
} from "../analyzeConversation";
import { buildSmsTimeline, promoteSmsLandingSubmits, type SmsTimelineSource } from "../smsTimeline";
import {
  INSTITUTIONAL_IMPERSONATION_SCENARIO_ID,
  LOAN_SCAM_SCENARIO_ID,
  SCENARIO_PROMPTS,
} from "../../scenarios";
import { judgeByRule } from "../../rewind/judge";
import { NEUTRAL_SCAMMER_LINES } from "./neutralScammerLines";

const SESSION_START_MS = 1_000_000;
const INSTITUTIONAL = SCENARIO_PROMPTS[INSTITUTIONAL_IMPERSONATION_SCENARIO_ID].weakenedTactics;
const LOAN = SCENARIO_PROMPTS[LOAN_SCAM_SCENARIO_ID].weakenedTactics;

/**
 * ⛔ 수정 **전** `COMPLIANCE_PATTERN`의 동결 사본 — 역방향 확인(3) 전용. 제품 코드는 이 값을 쓰지 않는다.
 * 원본: `functions/src/report/analyzeConversation.ts`(2026-10-17 수정 직전, main `086287a`).
 */
const PRE_FIX_COMPLIANCE =
  /알겠어|알았어|보내줄게|보낼게|보내드릴게|보내드리겠|보내겠|계좌\s*(번호)?|얼마(면|야)?|송금|이체|카드\s*번호|비밀번호|어디로\s*(보내|가면)|지금\s*갈게|바로\s*갈게|믿을게|그래[,.]?\s*알았|어떻게\s*하면\s*돼|말씀하신\s*대로|시키는\s*대로|하라는\s*대로|알려주신\s*대로|\[주민번호\]|\[전화\]|\[이메일\]|\[계좌\]|진행\s*(해|할게|하겠|해주|시켜)|신청\s*(할게|하겠|해주|합니다|했)|설치\s*(할게|하겠|해주|했|합니다)|(대출|입금|출금|이체|송금|결제)\s*(받을게|받겠|받을래|할게|하겠|해주|했)|(그렇게|그럼|그러면)\s*\s*(할게|하겠|해주|해 주)|불러\s*드릴게|알려\s*드릴게|알려\s*줄게|말씀\s*드릴게|^\s*[\d\s-]{4,}\s*$/;

/** 저항 우선 판정(`resisted || !complied` → 속지 않음)을 한 줄로 — analyzeConversation과 같은 규칙. */
const deceivedBy = (compliance: RegExp) => (answer: string) =>
  !RESISTANCE_PATTERN.test(answer) && compliance.test(answer);
const isDeceivedNow = deceivedBy(COMPLIANCE_PATTERN);
const wasDeceivedBeforeFix = deceivedBy(PRE_FIX_COMPLIANCE);

/** 관측된 답변 5개(라이브 입력 그대로 — 마스킹 대상 숫자열이 없어 textMasked도 같다). */
const OBSERVED_ANSWERS = [
  "네? 홍길동이고 80년 1월 1일생인데요. 무슨 일이죠?",
  "혼자 있어요. 우리은행 통장 하나 쓰고 있어요. 어떻게 하면 되죠?",
  "048231 이요",
  "300만원 정도 있어요. 어떻게 옮기면 돼요?",
  "받아적기 어려워요. 문자로 보내주실 수 있나요?",
] as const;

/** 각 답변 **직전**의 사기범 대사(합성). [0]은 오프닝(폴백 경로에서는 실제로 표시·재생된다). */
const SCAMMER_LINES = [
  "안녕하십니까, 서울중앙지검 수사관입니다. 고객님 명의 통장이 금융사기에 연루돼 연락드렸습니다. 본인 확인을 위해 성함이랑 생년월일 불러주십시오.",
  "수사 기밀이라 가족이나 은행 직원 누구에게도 말씀하시면 안 됩니다. 지금 주변에 누가 계십니까? 사용하시는 통장은 어디 겁니까?",
  "방금 문자로 보내드린 인증번호 여섯 자리 불러주십시오. 지금 즉시 확인해야 합니다.",
  "잔액 얼마 있으신지 확인해서 전액 이체해 주십시오. 협조하지 않으면 불이익이 있을 수 있습니다.",
  "안전계좌 번호 불러드리겠습니다, 받아 적으십시오.",
  "네, 지금 문자로 보내드리겠습니다.",
] as const;

/** 폴백 텍스트 경로의 실제 모양 — sendMessage가 user=N, scammer=N+1로 기록한다(roleplay/index.ts). */
function observedSession(): AnalysisMessage[] {
  const messages: AnalysisMessage[] = [];
  SCAMMER_LINES.forEach((line, i) => {
    messages.push({
      role: "scammer",
      textMasked: line,
      turnIndex: i * 2,
      createdAtMs: SESSION_START_MS + i * 20_000,
    });
    const answer = OBSERVED_ANSWERS[i];
    if (answer !== undefined) {
      messages.push({
        role: "user",
        textMasked: answer,
        turnIndex: i * 2 + 1,
        createdAtMs: SESSION_START_MS + i * 20_000 + 10_000,
      });
    }
  });
  return messages;
}

// ── (1) 관측 답변 5개 ─────────────────────────────────────────────────────────────────────────

test("[2026-10-17 관측] 인증번호 제공(③)·이체 방법 문의(④)는 속은 순간이다 — 리포트가 '속지 않았습니다'로 나오지 않는다", (t) => {
  const messages = observedSession();
  const result = analyzeConversation(messages, SESSION_START_MS, INSTITUTIONAL);
  const momentTurns = result.deceivedMoments.map((m) => m.turnIndex);
  const turnOf = (answerIndex: number) => answerIndex * 2 + 1;

  t.diagnostic(`속은 순간 turnIndex=${JSON.stringify(momentTurns)} / tacticsUsed=${JSON.stringify(result.tacticsUsed)}`);

  assert.equal(result.wasDeceived, true, "관측 세션은 '속았습니다'여야 한다");
  assert.ok(momentTurns.includes(turnOf(2)), "③ 인증번호 '048231 이요'가 속은 순간이 아니다");
  assert.ok(momentTurns.includes(turnOf(3)), "④ '어떻게 옮기면 돼요'가 속은 순간이 아니다");
  // ①(생년월일 제공)·②(지시 방법 문의)도 정보 제공·순응 신호다. ⑤는 문맥 없이는 모호해 잡지 않는다.
  assert.deepEqual(momentTurns, [turnOf(0), turnOf(1), turnOf(2), turnOf(3)]);
  assert.notEqual(result.tacticsUsed.length, 0, "시도된 수법이 0가지로 나오지 않는다");
});

test("[2026-10-17 관측 · 역방향 확인] 수정 전 패턴은 같은 답변 5개를 전부 '속지 않음'으로 판정했다(재현) — 수정 후와 나란히", (t) => {
  const rows = OBSERVED_ANSWERS.map((answer, i) => ({
    answer: `${i + 1}`,
    before: wasDeceivedBeforeFix(answer),
    after: isDeceivedNow(answer),
  }));
  for (const row of rows) t.diagnostic(`답변 ${row.answer}: 수정 전=${row.before} → 수정 후=${row.after}`);

  assert.deepEqual(
    rows.map((r) => r.before),
    [false, false, false, false, false],
    "재현 전제 — 수정 전 패턴은 다섯 답변 모두 놓쳤다(라이브 증상과 일치)",
  );
  assert.deepEqual(rows.map((r) => r.after), [true, true, true, true, false]);
});

// ── (2) 변형 · 반례 · 저항 우선 ───────────────────────────────────────────────────────────────

const COMPLIANCE_VARIANTS: ReadonlyArray<[label: string, answer: string]> = [
  ["숫자+이요(붙임)", "048231이요"],
  ["숫자+입니다", "048231 입니다"],
  ["숫자+요", "048231요"],
  ["문장 속 코드", "인증번호는 048231이에요"],
  ["네+숫자", "네 048231"],
  ["띄어 읽기", "048 231 이요"],
  ["숫자+맞아요", "048231 맞아요"],
  ["STT 한글 숫자", "네 공사팔이삼일이요"],
  ["STT 한글 숫자(띄움)", "공사팔 이삼일"],
  ["STT 한글 숫자(띄움+이요)", "공사팔 이삼일이요"],
  ["STT 한글 숫자(영)", "영사팔이삼일이요"],
  ["STT 한글 숫자(한 음절씩)", "공 사 팔 이 삼 일"],
  ["되나요", "어떻게 하면 되나요"],
  ["될까요", "어떻게 하면 될까요"],
  ["해야 돼요", "어떻게 해야 돼요?"],
  ["해야 하나요", "어떻게 해야 하나요?"],
  ["뭘 하면", "뭘 하면 되나요?"],
  ["링크 누르면", "링크 누르면 되나요?"],
  ["넣으면", "얼른 넣으면 되나요?"],
  ["잔액 고지(한글 금액)", "통장에 오백만 원 정도 있어요"],
  ["잔액 고지(습니다)", "300만원 정도 있습니다"],
  ["년생", "80년생이에요"],
  ["N일생+입니다", "1980년 1월 1일생입니다"],
  ["생년월일은+숫자", "생년월일은 800101이요"],
];

test("STT·표기 변형도 순응으로 판정한다(어미 변형 · 숫자+어미 · 한글 숫자 · 생년월일 · 잔액)", (t) => {
  const missed = COMPLIANCE_VARIANTS.filter(([, answer]) => !isDeceivedNow(answer));
  t.diagnostic(
    `수정 전 검출 ${COMPLIANCE_VARIANTS.filter(([, a]) => wasDeceivedBeforeFix(a)).length}/${COMPLIANCE_VARIANTS.length}` +
      ` → 수정 후 ${COMPLIANCE_VARIANTS.length - missed.length}/${COMPLIANCE_VARIANTS.length}`,
  );
  assert.deepEqual(missed, [], `순응으로 잡히지 않은 변형: ${JSON.stringify(missed)}`);
});

const NON_COMPLIANCE: ReadonlyArray<[label: string, answer: string]> = [
  ["반어 거절", "그걸 제가 어떻게 해요?"],
  ["확인 방법 질문", "어떻게 확인하면 돼요?"],
  ["어떻게 알고", "어떻게 알고 전화하셨어요?"],
  ["해야 할지", "어떻게 해야 할지 모르겠네요"],
  ["하면 될지(내포절)", "어떻게 하면 될지 모르겠어요"],
  ["하면 되는지(내포절)", "어떻게 하면 되는지 모르겠어요"],
  ["보내면 될지(내포절)", "보내면 될지 모르겠어요"],
  ["부정 조건", "안 보내면 돼요?"],
  ["잔액 부정", "300만원밖에 없어요"],
  ["잔액 양보절", "300만원 있어도 안 보내요"],
  ["잔액 부정(남아 있지 않아요)", "300만원 남아 있지 않아요"],
  ["돈 없음", "통장에 돈 없어요"],
  ["대표번호", "1332로 전화해 볼게요"],
  ["연도", "2026년에 바꿨어요"],
  ["호수", "1004호에 살아요"],
  ["시각", "4시 30분에 은행 가요"],
  ["날짜(생 없음)", "2026년 10월 1일에 통장 만들었어요"],
  ["한글 숫자 단어(사이사이)", "사이사이에 연락할게요"],
  ["한글 숫자 단어(이삼일)", "이삼일 걸려요"],
  ["한글 숫자 단어(구사일생)", "구사일생이네요"],
  ["한글 숫자 단어 이어짐", "공사 일이 이삼일 걸려요"],
  // reviewer M1 — `…년 생`의 뒤 경계, 생년월일인지 알 수 없는 날짜.
  ["N년 생활", "저 20년 생활했어요"],
  ["N년 생각", "15년 생각해봤어요"],
  ["N년 생계", "30년 생계 걱정만 했어요"],
  ["연도 붙은 날짜만", "2024년 3월 5일이요"],
  // reviewer M2 — 같은 답변 안의 거절·의심·되묻기(저항 패턴 밖의 어휘).
  ["잔액+못 드려요", "300만원 정도 있어요. 근데 못 드려요"],
  ["잔액+안 드릴 거예요", "300만원 있어요 안 드릴 거예요"],
  ["잔액+이상한데요", "300만원 있는데 왜 물어보세요? 이상한데요"],
  ["년생+왜 물어", "저 80년생인데 왜 생년월일을 물어보세요"],
  ["N일생+왜 알려", "전 80년 1월 1일생인데 그걸 왜 알려드려요"],
  ["방법 문의+사기", "어떻게 하면 되죠? 이거 사기 같은데요"],
  ["코드 되묻기+왜 불러", "048231 이요? 그걸 왜 불러줘야 하는데요"],
  // QA 문제 2 — 같은 답변 안의 거절·의심·확인 의사.
  ["잔액+안 보낼 거예요", "300만원 정도 있어요. 근데 안 보낼 거예요"],
  ["잔액+못 보내요", "300만원 정도 있어요. 못 보내요"],
  ["방법 문의+수상", "어떻게 옮기면 돼요? 근데 수상한데요"],
  ["방법 문의+믿기지", "어떻게 옮기면 돼요? 믿기지 않아요"],
  ["방법 문의+보이스피싱", "어떻게 하면 되나요? 근데 보이스피싱 같은데"],
  ["코드+수상", "048231 이요 근데 이거 맞나요 수상한데"],
  ["행동+가족에게 물어볼게", "보내면 되나요? 일단 가족에게 물어볼게요"],
  ["행동+은행에 물어볼게", "보내면 되나요? 은행에 가서 직접 물어볼게요"],
  ["T136 중립 답변", "무슨 말씀이신지 잘 모르겠는데요."],
  ["관측 ⑤(모호 — 잡지 않는다)", OBSERVED_ANSWERS[4]],
];

test("반례 — 순응 신호가 아닌 답변은 새 규칙이 잡지 않는다(오탐 금지)", () => {
  const falsePositives = NON_COMPLIANCE.filter(([, answer]) => isDeceivedNow(answer));
  assert.deepEqual(falsePositives, [], `오탐: ${JSON.stringify(falsePositives)}`);
});

test("저항 우선 원칙은 그대로다 — 새 순응 신호가 함께 있어도 저항 신호가 이긴다", () => {
  for (const answer of [
    "048231 이요 근데 경찰에 신고할게요",
    "어떻게 하면 되죠? 일단 끊고 은행에 직접 전화해 볼게요",
    "300만원 정도 있는데 의심스러워서 확인하고 다시 전화드릴게요",
  ]) {
    assert.ok(COMPLIANCE_PATTERN.test(answer), `전제 — 순응 신호도 있어야 의미가 있다: ${answer}`);
    assert.equal(isDeceivedNow(answer), false, `저항이 이겨야 한다: ${answer}`);
  }
});

test("되감기 규칙 판정도 같은 답변을 같게 판정한다(패턴 공유 · §15.6 G7)", () => {
  for (const answer of OBSERVED_ANSWERS.slice(0, 4)) {
    assert.equal(judgeByRule(answer).verdict, "risky", `되감기가 순응을 놓쳤다: ${answer}`);
  }
  assert.equal(judgeByRule(OBSERVED_ANSWERS[4]).verdict, "unclear");
  assert.equal(judgeByRule("1332로 전화해 볼게요").verdict, "unclear", "대표번호 확인 의사는 위험으로 몰지 않는다");
  assert.equal(judgeByRule("048231 이요 근데 경찰에 신고할게요").verdict, "good");
});

// ── (4) AC-083 — 같은 세션의 서술들이 서로 어긋나지 않는다 ─────────────────────────────────────

/** 관측 세션에서 실제로 있었던 문자 이벤트: 인증번호 문자 열람 + 링크 문자 탭(제출은 없음). */
const OBSERVED_SMS: SmsTimelineSource[] = [
  {
    smsId: "institutional-otp",
    kind: "otp",
    senderLabel: "모의 인증센터",
    body: "[모의] 인증번호 048231",
    anchorScammerTurn: 3,
    arrivedAtMs: SESSION_START_MS + 41_000,
    openedAtMs: SESSION_START_MS + 42_000,
  },
  {
    smsId: "institutional-link",
    kind: "link",
    senderLabel: "모의 안전계좌 안내",
    body: "[모의] 안전계좌 안내",
    linkDisplayText: "안전계좌 안내",
    anchorScammerTurn: 6,
    arrivedAtMs: SESSION_START_MS + 101_000,
    openedAtMs: SESSION_START_MS + 102_000,
    linkTappedAtMs: SESSION_START_MS + 103_000,
  },
];

test("[AC-083 · G22] 문자 이벤트는 판정을 바꾸지 않고, 요약(wasDeceived)과 리플레이 주석의 전제가 일치한다", (t) => {
  const messages = observedSession();
  const analysis = analyzeConversation(messages, SESSION_START_MS, INSTITUTIONAL);
  const analysisAgain = analyzeConversation(messages, SESSION_START_MS, INSTITUTIONAL);
  const smsTimeline = buildSmsTimeline(OBSERVED_SMS, messages, SESSION_START_MS);
  const promoted = promoteSmsLandingSubmits(
    OBSERVED_SMS,
    analysis.deceivedMoments,
    messages,
    SESSION_START_MS,
  );

  t.diagnostic(`문자 이벤트=${JSON.stringify(smsTimeline.map((s) => s.events.map((e) => e.event)))}`);

  // G22 — 문자 스냅샷은 판정 입력이 아니다(같은 대화 → 같은 산출). 링크 탭은 승격되지 않는다.
  assert.equal(smsTimeline.length, 2, "전제 — 문자가 실제로 스냅샷된 상태에서 비교한다");
  assert.deepEqual(analysisAgain, analysis);
  assert.equal(promoted.promotedCount, 0, "링크 탭·인증번호 표시는 속은 순간으로 승격되지 않는다(AC-080 (b))");

  // 요약 = 속았습니다. 리플레이는 deceivedMoments를 같은 turnIndex의 메시지에 주석으로 단다
  // (src/lib/replay/buildReplayTimeline.ts) — "뚜렷한 위험 신호가 없었습니다"는 주석이 0개일 때만 뜬다.
  // ⇒ 속은 순간마다 **정확히 하나의 참가자 메시지**가 있어야 두 서술이 같은 사실을 말한다.
  assert.equal(analysis.wasDeceived, true);
  const userTurns = new Set(messages.filter((m) => m.role === "user").map((m) => m.turnIndex));
  const momentTurns = analysis.deceivedMoments.map((m) => m.turnIndex);
  assert.equal(new Set(momentTurns).size, momentTurns.length, "같은 turnIndex에 속은 순간이 두 번 달렸다");
  for (const turn of momentTurns) {
    assert.ok(userTurns.has(turn), `속은 순간 turnIndex ${turn}에 참가자 메시지가 없다 — 리플레이 주석과 어긋난다`);
  }

  // AC-083 (a) — 이름으로 부른 수법은 같은 리포트의 수법 목록에 있다(폴백 라벨은 이름이 아니다).
  for (const moment of analysis.deceivedMoments) {
    assert.ok(
      moment.tactic === "약화된 사기 수법" || analysis.tacticsUsed.includes(moment.tactic),
      `속은 순간이 "${moment.tactic}"를 부르는데 수법 목록에 없다`,
    );
  }

  // 조언의 마무리 문장도 같은 판정을 말한다("응하지 않았습니다"가 섞이지 않는다).
  const advice = buildPreventionAdvice(analysis.tacticsUsed, analysis.wasDeceived).join(" ");
  assert.ok(!advice.includes("응하지 않았습니다"), "속은 세션의 조언이 '응하지 않았습니다'라고 말한다");
});

// ── (5) 수법 추정 ────────────────────────────────────────────────────────────────────────────

test("[수법 추정] 인용구를 문구 단위로 찾는다 — 띄어쓰기·어미가 달라도 저작된 문구가 남아 있으면 잡는다", (t) => {
  const cases: ReadonlyArray<[line: string, expected: string]> = [
    ["안녕하십니까, 서울중앙지검 수사관 김민수입니다.", "권위 암시"],
    ["지금 즉시 협조해 주셔야 합니다.", "긴급성 조성"],
    ["협조하지 않으시면 불이익이 있을 수 있습니다.", "불이익 암시"],
    ["주민번호 뒤 7자리 불러주세요.", "신원정보 직접 요구"],
    ["직접 방문하셔도 처리가 안 됩니다, 유선으로만 가능합니다.", "확인 절차 차단"],
  ];
  for (const [line, expected] of cases) {
    const result = analyzeConversation(
      [{ role: "scammer", textMasked: line, turnIndex: 0, createdAtMs: SESSION_START_MS }],
      SESSION_START_MS,
      INSTITUTIONAL,
    );
    t.diagnostic(`${JSON.stringify(result.tacticsUsed)} ← ${line}`);
    assert.ok(result.tacticsUsed.includes(expected), `"${expected}"를 찾지 못했다: ${line}`);
  }
});

test("[수법 추정] 한 대사에 수법이 여럿이면 모두 '시도된 수법'에 오른다", () => {
  const result = analyzeConversation(
    [{ role: "scammer", textMasked: SCAMMER_LINES[3], turnIndex: 0, createdAtMs: SESSION_START_MS }],
    SESSION_START_MS,
    INSTITUTIONAL,
  );
  assert.deepEqual(result.tacticsUsed, ["불이익 암시", "안전계좌 이체 요구"]);
});

test("[수법 추정] 저작 문구가 없는 일반 대사는 어떤 수법으로도 잡지 않는다(발명하지 않음)", () => {
  // PR-A3 리뷰 Major 2 — 표본은 공용 모듈로 옮겼다(문구 그대로 · demandFallbackLabel.test.ts가 같은 표본을 쓴다).
  const neutral = NEUTRAL_SCAMMER_LINES;
  for (const scenarioId of Object.keys(SCENARIO_PROMPTS)) {
    const tactics = SCENARIO_PROMPTS[scenarioId].weakenedTactics;
    for (const line of neutral) {
      const result = analyzeConversation(
        [{ role: "scammer", textMasked: line, turnIndex: 0, createdAtMs: SESSION_START_MS }],
        SESSION_START_MS,
        tactics,
      );
      assert.deepEqual(result.tacticsUsed, [], `${scenarioId}: 중립 대사가 수법으로 잡혔다 — ${line}`);
    }
  }
});

test("[수법 추정] 같은 시나리오의 두 수법이 같은 말로 시작하면, 갈라지는 지점까지 봐서 한쪽만 고른다", () => {
  const judgeLine = (line: string) =>
    analyzeConversation(
      [{ role: "scammer", textMasked: line, turnIndex: 0, createdAtMs: SESSION_START_MS }],
      SESSION_START_MS,
      LOAN,
    ).tacticsUsed;

  // 두 인용구가 모두 "지금 끊으시면"으로 시작한다(loanScam.prompt.ts — 마감 압박 · 전화 끊음 저지).
  assert.deepEqual(judgeLine("지금 끊으시면 대상에서 빠지세요."), ["마감 압박"]);
  assert.deepEqual(judgeLine("지금 끊으시면 오늘 조건으로는 다시 못 받으세요."), ["전화 끊음 저지"]);
});

// ── (6) 채널에 맞는 대처법 ────────────────────────────────────────────────────────────────────

/** 수정 전 통화용 문구(동결 사본) — 통화 세션의 문구가 한 글자도 바뀌지 않았음을 고정한다. */
const PRE_FIX_VOICE_ACTIONS: ReadonlyArray<[tactic: string, action: string]> = [
  ["확인 절차 차단", "상대가 확인 전화를 막으려 해도 반드시 알고 있는 번호로 직접 전화해 사실을 확인하세요."],
  ["송금 직접 요구", "계좌번호나 송금을 요구받으면 절대 응하지 말고, 전화를 끊은 뒤 112(경찰)나 가족에게 직접 확인하세요."],
  ["다급함 조성", "아무리 다급해 보여도 그 자리에서 결정하지 말고, 일단 전화를 끊고 잠시 시간을 두어 사실관계를 확인하세요."],
  ["가족애·죄책감 이용", "감정이 흔들리더라도 실제 그 사람이 맞는지부터 다른 방법(직접 전화·영상통화)으로 확인하세요."],
  ["권위 암시", "전화로 신원(경찰·기관 등)을 주장해도 그 자리에서 믿지 말고, 공식 대표번호로 직접 걸어 확인하세요."],
  ["약화된 사기 수법", "전화를 끊고 알고 있는 번호로 직접 다시 연락해 사실을 확인하세요."],
];

test("[채널] 통화 세션의 대처법·조언 문구는 수정 전과 한 글자도 다르지 않다", () => {
  for (const [tactic, action] of PRE_FIX_VOICE_ACTIONS) {
    assert.equal(pickCorrectAction(tactic), action);
    assert.equal(pickCorrectAction(tactic, "voice"), action);
  }
  assert.equal(
    buildPreventionAdvice([], false).at(-1),
    "이번엔 상대의 요구에 응하지 않았습니다. 다만 사기 수법은 계속 진화하므로, 오늘처럼 전화를 끊고 직접 확인하는 습관을 계속 유지하는 것이 중요합니다.",
  );
});

test("[채널] 메신저 세션의 대처법·조언에는 통화 전용 문구('전화를 끊', '전화로 신원')가 나오지 않는다", () => {
  const PHONE_ONLY = /전화를\s*끊|전화로\s*신원/;
  for (const [tactic] of PRE_FIX_VOICE_ACTIONS) {
    const action = pickCorrectAction(tactic, "messenger");
    assert.ok(action.length > 0);
    assert.ok(!PHONE_ONLY.test(action), `메신저 대처법에 통화 문구: ${action}`);
  }
  const tactics = PRE_FIX_VOICE_ACTIONS.map(([tactic]) => tactic);
  for (const wasDeceived of [true, false]) {
    for (const line of buildPreventionAdvice(tactics, wasDeceived, "messenger")) {
      assert.ok(!PHONE_ONLY.test(line), `메신저 조언에 통화 문구: ${line}`);
    }
  }
});

test("[채널] 속은 순간의 대처법은 그 답변이 오간 채널을 따른다(메신저→통화 전이 세션)", () => {
  const result = analyzeConversation(
    [
      { role: "scammer", textMasked: "엄마 지금 당장 도와줘", turnIndex: 0, createdAtMs: SESSION_START_MS, channel: "messenger" },
      { role: "user", textMasked: "어떻게 하면 되니?", turnIndex: 1, createdAtMs: SESSION_START_MS + 5_000, channel: "messenger" },
      { role: "scammer", textMasked: "지금 당장 보내줘", turnIndex: 2, createdAtMs: SESSION_START_MS + 9_000, channel: "voice" },
      { role: "user", textMasked: "어떻게 하면 되니?", turnIndex: 3, createdAtMs: SESSION_START_MS + 12_000, channel: "voice" },
    ],
    SESSION_START_MS,
    ["다급함 조성 — '지금 당장'"],
  );

  assert.equal(result.deceivedMoments.length, 2);
  assert.equal(result.deceivedMoments[0].correctAction, pickCorrectAction("다급함 조성", "messenger"));
  assert.equal(result.deceivedMoments[1].correctAction, pickCorrectAction("다급함 조성", "voice"));
  assert.notEqual(result.deceivedMoments[0].correctAction, result.deceivedMoments[1].correctAction);
});

// ── 배선 소스 게이트(관측 불가 지점 고정) ─────────────────────────────────────────────────────
// `generateReportCore`는 Firestore에 의존해 이 저장소에 단위 테스트가 없다(promotedTactics.test.ts와
// 같은 사정). 채널 배선 두 줄을 소스로 고정한다 — 지우면 메신저 세션에 다시 "전화를 끊고"가 나간다.

const REPORT_CORE = "src/report/generateReportCore.ts";

/** 주석은 걷어 낸다 — 검사 문자열이 자기 설명 주석에 걸리는 함정을 피한다(promotedTactics.test.ts와 같다). */
function codeOnly(path: string): string {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

test("[배선] generateReportCore가 메시지 채널을 분석 입력에 싣고, 조언 채널을 세션 채널에서 고른다", () => {
  const code = codeOnly(REPORT_CORE);
  assert.ok(
    /\.\.\.\(data\.channel \? \{ channel: data\.channel \} : \{\}\)/.test(code),
    `${REPORT_CORE}: 메시지 채널이 analyzeConversation 입력에 실리지 않으면 속은 순간의 대처법이 항상 통화 문구다.`,
  );
  assert.ok(
    /session\.channel === "messenger" \? "messenger" : "voice"/.test(code),
    `${REPORT_CORE}: 메신저에만 머문 세션만 메신저 문구를 써야 한다(전이 세션은 session.channel이 "voice").`,
  );
  assert.ok(
    /buildPreventionAdvice\(\s*analysis\.tacticsUsed,\s*wasDeceived,\s*adviceChannel\s*\)/.test(code),
    `${REPORT_CORE}: 예방 조언에 채널이 전달되지 않는다.`,
  );
});
