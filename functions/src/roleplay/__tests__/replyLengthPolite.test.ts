// 사기범 대사 문장 상한 보강(2026-10-18) — 순수 함수 직접 테스트.
// (A) 공손한 종결어미 + 쉼표 + 공백을 문장 경계로 센다(오프닝 `안녕하십니까, …`가 3문장으로 세어져
//     상한이 안 걸렸다). (B) 상한 면제를 "예고 완료"를 마킹하는 지시 2종으로 좁힌다(문자 도착 턴 5문장).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { FallbackTurnChoice } from "../../verifyIntercept/fallbackTurn";
import {
  countSentences,
  limitReplySentences,
  POLITE_COMMA_ENDINGS,
  shouldLimitReplySentences,
} from "../replyLength";

const REBUILT_OPENING =
  "안녕하십니까, 서울중앙지검 김진우 수사관입니다. 다름이 아니라, 고객님 명의 계좌가 사건에 연루돼 연락드렸습니다. " +
  "현재 사안이 급하게 확인돼야 하는데, 혹시 지금 바로 확인 가능하십니까?";

test("[A 쉼표 경계] 재구성 오프닝은 4문장이고, 3문장으로 자르면 잘린 끝이 아닌 쉼표는 그대로다", () => {
  assert.equal(countSentences(REBUILT_OPENING), 4);
  const result = limitReplySentences(REBUILT_OPENING, 3);
  assert.equal(
    result.text,
    "안녕하십니까, 서울중앙지검 김진우 수사관입니다. 다름이 아니라, 고객님 명의 계좌가 사건에 연루돼 연락드렸습니다.",
  );
  assert.equal(result.originalSentences, 4);
  assert.equal(result.keptSentences, 3);
  assert.equal(result.trimmed, true);
});

test("[A 쉼표 경계] 잘린 끝이 쉼표 경계면 마침표로 끝낸다(1문장 상한)", () => {
  assert.equal(limitReplySentences(REBUILT_OPENING, 1).text, "안녕하십니까.");
  assert.equal(limitReplySentences("확인했어요， 그럼 진행하죠.", 1).text, "확인했어요.");
});

test("[A 판정표] 목록의 어미 10종 + 쉼표(반각·전각) + 공백은 모두 경계다", () => {
  assert.deepEqual(
    [...POLITE_COMMA_ENDINGS],
    ["니다", "니까", "세요", "에요", "예요", "어요", "아요", "해요", "지요", "죠"],
  );
  const samples: Record<(typeof POLITE_COMMA_ENDINGS)[number], string> = {
    니다: "알겠습니다",
    니까: "그렇습니까",
    세요: "들으세요",
    에요: "아니에요",
    예요: "저예요",
    어요: "있어요",
    아요: "좋아요",
    해요: "확인해요",
    지요: "그렇지요",
    죠: "그렇죠",
  };
  for (const [ending, word] of Object.entries(samples)) {
    assert.ok(word.endsWith(ending), `샘플이 어미로 끝나야 한다: ${word}`);
    assert.equal(countSentences(`${word}, 다음 말입니다`), 2, `반각 쉼표: ${word}`);
    assert.equal(countSentences(`${word}， 다음 말입니다`), 2, `전각 쉼표: ${word}`);
  }
});

test("[A 비경계] 목록 밖 연결(다름이 아니라, · 하는데, · 그런데요,)은 경계가 아니다", () => {
  assert.equal(countSentences("다름이 아니라, 연락드렸습니다."), 1);
  assert.equal(countSentences("확인돼야 하는데, 가능하십니까?"), 1);
  assert.equal(countSentences("그런데요, 지금 바로 하셔야 합니다."), 1);
  assert.equal(countSentences("고객님, 지금 확인되셨죠?"), 1);
});

test("[A 비경계] 쉼표 뒤에 공백이 없거나 쉼표가 문자열 끝이면 경계가 아니다", () => {
  assert.equal(countSentences("확인했습니다,그래서 연락드렸습니다."), 1);
  assert.equal(countSentences("알겠습니다,"), 1);
  assert.equal(limitReplySentences("알겠습니다,", 1).text, "알겠습니다,");
});

test("[A 무변경] 상한 이하이면 쉼표 경계가 있어도 입력 문자열을 그대로(===) 돌려준다", () => {
  const text = "안녕하십니까, 김진우 수사관입니다. 잠시 통화 가능하십니까?";
  assert.equal(countSentences(text), 3);
  const result = limitReplySentences(text);
  assert.ok(result.text === text);
  assert.equal(result.trimmed, false);
});

/** 판정표 정본(implementer 명세 2 변경 B). 순서·내용 모두 이 표가 기준이다. */
const LIMIT_TABLE: ReadonlyArray<readonly [FallbackTurnChoice, boolean]> = [
  ["none", true],
  ["sms_announce", true],
  ["verify_reconnect", true],
  ["verify_announce", false],
  ["install_consent", false],
];

/** 판정 함수가 표 전수와 일치하는가(오염본 역검증에 같은 식을 쓴다). */
function matchesLimitTable(predicate: (choice: FallbackTurnChoice) => boolean): boolean {
  return LIMIT_TABLE.every(([choice, expected]) => predicate(choice) === expected);
}

test("[B 판정표] shouldLimitReplySentences — 5종 전수(마킹하는 2종만 면제)", () => {
  for (const [choice, expected] of LIMIT_TABLE) {
    assert.equal(shouldLimitReplySentences(choice), expected, choice);
  }
  assert.equal(matchesLimitTable(shouldLimitReplySentences), true);
});

test("[B 역검증] 마킹 2종 면제가 빠지거나 넓어진 오염본은 같은 판정식이 실패시킨다", () => {
  // 무조건 적용 — verify_announce·install_consent 면제가 빠져 G343 재발.
  assert.equal(matchesLimitTable(() => true), false);
  // 한 종만 면제.
  assert.equal(matchesLimitTable((c) => c !== "verify_announce"), false);
  assert.equal(matchesLimitTable((c) => c !== "install_consent"), false);
  // 이전 조건(지시 4종 전부 면제) — 문자 도착 턴 5문장 재발.
  assert.equal(matchesLimitTable((c) => c === "none"), false);
});
