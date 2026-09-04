// §55 D3 — "말하지 않은 첫 대사" 마크 대상 선택 규칙(docs/Architecture.md §55.4 (1) 5·8ⓐ).
//
// 이 파일이 고정하는 것:
//   ⓐ 클라 플래그가 `true`일 때만 오프닝(`turnIndex:0` · `role:"scammer"`)이 마크 대상이 된다.
//   ⓐ' **부재·`false`면 대상 0건**(종전 동작 그대로 — 회귀 0).
//   ⭐ 역검증 — 서버가 "전사를 제출했다"는 사실만으로 추론하지 않는다(**G351**).
import { test } from "node:test";
import assert from "node:assert/strict";
import { findOpeningToMarkNotSpoken, type OpeningMarkCandidate } from "../openingMark";

/** 실시간 제출 시점의 `historySnap` 모양 — 오프닝 1건만 있는 상태(§55.2 (1)). */
const OPENING_ONLY: OpeningMarkCandidate[] = [{ role: "scammer", turnIndex: 0 }];

/** 이미 폴백 대화가 쌓인 세션(오프닝 + 텍스트 경로 대화). */
const WITH_HISTORY: OpeningMarkCandidate[] = [
  { role: "scammer", turnIndex: 0 },
  { role: "user", turnIndex: 1 },
  { role: "scammer", turnIndex: 2 },
];

test("§55 D3 ⓐ: 플래그가 true면 turnIndex 0의 사기범 문서가 마크 대상이다", () => {
  assert.equal(findOpeningToMarkNotSpoken(OPENING_ONLY, true), 0);
  assert.equal(findOpeningToMarkNotSpoken(WITH_HISTORY, true), 0);
});

test("§55 D3 ⓐ': 플래그가 부재·false면 마크 대상이 0건이다(종전 동작)", () => {
  assert.equal(findOpeningToMarkNotSpoken(OPENING_ONLY, undefined), -1);
  assert.equal(findOpeningToMarkNotSpoken(OPENING_ONLY, false), -1);
  assert.equal(findOpeningToMarkNotSpoken(WITH_HISTORY, undefined), -1);
  assert.equal(findOpeningToMarkNotSpoken(WITH_HISTORY, false), -1);
});

test("⭐ 역검증(G351): 서버는 히스토리만 보고 추론하지 않는다 — 같은 입력이라도 플래그가 갈린다", () => {
  // 같은 `historySnap`을 두 번 넣는다. 결과가 갈리는 유일한 원인은 **클라가 보낸 플래그**여야 한다.
  // 이 단언이 깨진다면 서버가 어떤 형태로든 자체 추론을 시작했다는 뜻이다 — 그 추론은 폴백으로
  // 강등된 세션에서 **참가자가 실제로 들은 대사를 지운다**(§55.0 3, N2).
  assert.notEqual(
    findOpeningToMarkNotSpoken(WITH_HISTORY, true),
    findOpeningToMarkNotSpoken(WITH_HISTORY, false),
  );
});

test("§55 D3: 오프닝이 사기범 문서가 아니면 마크하지 않는다(엉뚱한 문서 마크 금지)", () => {
  const userFirst: OpeningMarkCandidate[] = [
    { role: "user", turnIndex: 0 },
    { role: "scammer", turnIndex: 1 },
  ];
  assert.equal(findOpeningToMarkNotSpoken(userFirst, true), -1);
  // 오프닝 문서가 아예 없는 경우(방어적) — 예외 없이 -1.
  assert.equal(findOpeningToMarkNotSpoken([], true), -1);
});
