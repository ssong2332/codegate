// T194-b(docs/Architecture.md §84.3.6 · §84.3.7 · §84.8 G570 · UX-008 v1.38 (1) · D-120) — "상대가 먼저 꺼낸 '내 정보'" 판정.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildPersonaBlock,
  personaMatchTokens,
  resolvePersonaBlockState,
  resolvePersonaFirstMentions,
  type PersonaTranscriptLine,
} from "../personaBlock";
import type { PersonaCard } from "../../shared/types";

const CARD: PersonaCard = {
  v: 1,
  items: [
    { key: "name", label: "이름", value: "김영숙" },
    { key: "birthYear", label: "출생 연도", value: "1961년생" },
    { key: "region", label: "사는 곳", value: "경상남도 ○○시" },
    { key: "bank", label: "거래 은행", value: "다온은행" },
    { key: "card", label: "사용 카드", value: "○○카드" },
  ],
};
const scammer = (turnIndex: number, textMasked: string, notSpoken?: true): PersonaTranscriptLine => ({
  role: "scammer",
  turnIndex,
  textMasked,
  ...(notSpoken ? { notSpoken } : {}),
});
const user = (turnIndex: number, textMasked: string): PersonaTranscriptLine => ({ role: "user", turnIndex, textMasked });

test("[G570] 대조 토큰 — 이름 전체 · 이름 2자 / 연도 4자리 · 두 자리 · 한글 읽기 / 도 이름 + 줄임말 / 은행명 / 가림 항목은 대조 제외", () => {
  assert.deepEqual(personaMatchTokens(CARD.items[0]!), ["김영숙", "영숙"]);
  assert.deepEqual(personaMatchTokens(CARD.items[1]!), ["1961", "61년", "육십일년"]);
  assert.deepEqual(personaMatchTokens(CARD.items[2]!), ["경상남도", "경남"]);
  assert.deepEqual(personaMatchTokens(CARD.items[3]!), ["다온은행"]);
  assert.deepEqual(personaMatchTokens(CARD.items[4]!), [], "○○카드는 고유 토큰이 없다");
  assert.deepEqual(personaMatchTokens({ key: "loan", label: "대출", value: "○○저축은행 대출 이용 중" }), []);
  assert.deepEqual(personaMatchTokens({ key: "birthYear", label: "출생 연도", value: "1970년생" }), ["1970", "70년", "칠십년"]);
});

test("[G570] 첫 언급 — 사기범이 먼저 말한 항목만 · 참가자가 먼저 말한 항목 제외 · notSpoken 줄 제외 · 가림 항목 제외", () => {
  const lines = [
    scammer(0, "여보세요, 김영숙 고객님 되시죠? 다온은행 쓰고 계신 걸로 확인됩니다.", true), // 듣지 못한 오프닝 — 제외
    scammer(1, "안녕하세요, 서울중앙지검입니다."),
    user(2, "네 제가 1961년생인데요"),
    scammer(3, "네, 61년생 김영숙 님 맞으시죠? ○○카드도 쓰시고요."),
    user(4, "경남 살아요"),
    scammer(5, "경상남도 쪽에 계시죠. 다온은행 거래하시고요."),
  ];
  const mentions = resolvePersonaFirstMentions(CARD.items, lines);
  assert.deepEqual(mentions, [
    { key: "name", scammerTurnIndex: 3 },
    { key: "bank", scammerTurnIndex: 5 },
  ]);
  // 역: notSpoken을 빼지 않으면 오프닝(0)이 앵커가 된다 — 제외 규칙이 실제로 일한다.
  const unfiltered = resolvePersonaFirstMentions(CARD.items, lines.map((l) => ({ role: l.role, turnIndex: l.turnIndex, textMasked: l.textMasked })));
  assert.equal(unfiltered.find((m) => m.key === "name")?.scammerTurnIndex, 0);
});

test("[G570] 상태 진리표 R-1~R-4 — 위에서부터 첫 일치 · R-1은 기록 ≥ 1에서만", () => {
  const rows: Array<[boolean, boolean, number, string | undefined]> = [
    [false, false, 0, undefined],
    [false, true, 3, undefined],
    [true, true, 0, "R-3"],
    [true, true, 2, "R-3"],
    [true, false, 1, "R-1"],
    [true, false, 4, "R-1"],
    [true, false, 0, "R-2"],
  ];
  for (const [hasCard, selfDialIntercepted, firstMentionCount, expected] of rows) {
    assert.equal(resolvePersonaBlockState({ hasCard, selfDialIntercepted, firstMentionCount }), expected, JSON.stringify({ hasCard, selfDialIntercepted, firstMentionCount }));
  }
});

test("[G570] 블록 — R-1은 먼저 말한 항목만(앵커 포함) · R-2는 카드 항목 전부(앵커 없음) · 카드 없으면 필드 부재", () => {
  const r1 = buildPersonaBlock(CARD, [scammer(1, "김영숙 님이시죠"), user(2, "네")], false)!;
  assert.equal(r1.state, "R-1");
  assert.deepEqual(r1.items, [{ key: "name", label: "이름", value: "김영숙", scammerTurnIndex: 1 }]);
  const r2 = buildPersonaBlock(CARD, [user(1, "김영숙입니다"), scammer(2, "김영숙 님 맞으시죠")], false)!;
  assert.equal(r2.state, "R-2", "참가자가 먼저 말했으면 단정하지 않는다(UF-014 Alternative (e))");
  assert.equal(r2.items.length, CARD.items.length);
  assert.ok(r2.items.every((i) => i.scammerTurnIndex === undefined));
  assert.equal(buildPersonaBlock(undefined, [scammer(1, "김영숙")], false), undefined);
  assert.equal(buildPersonaBlock({ v: 1, items: [] }, [], false), undefined);
});

test("[G570 역방향] 기록 없이 단정하는 사본(카드가 있으면 항상 R-1)은 R-2 샘플에서 진리표와 어긋난다", (t) => {
  const alwaysR1 = (i: { hasCard: boolean }) => (i.hasCard ? "R-1" : undefined);
  const sample = { hasCard: true, selfDialIntercepted: false, firstMentionCount: 0 };
  assert.notEqual(alwaysR1(sample), resolvePersonaBlockState(sample));
  t.diagnostic(`[G570 역방향] 기록 0 · 카드 있음 → 사본 ${alwaysR1(sample)} vs 정본 ${resolvePersonaBlockState(sample)} — 사본 실패 확인`);
});

test("[G570 배선] 리포트 생성이 이미 읽은 messages 스냅샷과 세션 카드로 1회 판정하고, 카드 없으면 필드를 만들지 않는다(소스 스캔)", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/report/generateReportCore.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /const personaBlock = buildPersonaBlock\(session\.personaCard, messages, false\);/);
  assert.match(src, /\.\.\.\(personaBlock \? \{ personaBlock \} : \{\}\),/);
  // messages 스냅샷이 notSpoken 표시를 싣는다(판정에서 빼기 위해).
  assert.match(src, /\.\.\.\(data\.notSpoken === true \? \{ notSpoken: true as const \} : \{\}\),/);
  const setAt = src.indexOf("await reportRef.set(reportDoc);");
  assert.ok(src.indexOf("const personaBlock = buildPersonaBlock(") < setAt, "판정은 리포트 write 앞");
});
