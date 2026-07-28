// 모의 화면 스냅샷 + 신규 순간 합성 + 3단계 파생 (T84, §15.9.5, DECISIONS #42, D-51 판정표,
// AC-072/AC-073, OQ-U24 판정).
//
// 이 파일이 고정하는 것은 네 가지다:
//   (1) **D-51 판정표 ③④가 데이터 조건으로 1:1 번역됐다** — 응낙만 승격, 표시·닫기는 표시 전용
//       (AC-062: 속은 순간 0건이면 되감기 진입점 없음).
//   (2) **승격은 push + turnIndex 오름차순 재정렬**이다(§15.9.5 e-2 규칙 2) — 리플레이의
//       `getAnnotatedTurnIndexes`↔`deceivedMoments` 1:1 전제가 유지된다.
//   (3) **앵커 미해결이면 승격하지 않는다**(e-2 규칙 3) — 조용히 버리지 않고 표시 전용으로 남긴다.
//   (4) **문서가 0건이면 산출이 도입 전과 완전히 동일하다**(회귀 0 — 기존 12개 시나리오).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DeceivedMomentResult } from "../analyzeConversation";
import { pickCorrectAction } from "../analyzeConversation";
import {
  applyMockScreens,
  deriveReportStages,
  resolveMockScreenAnchor,
  type MockScreenMessage,
  type MockScreenSource,
} from "../mockScreenTimeline";
import { MOCK_SCREENS } from "../../scenarios/mockScreens";

const SESSION_CREATED_MS = 1_000_000;
const CATALOG = MOCK_SCREENS["messenger-subsidy-smishing-sms"];
const LANDING_ID = "subsidy-install";

/** scammer(0, 링크 실림) user(1) scammer(2) user(3) — 실제 저장 형태와 같은 교대 배열. */
const messages: MockScreenMessage[] = [
  { role: "scammer", turnIndex: 0, createdAtMs: SESSION_CREATED_MS + 5_000, landingIds: [LANDING_ID] },
  { role: "user", turnIndex: 1, createdAtMs: SESSION_CREATED_MS + 12_000 },
  { role: "scammer", turnIndex: 2, createdAtMs: SESSION_CREATED_MS + 20_000 },
  { role: "user", turnIndex: 3, createdAtMs: SESSION_CREATED_MS + 30_000 },
];

const moment = (turnIndex: number): DeceivedMomentResult => ({
  turnIndex,
  timeLabel: `${turnIndex * 10}초 시점`,
  tactic: "약화된 사기 수법",
  correctAction: pickCorrectAction("약화된 사기 수법"),
  tacticCategory: "other",
});

const shownOnly: MockScreenSource = {
  landingId: LANDING_ID,
  kind: "app-install",
  shownAtMs: SESSION_CREATED_MS + 15_000,
};
const consented: MockScreenSource = { ...shownOnly, consentedAtMs: SESSION_CREATED_MS + 18_000 };

// ── 앵커(§15.9.5 e-2) ────────────────────────────────────────────────────────

test("앵커는 그 링크를 실은 **가장 이른 사기범 메시지**의 turnIndex이고, timeLabel은 같은 시간축이다", () => {
  const anchor = resolveMockScreenAnchor(LANDING_ID, messages, SESSION_CREATED_MS);
  assert.deepEqual(anchor, { anchorTurnIndex: 0, anchorResolved: true, timeLabel: "5초 시점" });
});

test("같은 링크가 여러 번 실리면 가장 이른 사기범 메시지를 집는다", () => {
  const repeated: MockScreenMessage[] = [
    ...messages,
    { role: "scammer", turnIndex: 4, createdAtMs: SESSION_CREATED_MS + 44_000, landingIds: [LANDING_ID] },
  ];
  assert.equal(resolveMockScreenAnchor(LANDING_ID, repeated, SESSION_CREATED_MS).anchorTurnIndex, 0);
});

