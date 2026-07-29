// ⭐ T136 / `docs/Architecture.md` §42 — **한 리포트가 자기 안에서 어긋나던 것**을 닫는 게이트.
//
// 관측(오케스트레이터 브라우저 실측 2026-07-29 · **관찰 1회 · planner 재현 0건 · architect 재현
// 0건**): 같은 리포트에서 **속은 시점 카드** = *"배송 보류를 빌미로 한 개인정보 입력 유도"*(수법을
// **이름으로 부른다**) / **아코디언** = *"시도된 수법 0가지"*.
//
// 이 파일이 고정하는 것은 다섯 가지다:
//   (P-2) **자기모순의 라이브 0회 재현** — 사기범 발화가 **패러프레이즈**(flavor 미포함)이고 제출
//         문서가 1건이면, 승격 순간은 **이름 있는 수법**을 갖는데 `analyzeConversation.tacticsUsed`는
//         **빈 배열**이다(= 오염 샘플). 그 상태에서 리포트 목록이 카드의 이름을 **포함한다**.
//   (P-3) **대조군** — 같은 픽스처의 사기범 발화만 `MockLlmClient`가 **실제로 만든 대사**로 바꾸면
//         추정이 성립해 `tacticsUsed.length >= 1`이다(정상 샘플도 통과한다).
//   (1)   **승격 0건이면 항등이다**(§42.7 if/then 8 — 기존 12개 시나리오 리포트 무변경).
//   (2)   **중복 제거는 문자열 동일성, 정렬은 넣지 않는다**(§42.6 B-3).
//   (3)   **배선 소스 게이트** — 이 저장소에 `generateReportCore`를 부르는 단위 테스트가 없어
//         (Firestore 의존) 합집합 배선은 **관측 불가 지점**이다. 그래서 소스로 고정한다:
//         `tacticsUsed: analysis.tacticsUsed` 로 되돌리거나 `buildPreventionAdvice`의 인자를
//         합집합으로 늘리면(**G215**) 이 테스트가 곧바로 빨개진다.
//
// ⛔ **`isMock=true`로 재현하지 않는다**(§42.3 · **G217**): Mock 경로는 flavor 문구를 대사에 직접
// 심으므로 추정이 필연적으로 매치한다 — Mock은 이 증상을 **재현하지 못한다**. 재현 경로는 아래
// **순수 함수 픽스처**이고 **라이브·에뮬레이터 호출 0회**다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import {
  applyMockScreens,
  mergePromotedTactics,
  type MockScreenMessage,
  type MockScreenSource,
} from "../mockScreenTimeline";
import { MOCK_SCREENS } from "../../scenarios/mockScreens";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { MockLlmClient } from "../../llm/mockClient";
import { extractLinkMarker } from "../../roleplay/linkMarker";

const SCENARIO_ID = "messenger-parcel-smishing-sms";
const LANDING_ID = "parcel-redelivery";
const SESSION_CREATED_MS = 1_000_000;
const CATALOG = MOCK_SCREENS[SCENARIO_ID];
const WEAKENED_TACTICS = SCENARIO_PROMPTS[SCENARIO_ID].weakenedTactics;
const CARD_TACTIC = CATALOG.find((c) => c.landingId === LANDING_ID)!.momentTactic;

/**
 * ⭐ **패러프레이즈된 사기범 발화** — 카탈로그 인용구(`'여기서 주소 확인해 주세요'` 등)를 하나도
 * 그대로 쓰지 않는다. 실 LLM은 표현이 자유로워 `findMatchedTactic`의 **앞 8자 부분 일치**가
 * 성립하지 않는다는 것이 이 저장소가 자기 코드에 이미 적어 둔 한계다
 * (`scenarios/tacticFlavor.ts` · `report/analyzeConversation.ts` 파일 서두).
 * ⛔ 오염은 **테스트 코드 안에서만** 만든다 — 카탈로그·프롬프트 원문은 한 글자도 고치지 않는다
 * (§42.7 if/then 5).
 */
