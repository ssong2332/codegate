import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, buildPreventionAdvice, pickCorrectAction } from "../analyzeConversation";

// flavor(라벨 뒤 "—" 이후 설명부)는 MockLlmClient(craftOpeningLine/craftEscalationLine,
// functions/src/llm/mockClient.ts)가 실제로 대사에 그대로 삽입하는 문구다 — 아래 테스트의
// 사기범 발화는 그 실제 산출 패턴(필러 + flavor)을 그대로 재현해, findMatchedTactic()의 부분
// 일치 매칭이 실제 Mock 산출물에서도 성립함을 검증한다.
const WEAKENED_TACTICS = [
  "다급함 조성 — 지금 당장 도와줘야 해, 더 늦으면 큰일나",
  "확인 전화 차단 유도 — 아빠한테는 비밀로 해줘",
  "송금 요구 얼버무리기 — 지금은 정신없어서 계좌번호는 문자로 다시 보낼게",
];

const SESSION_START_MS = 1_000_000;

test("analyzeConversation(): 사용자가 저항 없이 순응하면 deceivedMoments에 기록되고 wasDeceived=true(AC-008)", () => {
  const messages = [
    {
      role: "scammer" as const,
      textMasked: "여보세요...? 나야... 지금은 정신없어서 계좌번호는 문자로 다시 보낼게.",
      turnIndex: 0,
      createdAtMs: SESSION_START_MS,
    },
    {
      role: "user" as const,
      textMasked: "알겠어, 계좌번호 뭐야?",
      turnIndex: 1,
      createdAtMs: SESSION_START_MS + 15_000,
    },
  ];

  const result = analyzeConversation(messages, SESSION_START_MS, WEAKENED_TACTICS);

  assert.equal(result.wasDeceived, true);
  assert.equal(result.deceivedMoments.length, 1);
  assert.equal(result.deceivedMoments[0].turnIndex, 1);
  // AC-026: "15초 시점에 속았습니다"류 — 실제 경과시간(초) 기반 timeLabel.
  assert.equal(result.deceivedMoments[0].timeLabel, "15초 시점");
  assert.ok(result.deceivedMoments[0].tactic.length > 0);
  assert.ok(result.deceivedMoments[0].correctAction.length > 0);
  assert.ok(result.tacticsUsed.length > 0);
});

test("analyzeConversation(): 사용자가 직접 확인·의심 등 저항 신호를 보이면 그 턴은 속은 순간으로 기록하지 않는다", () => {
  const messages = [
    {
      role: "scammer" as const,
      textMasked: "엄마야... 나야... 지금 당장 도와줘야 해, 더 늦으면 큰일나.",
      turnIndex: 0,
      createdAtMs: SESSION_START_MS,
    },
    {
      role: "user" as const,
      textMasked: "진짜야? 내가 직접 전화해서 확인해 볼게.",
      turnIndex: 1,
      createdAtMs: SESSION_START_MS + 5_000,
    },
  ];

  const result = analyzeConversation(messages, SESSION_START_MS, WEAKENED_TACTICS);

  assert.equal(result.deceivedMoments.length, 0);
});

test("analyzeConversation(): 한 번도 속지 않은 세션은 wasDeceived=false이면서도 tacticsUsed는 나열한다(AC-009)", () => {
  const messages = [
    {
      role: "scammer" as const,
      textMasked: "엄마... 나야... 지금 당장 도와줘야 해, 더 늦으면 큰일나.",
      turnIndex: 0,
      createdAtMs: SESSION_START_MS,
    },
    {
      role: "user" as const,
      textMasked: "그럴 리가, 경찰에 신고할게.",
      turnIndex: 1,
      createdAtMs: SESSION_START_MS + 8_000,
    },
  ];

  const result = analyzeConversation(messages, SESSION_START_MS, WEAKENED_TACTICS);

  assert.equal(result.wasDeceived, false);
  assert.deepEqual(result.deceivedMoments, []);
  assert.ok(result.tacticsUsed.length > 0, "속지 않았어도 시도된 수법은 나열해야 한다(AC-009)");
});

test("analyzeConversation(): 대화가 아예 없으면 wasDeceived=false, 빈 목록", () => {
  const result = analyzeConversation([], SESSION_START_MS, WEAKENED_TACTICS);
  assert.equal(result.wasDeceived, false);
  assert.deepEqual(result.deceivedMoments, []);
  assert.deepEqual(result.tacticsUsed, []);
});

test("pickCorrectAction(): 수법 라벨 키워드에 맞는 대처법 문구를 돌려준다", () => {
  assert.match(pickCorrectAction("확인 전화 차단 유도"), /직접 전화/);
  assert.match(pickCorrectAction("송금 요구 얼버무리기"), /계좌번호나 송금/);
});

test("buildPreventionAdvice(): 항상 최소 1개 이상 반환한다(AC-008 min 1)", () => {
  assert.ok(buildPreventionAdvice([], false).length >= 1);
  assert.ok(buildPreventionAdvice(["다급함 조성"], true).length >= 1);
});

test("buildPreventionAdvice(): 과신 표현('면역', '완전') 없이 개선 영역 프레임을 유지한다(PRD Risks, UX.md Accessibility)", () => {
  const deceivedAdvice = buildPreventionAdvice(["다급함 조성"], true).join(" ");
  const safeAdvice = buildPreventionAdvice([], false).join(" ");
  assert.ok(!/면역/.test(deceivedAdvice));
  assert.ok(!/면역/.test(safeAdvice));
});
