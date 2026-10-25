// §132.14(DECISIONS #248 · 메인 라이브 2026-10-25 · 자녀 납치 협박 초급 fv-c5ih · 텍스트 폴백 오프닝) — "거기 혹시 김맞으세요?":
// 모델이 쓴 "김○○ 씨"에서 4-e가 "○○ 씨"만 지워 성이 남았다. 성 + 자리표시를 한 덩어리로 정리한다(폴백 4-f · Live 2-e).
import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyScammerReplyMarkup } from "../replyMarkup";
import { stripLeakedThought } from "../../realtime/thoughtLeak";

test("[§132.14] 라이브 오프닝 재현 — '김○○ 씨 맞으세요'는 성째 '본인 맞으세요'로(폴백 · Live 같은 결과)", () => {
  const live = "여보세요, 거기 혹시 김○○ 씨 맞으세요? 저는 시내 ○○경찰서 사이버수사팀 담당자입니다.";
  const expected = "여보세요, 거기 혹시 본인 맞으세요? 저는 시내 경찰서 사이버수사팀 담당자입니다.";
  assert.equal(tidyScammerReplyMarkup(live).text, expected, "폴백 · 오프닝");
  assert.equal(stripLeakedThought(live), expected, "Live 전사 · 자막");});

test("[§132.14] 성 + 자리표시 — 호칭 · 조사 · 직함 · 주어 자기소개 · 반말 자기소개", () => {
  const both: ReadonlyArray<readonly [string, string]> = [
    ["김○○ 씨는 지금 제 말 잘 들으세요.", "본인은 지금 제 말 잘 들으세요."],
    ["이○○ 씨가 직접 오셔야 합니다.", "본인이 직접 오셔야 합니다."],
    ["김○○ 씨 본인 맞으세요?", "본인 맞으세요?"],
    ["박○○님 맞으시죠?", "고객님 맞으시죠?"],
    ["저는 서울중앙지검 김○○ 수사관입니다.", "저는 서울중앙지검 김 수사관입니다."],
    ["저는 ○○○ 수사관입니다.", "저는 수사관입니다."],
  ];
  for (const [input, out] of both) {
    assert.equal(tidyScammerReplyMarkup(input).text, out, input);
    assert.equal(stripLeakedThought(input), out, `Live: ${input}`);
  }
  // 자기소개형은 폴백(4-d · 4-f)만 다룬다 — Live 사본에는 자기소개 행이 없다(§132.14 남은 것).
  for (const [input, out] of [
    ["저는 김○○입니다.", "저는 담당자입니다."],
    ["저는 ○○○입니다.", "저는 담당자입니다."],
    ["상담원 이○○입니다.", "상담원입니다."],
    ["나 김○○야.", "나야."],
  ] as const) {
    assert.equal(tidyScammerReplyMarkup(input).text, out, input);
  }
});

test("[§132.14] 그대로 둘 것 — 가린 학원 표기 · 이름 되받기 틀 · OO은행 · 성 앞이 한글인 낱말", () => {
  for (const keep of ["○○학원 앞이에요.", "○○이 지금 여기 있습니다.", "OO은행 948-2716-5093-27로 넣어요."]) {
    assert.equal(tidyScammerReplyMarkup(keep).text, keep, keep);
    assert.equal(stripLeakedThought(keep), keep, `Live: ${keep}`);
  }
  // "사장" 끝 글자 "장"은 성 목록에 있지만 앞 글자가 한글이라 성으로 보지 않는다(종전 4-d 동작 그대로).
  assert.equal(tidyScammerReplyMarkup("사장○○님").text, "사장고객님");
});