const PARAPHRASED_SCAMMER_TURN0 =
  "안녕하세요, 접수처입니다. 물품이 접수처에 보관 중이라 받는 분 정보를 한 번만 확인 부탁드립니다.";
const PARAPHRASED_SCAMMER_TURN2 = "확인이 늦어지면 반송 처리될 수 있어 미리 안내드립니다.";
/** 순응 신호가 없는 답변 — 대화 쪽에서 속은 순간이 생기지 않게 해 승격분만 남긴다. */
const NEUTRAL_USER_REPLY = "무슨 말씀이신지 잘 모르겠는데요.";

const analysisMessages = (scammerTurn0: string): AnalysisMessage[] => [
  { role: "scammer", turnIndex: 0, createdAtMs: SESSION_CREATED_MS + 5_000, textMasked: scammerTurn0 },
  { role: "user", turnIndex: 1, createdAtMs: SESSION_CREATED_MS + 12_000, textMasked: NEUTRAL_USER_REPLY },
  {
    role: "scammer",
    turnIndex: 2,
    createdAtMs: SESSION_CREATED_MS + 20_000,
    textMasked: PARAPHRASED_SCAMMER_TURN2,
  },
];

/** 승격의 앵커 = `[[LINK:parcel-redelivery]]` 첨부를 실은 사기범 메시지(§15.9.5 e-2). */
const screenMessages: MockScreenMessage[] = [
  { role: "scammer", turnIndex: 0, createdAtMs: SESSION_CREATED_MS + 5_000, landingIds: [LANDING_ID] },
  { role: "user", turnIndex: 1, createdAtMs: SESSION_CREATED_MS + 12_000 },
  { role: "scammer", turnIndex: 2, createdAtMs: SESSION_CREATED_MS + 20_000 },
];

/** 참가자가 가짜 랜딩 폼을 **제출했다**(T123/AC-080 — 승격의 필요조건). */
const submittedDoc: MockScreenSource = {
  landingId: LANDING_ID,
  kind: "credential-form",
  shownAtMs: SESSION_CREATED_MS + 9_000,
  submittedAtMs: SESSION_CREATED_MS + 15_000,
};

/** `generateReportCore`의 ②→②-d→②-e 순서를 그대로 재구성한다(§42.7 if/then 4). */
function runPipeline(scammerTurn0: string, docs: readonly MockScreenSource[]) {
  const analysis = analyzeConversation(
    analysisMessages(scammerTurn0),
    SESSION_CREATED_MS,
    WEAKENED_TACTICS,
  );
  const mock = applyMockScreens(docs, analysis.deceivedMoments, screenMessages, SESSION_CREATED_MS, CATALOG);
  const tacticsUsed = mergePromotedTactics(analysis.tacticsUsed, mock.deceivedMoments, CATALOG);
  return { analysis, mock, tacticsUsed };
}

// ── P-2 오염 샘플 — 자기모순의 재현과 해소 ────────────────────────────────────────────────────

test("[T136/P-2] 패러프레이즈 발화 + 제출 1건 = **이름 있는 순간 1건 + 추정 0건**이 실제로 재현된다(오염 샘플)", (t) => {
  const { analysis, mock } = runPipeline(PARAPHRASED_SCAMMER_TURN0, [submittedDoc]);

  t.diagnostic(`analysis.tacticsUsed=${JSON.stringify(analysis.tacticsUsed)}`);
  t.diagnostic(`승격=${mock.promotedCount} / 카드 수법="${mock.deceivedMoments[0]?.tactic}"`);

  assert.equal(analysis.deceivedMoments.length, 0, "픽스처 전제: 대화 쪽 속은 순간 0건");
  assert.deepEqual(
    analysis.tacticsUsed,
    [],
    "⭐ 재현 조건 — 추정기가 아무 수법도 찾지 못한다(F2)",
  );
  assert.equal(mock.promotedCount, 1);
  assert.equal(
    mock.deceivedMoments[0].tactic,
    CARD_TACTIC,
    "⭐ 재현 조건 — 그런데 속은 시점 카드는 수법을 **이름으로 부른다**",
  );
});

