import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupArchiveItemsByTactic,
  summarizeArchive,
  type ArchiveMomentSource,
  type ArchiveReportSource,
} from "./buildArchiveItems.ts";

// T74 / AC-068 · AC-069 — 실패 아카이브(UX-030 / UF-010)의 순간 단위 평탄화·수법별 묶기.

function moment(overrides: Partial<ArchiveMomentSource> = {}): ArchiveMomentSource {
  return {
    turnIndex: 1,
    timeLabel: "15초 시점",
    tactic: "긴급성 조성",
    correctAction: "전화를 끊고 직접 확인하세요.",
    tacticCategory: "urgency",
    ...overrides,
  };
}

function report(overrides: Partial<ArchiveReportSource> = {}): ArchiveReportSource {
  return {
    reportId: "report-1",
    sessionId: "session-1",
    // 로컬 시간 기준으로 만들어 타임존과 무관하게 "2026년 7월 20일"로 포맷되게 한다.
    createdAt: new Date(2026, 6, 20, 10, 0, 0),
    scenarioId: "loan-refinance-scam",
    channel: "voice",
    challengeId: null,
    deceivedMoments: [moment()],
    ...overrides,
  };
}

// ── AC-068 핵심: 세션 1건이 아니라 속은 순간 1건이 항목 1건 ────────────────────────────────
test("한 세션에서 3번 속았으면 항목 3개가 된다(AC-068 — 단위가 세션이 아니라 순간)", () => {
  const summary = summarizeArchive([
    report({
      deceivedMoments: [
        moment({ turnIndex: 1, timeLabel: "15초 시점" }),
        moment({ turnIndex: 3, timeLabel: "42초 시점", tactic: "확인 차단", tacticCategory: "verification_block" }),
        moment({ turnIndex: 5, timeLabel: "70초 시점", tactic: "송금 직접 요구", tacticCategory: "payment_demand" }),
      ],
    }),
  ]);

  assert.equal(summary.items.length, 3);
  assert.equal(summary.ownedReportCount, 1);
  assert.deepEqual(
    summary.items.map((item) => item.momentIndex),
    [0, 1, 2],
  );
  // 되감기(UX-028)가 지목할 수 있도록 항목마다 원 리포트 + 순간 인덱스가 유지된다.
  assert.deepEqual(
    summary.items.map((item) => item.key),
    ["report-1#0", "report-1#1", "report-1#2"],
  );
});

test("항목은 AC-026 3요소(시점·수법·올바른 대처) + 세션 메타를 담는다(P-23)", () => {
  const [item] = summarizeArchive([report()]).items;
  assert.equal(item.dateLabel, "2026년 7월 20일");
  assert.equal(item.timeLabel, "15초 시점");
  assert.equal(item.tactic, "긴급성 조성");
  assert.equal(item.correctAction, "전화를 끊고 직접 확인하세요.");
  assert.equal(item.scenarioId, "loan-refinance-scam");
  assert.equal(item.channel, "voice");
});

test("channel이 없는 기존 리포트는 voice로 간주한다(하위호환 — 부재=voice)", () => {
  const [item] = summarizeArchive([report({ channel: null })]).items;
  assert.equal(item.channel, "voice");
});

test("createdAt이 없으면 날짜 라벨을 지어내지 않고 비운다", () => {
  const [item] = summarizeArchive([report({ createdAt: null })]).items;
  assert.equal(item.dateLabel, "");
  assert.equal(item.createdAtMs, null);
});

// ── AC-069: 2인 챌린지(사용자2) 데이터 배제 ────────────────────────────────────────────────
test("challengeId가 있는 리포트는 항목으로 만들지 않는다(AC-069/AC-043/AC-055 — 협상 대상 아님)", () => {
  const summary = summarizeArchive([
    report({ reportId: "mine", challengeId: null }),
    report({
      reportId: "challenge-session",
      challengeId: "challenge-1",
      deceivedMoments: [moment(), moment(), moment()],
    }),
  ]);

  assert.equal(summary.items.length, 1);
  assert.equal(summary.items[0].reportId, "mine");
  assert.equal(summary.ownedReportCount, 1);
  assert.equal(summary.excludedChallengeReportCount, 1);
  assert.ok(
    summary.items.every((item) => item.reportId !== "challenge-session"),
    "챌린지 리포트의 순간이 단 1건도 섞이면 안 된다",
  );
});

test("모든 리포트가 챌린지 리포트면 항목도 본인 리포트 수도 0이다(빈 상태 A로 떨어진다)", () => {
  const summary = summarizeArchive([report({ challengeId: "c1" }), report({ challengeId: "c2" })]);
  assert.equal(summary.items.length, 0);
  assert.equal(summary.ownedReportCount, 0);
  assert.equal(summary.excludedChallengeReportCount, 2);
});

