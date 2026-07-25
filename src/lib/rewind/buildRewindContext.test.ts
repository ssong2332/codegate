import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRewindContext, type RewindMessageSource } from "./buildRewindContext.ts";

// T70 / UX-028 / AC-062 — "속은 순간 앞뒤 몇 턴 + 문제의 그 대사 + 그때 내 답변"을 구성한다.

const MESSAGES: RewindMessageSource[] = [
  { id: "m0", role: "scammer", textMasked: "안녕하세요, 서울중앙지검입니다.", turnIndex: 0 },
  { id: "m1", role: "user", textMasked: "네?", turnIndex: 1 },
  { id: "m2", role: "scammer", textMasked: "계좌가 범죄에 연루됐습니다.", turnIndex: 2 },
  { id: "m3", role: "user", textMasked: "정말요?", turnIndex: 3 },
  { id: "m4", role: "scammer", textMasked: "지금 바로 계좌번호를 불러 주세요.", turnIndex: 4 },
  { id: "m5", role: "user", textMasked: "[계좌] 입니다.", turnIndex: 5 },
  { id: "m6", role: "scammer", textMasked: "확인됐습니다.", turnIndex: 6 },
];

const MOMENT = {
  turnIndex: 5,
  timeLabel: "42초 시점",
  tactic: "권위 사칭",
  correctAction: "전화를 끊고 공식 대표번호로 직접 확인하세요.",
};

test("buildRewindContext(): 문제의 사기범 대사와 그때 내 답변을 각각 짚어 준다", () => {
  const context = buildRewindContext(MESSAGES, MOMENT);
  assert.equal(context.scammerLine?.id, "m4");
  assert.equal(context.originalAnswer?.id, "m5");
  assert.equal(context.originalAnswer?.textMasked, "[계좌] 입니다.");
});

test("buildRewindContext(): 앞뒤 맥락 턴을 옵션 개수만큼 포함한다", () => {
  const context = buildRewindContext(MESSAGES, MOMENT, { before: 2, after: 1 });
  assert.deepEqual(
    context.turns.map((t) => t.id),
    ["m2", "m3", "m4", "m5", "m6"],
  );
  assert.deepEqual(
    context.turns.map((t) => t.kind),
    ["context", "context", "scammer-focus", "original-answer", "context"],
  );
  assert.equal(context.hasMoreBefore, true);
  assert.equal(context.hasMoreAfter, false);
});

test("buildRewindContext(): turnIndex가 연속이 아니어도 정렬 위치로 짝을 찾는다(채널 전이 대비)", () => {
  const gapped: RewindMessageSource[] = [
    { id: "a", role: "scammer", textMasked: "문자 확인하셨어요?", turnIndex: 10 },
    { id: "b", role: "user", textMasked: "네 바로 송금할게요.", turnIndex: 17 },
  ];
  const context = buildRewindContext(gapped, { ...MOMENT, turnIndex: 17 });
  assert.equal(context.scammerLine?.id, "a");
  assert.equal(context.originalAnswer?.id, "b");
});

test("buildRewindContext(): 해당 순간의 사용자 턴이 없으면 빈 맥락을 돌려준다(없는 대화를 지어내지 않음)", () => {
  const context = buildRewindContext(MESSAGES, { ...MOMENT, turnIndex: 99 });
  assert.deepEqual(context.turns, []);
  assert.equal(context.scammerLine, null);
  assert.equal(context.originalAnswer, null);
});

test("buildRewindContext(): 앞에 사기범 발화가 없어도 사용자 답변은 그대로 표시한다", () => {
  const onlyUser: RewindMessageSource[] = [
    { id: "u", role: "user", textMasked: "여보세요?", turnIndex: 0 },
  ];
  const context = buildRewindContext(onlyUser, { ...MOMENT, turnIndex: 0 });
  assert.equal(context.scammerLine, null);
  assert.equal(context.originalAnswer?.id, "u");
  assert.equal(context.turns.length, 1);
});

test("buildRewindContext(): 입력 배열을 변형하지 않는다(호출부의 원본 보존)", () => {
  const input = [...MESSAGES].reverse();
  const snapshot = input.map((m) => m.id);
  buildRewindContext(input, MOMENT);
  assert.deepEqual(
    input.map((m) => m.id),
    snapshot,
  );
});
