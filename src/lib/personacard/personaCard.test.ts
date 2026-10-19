// T194-b(docs/Architecture.md §84.3.3 · §84.3.7 · §84.8 G571 · PRD AC-104 (b)(d)(f) · UX-014 v1.38 (1)(3) · UX-008 v1.38 (1) · UX-018 v1.38 ①)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MASK_ACCESSIBLE_NAME,
  PERSONA_CARD_COPY,
  PERSONA_REPLAY_NOTE,
  PERSONA_REPORT_COPY,
  personaEventLogLine,
  personaReplayAnchor,
  readPersonaBlock,
  readSessionPersonaCard,
  resolvePersonaBlockCopy,
  splitMaskedValue,
} from "./personaCard.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const UX = read("../../../docs/UX.md");
/** 주석 줄 제외 코드(설명 주석이 문면을 인용할 수 있다 — reportTacticsCopy.test.ts 관례). */
const codeOnly = (rel: string) =>
  read(rel)
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");

const CARD = {
  v: 1,
  items: [
    { key: "name", label: "이름", value: "김영숙" },
    { key: "birthYear", label: "출생 연도", value: "1961년생" },
    { key: "region", label: "사는 곳", value: "경기도 ○○시" },
    { key: "bank", label: "거래 은행", value: "다온은행" },
  ],
};

test("[G571] 카드 · 리포트 · 리플레이 문면 = docs/UX.md 정본 글자 그대로(굵게 표기 안의 원문과 대조)", (t) => {
  const all = [...Object.values(PERSONA_CARD_COPY), ...Object.values(PERSONA_REPORT_COPY)];
  for (const text of all) assert.ok(UX.includes(`**${text}**`), `UX.md 정본에 없는 문면: ${text}`);
  assert.ok(UX.includes(`*${PERSONA_REPLAY_NOTE}*`), "리플레이 주석 문면");
  t.diagnostic(`[G571] 정본 대조 ${all.length + 1}건 일치`);
});

test("[G571 역방향] 한 글자 바꾼 사본은 정본 대조에서 걸린다", () => {
  const tampered = PERSONA_REPORT_COPY.r1Fact.replace("먼저", "미리");
  assert.equal(UX.includes(`**${tampered}**`), false);
});

test("[G571] 상태 → 문면: R-1 단정 · R-2 조건문 · R-3 대처만 '다른 전화로' · 공통 꼬리", () => {
  const r1 = resolvePersonaBlockCopy({ state: "R-1", items: [{ label: "이름", value: "김영숙", scammerTurnIndex: 3 }] });
  assert.equal(r1.title, PERSONA_REPORT_COPY.r1Title);
  assert.equal(r1.fact, PERSONA_REPORT_COPY.r1Fact);
  assert.equal(r1.action, PERSONA_REPORT_COPY.action);
  const r2 = resolvePersonaBlockCopy({ state: "R-2", items: [{ label: "이름", value: "김영숙" }] });
  assert.equal(r2.title, PERSONA_REPORT_COPY.r2Title);
  assert.equal(r2.explanation, PERSONA_REPORT_COPY.r2Explanation);
  const r3a = resolvePersonaBlockCopy({ state: "R-3", items: [{ label: "이름", value: "김영숙", scammerTurnIndex: 1 }] });
  assert.equal(r3a.title, PERSONA_REPORT_COPY.r1Title);
  assert.equal(r3a.action, PERSONA_REPORT_COPY.r3Action);
  const r3b = resolvePersonaBlockCopy({ state: "R-3", items: [{ label: "이름", value: "김영숙" }] });
  assert.equal(r3b.title, PERSONA_REPORT_COPY.r2Title);
  for (const c of [r1, r2, r3a, r3b]) assert.equal(c.tail, PERSONA_REPORT_COPY.tail);
});

test("[UF-014 Failure (a)(c) 클라 방어] 고급이 아닌 세션 · 모양이 다른 값 · 6행 이상은 그리지 않는다", () => {
  assert.deepEqual(readSessionPersonaCard(CARD, "advanced"), CARD.items.map(({ label, value }) => ({ label, value })));
  assert.equal(readSessionPersonaCard(CARD, "intermediate"), null);
  assert.equal(readSessionPersonaCard(CARD, undefined), null);
  assert.equal(readSessionPersonaCard(undefined, "advanced"), null);
  assert.equal(readSessionPersonaCard({ v: 2, items: CARD.items }, "advanced"), null);
  assert.equal(readSessionPersonaCard({ v: 1, items: [] }, "advanced"), null);
  assert.equal(readSessionPersonaCard({ v: 1, items: [...CARD.items, ...CARD.items] }, "advanced"), null);
  assert.equal(readSessionPersonaCard({ v: 1, items: [{ label: "이름", value: 3 }] }, "advanced"), null);
});

