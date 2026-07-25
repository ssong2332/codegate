// node:test 단위 테스트 (T33, UX-018, AC-038) — src/lib/history/mapHistoryItems.test.ts와 동일한
// 실행 방식(Node 내장 --experimental-strip-types, 프론트엔드 테스트 러너 부재 우회, T19 known gap).
// 실행: `npm test` (package.json 참고).
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReplayTimeline,
  getAnnotatedTurnIndexes,
  type ReplayTimelineItem,
  type ReplayTimelineMessageItem,
} from "./buildReplayTimeline.ts";

/** 타임라인이 T89 이후 메시지·문자 판별 유니온이라, 기존 메시지 단언은 이 좁히기를 거친다. */
function messagesOf(timeline: readonly ReplayTimelineItem[]): ReplayTimelineMessageItem[] {
  return timeline.filter((item): item is ReplayTimelineMessageItem => item.kind === "message");
}

test("AC-038: 속은 시점(deceivedMoments)이 같은 turnIndex의 메시지에 주석으로 매칭된다", () => {
  const timeline = buildReplayTimeline(
    [
      { id: "m0", role: "scammer", textMasked: "지금 사고가 나서 급해요", turnIndex: 0 },
      { id: "m1", role: "user", textMasked: "계좌번호 알려주세요", turnIndex: 1 },
      { id: "m2", role: "scammer", textMasked: "감사합니다", turnIndex: 2 },
    ],
    [
      { turnIndex: 1, timeLabel: "12초 시점", tactic: "긴급성 압박", correctAction: "전화를 끊고 직접 확인하세요." },
    ],
  );

  const items = messagesOf(timeline);
  assert.equal(timeline.length, 3);
  assert.equal(items[0].annotation, null);
  assert.equal(items[1].annotation?.tactic, "긴급성 압박");
  assert.equal(items[1].annotation?.timeLabel, "12초 시점");
  assert.equal(items[2].annotation, null);
});

test("AC-038: deceivedMoments가 비어 있으면(한 번도 안 속음) 모든 항목의 annotation이 null이다", () => {
  const timeline = buildReplayTimeline(
    [{ id: "m0", role: "scammer", textMasked: "안녕하세요", turnIndex: 0 }],
    [],
  );
  assert.equal(messagesOf(timeline).every((item) => item.annotation === null), true);
  assert.deepEqual(getAnnotatedTurnIndexes(timeline), []);
});

test("AC-038: 입력 순서와 무관하게 turnIndex 오름차순으로 정렬한다(교차채널 세션의 단조 turnIndex 전제)", () => {
  const timeline = buildReplayTimeline(
    [
      { id: "m2", role: "scammer", textMasked: "b", turnIndex: 2, channel: "voice" },
      { id: "m0", role: "scammer", textMasked: "a", turnIndex: 0, channel: "messenger" },
      { id: "m1", role: "user", textMasked: "c", turnIndex: 1, channel: "messenger" },
    ],
    [],
  );
  assert.deepEqual(
    timeline.map((item) => item.id),
    ["m0", "m1", "m2"],
  );
});

test("AC-038: 주석이 달린 항목의 turnIndex만 순서대로 추출한다(스텝 내비게이션 대상)", () => {
  const timeline = buildReplayTimeline(
    [
      { id: "m0", role: "scammer", textMasked: "a", turnIndex: 0 },
      { id: "m1", role: "user", textMasked: "b", turnIndex: 1 },
      { id: "m2", role: "scammer", textMasked: "c", turnIndex: 2 },
      { id: "m3", role: "user", textMasked: "d", turnIndex: 3 },
    ],
    [
      { turnIndex: 1, timeLabel: "5초 시점", tactic: "t1", correctAction: "a1" },
      { turnIndex: 3, timeLabel: "20초 시점", tactic: "t2", correctAction: "a2" },
    ],
  );
  assert.deepEqual(getAnnotatedTurnIndexes(timeline), [1, 3]);
});

// ── T89(§15.1.5 (4)) — 통화 중 문자 이벤트 병합 ──────────────────────────────────
const CONVERSATION = [
  { id: "m0", role: "scammer" as const, textMasked: "a", turnIndex: 0 },
  { id: "m1", role: "user" as const, textMasked: "b", turnIndex: 1 },
  { id: "m2", role: "scammer" as const, textMasked: "c", turnIndex: 2 },
  { id: "m3", role: "user" as const, textMasked: "d", turnIndex: 3 },
];

