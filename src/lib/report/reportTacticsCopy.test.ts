// T189 · D-78 · AC-083 (b)·(e) — docs/UX.md UX-008 v1.31 노트 (6) 완료 판정 증거.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  countReplaySignalCards,
  replayNavEmptyText,
  SIGNAL_CARD_HEADING,
  TACTICS_NOT_FOUND_TEXT,
  tacticsAccordionLabel,
} from "./reportTacticsCopy.ts";
import { resolveMockScreenCopy } from "./mockScreenTimelineCopy.ts";
import type {
  ReplayDeceivedMomentSource,
  ReplayMockScreenSource,
  ReplayTimelineItem,
} from "../replay/buildReplayTimeline.ts";

// UX-008 v1.31 (3) 금지 문면. "신호가 없"은 "(위험) 신호가 없"로 읽히는 서술 전반을 잡는다.
const FORBIDDEN = ["0가지", "식별된 수법이 없습니다", "뚜렷한 위험 신호가 없었습니다", "신호가 없"];

function assertNoForbidden(text: string): void {
  for (const phrase of FORBIDDEN) {
    assert.equal(text.includes(phrase), false, `금지 문면 "${phrase}" 포함: ${text}`);
  }
}

// ── 글자 단위 정본(UX-008 v1.31 (1)) ───────────────────────────────────────
const TB3 = "시도된 수법 · 이름을 찾지 못함";
const TB4 = "이번 대화에서 시도된 수법을 이름으로 찾아내지 못했습니다. 수법이 없었다는 뜻은 아닙니다.";
const TB9a = "속은 순간이 없어 바로 이동할 지점이 없습니다. 아래 대화를 처음부터 읽어 보세요.";
const TB9b = "속은 순간이 없어 바로 이동할 지점이 없습니다. 아래 대화의 '여기가 신호였어요' 표시를 읽어 보세요.";
const TB9c =
  "속은 순간이 대화의 어느 말인지 확인하지 못해 바로 이동할 수 없습니다. 아래 대화를 처음부터 읽어 보세요.";
const TB9d =
  "속은 순간이 대화의 어느 말인지 확인하지 못해 바로 이동할 수 없습니다. 아래 대화의 '여기가 신호였어요' 표시를 읽어 보세요.";

test("TB-3: 수법 0개 → 아코디언 버튼 문면 글자 일치 + 금지 문면 0건", () => {
  assert.equal(tacticsAccordionLabel(0), TB3);
  assertNoForbidden(tacticsAccordionLabel(0));
});

test("TB-4/TB-7: 리포트 본문과 리플레이 상단 상자가 같은 문장(글자 일치) + 금지 문면 0건", () => {
  assert.equal(TACTICS_NOT_FOUND_TEXT, TB4);
  assertNoForbidden(TACTICS_NOT_FOUND_TEXT);
});

test("[역방향] TB-1: 수법 2개 → `시도된 수법 2가지` 무변경, 1개 → `1가지`", () => {
  assert.equal(tacticsAccordionLabel(2), "시도된 수법 2가지");
  assert.equal(tacticsAccordionLabel(1), "시도된 수법 1가지");
});

test("TB-9a~d: 속음 여부 × 신호카드수 4칸 글자 일치 + 금지 문면 0건", () => {
  assert.equal(replayNavEmptyText(false, 0), TB9a);
  assert.equal(replayNavEmptyText(false, 3), TB9b);
  assert.equal(replayNavEmptyText(true, 0), TB9c);
  assert.equal(replayNavEmptyText(true, 1), TB9d);
  for (const text of [TB9a, TB9b, TB9c, TB9d]) assertNoForbidden(text);
});

// ── 신호카드수(UX-008 v1.31 (2)) ─────────────────────────────────────────────
function sms(id: string, eventCount: number): ReplayTimelineItem {
  return {
    kind: "sms",
    id: `sms-${id}`,
    turnIndex: 0,
    sms: {
      smsId: id,
      kind: "link",
      senderLabel: "발신",
      body: "본문",
      anchorTurnIndex: 0,
      anchorResolved: true,
      events: Array.from({ length: eventCount }, (_, i) => ({ event: `e${i}`, what: "w" })),
    },
  };
}

function verify(id: string, eventCount: number): ReplayTimelineItem {
  return {
    kind: "verify",
    id: `verify-${id}`,
    turnIndex: 0,
    verify: {
      offerId: id,
      deskLabel: "창구",
      anchorTurnIndex: 0,
      anchorResolved: true,
      outcome: "offered_not_placed",
      events: Array.from({ length: eventCount }, (_, i) => ({ event: `v${i}`, what: "w" })),
    },
  };
}

function mock(id: string, fields: Partial<ReplayMockScreenSource>): ReplayTimelineItem {
  return {
    kind: "mockScreen",
    id: `mock-${id}`,
    turnIndex: 5,
    mockScreen: {
      landingId: id,
      kind: "credential-form",
      anchorTurnIndex: 5,
      anchorResolved: true,
      consented: false,
      ...fields,
    },
  };
}

