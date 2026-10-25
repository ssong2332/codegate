// §129.10 (1) 큰 시계 안전장치 · (4) 리포트 타임라인 실제 시각 순(메인 라이브 재테스트 2026-10-24 · 빌드 cTcCpAsR).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareTimelineEntries } from "./timelineOrder.ts";

const read = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");

test("[§129.10 (4)] O1 — 시각이 이른 항목이 먼저('2분 15초 속음' → '2분 16초 문자 도착') · O2 — 같은 초 · 시각 없음은 종전 키", () => {
  const moment = { timeLabel: "135초 시점", sortKey: [7, 0, 0] as const };
  const sms = { timeLabel: "136초 시점", sortKey: [6, 1, 0] as const };
  assert.deepEqual([sms, moment].sort(compareTimelineEntries), [moment, sms]);
  const sameSecondSms = { timeLabel: "135초 시점", sortKey: [7, 1, 0] as const };
  assert.deepEqual([sameSecondSms, moment].sort(compareTimelineEntries), [moment, sameSecondSms], "같은 초 = 종류 순(순간 먼저)");
  const unresolved = { sortKey: [9, 1, 0] as const };
  assert.ok(compareTimelineEntries(moment, unresolved) < 0, "시각 없음 = 종전 키");
});

test("[§129.10 (1) · (4) 배선] 리포트가 실제 시각 비교로 정렬하고, 큰 시계는 프레임이 멈춰도 최종 값으로 맞춘다", () => {
  const page = read("src/app/report/page.tsx");
  assert.ok(page.includes("].sort(compareTimelineEntries);"));
  assert.ok(page.includes("timeLabel: sms.events[0]?.timeLabel ?? sms.timeLabel,"));
  const clock = read("src/components/ui/BigClock.tsx");
  assert.ok(clock.includes("window.setTimeout(() => setShown(seconds), duration + 100)"));
  assert.ok(clock.includes("window.clearTimeout(settle)"));
});

test("[§129.10 (4) 미러] timelineOrder는 값 import 없는 잎 모듈이고, 시각 파싱이 e2Layout과 같다", () => {
  const src = read("src/lib/report/timelineOrder.ts");
  assert.ok(!/^import (?!type )/m.test(src), "값 import 0건(앱 빌드 · strip-types 러너 둘 다 통과)");
  const body = (s: string) => s.slice(s.indexOf("parseMomentSeconds(timeLabel"), s.indexOf("return m ? Number(m[1]) : null;"));
  assert.equal(body(src), body(read("src/lib/design/e2Layout.ts")));
});