function smsSource(overrides: Record<string, unknown> = {}) {
  return {
    smsId: "otp-1",
    kind: "otp" as const,
    senderLabel: "0507-000-0000",
    body: "인증번호 [482917]",
    anchorTurnIndex: 2,
    anchorResolved: true,
    timeLabel: "12초 시점",
    events: [{ event: "sms_received", what: "문자가 도착했습니다." }],
    ...overrides,
  };
}

test("[T89] 문자는 같은 앵커 메시지 **뒤**에 놓이고 메시지끼리의 상대 순서는 불변이다", () => {
  const timeline = buildReplayTimeline(CONVERSATION, [], [smsSource()]);
  assert.deepEqual(
    timeline.map((item) => item.id),
    ["m0", "m1", "m2", "sms-otp-1", "m3"],
  );
});

test("[T89 필수 회귀 §15.1.5 (2)②] 문자가 0건이면 결과가 도입 전과 완전히 동일하다", () => {
  const withoutArg = buildReplayTimeline(CONVERSATION, []);
  const withEmpty = buildReplayTimeline(CONVERSATION, [], []);
  assert.deepEqual(withEmpty, withoutArg);
  assert.deepEqual(withoutArg.map((i) => i.id), ["m0", "m1", "m2", "m3"]);
});

test("[T89] anchorTurnIndex -1(대화 맨 앞)이면 첫 메시지보다 앞에 놓인다", () => {
  const timeline = buildReplayTimeline(CONVERSATION, [], [smsSource({ anchorTurnIndex: -1 })]);
  assert.equal(timeline[0].id, "sms-otp-1");
});

test("[T89] 같은 앵커의 문자 여러 건은 서버가 준 배열 순서를 그대로 보존한다(화면이 재해석하지 않는다)", () => {
  const timeline = buildReplayTimeline(
    CONVERSATION,
    [],
    [smsSource({ smsId: "first" }), smsSource({ smsId: "second" })],
  );
  assert.deepEqual(
    timeline.map((item) => item.id),
    ["m0", "m1", "m2", "sms-first", "sms-second", "m3"],
  );
});

// ⚠️ G16 — 이 두 테스트가 T70(되감기)·T74(아카이브) 동반 파손을 막는 회귀 고정이다.
test("[G16] 문자 항목은 getAnnotatedTurnIndexes에 절대 포함되지 않는다(되감기 인덱스 1:1 전제 보호)", () => {
  const timeline = buildReplayTimeline(
    CONVERSATION,
    [{ turnIndex: 3, timeLabel: "20초 시점", tactic: "t", correctAction: "a" }],
    [smsSource({ anchorTurnIndex: 2 }), smsSource({ smsId: "link-1", anchorTurnIndex: 3 })],
  );
  // deceivedMoments가 1건이므로 목록도 정확히 1건이어야 한다(문자 2건이 섞이면 3이 된다).
  assert.deepEqual(getAnnotatedTurnIndexes(timeline), [3]);
});

test("[G16/AC-062] 속은 순간 0건 + 문자 있는 세션은 주석 목록이 비어 있다(되감기 진입점 미노출 근거)", () => {
  const timeline = buildReplayTimeline(CONVERSATION, [], [smsSource(), smsSource({ smsId: "s2" })]);
  assert.deepEqual(getAnnotatedTurnIndexes(timeline), []);
});

test("[G17] 앵커 메시지와 turnIndex가 같아도 문자 항목에는 주석이 붙지 않는다(주석 이중 렌더 방지)", () => {
  const timeline = buildReplayTimeline(
    CONVERSATION,
    [{ turnIndex: 2, timeLabel: "12초 시점", tactic: "t", correctAction: "a" }],
    [smsSource({ anchorTurnIndex: 2 })],
  );
  const annotated = timeline.filter(
    (item) => item.kind === "message" && item.annotation !== null,
  );
  assert.equal(annotated.length, 1, "같은 turnIndex를 공유해도 주석 카드는 메시지 1건에만 붙는다");
  const smsItem = timeline.find((item) => item.kind === "sms");
  assert.equal(
    (smsItem as unknown as Record<string, unknown>).annotation,
    undefined,
    "문자 항목에는 annotation 필드 자체가 없다",
  );
});
