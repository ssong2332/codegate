// T194-b(docs/Architecture.md §84.3.6 · §84.3.7 · §84.8 G570 · UX-008 v1.38 (1) · D-120) — "상대가 먼저 꺼낸 '내 정보'" 판정.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildPersonaBlock,
  personaMatchTokens,
  regionMentioned,
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
  // §88 — 사기범 쪽 이름 토큰은 성 뺀 이름에 호칭이 붙은 꼴만(일상어 거짓 양성 방지). 참가자 쪽은 성 뺀 이름 그대로도 센다.
  assert.deepEqual(personaMatchTokens(CARD.items[0]!), ["김영숙", "영숙님", "영숙 님", "영숙씨", "영숙 씨"]);
  assert.deepEqual(personaMatchTokens(CARD.items[1]!), ["1961", "61년", "육십일년"]);
  assert.deepEqual(personaMatchTokens(CARD.items[2]!), ["경상남도", "경남"]);
  assert.deepEqual(personaMatchTokens(CARD.items[3]!), ["다온은행"]);
  assert.deepEqual(personaMatchTokens(CARD.items[4]!), [], "○○카드는 고유 토큰이 없다");
  assert.deepEqual(personaMatchTokens({ key: "loan", label: "대출", value: "○○저축은행 대출 이용 중" }), []);
  assert.deepEqual(personaMatchTokens({ key: "birthYear", label: "출생 연도", value: "1970년생" }), ["1970", "70년", "칠십년"]);
  // §88 후속 — 생년월일: 연도 토큰 + "월 일생"(끝 "생"까지 — 날짜만으로는 세지 않는다).
  assert.deepEqual(personaMatchTokens({ key: "birthDate", label: "생년월일", value: "1965년 3월 2일생" }), [
    "1965",
    "65년",
    "육십오년",
    " 3월 2일생",
    " 3월2일생",
  ]);
  // 리뷰 Minor 1 — "2월 2일생" 카드가 다른 날짜 "12월 2일생"에 부분 일치하지 않는다.
  const feb2 = [{ key: "birthDate" as const, label: "생년월일", value: "1970년 2월 2일생" }];
  assert.deepEqual(resolvePersonaFirstMentions(feb2, [scammer(1, "고객님 12월 2일생이라고 돼 있네요"), user(2, "네")]), []);
  assert.deepEqual(resolvePersonaFirstMentions(feb2, [scammer(1, "고객님 2월 2일생 맞으시죠"), user(2, "네")]), [{ key: "birthDate", scammerTurnIndex: 1 }]);
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
  // §92 — 네 번째 인자 = 카탈로그 카드 종류에서 고른 협박형 context(기관형 · 대상 밖 = undefined).
  assert.match(
    src,
    /const personaKind = personaCardKind\(session\.scenarioId\);\n\s*const personaBlock = buildPersonaBlock\(\n\s*session\.personaCard,\n\s*messages,\n\s*false,\n\s*personaKind === "child-threat" \|\| personaKind === "self-threat" \? personaKind : undefined,\n\s*\);/,
  );
  assert.match(src, /\.\.\.\(personaBlock \? \{ personaBlock \} : \{\}\),/);
  // messages 스냅샷이 notSpoken 표시를 싣는다(판정에서 빼기 위해).
  assert.match(src, /\.\.\.\(data\.notSpoken === true \? \{ notSpoken: true as const \} : \{\}\),/);
  const setAt = src.indexOf("await reportRef.set(reportDoc);");
  assert.ok(src.indexOf("const personaBlock = buildPersonaBlock(") < setAt, "판정은 리포트 write 앞");
});

// ── §88(DECISIONS #199 · UX D-131) — 사용자 입력 카드(v2) ─────────────────────────────

const INPUT_CARD: PersonaCard = {
  v: 2,
  inputBy: "sender",
  items: [
    { key: "name", label: "이름", value: "이하나" },
    { key: "birthYear", label: "출생 연도", value: "1962년생" },
    { key: "region", label: "사는 곳", value: "부산광역시" },
  ],
};

test("[§88] v2 카드 — 시 · 도 정식 명칭 값도 줄임말로 대조되고, 블록에 inputBy가 실린다(v1은 부재)", () => {
  assert.deepEqual(personaMatchTokens(INPUT_CARD.items[2]!), ["부산광역시", "부산"]);
  const block = buildPersonaBlock(INPUT_CARD, [scammer(1, "부산 사시는 62년생 이하나 님 맞으시죠?"), user(2, "네")], false)!;
  assert.equal(block.state, "R-1");
  assert.equal(block.inputBy, "sender");
  assert.deepEqual(block.items.map((i) => i.key), ["name", "birthYear", "region"]);
  assert.equal(buildPersonaBlock(CARD, [user(1, "네")], false)!.inputBy, undefined);
});