test("[UX-014 v1.38 (3)] 가림 '○○'은 조각으로 나뉘어 스크린리더 이름이 '가려진 이름'이 된다", () => {
  assert.deepEqual(splitMaskedValue("경기도 ○○시"), [
    { text: "경기도 ", masked: false },
    { text: "○○", masked: true },
    { text: "시", masked: false },
  ]);
  assert.deepEqual(splitMaskedValue("김영숙"), [{ text: "김영숙", masked: false }]);
  assert.equal(MASK_ACCESSIBLE_NAME, "가려진 이름");
});

test("[UX-018 v1.38 ①] 리플레이 앵커 — 기록이 있을 때만 가장 이른 사기범 줄 · R-2는 null · 부재는 null", () => {
  const r1 = readPersonaBlock({
    state: "R-1",
    items: [
      { key: "bank", label: "거래 은행", value: "다온은행", scammerTurnIndex: 5 },
      { key: "name", label: "이름", value: "김영숙", scammerTurnIndex: 3 },
    ],
  });
  assert.equal(personaReplayAnchor(r1), 3);
  assert.equal(personaReplayAnchor(readPersonaBlock({ state: "R-2", items: CARD.items })), null);
  assert.equal(personaReplayAnchor(readPersonaBlock(undefined)), null);
  assert.equal(readPersonaBlock({ state: "R-9", items: CARD.items }), null);
});

test("[T194-C10] 이벤트 로그 줄은 종류 · 상태 · 행 수만 싣는다(카드 값 0)", () => {
  const line = personaEventLogLine({ kind: "persona_card_shown", rows: 4 });
  assert.equal(line, '[persona-card] {"v":1,"kind":"persona_card_shown","rows":4}');
  const report = personaEventLogLine({ kind: "persona_report_block_shown", state: "R-1", rows: 2 });
  for (const item of CARD.items) assert.equal(report.includes(item.value), false);
});

test("[배선 · AC-104 (d)] 통화 화면은 세션 문서 스냅샷에서만 카드를 읽어 고지 화면에 넘기고, 클라 → 서버로 카드를 보내는 경로가 없다(소스 스캔)", () => {
  const play = codeOnly("../../app/session/play/page.tsx");
  assert.match(play, /setPersonaCard\(readSessionPersonaCard\(data\.personaCard, data\.difficultyLevel\)\);/);
  assert.match(play, /<CallStartNotice[\s\S]*?personaCard=\{personaCard\}/);
  const notice = codeOnly("../../components/CallStartNotice.tsx");
  for (const key of ["title", "guide", "noticeVirtual", "noticeNoRevisit"]) {
    assert.ok(notice.includes(`{PERSONA_CARD_COPY.${key}}`), `고지 화면이 ${key}를 그리지 않는다`);
  }
  // 카드 블록은 고지 ②(stopHint) 뒤 · 화면 모양 줄(DeviceSkinPicker) 앞.
  const hintAt = notice.indexOf("{PRE_CALL_NOTICE.stopHint}");
  const cardAt = notice.indexOf("{personaCard && (");
  const pickerAt = notice.indexOf("<DeviceSkinPicker");
  assert.ok(hintAt > -1 && cardAt > hintAt && pickerAt > cardAt, `순서: 고지② ${hintAt} → 카드 ${cardAt} → 화면 모양 ${pickerAt}`);
  // 클라 API 래퍼 · 콜러블 요청 어디에도 카드 필드가 없다.
  const api = ["../api/createSession.ts", "../api/types.ts"].map((rel) => codeOnly(rel)).join("\n");
  assert.equal(/personaCard/.test(api), false, "클라 API 층이 personaCard를 다룬다");
});

test("[배선] 리포트는 블록을 문면 함수로만 그리고(자리: 타임라인 아래 · 시도된 수법 위), 리플레이는 같은 앵커로 주석 · 신호 카드 수에 넣는다", () => {
  const report = codeOnly("../../app/report/page.tsx");
  assert.match(report, /personaBlock: readPersonaBlock\(data\.personaBlock\),/);
  const blockAt = report.indexOf("<ReportPersonaBlock block={report.personaBlock} />");
  const tacticsAt = report.indexOf('onClick={() => toggleSection("tactics")}');
  const timelineAt = report.indexOf('aria-label="속은 시점 타임라인"');
  assert.ok(timelineAt > -1 && blockAt > timelineAt && tacticsAt > blockAt, `자리: 타임라인 ${timelineAt} → 블록 ${blockAt} → 수법 ${tacticsAt}`);
  assert.match(report, /const copy = resolvePersonaBlockCopy\(block\);/);
  const replay = codeOnly("../../app/report/replay/page.tsx");
  assert.match(replay, /personaAnchor: personaReplayAnchor\(readPersonaBlock\(reportData\.personaBlock\)\),/);
  assert.match(replay, /\{PERSONA_REPLAY_NOTE\}/);
  assert.match(replay, /\(personaNoteRendered \? 1 : 0\)/);
});