test("[T136/P-2 해소] 그 오염 샘플에서도 리포트 수법 목록이 **카드가 부르는 이름을 포함**한다(§42.6 B)", (t) => {
  const { analysis, mock, tacticsUsed } = runPipeline(PARAPHRASED_SCAMMER_TURN0, [submittedDoc]);

  t.diagnostic(`before(analysis.tacticsUsed)=${JSON.stringify(analysis.tacticsUsed)}`);
  t.diagnostic(`after (report.tacticsUsed) =${JSON.stringify(tacticsUsed)}`);

  assert.deepEqual(tacticsUsed, [CARD_TACTIC]);
  // ⭐ 이 리포트가 참가자에게 말하는 두 서술이 더 이상 어긋나지 않는다.
  for (const moment of mock.deceivedMoments) {
    if (!CATALOG.some((item) => item.momentTactic === moment.tactic)) continue;
    assert.ok(
      tacticsUsed.includes(moment.tactic),
      `속은 시점 카드가 "${moment.tactic}"를 이름으로 부르는데 수법 목록에 없다 — 리포트가 자기 안에서 어긋난다(T136).`,
    );
  }
  assert.notEqual(tacticsUsed.length, 0, '아코디언이 "시도된 수법 0가지"라고 말하지 않는다');
});

// ── P-3 대조군 — 정상 샘플도 통과한다 ─────────────────────────────────────────────────────────

test("[T136/P-3 대조군] 사기범 발화를 MockLlmClient가 **실제로 만든 대사**로 바꾸면 추정이 성립한다", async (t) => {
  const llm = new MockLlmClient();
  // craftEscalationLine(turn = messages.length)의 `turn % tactics.length` = 2 → "링크 클릭 유도".
  const completion = await llm.complete({
    systemPrompt: "테스트",
    messages: [
      { role: "user", content: "테스트 사용자 입력" },
      { role: "assistant", content: "테스트 사기범 발화" },
    ],
    mockTacticHints: [...WEAKENED_TACTICS],
  });
  // 실제 파이프라인과 같은 순서로 마커를 걷어 낸 텍스트가 `textMasked`로 저장된다.
  const { text: mockLine, attachments } = extractLinkMarker(completion.text);

  t.diagnostic(`Mock 대사="${mockLine}" / attachments=${JSON.stringify(attachments)}`);

  const { analysis, tacticsUsed } = runPipeline(mockLine, [submittedDoc]);
  t.diagnostic(`analysis.tacticsUsed=${JSON.stringify(analysis.tacticsUsed)}`);
  t.diagnostic(`report.tacticsUsed  =${JSON.stringify(tacticsUsed)}`);

  assert.ok(
    analysis.tacticsUsed.length >= 1,
    "⭐ Mock 경로는 flavor를 대사에 직접 심으므로 이 증상을 재현하지 못한다(§42.3 · G217/G218)",
  );
  assert.ok(tacticsUsed.includes(CARD_TACTIC), "합집합은 정상 샘플에서도 카드의 이름을 싣는다");
  assert.ok(
    tacticsUsed.length > analysis.tacticsUsed.length,
    "추정분과 승격분이 **둘 다** 남는다 — 대체가 아니라 합집합이다(§42.6 C 기각)",
  );
});

// ── 무회귀 불변식 ─────────────────────────────────────────────────────────────────────────────

