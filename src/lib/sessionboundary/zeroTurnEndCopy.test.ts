// §129 · UX D-160(에뮬레이터 점검 D18) — 0턴 종료 화면 문면 판정표 Z1 · Z2와 종료 화면 배선을 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isZeroTurnEnd,
  ZERO_TURN_CHALLENGE_TAIL,
  ZERO_TURN_DISPOSAL_STATUS,
  ZERO_TURN_REASSURANCE,
} from "./zeroTurnEndCopy.ts";

const END_PAGE = readFileSync("src/app/session/end/page.tsx", "utf8").replace(/\r\n/g, "\n");

test("[§129 D-160 Z1 · Z2] userTurnCount가 정확히 0일 때만 0턴 문면 — 1 이상 · 부재 · 숫자 아님 = 종전", () => {
  assert.equal(isZeroTurnEnd(0), true);
  for (const value of [1, 7, undefined, null, "0", Number.NaN]) assert.equal(isZeroTurnEnd(value), false, String(value));
});

test("[§129 D-160] 0턴 문면 — \"지금까지 대화한\" · \"훈련 중 사용된\" 표현 0 · 실제 피해 없음 안심 문장 유지", () => {
  for (const text of [ZERO_TURN_REASSURANCE, ZERO_TURN_CHALLENGE_TAIL, ZERO_TURN_DISPOSAL_STATUS]) {
    assert.equal(text.includes("지금까지 대화한"), false, text);
    assert.equal(text.includes("훈련 중 사용된"), false, text);
  }
  assert.ok(ZERO_TURN_REASSURANCE.includes("실제로 돈이나 개인정보가 오간 것은 없으니 안심하셔도 됩니다."));
  assert.ok(ZERO_TURN_CHALLENGE_TAIL.includes("실제로 돈이나 개인정보가 오간 것은 없으니 안심하셔도 됩니다."));
});

test("[§129 D-160 배선] 종료 화면이 리포트 userTurnCount로 0턴을 가르고 · 2인 문면은 정체 공개 앞머리를 그대로 둔다", () => {
  assert.match(END_PAGE, /setZeroTurn\(isZeroTurnEnd\(data\.userTurnCount\)\);/);
  assert.match(END_PAGE, /\{zeroTurn \? ZERO_TURN_DISPOSAL_STATUS : "훈련 중 사용된 음성·합성 파일은 폐기 절차가 시작되었습니다\."\}/);
  assert.match(
    END_PAGE,
    /challenge && zeroTurn \? \(\s*<>\s*\{challenge\.displayName\}님이 준비한 훈련이었습니다\. 실제 상황이 아니었습니다\. \{ZERO_TURN_CHALLENGE_TAIL\}/,
  );
  assert.match(END_PAGE, /zeroTurn \? \(\s*<>\{ZERO_TURN_REASSURANCE\}<\/>/);
});
