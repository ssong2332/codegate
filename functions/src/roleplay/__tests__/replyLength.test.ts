// 사기범 대사 문장 수 상한(roleplay/replyLength.ts) — 순수 함수 직접 테스트.
// 라이브(2026-10-17): 사기범 5턴이 전부 5~7문장이었다(규칙은 CONVERSATION_STYLE "한 번에 1~3문장").
import { test } from "node:test";
import assert from "node:assert/strict";
import { countSentences, limitReplySentences, MAX_SCAMMER_REPLY_SENTENCES } from "../replyLength";
import { buildSystemPrompt } from "../promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";

const SEVEN =
  "안녕하십니까, 서울중앙지검 수사관입니다. 고객님 명의 계좌가 범죄에 연루됐습니다. " +
  "지금 바로 조치하셔야 합니다! 혹시 최근에 통장을 만드신 적 있으세요? " +
  "협조하지 않으시면 불이익이 있을 수 있습니다. 이 통화는 녹음되고 있습니다. 끊지 마십시오.";

test("[상한] 7문장 입력 → 앞 3문장만 남는다", () => {
  const result = limitReplySentences(SEVEN);
  assert.equal(
    result.text,
    "안녕하십니까, 서울중앙지검 수사관입니다. 고객님 명의 계좌가 범죄에 연루됐습니다. 지금 바로 조치하셔야 합니다!",
  );
  assert.equal(result.originalSentences, 7);
  assert.equal(result.keptSentences, 3);
  assert.equal(result.trimmed, true);
  assert.equal(countSentences(SEVEN), 7);
});

test("[무변경] 3문장 이하는 입력 문자열 그대로(===), trimmed false", () => {
  for (const text of [
    "",
    "네.",
    "고객님, 지금 확인되셨죠? 그럼 바로 진행하겠습니다.",
    "고객님 계좌가 위험합니다. 지금 옮기셔야 해요. 문자로 보낸 계좌 확인하셨죠?   ",
  ]) {
    const result = limitReplySentences(text);
    assert.ok(result.text === text, `입력과 달라졌다: ${JSON.stringify(text)}`);
    assert.equal(result.trimmed, false);
    assert.equal(result.keptSentences, result.originalSentences);
  }
});

test("[경계] 말줄임표(.. ... …)는 문장 끝이 아니다", () => {
  assert.equal(countSentences("엄마... 나 진짜 큰일 났어.. 빨리… 도와줘"), 1);
  assert.equal(countSentences("엄마... 나야. 빨리 와."), 2);
});

test("[경계] 물음표·느낌표가 섞인 부호 묶음(?... ?! ！？)은 문장 끝이다", () => {
  assert.equal(countSentences("왜 내 말을 못 믿어?... 진짜야!"), 2);
  assert.equal(countSentences("지금 뭐 하시는 거예요?! 빨리 하세요"), 2);
  assert.equal(countSentences("정말요？ 네！ 알겠습니다"), 3);
});

test("[경계] 숫자 사이 점(3.5%)은 경계가 아니다", () => {
  assert.equal(countSentences("금리는 연 3.5%로 낮아집니다. 오늘만 됩니다."), 2);
});

test("[경계] 닫는 따옴표·괄호가 붙어도 문장 끝이고, 따옴표 뒤에 글자가 이어지면 아니다", () => {
  assert.equal(countSentences("그분이 \"지금 보내세요.\" 그렇게 말했어요. (확인하세요.) 네"), 4);
  assert.equal(countSentences("\"지금 보내세요.\"라고 하셨잖아요."), 1);
  assert.equal(countSentences("「확인됐습니다.」 『다음 단계로 가죠!』 [안내] 끝"), 3);
});

test("[경계] 줄바꿈은 문장 경계이고, 공백뿐인 조각은 세지 않는다", () => {
  assert.equal(countSentences("첫째 줄\n둘째 줄\n\n   \n셋째 줄\r\n넷째 줄"), 4);
  const result = limitReplySentences("첫째 줄\n둘째 줄\n셋째 줄\n넷째 줄");
  assert.equal(result.text, "첫째 줄\n둘째 줄\n셋째 줄");
  assert.equal(result.trimmed, true);
});

test("[경계] 종결부호 없이 끝나는 마지막 조각도 내용이 있으면 1문장이다", () => {
  assert.equal(countSentences("확인했습니다. 그럼 지금 바로"), 2);
  assert.equal(countSentences("   "), 0);
  const result = limitReplySentences("하나. 둘. 셋. 넷 끝");
  assert.equal(result.text, "하나. 둘. 셋.");
  assert.equal(result.originalSentences, 4);
});

test("[인자] maxSentences는 1 이상의 정수여야 한다", () => {
  assert.throws(() => limitReplySentences("하나. 둘.", 0), RangeError);
  assert.equal(limitReplySentences("하나. 둘.", 1).text, "하나.");
});

test("[결합 고정] MAX_SCAMMER_REPLY_SENTENCES === 3 이고 조립 프롬프트에 '1~3문장'이 있다", () => {
  const message = "상수와 CONVERSATION_STYLE 문면을 함께 바꿔라 — T167 참고";
  assert.equal(MAX_SCAMMER_REPLY_SENTENCES, 3, message);
  const anyScenario = SCENARIO_PROMPTS[Object.keys(SCENARIO_PROMPTS)[0]];
  assert.ok(buildSystemPrompt(anyScenario).includes("1~3문장"), message);
});