test("[§88] 성 뺀 이름이 일상어와 겹쳐도(\"하나만 여쭤볼게요\") 사기범 '먼저 말함'으로 세지 않고, 참가자가 성 뺀 이름을 먼저 말하면 참가자 먼저로 본다", () => {
  const nameOnly: PersonaCard = { v: 2, inputBy: "self", items: [INPUT_CARD.items[0]!] };
  assert.deepEqual(resolvePersonaFirstMentions(nameOnly.items, [scammer(1, "하나만 여쭤볼게요"), user(2, "네")]), []);
  assert.deepEqual(resolvePersonaFirstMentions(nameOnly.items, [user(1, "하나라고 해요"), scammer(2, "하나 님, 확인됐습니다")]), []);
  assert.deepEqual(resolvePersonaFirstMentions(nameOnly.items, [scammer(1, "하나 님 맞으시죠?"), user(2, "네")]), [
    { key: "name", scammerTurnIndex: 1 },
  ]);
});

test("[§88 후속] 생년월일 행 — 사기범이 \"65년 3월 2일생\"으로 먼저 말하면 R-1 · 결제일로 \"3월 2일\"만 말하면 세지 않는다", () => {
  const card: PersonaCard = { v: 2, inputBy: "self", items: [{ key: "birthDate", label: "생년월일", value: "1965년 3월 2일생" }] };
  const block = buildPersonaBlock(card, [scammer(1, "고객님 65년 3월 2일생 맞으시죠?"), user(2, "네")], false)!;
  assert.equal(block.state, "R-1");
  assert.deepEqual(block.items, [{ key: "birthDate", label: "생년월일", value: "1965년 3월 2일생", scammerTurnIndex: 1 }]);
  assert.deepEqual(resolvePersonaFirstMentions(card.items, [scammer(1, "3월 2일에 결제된 건이 있습니다"), user(2, "네")]), []);
  assert.equal(buildPersonaBlock(card, [scammer(1, "3월 2일에 결제된 건이 있습니다"), user(2, "네")], false)!.state, "R-2");
});

// 2026-10-21 메인 세션 라이브 실측 — 사기범이 "서울중앙지방검찰청"이라고만 말했는데 "사는 곳: 서울특별시"가 먼저 말한 정보로 표시됐다.
test("[2026-10-21 지역 부분 일치] 기관명 · 은행명 안의 지명은 '사는 곳을 먼저 말함'으로 세지 않는다", () => {
  const card: PersonaCard = {
    v: 2,
    inputBy: "self",
    items: [
      { key: "name", label: "이름", value: "홍길순" },
      { key: "birthDate", label: "생년월일", value: "1962년 3월 2일생" },
      { key: "region", label: "사는 곳", value: "서울특별시" },
    ],
  };
  const lines = [
    scammer(0, "홍길순 님 되시죠? 서울중앙지방검찰청 수사관입니다."),
    user(1, "네 맞는데요"),
    scammer(2, "서울경찰청과 공조 중인 사건이라 협조 부탁드립니다."),
  ];
  const block = buildPersonaBlock(card, lines, false)!;
  assert.equal(block.state, "R-1");
  assert.deepEqual(block.items.map((i) => i.key), ["name"], "이름만 — 사는 곳은 기관명 안이라 제외");

  const seoul = personaMatchTokens(card.items[2]!);
  const seoulSays = (text: string) => seoul.some((tk) => regionMentioned(text, tk));
  // 기관명 · 고유명사 안(붙여 씀 · 띄어 씀 — 리뷰 Major 1 · 2).
  for (const text of [
    "서울중앙지방검찰청", "서울경찰청", "서울특별시경찰청", "서울 중앙지방검찰청", "서울 경찰청", "서울 지방법원",
    "서울은평경찰서", "서울도봉경찰서", "서울이랜드", "서울사이버대",
  ]) {
    assert.equal(seoulSays(text), false, text);
  }
  assert.equal(regionMentioned("부산은행 계좌로", "부산"), false, "은행명");
  // 주소 문맥 · 줄 끝 · 문장부호.
  for (const text of [
    "서울 사시죠?", "서울에 거주하시고요", "서울이시고", "지금 서울사시는", "서울특별시에 사시는", "서울, 맞으시죠", "서울시에 계시죠",
    "사시는 곳이 서울", "사시는 데가 서울시", "서울시?", "서울인데요", "서울 출신이시죠",
  ]) {
    assert.equal(seoulSays(text), true, text);
  }
  assert.equal(regionMentioned("대전광역시 거주하시는", "대전광역시"), true);
  assert.equal(regionMentioned("부산 쪽에 사시죠", "부산"), true);
  assert.equal(regionMentioned("부산쪽이시죠", "부산"), true);
  // 주소 문맥으로 말하면 그대로 R-1에 든다.
  const said = buildPersonaBlock(card, [scammer(0, "서울에 사시는 홍길순 님 맞으시죠?"), user(1, "네")], false)!;
  assert.deepEqual(said.items.map((i) => i.key).sort(), ["name", "region"]);
});

// ── §92(2026-10-21 · 대상 확대 — 협박형 2종) — 새 행 토큰 · 협박형 context ──────────────────────────────