test("링크 메시지를 못 찾으면 미해결(anchorResolved:false)로 정직하게 표기한다(조용한 누락 금지)", () => {
  const noLink = messages.map(({ landingIds: _drop, ...rest }) => rest);
  const anchor = resolveMockScreenAnchor(LANDING_ID, noLink, SESSION_CREATED_MS);
  assert.equal(anchor.anchorResolved, false);
  assert.equal(anchor.anchorTurnIndex, 3, "마지막 메시지 뒤에 둔다(smsTimeline 규칙 3과 동형)");
  assert.equal(anchor.timeLabel, undefined);
});

// ── D-51 판정표(§15.9.5 e-1) ─────────────────────────────────────────────────

test("[회귀 0] 문서가 0건이면 deceivedMoments가 입력 그대로다(기존 12개 시나리오 무변경)", () => {
  const input = [moment(1), moment(3)];
  const result = applyMockScreens([], input, messages, SESSION_CREATED_MS, CATALOG);
  assert.deepEqual(result.deceivedMoments, input);
  assert.deepEqual(result.mockScreenTimeline, []);
  assert.equal(result.promotedCount, 0);
});

test("[D-51 ③] 화면이 떴으나 닫으면 표시 항목만 생기고 **속은 순간은 늘지 않는다**(AC-062 보호)", () => {
  const input = [moment(1)];
  const result = applyMockScreens([shownOnly], input, messages, SESSION_CREATED_MS, CATALOG);
  assert.equal(result.promotedCount, 0);
  assert.deepEqual(result.deceivedMoments, input, "순간 배열이 한 건도 바뀌지 않는다");
  assert.equal(result.mockScreenTimeline.length, 1);
  assert.equal(result.mockScreenTimeline[0].consented, false);
  assert.equal(result.mockScreenTimeline[0].anchorTurnIndex, 0);
  assert.equal(result.mockScreenTimeline[0].timeLabel, "5초 시점");
});

test("[D-51 ③ + AC-062] 속은 순간 0건 세션에서 화면만 뜨면 여전히 0건이다(되감기 진입점 미생성)", () => {
  const result = applyMockScreens([shownOnly], [], messages, SESSION_CREATED_MS, CATALOG);
  assert.deepEqual(result.deceivedMoments, []);
  assert.equal(result.mockScreenTimeline.length, 1, "표시 항목은 남는다(시도된 수법, AC-009)");
});

test("[D-51 ④] 가짜 '권한 허용'에 응하면 순간 1건이 **사기범 앵커 턴에** 합성된다", () => {
  const result = applyMockScreens([consented], [moment(3)], messages, SESSION_CREATED_MS, CATALOG);
  assert.equal(result.promotedCount, 1);
  assert.equal(result.deceivedMoments.length, 2);
  const promoted = result.deceivedMoments[0];
  assert.equal(promoted.turnIndex, 0, "앵커 = 설치 링크를 실은 사기범 메시지");
  assert.equal(promoted.timeLabel, "5초 시점");
  assert.equal(promoted.tactic, CATALOG[0].momentTactic);
  assert.equal(promoted.correctAction, CATALOG[0].correctAction);
  assert.equal(
    promoted.tacticCategory,
    "link_or_install",
    "신규 카테고리 0건 — 기존 고정 10종으로 자연 정규화된다(§15.9.5 e-1)",
  );
  assert.equal(result.mockScreenTimeline[0].consented, true);
});

// ── T123 / AC-080 — 메신저 표면(경로 B)의 가짜 랜딩 **제출 승격** ────────────────────────────
//
// 경로 A(`smsTimeline.test.ts`)와 **같은 승격 규칙**을 쓴다(G137 — 조립은 buildLandingSubmitMoment
// 한 곳이 소유). 여기서 고정하는 것은 이 표면에서도 제출이 실제로 승격을 만들고, 그 경로를 끊으면
// 승격이 사라진다는 것이다(각각 독립 샘플).

