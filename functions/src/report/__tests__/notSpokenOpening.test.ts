// §55 D3 — "말하지 않은 첫 대사"(`MessageDoc.notSpoken`)의 **서버 소비처** 회귀 고정
// (docs/Architecture.md §55.4 (1) 6·7·8ⓒ·9ⓓⓔ).
//
// 이 파일이 고정하는 것:
//   ⓒ **차단** — `analyzeConversation`이 유령 사기범 행으로 없는 "속은 순간"·없는 "시도된 수법"을
//     만들지 않는다(§55.2 (3) — `tacticsUsed` 오염 + 참가자 발화와의 짝짓기 오염).
//   ⓓ ⭐ **역검증 · 앵커 불변(G350 트립와이어)** — `notSpoken` 문서가 섞여 있어도 문자·확인·모의화면
//     앵커가 **한 칸도 밀리지 않는다.** ⛔ 이 단언이 없으면 누군가 앵커 리졸버에 같은 필터를 넣어도
//     아무도 모른다 — 그 순간 리플레이의 문자·오퍼·전환 카드가 전부 한 턴씩 밀린다(G348).
//   ⓔ ⭐ **역검증 · 회귀 0** — 필드가 **없는** 입력에서 산출물이 도입 전과 완전히 동일하다.
//   ⓕ ⭐ **역검증 · 폴백 보존** — 플래그가 서지 않은 세션(폴백·ElevenLabs)에서는 첫 행이 그대로 남는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import { resolveAnchor, type SmsTimelineMessage } from "../smsTimeline";
import { resolveReconnectAnchor } from "../verifyTimeline";
import { resolveMockScreenAnchor, type MockScreenMessage } from "../mockScreenTimeline";
import { pickScammerLineForMoment, type ScammerLineMessage } from "../../rewind/scammerLine";

const SESSION_START_MS = 1_000_000;
const WEAKENED_TACTICS = [
  "다급함 조성 — 지금 당장 도와줘야 해, 더 늦으면 큰일나",
  "송금 요구 얼버무리기 — 지금은 정신없어서 계좌번호는 문자로 다시 보낼게",
];

/** `createSession`이 모든 세션에 쓰는 오프닝 문장(실시간 경로에서는 낭독되지 않는다). */
const OPENING_TEXT = "여보세요...? 나야... 지금은 정신없어서 계좌번호는 문자로 다시 보낼게.";

/**
 * 실시간(Gemini) 세션의 실제 모양 — `turnIndex:0`은 **낭독되지 않은 오프닝**이고, 그 뒤가 전사다.
 * 참가자가 모델보다 먼저 말한 경우(§55.2 (3) 셋째 행)를 그대로 재현한다: 유령 행 바로 뒤가
 * **참가자의 순응 답변**이라 필터가 없으면 짝이 성립해 "속은 순간"이 만들어진다.
 */
const REALTIME_MESSAGES: AnalysisMessage[] = [
  { role: "scammer", textMasked: OPENING_TEXT, turnIndex: 0, createdAtMs: SESSION_START_MS, notSpoken: true },
  { role: "user", textMasked: "네 알겠습니다, 그렇게 할게요.", turnIndex: 1, createdAtMs: SESSION_START_MS + 5_000 },
  { role: "scammer", textMasked: "네 고객님, 확인 도와드리겠습니다.", turnIndex: 2, createdAtMs: SESSION_START_MS + 9_000 },
];

test("§55 D3 ⓒ: 낭독되지 않은 오프닝은 '속은 순간'도 '시도된 수법'도 만들지 않는다", () => {
  const result = analyzeConversation(REALTIME_MESSAGES, SESSION_START_MS, WEAKENED_TACTICS);

  assert.deepEqual(result.deceivedMoments, [], "말한 적 없는 대사에 대한 '속은 순간'이 만들어졌다");
  assert.equal(result.wasDeceived, false);
  assert.deepEqual(result.tacticsUsed, [], "낭독되지 않은 수법이 '시도된 수법'에 올랐다");
});

test("⭐ 역검증 ⓕ: 같은 대화에서 마크가 없으면(폴백·ElevenLabs) 종전대로 판정된다", () => {
  // ⛔ 이 단언이 후보 C2(리플레이에서 turnIndex:0을 **무조건** 숨기기)를 막는 자리다 — 폴백
  // 경로에서는 그 대사가 실제로 재생·표시되므로 판정에서도 살아 있어야 한다.
  const spoken = REALTIME_MESSAGES.map(({ notSpoken: _notSpoken, ...rest }) => rest);
  const result = analyzeConversation(spoken, SESSION_START_MS, WEAKENED_TACTICS);

  assert.equal(result.wasDeceived, true);
  assert.equal(result.deceivedMoments.length, 1);
  assert.equal(result.deceivedMoments[0].turnIndex, 1);
  assert.ok(result.tacticsUsed.length > 0);
});

test("⭐ 역검증 ⓔ: 필드가 아예 없는 입력의 산출물은 도입 전과 완전히 동일하다(회귀 0)", () => {
  const legacy: AnalysisMessage[] = [
    { role: "scammer", textMasked: OPENING_TEXT, turnIndex: 0, createdAtMs: SESSION_START_MS },
    { role: "user", textMasked: "알겠어, 계좌번호 뭐야?", turnIndex: 1, createdAtMs: SESSION_START_MS + 15_000 },
  ];
  const result = analyzeConversation(legacy, SESSION_START_MS, WEAKENED_TACTICS);

  assert.equal(result.wasDeceived, true);
  assert.equal(result.deceivedMoments.length, 1);
  assert.equal(result.deceivedMoments[0].timeLabel, "15초 시점");
});