const CHILD_CARD: PersonaCard = {
  v: 2,
  inputBy: "self",
  items: [
    { key: "childName", label: "자녀 이름", value: "김민준" },
    { key: "childGrade", label: "자녀 학년", value: "초등학교 3학년" },
    { key: "childAcademy", label: "자녀가 다니는 학원", value: "영어학원" },
  ],
};

test("[§92 · 리뷰 Major 1 · 2] 자녀 행 토큰 — 부르는 꼴 + 뒤 낱말 앵커만(프롬프트 대사와 일치) · 일상어(하나는 · 보람이 있다) 0", () => {
  const [child, grade, academy] = CHILD_CARD.items;
  const tokens = personaMatchTokens(child!);
  for (const t of ["김민준", "민준이 지금", "민준이가 지금", "민준이를 데리고"]) assert.ok(tokens.includes(t), t);
  assert.equal(tokens.includes("민준"), false, "맨몸은 사기범 쪽 토큰이 아니다");
  // 받침 없는 이름 — 프롬프트 대사 "'지우 지금 여기 있습니다'"가 잡혀야 한다(Major 1).
  const jiwoo = { key: "childName", label: "자녀 이름", value: "이지우" } as const;
  const said = buildPersonaBlock({ v: 2, inputBy: "self", items: [jiwoo] }, [scammer(0, "지우 지금 여기 있습니다."), user(1, "네?")], false, "child-threat")!;
  assert.equal(said.state, "R-1");
  // 일상어와 겹치는 이름 — 조사 꼴만으로는 세지 않는다(Major 2).
  for (const [value, line] of [
    ["김하나", "하나는 확실합니다. 하나도 못 건집니다."],
    ["이보람", "협조하시면 보람이 있을 거예요."],
    ["하늘", "하늘이 두 쪽 나도 오늘 안에 보내세요."],
  ] as const) {
    const card: PersonaCard = { v: 2, inputBy: "self", items: [{ key: "childName", label: "자녀 이름", value }] };
    assert.equal(buildPersonaBlock(card, [scammer(0, line), user(1, "네")], false, "child-threat")!.state, "R-2", `${value}: ${line}`);
  }
  // 2자 이름도 부르는 꼴 앵커로는 센다.
  const twoChar: PersonaCard = { v: 2, inputBy: "self", items: [{ key: "childName", label: "자녀 이름", value: "하늘" }] };
  assert.equal(buildPersonaBlock(twoChar, [scammer(0, "하늘이 지금 여기 있어요."), user(1, "네?")], false, "child-threat")!.state, "R-1");
  assert.deepEqual(personaMatchTokens(grade!), ["초등학교 3학년", "초등 3학년", "초3"]);
  assert.deepEqual(personaMatchTokens({ key: "childGrade", label: "자녀 학년", value: "유치원생" }), ["유치원"]);
  assert.deepEqual(personaMatchTokens(academy!), ["영어학원", "영어 학원"]);
  assert.deepEqual(personaMatchTokens({ key: "job", label: "하는 일", value: "공무원" }), ["공무원"]);
});

test("[§92] 협박형 블록 — 협박범이 먼저 댄 자녀 정보 = R-1 · context가 실린다 · 참가자가 먼저 말한 이름은 세지 않는다 · 부재 = 기관형", () => {
  const first = buildPersonaBlock(
    CHILD_CARD,
    [scammer(0, "민준이 지금 여기 있어요. 초3이죠? 영어학원 끝나고 데려왔어요."), user(1, "네? 우리 민준이요?")],
    false,
    "child-threat",
  )!;
  assert.equal(first.state, "R-1");
  assert.equal(first.context, "child-threat");
  assert.deepEqual(first.items.map((i) => i.key), ["childName", "childGrade", "childAcademy"]);
  // 참가자가 먼저 이름을 말하고 협박범이 되받으면 "먼저 꺼냄"이 아니다(카드 없음 꼴과 같은 판정).
  const echoed = buildPersonaBlock(CHILD_CARD, [scammer(0, "아이 데리고 있어요."), user(1, "민준이요?"), scammer(2, "네, 민준이 여기 있어요.")], false, "child-threat")!;
  assert.equal(echoed.state, "R-2");
  assert.equal(echoed.context, "child-threat");
  // 기관형 = context 부재(종전 문면).
  assert.equal(buildPersonaBlock(INPUT_CARD, [user(0, "네")], false)!.context, undefined);
  const self = buildPersonaBlock(
    { v: 2, inputBy: "sender", items: [{ key: "name", label: "이름", value: "이하나" }, { key: "job", label: "하는 일", value: "교사" }] },
    [scammer(0, "이하나 씨, 교사시죠? 다 알고 있어요."), user(1, "누구세요")],
    false,
    "self-threat",
  )!;
  assert.equal(self.state, "R-1");
  assert.equal(self.context, "self-threat");
  assert.deepEqual(self.items.map((i) => i.key), ["name", "job"]);
});
