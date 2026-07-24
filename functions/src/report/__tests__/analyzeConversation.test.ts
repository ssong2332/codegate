import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, buildPreventionAdvice, pickCorrectAction } from "../analyzeConversation";
import { MockLlmClient } from "../../llm/mockClient";

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

// 회귀 테스트(2026-07-24) — 사용자가 "일부러 사기에 넘어가는 척" 실측 신고: 라이브 에뮬레이터로
// sendMessage→generateReport 경로에서 재현된 두 가지 실패 모드를 그대로 고정한다(functions/src/
// report/analyzeConversation.ts 주석 참고). 고침 전에는 둘 다 wasDeceived=false로 잘못 판정됐다.
test("analyzeConversation(): '확인하고'만으로는 저항으로 오판정하지 않는다 — 순응 발화 속 필러(회귀, 라이브 재현)", () => {
  const messages = [
    {
      role: "scammer" as const,
      textMasked: "잠시만요... 직접 방문하시면 안 됩니다, 유선으로만 처리 가능합니다.",
      turnIndex: 0,
      createdAtMs: SESSION_START_MS,
    },
    {
      role: "user" as const,
      textMasked: "네, 알겠습니다. 확인하고 바로 송금하겠습니다.",
      turnIndex: 1,
      createdAtMs: SESSION_START_MS + 12_000,
    },
  ];

  const result = analyzeConversation(messages, SESSION_START_MS, WEAKENED_TACTICS);

  assert.equal(result.wasDeceived, true);
  assert.equal(result.deceivedMoments.length, 1);
});

test("analyzeConversation(): '확인하고 다시 전화/확인'류 진짜 재확인 의도는 여전히 저항으로 판정한다", () => {
  const messages = [
    {
      role: "scammer" as const,
      textMasked: "지금 당장 처리하지 않으면 불이익이 있습니다.",
      turnIndex: 0,
      createdAtMs: SESSION_START_MS,
    },
    {
      role: "user" as const,
      textMasked: "확인하고 다시 전화드릴게요.",
      turnIndex: 1,
      createdAtMs: SESSION_START_MS + 5_000,
    },
  ];

  const result = analyzeConversation(messages, SESSION_START_MS, WEAKENED_TACTICS);

  assert.equal(result.deceivedMoments.length, 0);
});

test("analyzeConversation(): 격식체 '말씀하신 대로' 순응 표현도 속은 순간으로 감지한다(회귀, 라이브 재현)", () => {
  const messages = [
    {
      role: "scammer" as const,
      textMasked: "잠시만요... 오늘까지만 신청 가능하세요, 지금 끊으시면 대상에서 빠져요.",
      turnIndex: 0,
      createdAtMs: SESSION_START_MS,
    },
    {
      role: "user" as const,
      textMasked: "네, 말씀하신 대로 바로 처리하겠습니다.",
      turnIndex: 1,
      createdAtMs: SESSION_START_MS + 20_000,
    },
  ];

  const result = analyzeConversation(messages, SESSION_START_MS, WEAKENED_TACTICS);

  assert.equal(result.wasDeceived, true);
  assert.equal(result.deceivedMoments.length, 1);
});

test("analyzeConversation(): '말씀하신 대로는 못 하겠습니다'처럼 부정이 섞이면 저항이 우선한다(신규 순응 키워드의 오탐 방지)", () => {
  const messages = [
    {
      role: "scammer" as const,
      textMasked: "지금 계좌번호를 알려주셔야 처리됩니다.",
      turnIndex: 0,
      createdAtMs: SESSION_START_MS,
    },
    {
      role: "user" as const,
      textMasked: "말씀하신 대로는 못 하겠습니다.",
      turnIndex: 1,
      createdAtMs: SESSION_START_MS + 3_000,
    },
  ];

  const result = analyzeConversation(messages, SESSION_START_MS, WEAKENED_TACTICS);

  assert.equal(result.deceivedMoments.length, 0);
});

// 회귀 테스트(reviewer 리젝션, 2026-07-24, Critical) — reviewer가 직접 코드 실행으로 재현: 위
// "말씀하신 대로는 못 하겠습니다" 오탐 방지의 최초 구현(못\s*하겠|안\s*하겠|하지\s*않겠|거절를
// RESISTANCE_PATTERN 독립 항목으로 추가)은 무엇을 부정하는지 범위가 없는 범용 완곡 표현이라,
// 망설임-후-순응(hesitation-then-compliance) 문구에서 명백한 순응 신호(계좌번호/송금 등)를
// 무시하고 메시지 전체를 통째로 저항으로 오판정했다(블랭킷 오버라이드 버그). 아래 4건은 그 정확한
// 재현 케이스 — 지금은 부정이 "말씀하신/시키는/하라는/알려주신 대로"에 직접 붙을 때만 저항으로
// 잡는 단일 결합 패턴으로 범위를 좁혀 모두 wasDeceived:true로 올바르게 판정돼야 한다.
test("analyzeConversation(): '거절하고 싶은데... 계좌번호 알려드릴게요'류 망설임-후-순응은 속은 순간으로 판정한다(회귀, reviewer 재현)", () => {
  const messages = [
    {
      role: "scammer" as const,
      textMasked: "지금 계좌번호를 알려주셔야 처리됩니다.",
      turnIndex: 0,
      createdAtMs: SESSION_START_MS,
    },
    {
      role: "user" as const,
      textMasked: "정말 거절하고 싶은데 무서워서 계좌번호 알려드릴게요.",
      turnIndex: 1,
      createdAtMs: SESSION_START_MS + 6_000,
    },
  ];

  const result = analyzeConversation(messages, SESSION_START_MS, WEAKENED_TACTICS);

  assert.equal(result.wasDeceived, true);
  assert.equal(result.deceivedMoments.length, 1);
});