test("[T136/if-then 8] 승격이 0건이면 합집합은 **항등**이다(기존 12개 시나리오 리포트 무변경)", (t) => {
  const shownOnly: MockScreenSource = { ...submittedDoc };
  delete (shownOnly as { submittedAtMs?: number }).submittedAtMs;

  const withDoc = runPipeline(PARAPHRASED_SCAMMER_TURN0, [shownOnly]);
  const noDoc = runPipeline(PARAPHRASED_SCAMMER_TURN0, []);
  const mockLineRun = runPipeline(PARAPHRASED_SCAMMER_TURN0, []);

  t.diagnostic(`화면만 뜬 경우 승격=${withDoc.mock.promotedCount} / tacticsUsed=${JSON.stringify(withDoc.tacticsUsed)}`);

  assert.equal(withDoc.mock.promotedCount, 0, "제출·응낙이 없으면 승격은 0건이다(AC-080 (b) · AC-062)");
  assert.deepEqual(withDoc.tacticsUsed, withDoc.analysis.tacticsUsed);
  assert.deepEqual(noDoc.tacticsUsed, noDoc.analysis.tacticsUsed);
  assert.deepEqual(mockLineRun.tacticsUsed, mockLineRun.analysis.tacticsUsed);
});

test("[T136/B-3] 중복은 제거하고 **정렬은 넣지 않는다** — 기존 순서가 앞, 승격분이 뒤다", () => {
  const moments = [
    { turnIndex: 0, timeLabel: "5초 시점", tactic: CARD_TACTIC, correctAction: "x", tacticCategory: "other" as const },
    { turnIndex: 1, timeLabel: "9초 시점", tactic: CARD_TACTIC, correctAction: "x", tacticCategory: "other" as const },
    { turnIndex: 2, timeLabel: "9초 시점", tactic: "약화된 사기 수법", correctAction: "x", tacticCategory: "other" as const },
  ];
  const merged = mergePromotedTactics(["하 수법", "가 수법"], moments, CATALOG);

  assert.deepEqual(
    merged,
    ["하 수법", "가 수법", CARD_TACTIC],
    "기존 등장 순서 보존 · 승격분 1회만 · 사전순 정렬 없음",
  );
  assert.deepEqual(
    mergePromotedTactics([CARD_TACTIC], moments, CATALOG),
    [CARD_TACTIC],
    "이미 추정으로 잡힌 수법은 두 번 실리지 않는다",
  );
});

test("[T136/§42.6 D 기각] 시도되지 않은 수법은 목록에 들어가지 않는다(반대 방향의 거짓 금지)", () => {
  const otherCatalog = MOCK_SCREENS["messenger-subsidy-smishing-sms"];
  const merged = mergePromotedTactics([], [], otherCatalog);
  assert.deepEqual(merged, [], "카탈로그에 있다는 이유만으로 나열하지 않는다 — 승격된 순간만 싣는다");
});

// ── 배선 소스 게이트(관측 불가 지점 고정) ─────────────────────────────────────────────────────

const REPORT_CORE = "src/report/generateReportCore.ts";

/** 주석은 걷어 낸다 — 금지 문자열이 **자기 설명 주석**에 걸리는 함정을 피한다(이 저장소 재발 2회). */
function codeOnly(path: string): string {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

test("[T136 배선] generateReportCore가 리포트 `tacticsUsed`를 **합집합으로** 싣는다", () => {
  const code = codeOnly(REPORT_CORE);

  assert.ok(
    /mergePromotedTactics\(\s*analysis\.tacticsUsed,\s*mock\.deceivedMoments,/.test(code),
    `${REPORT_CORE}: 합집합 입력은 **최종** \`mock.deceivedMoments\`다(§42.6 B-1 — \`analysis.deceivedMoments\`를 쓰면 T83 주석 전 라벨이 실린다).`,
  );
  assert.ok(
    !code.includes("tacticsUsed: analysis.tacticsUsed"),
    `${REPORT_CORE}: 리포트 필드를 추정 산출 그대로 되돌리면 T136 자기모순이 재발한다.`,
  );
});

test("[T136/G215] `buildPreventionAdvice`의 인자는 여전히 `analysis.tacticsUsed`다(합집합을 넘기지 않는다)", () => {
  const code = codeOnly(REPORT_CORE);
  assert.ok(
    code.includes("buildPreventionAdvice(analysis.tacticsUsed, wasDeceived)"),
    `${REPORT_CORE}: 조언 입력을 늘리면 승격 순간의 correctAction과 중복된다(§42.6 B-2 · §15.9.5 e-1).`,
  );
});
