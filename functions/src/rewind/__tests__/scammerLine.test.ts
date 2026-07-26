// 되감기 대사 선택 규칙 — §15.9.7 G57 수정의 회귀 고정 (T84, AC-062/AC-063).
//
// 고정하는 것은 두 가지다:
//   (1) **기존 동작 불변**: 앵커가 사용자 턴인 기존 순간에서는 결과가 한 글자도 바뀌지 않는다
//       (시작점을 `position`으로 일반화해도 그 자리는 user라 절대 매치되지 않는다).
//   (2) **G57 해소**: 앵커가 **사기범 턴**(T84가 합성하는 모의 설치 응낙 순간)이면 **그 메시지
//       자신**을 집는다 — 예전 구현은 한 칸 앞의 다른 사기범 대사를 집었다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickScammerLineForMoment, type ScammerLineMessage } from "../scammerLine";

/** scammer(0) user(1) scammer(2) user(3) — 실제 저장 형태와 같은 교대 배열. */
const messages: ScammerLineMessage[] = [
  { role: "scammer", turnIndex: 0, textMasked: "지원금 대상자로 확인되셨습니다" },
  { role: "user", turnIndex: 1, textMasked: "그래요?" },
  { role: "scammer", turnIndex: 2, textMasked: "설치하셔야 접수가 됩니다" },
  { role: "user", turnIndex: 3, textMasked: "알겠습니다" },
];

/** ⚠️ 수정 **전** 구현(시작점 `position - 1`)을 그대로 재현한 대조군. */
function legacyPick(msgs: readonly ScammerLineMessage[], momentTurnIndex: number): string {
  const position = msgs.findIndex((m) => m.turnIndex === momentTurnIndex);
  if (position < 0) return "";
  for (let i = position - 1; i >= 0; i -= 1) {
    if (msgs[i].role === "scammer") return msgs[i].textMasked;
  }
  return "";
}

test("[회귀 0] 사용자 턴 앵커에서는 수정 전후 결과가 완전히 동일하다", () => {
  for (const userTurn of [1, 3]) {
    assert.equal(
      pickScammerLineForMoment(messages, userTurn),
      legacyPick(messages, userTurn),
      `turnIndex ${userTurn}: 기존 순간의 결과가 바뀌면 안 된다`,
    );
  }
  assert.equal(pickScammerLineForMoment(messages, 1), "지원금 대상자로 확인되셨습니다");
  assert.equal(pickScammerLineForMoment(messages, 3), "설치하셔야 접수가 됩니다");
});

test("[G57] 사기범 턴 앵커에서 **그 메시지 자신**을 집는다(예전 구현은 한 칸 앞을 집었다)", () => {
  assert.equal(pickScammerLineForMoment(messages, 2), "설치하셔야 접수가 됩니다");
  assert.equal(
    legacyPick(messages, 2),
    "지원금 대상자로 확인되셨습니다",
    "이것이 G57이 지적한 오작동이다 — 수정 후에는 나오지 않아야 한다",
  );
  assert.notEqual(pickScammerLineForMoment(messages, 2), legacyPick(messages, 2));
});

test("대화 맨 앞 사기범 턴 앵커에서도 그 대사를 집는다(예전엔 빈 문자열)", () => {
  assert.equal(pickScammerLineForMoment(messages, 0), "지원금 대상자로 확인되셨습니다");
  assert.equal(legacyPick(messages, 0), "");
});

test("앵커를 찾지 못하면 빈 문자열(비차단, P-4)", () => {
  assert.equal(pickScammerLineForMoment(messages, 99), "");
  assert.equal(pickScammerLineForMoment([], 0), "");
});

test("turnIndex가 연속이 아니어도(채널 전이) 정렬 위치로 찾는다", () => {
  const crossChannel: ScammerLineMessage[] = [
    { role: "scammer", turnIndex: 0, textMasked: "메신저 대사" },
    { role: "user", turnIndex: 1, textMasked: "네" },
    { role: "scammer", turnIndex: 7, textMasked: "통화 대사" },
    { role: "user", turnIndex: 8, textMasked: "알겠습니다" },
  ];
  assert.equal(pickScammerLineForMoment(crossChannel, 8), "통화 대사");
  assert.equal(pickScammerLineForMoment(crossChannel, 7), "통화 대사");
});