test("analyzeConversation(): '못 하겠지만... 송금할게요'류 망설임-후-순응은 속은 순간으로 판정한다(회귀, reviewer 재현)", () => {
  const messages = [
    {
      role: "scammer" as const,
      textMasked: "지금 바로 처리 안 하시면 불이익이 있습니다.",
      turnIndex: 0,
      createdAtMs: SESSION_START_MS,
    },
    {
      role: "user" as const,
      textMasked: "못 하겠지만 어쩔 수 없이 송금할게요.",
      turnIndex: 1,
      createdAtMs: SESSION_START_MS + 6_000,
    },
  ];

  const result = analyzeConversation(messages, SESSION_START_MS, WEAKENED_TACTICS);

  assert.equal(result.wasDeceived, true);
  assert.equal(result.deceivedMoments.length, 1);
});

test("analyzeConversation(): '안 하겠다고 생각했는데... 계좌번호 불러드릴게요'류 망설임-후-순응은 속은 순간으로 판정한다(회귀, reviewer 재현)", () => {
  const messages = [
    {
      role: "scammer" as const,
      textMasked: "지금 계좌번호를 불러주셔야 합니다.",
      turnIndex: 0,
      createdAtMs: SESSION_START_MS,
    },
    {
      role: "user" as const,
      textMasked: "안 하겠다고 생각했는데 그냥 계좌번호 불러드릴게요.",
      turnIndex: 1,
      createdAtMs: SESSION_START_MS + 6_000,
    },
  ];

  const result = analyzeConversation(messages, SESSION_START_MS, WEAKENED_TACTICS);

  assert.equal(result.wasDeceived, true);
  assert.equal(result.deceivedMoments.length, 1);
});

test("analyzeConversation(): '거절할 수가 없어서... 보내드리겠습니다'류 망설임-후-순응은 속은 순간으로 판정한다(회귀, reviewer 재현)", () => {
  const messages = [
    {
      role: "scammer" as const,
      textMasked: "지금 바로 보내주셔야 처리됩니다.",
      turnIndex: 0,
      createdAtMs: SESSION_START_MS,
    },
    {
      role: "user" as const,
      textMasked: "거절할 수가 없어서 결국 보내드리겠습니다.",
      turnIndex: 1,
      createdAtMs: SESSION_START_MS + 6_000,
    },
  ];

  const result = analyzeConversation(messages, SESSION_START_MS, WEAKENED_TACTICS);

  assert.equal(result.wasDeceived, true);
  assert.equal(result.deceivedMoments.length, 1);
});

// 회귀 테스트(2026-07-24, "시도된 수법" 검증 중 발견) — 실제 scenarioPrompts 콘텐츠는 인용구
// 형식("라벨 — '실제 대사', '실제 대사' 처럼 ...한다")을 쓰는데(institutionalImpersonation.prompt.ts
// 등), analyzeConversation.ts의 예전 flavor 추출 로직은 인용구를 무시한 "— 이후 전체"였다.
// MockLlmClient가 실제로 만드는 대사(인용구만 추출)와 어긋나 findMatchedTactic()이 Mock 산출물
// 조차 한 번도 못 맞히고 tacticsUsed가 항상 빈 배열이었다(라이브 에뮬레이터로 확인). 지금은 양쪽이
// scenarios/tacticFlavor.ts 공용 함수를 쓰므로, MockLlmClient가 실제로 생성한 대사를 그대로
// analyzeConversation에 넣어도 tacticsUsed가 정확히 채워져야 한다.
test("analyzeConversation(): 인용구 형식 weakenedTactics(실제 콘텐츠 형식) — MockLlmClient가 실제로 만든 대사에서도 tacticsUsed가 채워진다(회귀)", async () => {
  const quotedTactics = [
    "확인 절차 차단 — '직접 방문하시면 안 됩니다', '유선으로만 처리 가능합니다' 처럼 제3자·기관 재확인을 막으려 한다.",
  ];

  const mock = new MockLlmClient();
  const opening = await mock.complete({
    systemPrompt: "(system prompt)",
    messages: [],
    mockTacticHints: quotedTactics,
  });

  const messages = [
    {
      role: "scammer" as const,
      textMasked: opening.text,
      turnIndex: 0,
      createdAtMs: SESSION_START_MS,
    },
    {
      role: "user" as const,
      textMasked: "네, 알겠습니다. 확인하고 바로 송금하겠습니다.",
      turnIndex: 1,
      createdAtMs: SESSION_START_MS + 10_000,
    },
  ];

  const result = analyzeConversation(messages, SESSION_START_MS, quotedTactics);

  assert.equal(result.wasDeceived, true);
  assert.deepEqual(result.tacticsUsed, ["확인 절차 차단"]);
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
