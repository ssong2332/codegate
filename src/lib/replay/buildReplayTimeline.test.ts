// node:test 단위 테스트 (T33, UX-018, AC-038) — src/lib/history/mapHistoryItems.test.ts와 동일한
// 실행 방식(Node 내장 --experimental-strip-types, 프론트엔드 테스트 러너 부재 우회, T19 known gap).
// 실행: `npm test` (package.json 참고).
import test from "node:test";
import assert from "node:assert/strict";
import { buildReplayTimeline, getAnnotatedTurnIndexes } from "./buildReplayTimeline.ts";

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

  assert.equal(timeline.length, 3);
  assert.equal(timeline[0].annotation, null);
  assert.equal(timeline[1].annotation?.tactic, "긴급성 압박");
  assert.equal(timeline[1].annotation?.timeLabel, "12초 시점");
  assert.equal(timeline[2].annotation, null);
});

test("AC-038: deceivedMoments가 비어 있으면(한 번도 안 속음) 모든 항목의 annotation이 null이다", () => {
  const timeline = buildReplayTimeline(
    [{ id: "m0", role: "scammer", textMasked: "안녕하세요", turnIndex: 0 }],
    [],
  );
  assert.equal(timeline.every((item) => item.annotation === null), true);
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
