// §129.8 — (3) 사건 실제 시각 표기(사용자 결정 N3)와 (4) 되짚어보기 답 0 문면(N8)의 화면 배선을 소스로 고정한다(렌더 없는 러너).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NOT_ANSWERED_SENTENCE,
  UNANSWERED_REPLAY_FOOTER,
  UNANSWERED_REPLAY_INTRO,
  UNANSWERED_REPLAY_STATUS,
} from "./reportTacticsCopy.ts";

const read = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");

test("[§129.8 N3] 리포트 · 되짚어보기 문자 카드 시각 = 이벤트 실제 시각, 없으면 항목 앵커 시각(옛 리포트)", () => {
  for (const file of ["src/app/report/page.tsx", "src/app/report/replay/page.tsx"]) {
    const src = read(file);
    assert.ok(src.includes("formatMomentLabel(event.timeLabel ?? sms.timeLabel ?? \"\")"), file);
  }
  assert.ok(read("src/app/report/page.tsx").includes("events: { event: string; what: string; correctAction?: string; timeLabel?: string }[];"));
  assert.ok(read("src/lib/replay/buildReplayTimeline.ts").includes("events: { event: string; what: string; correctAction?: string; timeLabel?: string }[];"));
  assert.ok(read("functions/src/shared/types.ts").includes("timeLabel?: string;"));
});

test("[§129.8 N8] 되짚어보기 답 0 문면 — 리포트 NS-2와 같은 문장 · 일반 문구('어떻게 대응했는지' · '놓쳤을 수 있는') 0 · 같은 판정 함수", () => {
  assert.ok(UNANSWERED_REPLAY_STATUS.endsWith(NOT_ANSWERED_SENTENCE));
  for (const text of [UNANSWERED_REPLAY_STATUS, UNANSWERED_REPLAY_INTRO, UNANSWERED_REPLAY_FOOTER]) {
    assert.equal(/어떻게\s*대응했는지|놓쳤을 수 있는/.test(text), false, text);
  }
  const replay = read("src/app/report/replay/page.tsx");
  assert.ok(replay.includes("isUnansweredReport(report.wasDeceived, report.userTurnCount)"));
  assert.ok(replay.includes("{UNANSWERED_REPLAY_STATUS}"));
  assert.ok(replay.includes("? UNANSWERED_REPLAY_FOOTER"));
});