// --- ⓓ 앵커 불변(G350 트립와이어) ---------------------------------------------------------------

/** 타입에 없는 필드를 **런타임에만** 실어 준다 — 앵커 리졸버가 그 값을 보는지 확인하기 위한 것이다. */
function markNotSpoken<T extends object>(message: T): T {
  return { ...message, notSpoken: true };
}

const SMS_BASE: SmsTimelineMessage[] = [
  { role: "scammer", turnIndex: 0, createdAtMs: SESSION_START_MS + 1_000 }, // 오프닝(사기범 #1)
  { role: "user", turnIndex: 1, createdAtMs: SESSION_START_MS + 2_000 },
  { role: "scammer", turnIndex: 2, createdAtMs: SESSION_START_MS + 3_000 }, // 사기범 #2
  { role: "user", turnIndex: 3, createdAtMs: SESSION_START_MS + 4_000 },
  { role: "scammer", turnIndex: 4, createdAtMs: SESSION_START_MS + 5_000 }, // 사기범 #3
];
const SMS_MARKED: SmsTimelineMessage[] = [markNotSpoken(SMS_BASE[0]), ...SMS_BASE.slice(1)];

test("⭐⭐ 역검증 ⓓ(G350): notSpoken이 섞여도 문자 앵커가 한 칸도 밀리지 않는다", () => {
  for (const anchorScammerTurn of [1, 2, 3]) {
    const before = resolveAnchor(anchorScammerTurn, SMS_BASE, SESSION_START_MS);
    const after = resolveAnchor(anchorScammerTurn, SMS_MARKED, SESSION_START_MS);
    assert.deepEqual(after, before, `문자 앵커가 밀렸다(anchorScammerTurn=${anchorScammerTurn})`);
  }
  // ⭐ 값 자체도 못 박는다 — 오프닝이 **여전히 사기범 #1**이다(실시간 앵커 `+1`의 근거, G348).
  assert.equal(resolveAnchor(1, SMS_MARKED, SESSION_START_MS).anchorTurnIndex, 0);
  assert.equal(resolveAnchor(2, SMS_MARKED, SESSION_START_MS).anchorTurnIndex, 2);
});

test("⭐⭐ 역검증 ⓓ(G350): notSpoken이 섞여도 확인(전환) 앵커가 한 칸도 밀리지 않는다", () => {
  for (const reconnectAnchorScammerTurn of [0, 1, 2]) {
    const before = resolveReconnectAnchor(reconnectAnchorScammerTurn, SMS_BASE, SESSION_START_MS);
    const after = resolveReconnectAnchor(reconnectAnchorScammerTurn, SMS_MARKED, SESSION_START_MS);
    assert.deepEqual(after, before, `전환 앵커가 밀렸다(N=${reconnectAnchorScammerTurn})`);
  }
  // 0-기반 "사기범 문서 수" N=1 ⇒ 다음 사기범 대사(turnIndex 2). 오프닝이 세어져 있어야 성립한다.
  assert.equal(resolveReconnectAnchor(1, SMS_MARKED, SESSION_START_MS).anchorTurnIndex, 2);
});

test("⭐⭐ 역검증 ⓓ(G350): notSpoken이 섞여도 모의화면 앵커가 한 칸도 밀리지 않는다", () => {
  const base: MockScreenMessage[] = [
    { role: "scammer", turnIndex: 0, createdAtMs: SESSION_START_MS + 1_000, landingIds: ["landing-a"] },
    { role: "user", turnIndex: 1, createdAtMs: SESSION_START_MS + 2_000 },
    { role: "scammer", turnIndex: 2, createdAtMs: SESSION_START_MS + 3_000, landingIds: ["landing-b"] },
  ];
  const marked: MockScreenMessage[] = [markNotSpoken(base[0]), ...base.slice(1)];

  for (const landingId of ["landing-a", "landing-b", "landing-none"]) {
    assert.deepEqual(
      resolveMockScreenAnchor(landingId, marked, SESSION_START_MS),
      resolveMockScreenAnchor(landingId, base, SESSION_START_MS),
      `모의화면 앵커가 밀렸다(landingId=${landingId})`,
    );
  }
});

// --- 소비 ③(서버 되감기) -----------------------------------------------------------------------

test("§55 D3: 되감기가 낭독되지 않은 대사를 '그 순간 사기범이 한 말'로 집지 않는다", () => {
  const messages: ScammerLineMessage[] = [
    { role: "scammer", textMasked: OPENING_TEXT, turnIndex: 0, notSpoken: true },
    { role: "user", textMasked: "네 알겠습니다.", turnIndex: 1 },
  ];
  assert.equal(pickScammerLineForMoment(messages, 1), "");

  // ⭐ 역검증 — 같은 대화에서 마크가 없으면 종전대로 그 대사를 집는다(회귀 0).
  const spoken: ScammerLineMessage[] = messages.map(({ notSpoken: _notSpoken, ...rest }) => rest);
  assert.equal(pickScammerLineForMoment(spoken, 1), OPENING_TEXT);
});

test("§55 D3: 마크된 행 뒤에 실제 사기범 대사가 있으면 그것을 집는다(앞으로 건너뛰지 않는다)", () => {
  const messages: ScammerLineMessage[] = [
    { role: "scammer", textMasked: OPENING_TEXT, turnIndex: 0, notSpoken: true },
    { role: "scammer", textMasked: "고객님 계좌가 지금 위험합니다.", turnIndex: 1 },
    { role: "user", textMasked: "네 그렇게 할게요.", turnIndex: 2 },
  ];
  assert.equal(pickScammerLineForMoment(messages, 2), "고객님 계좌가 지금 위험합니다.");
});
