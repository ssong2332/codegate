import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { HANGUP_RULE_NONE, HANGUP_RULE_SIGNAL, HANGUP_RULE_TOOL } from "../promptAssembly";

// T192 C6-F · G562 — 끊기 시점 1문장(Architecture.md §79.20 (2) ④). 신고 "입금 확인 중" 공회전의 ⓒ(끊을 *때*를 말하지
// 않는다)를 닫는다. ⛔ 이유를 더하지 않는다(AC-103 (a) "이 둘뿐") — 첫째 경우의 **시점**이라 `kind = goal`.
// ⓒ(F11 카운터 표현 = 기존 허용 목록과 정확 일치 · G130)는 `promptAssembly.test.ts` [T192/C2 G505 · G130]이 **허용 목록
// 무변경 그대로** 새 TOOL · SIGNAL 상수를 다시 잰다 — 이 파일은 그 목록을 복제하지 않는다(한 곳에서만 고친다).
const SENTENCE = "원하던 것을 얻었고 상대에게 더 요구할 것이 남지 않았다면, 통화를 붙잡아 두지 말고 그때 끊는다.";
const BEFORE = "네가 요구한 정보(인증번호·계좌번호·카드번호 등)를 불러 주었다.";
const AFTER = "둘째, 상대가 거절이나 의심을 되풀이해 더는 진행할 수 없다.";
const SRC = path.resolve(__dirname, "../../../src/roleplay/promptAssembly.ts");

/** 판정식(역검증과 같은 함수) — 위반 목록을 돌려준다. */
function sentenceViolations(text: string): string[] {
  const out: string[] = [];
  const count = text.split(SENTENCE).length - 1;
  if (count !== 1) out.push(`문장 ${count}회`);
  const at = text.indexOf(SENTENCE);
  if (at >= 0) {
    const beforeAt = text.indexOf(BEFORE);
    const afterAt = text.indexOf(AFTER);
    if (!(beforeAt >= 0 && beforeAt + BEFORE.length + 1 === at)) out.push("'…불러 주었다.' 바로 뒤가 아니다");
    if (!(afterAt === at + SENTENCE.length + 1)) out.push("'둘째,' 바로 앞이 아니다");
  }
  if (/셋째|세 경우|세 가지 경우/.test(text)) out.push("끊는 이유가 셋이 됐다(AC-103 (a) '이 둘뿐')");
  return out;
}

test("[G562 ⓐ] TOOL · SIGNAL 공통 머리에 시점 문장 정확히 1회 — '…불러 주었다.' 뒤 · '둘째,' 앞", () => {
  assert.deepEqual(sentenceViolations(HANGUP_RULE_TOOL), [], "TOOL");
  assert.deepEqual(sentenceViolations(HANGUP_RULE_SIGNAL), [], "SIGNAL");
  // 상수 소스에서도 HANGUP_RULE_CASES 한 곳에만 있다(TOOL · SIGNAL은 그 상수를 펼친다 — 중복 저작 0).
  const src = readFileSync(SRC, "utf8");
  assert.equal(src.split(SENTENCE).length - 1, 1, "문장이 promptAssembly.ts에 한 번만 있어야 한다");
  const casesLine = src.split(/\r?\n/).find((line) => line.startsWith("const HANGUP_RULE_CASES = `"));
  assert.ok(casesLine?.includes(SENTENCE), "문장이 HANGUP_RULE_CASES 밖에 있다");
});

test("[G562 ⓑ] NONE에는 없다(NONE 바이트 동일은 G505 원문 대조가 그대로 본다)", () => {
  assert.equal(HANGUP_RULE_NONE.includes(SENTENCE), false);
  assert.equal(HANGUP_RULE_NONE.includes("붙잡아 두지 말고"), false);
});

test("[G562 ⓓ · G130] 문장에 침묵 · 소강 · 기다림 · '확인 중' 어휘 0 · 숫자 · 서수 0", () => {
  for (const word of ["침묵", "소강", "기다", "확인 중"]) {
    assert.equal(SENTENCE.includes(word), false, word);
  }
  assert.equal(/[0-9０-９]/.test(SENTENCE), false);
  assert.equal(/첫째|둘째|셋째|번째|차례|한 번/.test(SENTENCE), false);
  // 끊는 이유는 여전히 둘(첫째 · 둘째) — SIGNAL은 첫째 경우 = END_CALL_GOAL 그대로.
  assert.ok(HANGUP_RULE_SIGNAL.includes("첫째 경우면 [[SIGNAL:END_CALL_GOAL]]"));
});

test("[G562 ⓔ 역검증] 문장을 뺀 사본 · 자리를 옮긴 사본 · '셋째'를 넣은 사본은 같은 판정식에 걸린다", () => {
  assert.notDeepEqual(sentenceViolations(HANGUP_RULE_TOOL.replace(`${SENTENCE} `, "")), []);
  const moved = HANGUP_RULE_TOOL.replace(`${SENTENCE} `, "").replace(AFTER, `${AFTER} ${SENTENCE}`);
  assert.notDeepEqual(sentenceViolations(moved), []);
  assert.notDeepEqual(sentenceViolations(HANGUP_RULE_TOOL.replace(AFTER, `${AFTER} 셋째, 할 일이 끝났다.`)), []);
  assert.notDeepEqual(sentenceViolations(`${HANGUP_RULE_TOOL} ${SENTENCE}`), [], "두 번 넣은 사본");
});
