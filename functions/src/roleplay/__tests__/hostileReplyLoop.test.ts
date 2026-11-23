// 2026-11-23 사용자 실기(검찰 고급) — ① 본인 확인을 피하자 사기범이 말없이 다음 단계로 넘어갔고 "너 누구한테 전화했는데?"에 답하지 않았다
// ③ 참가자가 적대적으로 나오자 대화가 빙빙 돌고 같은 내용이 반복됐다. 판정표 = docs/research/hostile-reply-loop-2026-11-23.md 3-A · 3-B.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideRepeatBreak,
  HOSTILE_PARTICIPANT,
  repeatBreakInstruction,
  REPEAT_BREAK_HOSTILE_INSTRUCTION,
} from "../repeatBreak";
import { buildSystemPrompt, DIRECT_QUESTION_REPLY_SENTENCE, OFF_TOPIC_REPLY_SENTENCE } from "../promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { listFlowVariants, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";

// 재현 대본(신고 설명을 옮긴 것 — 캡처 원문은 해상도가 낮아 읽지 못했다). 사기범은 말을 바꿔 같은 설명을 되풀이한다.
const HOSTILE_USER = ["본인 확인 안 해요.", "너 누구한테 전화했는데?", "보이스피싱이잖아. 경찰에 신고할 거야."];
const LOOPING_SCAMMER = [
  "서울 OO지방검찰청 수사관입니다. 본인 명의 계좌가 사건에 연루돼 연락드렸습니다.",
  "협조하지 않으시면 절차상 불이익이 있을 수 있습니다. 본인 계좌가 범죄에 이용된 정황이 있습니다.",
];

test("[1-c 재현] 수정 전 입력(참가자 발화 하나)으로는 적대가 이어져도 주입 0 — 사기범 대사가 서로 달라 유사도 행도 0", () => {
  assert.equal(decideRepeatBreak(LOOPING_SCAMMER, HOSTILE_USER[1]), null);
});

test("[1-c] 참가자 발화 두 개가 연달아 거절 · 의심 · 따짐이면 hostile — 사기범 대답 수와 무관", () => {
  assert.equal(decideRepeatBreak(LOOPING_SCAMMER, HOSTILE_USER[1], HOSTILE_USER[0]), "hostile");
  assert.equal(decideRepeatBreak(LOOPING_SCAMMER, HOSTILE_USER[2], HOSTILE_USER[1]), "hostile");
  assert.equal(decideRepeatBreak([], HOSTILE_USER[2], HOSTILE_USER[1]), "hostile");
  assert.equal(repeatBreakInstruction("hostile"), REPEAT_BREAK_HOSTILE_INSTRUCTION);
});

test("[1-c 판정표] 한 번의 의심 · 순순한 답 · 사실 진술은 아니다 · 자금 소진(1-b)이 먼저 이긴다", () => {
  assert.equal(decideRepeatBreak(LOOPING_SCAMMER, "네, 알겠습니다.", HOSTILE_USER[0]), null, "앞만 적대");
  assert.equal(decideRepeatBreak(LOOPING_SCAMMER, HOSTILE_USER[0], "네, 홍길동이에요."), null, "뒤만 적대");
  for (const t of ["네, 알겠습니다.", "대출은 안 해봤어요.", "안해본 거라 잘 몰라요.", "OO은행 쓰고 있어요.", "얼마 보내면 돼요?", "안녕하세요"]) {
    assert.equal(HOSTILE_PARTICIPANT.test(t), false, t);
  }
  for (const t of ["사기 치지 마", "보이스피싱 같은데요", "경찰에 확인해 볼게요", "못 믿겠어요", "안 알려 줄 거예요", "안 해요", "싫어요", "내가 왜 알려 줘야 돼?", "너 누구야", "누구한테 전화했는데?", "그만해요"]) {
    assert.ok(HOSTILE_PARTICIPANT.test(t), t);
  }
  assert.equal(decideRepeatBreak(LOOPING_SCAMMER, "돈 없어. 사기 치지 마", HOSTILE_USER[0]), "exhausted");
});

test("[1-c 문면] 답부터 · 가장 센 압박 하나 · 끊기 항목 위임 — 숫자 · 횟수 표현 · 따옴표 0", () => {
  const t = REPEAT_BREAK_HOSTILE_INSTRUCTION;
  assert.ok(t.includes("첫 문장에서 그것부터 답하라"));
  assert.ok(t.includes("아직 쓰지 않은 가장 센 압박 하나만"));
  assert.ok(t.includes("[진행 강제]의 통화 끝내기 항목이 정한 대로 하라"));
  assert.equal(/[0-9０-９]|한\s*번|두\s*번|번째|["“”'‘’]/.test(t), false);
  assert.ok(t.startsWith("(") && t.endsWith(")"));
});

test("[3-A] [대화 방식] 직접 질문 · 거절 짚기 1문장 — 전 시나리오 · 전 경로 1회 · 주변 이야기 문장 바로 뒤", () => {
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    for (const opts of [{ difficultyLevel: "beginner" as const }, { difficultyLevel: "advanced" as const, liveSpeechStyle: true }]) {
      const assembled = buildSystemPrompt(prompt, opts);
      assert.equal(assembled.split(DIRECT_QUESTION_REPLY_SENTENCE).length - 1, 1, id);
      assert.ok(assembled.includes(OFF_TOPIC_REPLY_SENTENCE + DIRECT_QUESTION_REPLY_SENTENCE), id);
    }
  }
  assert.equal(/[0-9]|한\s*번|번째/.test(DIRECT_QUESTION_REPLY_SENTENCE), false);
});

test("[3-A 검찰 고급] 현행 루트 전부의 조립 산출물에 직접 질문 문장이 실린다", () => {
  const variants = listFlowVariants("prosecution-cooperation-call", "advanced");
  assert.ok(variants.length > 0);
  for (const v of variants) {
    const prompt = resolveSessionScenarioPrompt("prosecution-cooperation-call", v.variantId)!;
    const assembled = buildSystemPrompt(prompt, { difficultyLevel: "advanced", liveSpeechStyle: true });
    assert.equal(assembled.split(DIRECT_QUESTION_REPLY_SENTENCE).length - 1, 1, v.variantId);
  }
});