function message(turnIndex: number, annotated: boolean): ReplayTimelineItem {
  return {
    kind: "message",
    id: `m${turnIndex}`,
    turnIndex,
    role: "scammer",
    textMasked: "말",
    annotation: annotated
      ? ({ turnIndex, timeLabel: "0:10", tactic: "긴급성", correctAction: "끊기" } satisfies ReplayDeceivedMomentSource)
      : null,
  };
}

/** 페이지와 같은 결합 — 렌더가 쓰는 `resolveMockScreenCopy(…, "replay")`를 그대로 넘긴다. */
function countWith(timeline: ReplayTimelineItem[], deceivedMoments: { turnIndex: number }[]): number {
  return countReplaySignalCards(timeline, (m) => resolveMockScreenCopy(m, deceivedMoments, "replay"));
}

test("신호카드수: 빈 타임라인 = 0", () => {
  assert.equal(countWith([], []), 0);
});

test("신호카드수: sms 분기 — 항목별 events.length 합(이벤트 0건 항목은 0장)", () => {
  assert.equal(countWith([sms("a", 2), sms("b", 1), sms("c", 0)], []), 3);
});

test("신호카드수: verify 분기 — 항목별 events.length 합", () => {
  assert.equal(countWith([verify("a", 1), verify("b", 2)], []), 3);
});

test("신호카드수: mockScreen 분기 — 가(consented)만 1장, 나(소제목 없음)·다(잘 대응한 지점)는 0장", () => {
  // 가: 권한 허용에 응함 → heading "⚠️ 여기가 신호였어요"
  assert.equal(countWith([mock("ga", { consented: true })], []), 1);
  // 나: 같은 순간 승격 있음 → heading 없음
  assert.equal(countWith([mock("na", {})], [{ turnIndex: 5 }]), 0);
  // 나(안전 폴백): 앵커 미해결 → heading 없음
  assert.equal(countWith([mock("na2", { anchorResolved: false })], []), 0);
  // 다: 승격 없음 + 미응낙 → heading "잘 대응한 지점" — 세지 않는다
  assert.equal(resolveMockScreenCopy({ anchorTurnIndex: 5, anchorResolved: true, consented: false }, [], "replay").heading, "잘 대응한 지점");
  assert.equal(countWith([mock("da", {})], []), 0);
});

test("신호카드수: 메시지 말풍선 주석(속은 순간)은 세지 않는다 — annotatedTurnIndexes의 몫", () => {
  assert.equal(countWith([message(1, true), message(2, false)], [{ turnIndex: 1 }]), 0);
});

test("신호카드수: 분기 혼합 합산", () => {
  const timeline = [message(1, false), sms("a", 2), verify("b", 1), mock("ga", { consented: true }), mock("da", { anchorTurnIndex: 9 })];
  assert.equal(countWith(timeline, []), 4);
});

test("SIGNAL_CARD_HEADING은 모의 화면 문구 표의 신호 소제목과 같은 문자열이다", () => {
  assert.equal(SIGNAL_CARD_HEADING, "⚠️ 여기가 신호였어요");
  assert.equal(
    resolveMockScreenCopy({ anchorTurnIndex: 0, anchorResolved: true, consented: true }, [], "replay").heading,
    SIGNAL_CARD_HEADING,
  );
});

// ── 소스 게이트: 페이지가 옛 금지 문면을 더 이상 그리지 않고, 판정 함수를 호출한다 ──────────
function codeOnly(path: string): string {
  // 주석 줄은 제외한다(설명 주석이 금지 문면을 인용할 수 있다).
  return readFileSync(new URL(path, import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

test("[소스] 리포트·리플레이 페이지에 금지 문면 리터럴 0건", () => {
  for (const path of ["../../app/report/page.tsx", "../../app/report/replay/page.tsx"]) {
    const code = codeOnly(path);
    for (const phrase of ["식별된 수법이 없습니다", "뚜렷한 위험 신호가 없었습니다", "신호가 없"]) {
      assert.equal(code.includes(phrase), false, `${path}: "${phrase}"`);
    }
    // 하드코딩된 `{n}가지` 템플릿이 남아 있지 않다(TB-1/TB-3 판정은 함수 하나가 소유).
    assert.equal(/\}가지/.test(code), false, `${path}: 하드코딩된 "{n}가지"`);
  }
});

test("[소스] 페이지가 판정 함수를 호출한다(배선)", () => {
  const report = codeOnly("../../app/report/page.tsx");
  assert.match(report, /tacticsAccordionLabel\(report\.tacticsUsed\.length\)/);
  assert.match(report, /\{TACTICS_NOT_FOUND_TEXT\}/);
  const replay = codeOnly("../../app/report/replay/page.tsx");
  assert.match(replay, /replayNavEmptyText\(report\.wasDeceived, signalCardCount\)/);
  assert.match(replay, /countReplaySignalCards\(timeline,/);
  assert.match(replay, /resolveMockScreenCopy\(mockScreen, deceivedMoments, "replay"\)/);
  assert.match(replay, /\{TACTICS_NOT_FOUND_TEXT\}/);
});