const PARCEL_CATALOG = MOCK_SCREENS["messenger-parcel-smishing-sms"];
const PARCEL_LANDING_ID = "parcel-redelivery";
/** scammer(0, credential-form 링크 실림) user(1) scammer(2) — 경로 B의 최소 대화. */
const parcelMessages: MockScreenMessage[] = [
  {
    role: "scammer",
    turnIndex: 0,
    createdAtMs: SESSION_CREATED_MS + 5_000,
    landingIds: [PARCEL_LANDING_ID],
  },
  { role: "user", turnIndex: 1, createdAtMs: SESSION_CREATED_MS + 12_000 },
  { role: "scammer", turnIndex: 2, createdAtMs: SESSION_CREATED_MS + 20_000 },
];
const parcelShown: MockScreenSource = {
  landingId: PARCEL_LANDING_ID,
  kind: "credential-form",
  shownAtMs: SESSION_CREATED_MS + 9_000,
};
const parcelSubmitted: MockScreenSource = {
  ...parcelShown,
  submittedAtMs: SESSION_CREATED_MS + 15_000,
};

test("[AC-080/경로 B] 메신저 랜딩 제출이 속은 순간 1건으로 승격된다", (t) => {
  const result = applyMockScreens(
    [parcelSubmitted],
    [],
    parcelMessages,
    SESSION_CREATED_MS,
    PARCEL_CATALOG,
  );
  const item = PARCEL_CATALOG.find((c) => c.landingId === PARCEL_LANDING_ID);
  t.diagnostic(`승격=${result.promotedCount} / 순간=${JSON.stringify(result.deceivedMoments)}`);
  assert.equal(result.promotedCount, 1);
  assert.equal(result.deceivedMoments[0].turnIndex, 0, "링크를 실은 사기범 메시지가 앵커다");
  // 문면은 카탈로그 저작 문자열 그대로 — 경로 A와 **같은 규칙**이다(G137).
  assert.equal(result.deceivedMoments[0].tactic, item?.momentTactic);
  assert.equal(result.deceivedMoments[0].correctAction, item?.correctAction);
});

test("[AC-080/경로 B 역검증] 제출 경로를 끊으면 승격이 사라진다(독립 샘플)", (t) => {
  const noSubmit = applyMockScreens(
    [parcelShown],
    [],
    parcelMessages,
    SESSION_CREATED_MS,
    PARCEL_CATALOG,
  );
  const noAnchor = applyMockScreens([parcelSubmitted], [], [], SESSION_CREATED_MS, PARCEL_CATALOG);
  const noCatalog = applyMockScreens([parcelSubmitted], [], parcelMessages, SESSION_CREATED_MS, []);
  t.diagnostic(
    `끊은 경로별 승격 수 — 제출필드 제거=${noSubmit.promotedCount} / ` +
      `앵커 미해결=${noAnchor.promotedCount} / 카탈로그 미소속=${noCatalog.promotedCount}`,
  );
  assert.equal(noSubmit.promotedCount, 0, "화면만 뜬 세션은 AC-062대로 진입점이 없다");
  assert.equal(noAnchor.promotedCount, 0);
  assert.equal(noCatalog.promotedCount, 0);
  assert.deepEqual(noSubmit.deceivedMoments, [], "제출 0건이면 입력 그대로다");
});

test("[T123] `consented`는 여전히 '권한 허용'만 뜻한다 — 제출 항목은 consented:false로 남는다", () => {
  const result = applyMockScreens(
    [parcelSubmitted],
    [],
    parcelMessages,
    SESSION_CREATED_MS,
    PARCEL_CATALOG,
  );
  assert.equal(result.promotedCount, 1, "승격은 일어난다");
  assert.equal(
    result.mockScreenTimeline[0].consented,
    false,
    "표시 스냅샷의 의미는 갈리지 않는다(스키마 무변경 — 화면 문면은 ux-design 소관)",
  );
});

test("[§15.9.5 e-2 규칙 2] 병합 결과는 turnIndex 오름차순이다(되감기 딥링크 1:1 전제)", () => {
  const result = applyMockScreens([consented], [moment(3), moment(1)], messages, SESSION_CREATED_MS, CATALOG);
  assert.deepEqual(
    result.deceivedMoments.map((m) => m.turnIndex),
    [0, 1, 3],
  );
});