// ── 빈 상태 2종 구분(UX-030 States) ────────────────────────────────────────────────────────
test("훈련 이력 자체가 없으면 ownedReportCount=0(빈 상태 A)", () => {
  const summary = summarizeArchive([]);
  assert.equal(summary.items.length, 0);
  assert.equal(summary.ownedReportCount, 0);
});

test("훈련은 했지만 한 번도 안 속았으면 ownedReportCount>0 · items=0(빈 상태 B)", () => {
  const summary = summarizeArchive([report({ deceivedMoments: [] }), report({ reportId: "r2", deceivedMoments: [] })]);
  assert.equal(summary.items.length, 0);
  assert.equal(summary.ownedReportCount, 2);
});

// ── 수법별 묶기(AC-068 "같은 수법에 몇 번 넘어갔는지") ─────────────────────────────────────
test("표기가 달라도 같은 tacticCategory면 하나로 묶이고 반복 횟수가 정확하다(§15.4.2/G14)", () => {
  const summary = summarizeArchive([
    report({
      reportId: "r1",
      createdAt: new Date(2026, 6, 20),
      deceivedMoments: [moment({ tactic: "긴급성 조성", tacticCategory: "urgency" })],
    }),
    report({
      reportId: "r2",
      createdAt: new Date(2026, 6, 19),
      deceivedMoments: [moment({ tactic: "다급함 조성", tacticCategory: "urgency" })],
    }),
    report({
      reportId: "r3",
      createdAt: new Date(2026, 6, 18),
      deceivedMoments: [moment({ tactic: "마감 압박", tacticCategory: "urgency" })],
    }),
  ]);

  const groups = groupArchiveItemsByTactic(summary.items);
  assert.equal(groups.length, 1, "정규화가 없으면 여기서 3개로 흩어진다");
  assert.equal(groups[0].count, 3);
  // 표시 문구는 원문 유지 — 대표는 가장 최근 항목, 나머지 표기도 감추지 않는다.
  assert.equal(groups[0].label, "긴급성 조성");
  assert.deepEqual(groups[0].otherLabels, ["다급함 조성", "마감 압박"]);
});

test("tacticCategory가 없는 기존 리포트는 tactic 원문으로 묶인다(하위호환·무백필)", () => {
  const summary = summarizeArchive([
    report({ reportId: "r1", deceivedMoments: [moment({ tactic: "확인 차단", tacticCategory: undefined })] }),
    report({ reportId: "r2", deceivedMoments: [moment({ tactic: "확인 차단", tacticCategory: undefined })] }),
    report({ reportId: "r3", deceivedMoments: [moment({ tactic: "확인 절차 차단", tacticCategory: undefined })] }),
  ]);

  const groups = groupArchiveItemsByTactic(summary.items);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].label, "확인 차단");
});

test("other 카테고리는 한 덩어리로 뭉치지 않고 원문 라벨로 나뉜다(거짓 반복 횟수 방지)", () => {
  const summary = summarizeArchive([
    report({ reportId: "r1", deceivedMoments: [moment({ tactic: "약화된 사기 수법", tacticCategory: "other" })] }),
    report({ reportId: "r2", deceivedMoments: [moment({ tactic: "알 수 없는 수법", tacticCategory: "other" })] }),
  ]);

  const groups = groupArchiveItemsByTactic(summary.items);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => group.count),
    [1, 1],
  );
});

test("그룹은 반복 횟수가 많은 순으로 정렬된다(반복 인지가 이 화면의 핵심 가치)", () => {
  const summary = summarizeArchive([
    report({
      reportId: "r1",
      deceivedMoments: [
        moment({ tactic: "송금 직접 요구", tacticCategory: "payment_demand" }),
        moment({ tactic: "긴급성 조성", tacticCategory: "urgency" }),
        moment({ tactic: "마감 압박", tacticCategory: "urgency" }),
      ],
    }),
  ]);

  const groups = groupArchiveItemsByTactic(summary.items);
  assert.deepEqual(
    groups.map((group) => [group.label, group.count]),
    [
      ["긴급성 조성", 2],
      ["송금 직접 요구", 1],
    ],
  );
});

test("묶기는 항목을 잃거나 복제하지 않는다(총합 = 전체 항목 수)", () => {
  const summary = summarizeArchive([
    report({
      reportId: "r1",
      deceivedMoments: [
        moment({ tactic: "긴급성 조성", tacticCategory: "urgency" }),
        moment({ tactic: "확인 차단", tacticCategory: "verification_block" }),
        moment({ tactic: "다급함 조성", tacticCategory: "urgency" }),
      ],
    }),
    report({ reportId: "r2", deceivedMoments: [moment({ tactic: "송금 요구", tacticCategory: "payment_demand" })] }),
  ]);

  const groups = groupArchiveItemsByTactic(summary.items);
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  assert.equal(total, summary.items.length);
  assert.equal(total, 4);
  assert.equal(new Set(groups.flatMap((g) => g.items.map((i) => i.key))).size, 4);
});
