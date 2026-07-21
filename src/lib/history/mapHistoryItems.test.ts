// node:test 단위 테스트 (Track B, T15, AC-016) — 프론트엔드에는 테스트 러너가 없어(T19 known gap,
// node:test는 JSX 불가) Node 내장 --experimental-strip-types로 컴파일 없이 이 순수 .ts 파일을
// 직접 실행한다. 실행: `npm test` (package.json 참고).
import test from "node:test";
import assert from "node:assert/strict";
import { mapReportsToHistoryItems } from "./mapHistoryItems.ts";

test("AC-016: 세션/리포트를 시간순 입력 그대로 화면 표시용 항목으로 변환한다", () => {
  const items = mapReportsToHistoryItems([
    {
      reportId: "r2",
      sessionId: "s2",
      wasDeceived: true,
      createdAt: new Date("2026-07-21T10:00:00+09:00"),
    },
    {
      reportId: "r1",
      sessionId: "s1",
      wasDeceived: false,
      createdAt: new Date("2026-07-20T09:00:00+09:00"),
    },
  ]);

  assert.equal(items.length, 2);
  assert.equal(items[0].reportId, "r2");
  assert.equal(items[0].sessionId, "s2");
  assert.equal(items[0].resultLabel, "속음");
  assert.match(items[0].dateLabel, /2026/);

  assert.equal(items[1].resultLabel, "안 속음");
});

test("AC-016: 기록 없음(빈 배열) → 빈 목록을 반환한다(Empty 상태 판단은 화면이 함)", () => {
  assert.deepEqual(mapReportsToHistoryItems([]), []);
});

test("createdAt이 없으면(방어적 처리) 날짜 미상으로 표시한다", () => {
  const items = mapReportsToHistoryItems([
    { reportId: "r3", sessionId: "s3", wasDeceived: false, createdAt: null },
  ]);
  assert.equal(items[0].dateLabel, "날짜 미상");
});