test("[§15.9.5 e-2 규칙 3] 앵커 미해결이면 승격하지 않고 표시 전용으로만 남긴다", () => {
  const noLink = messages.map(({ landingIds: _drop, ...rest }) => rest);
  const input = [moment(1)];
  const result = applyMockScreens([consented], input, noLink, SESSION_CREATED_MS, CATALOG);
  assert.equal(result.promotedCount, 0);
  assert.deepEqual(result.deceivedMoments, input);
  assert.equal(result.mockScreenTimeline[0].anchorResolved, false);
  assert.equal(
    result.mockScreenTimeline[0].consented,
    false,
    "승격되지 않았으므로 '같은 순간이 deceivedMoments에도 있다'고 표기하면 안 된다(중복 카드 규칙)",
  );
});

test("[위조 방어] 카탈로그에 없는 landingId는 응낙이 있어도 승격하지 않는다", () => {
  const rogue: MockScreenSource = {
    landingId: "rogue-landing",
    kind: "app-install",
    shownAtMs: SESSION_CREATED_MS,
    consentedAtMs: SESSION_CREATED_MS + 1_000,
  };
  const result = applyMockScreens([rogue], [], messages, SESSION_CREATED_MS, CATALOG);
  assert.equal(result.promotedCount, 0);
});

test("스냅샷에 화면 콘텐츠 원문·원시 타임스탬프를 싣지 않는다(§15.9.5 e-4 금지 표)", () => {
  const result = applyMockScreens([consented], [], messages, SESSION_CREATED_MS, CATALOG);
  const entry = result.mockScreenTimeline[0] as Record<string, unknown>;
  for (const forbidden of ["headline", "bodyLines", "consentLabel", "shownAtMs", "consentedAtMs", "url"]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(entry, forbidden),
      false,
      `스냅샷에 있으면 안 되는 것: ${forbidden}`,
    );
  }
});

// ── 단계 도달 판정(§15.9.5 e-3, OQ-U24) ───────────────────────────────────────

const stageInput = {
  entryChannel: "messenger" as const,
  installIntended: true,
  installLandingIds: [LANDING_ID],
  voiceIntended: true,
};

test("[OQ-U24] 3단계 완주면 3행 전부 reached:true", () => {
  assert.deepEqual(
    deriveReportStages({ ...stageInput, reachedLandingIds: [LANDING_ID], voiceReached: true }),
    [
      { stage: "messenger", reached: true },
      { stage: "mock_install", reached: true },
      { stage: "voice", reached: true },
    ],
  );
});

test("[OQ-U24] **미도달 단계도 reached:false로 데이터에 남는다**(빼면 '없었다'와 구분 불가)", () => {
  assert.deepEqual(deriveReportStages({ ...stageInput, reachedLandingIds: [], voiceReached: false }), [
    { stage: "messenger", reached: true },
    { stage: "mock_install", reached: false },
    { stage: "voice", reached: false },
  ]);
});

test("2단계에서 종료한 세션은 voice.reached === false다(§15.9.8 증거 4)", () => {
  const stages = deriveReportStages({
    ...stageInput,
    reachedLandingIds: [LANDING_ID],
    voiceReached: false,
  });
  assert.equal(stages.find((s) => s.stage === "voice")?.reached, false);
  assert.equal(stages.find((s) => s.stage === "mock_install")?.reached, true);
});

test("[무백필] 의도된 단계가 2개 미만이면 빈 배열 — 기존 12개 시나리오 리포트 무변경", () => {
  // 설치 카탈로그도 escalation도 없는 메신저 시나리오.
  assert.deepEqual(
    deriveReportStages({
      entryChannel: "messenger",
      installIntended: false,
      installLandingIds: [],
      reachedLandingIds: [],
      voiceIntended: false,
      voiceReached: false,
    }),
    [],
  );
  // 보이스로 시작한 세션은 표에 없는 케이스라 자연히 빈 배열로 떨어진다(임의 판단 금지).
  assert.deepEqual(
    deriveReportStages({ ...stageInput, entryChannel: "voice", reachedLandingIds: [], voiceReached: false }),
    [],
  );
});

test("설치 카탈로그가 없고 escalation만 있으면 2행(messenger·voice)이다", () => {
  assert.deepEqual(
    deriveReportStages({
      entryChannel: "messenger",
      installIntended: false,
      installLandingIds: [],
      reachedLandingIds: [],
      voiceIntended: true,
      voiceReached: true,
    }),
    [
      { stage: "messenger", reached: true },
      { stage: "voice", reached: true },
    ],
  );
});
