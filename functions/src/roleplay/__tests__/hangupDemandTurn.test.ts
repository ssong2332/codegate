import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { HANGUP_RULE_NONE, HANGUP_RULE_SIGNAL, HANGUP_RULE_TOOL } from "../promptAssembly";

// T192 C7 · G622(Architecture.md §79.22 (4) ① · (9)) — 공통 머리 CASES에 2곳: 첫째 경우 괄호(약속은 마친 것이 아니다) ·
// 끝 1문장(돈·정보·행동을 요구하거나 재촉한 응답에서는 끊지 않는다 — §79.22 (12) ① M1). ⭐ 정본은 사본으로 들고 있다(소스 상수에서 읽지 않는다).
// ⚠️ 줄바꿈 리터럴 앵커 0(CRLF 체크아웃 대비).

const C7_A = "(하겠다는 약속만 한 것은 마친 것이 아니다)";
const C7_B = "네가 상대에게 돈·정보·행동을 요구하거나 재촉한 응답에서는 끊지 않는다 — 그 말에 대한 상대의 답을 들은 뒤에 끊을지 다시 판단한다.";
const EXCLUSION = "상대가 침묵하거나 대화가 소강 상태이거나 시간이 오래 걸린다는 이유로는 끊지 않는다.";
const SECOND_CASE = "둘째, ";

/** §79.22 (4) ① 정본 전문(사본). */
const G622_CASES_CANON =
  "- **통화는 상대가 끝내는 것이 원칙이다 — 네가 먼저 끊는 것은 아래 두 경우뿐이다.** 첫째, 네가 원하던 것을 얻었다: 상대가 문자로 온 이체 화면에서 이체를 마쳤거나(하겠다는 약속만 한 것은 마친 것이 아니다), 네가 요구한 정보(인증번호·계좌번호·카드번호 등)를 불러 주었다. 원하던 것을 얻었고 상대에게 더 요구할 것이 남지 않았다면, 통화를 붙잡아 두지 말고 그때 끊는다. 둘째, 상대가 거절이나 의심을 되풀이해 더는 진행할 수 없다. 상대가 침묵하거나 대화가 소강 상태이거나 시간이 오래 걸린다는 이유로는 끊지 않는다. 네가 상대에게 돈·정보·행동을 요구하거나 재촉한 응답에서는 끊지 않는다 — 그 말에 대한 상대의 답을 들은 뒤에 끊을지 다시 판단한다.";
/** C7 전 CASES(C6-F 시점) — 역검증 · 꼬리 바이트 대조용. */
const G622_OLD_CASES = G622_CASES_CANON.replace(C7_A, "").replace(` ${C7_B}`, "");

/** C7 전 TOOL · SIGNAL 꼬리(`**끊기로 했으면` · `**이번 응답에서`부터) — 바이트 동일 대조. */
const TOOL_TAIL_BEFORE =
  '**끊기로 했으면 그 응답에서는 어떤 말보다도 먼저 `end_call` 도구를 부르고, 결과가 허락한 뒤에만** 짧은 마무리 한마디를 하고 더 말하지 않는다. 끊기로 한 그 응답에서는 도구 결과를 받기 전에 확인 결과를 알리는 말도, 끝내겠다는 말도, 작별 인사도 하지 않는다. 결과가 허락하지 않으면 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어간다. 도구를 부르지 않은 응답에서는 "그럼 통화 종료하겠습니다", "끊겠습니다", "여기까지 하겠습니다"처럼 네가 통화를 마치겠다는 말을 어떤 표현으로도 하지 않는다.';
const SIGNAL_TAIL_BEFORE =
  '**이번 응답에서 끊기로 했다면** 짧은 마무리 한마디만 하고, 응답 맨 끝에 첫째 경우면 [[SIGNAL:END_CALL_GOAL]], 둘째 경우면 [[SIGNAL:END_CALL_GIVEUP]]을 붙인다. 끊지 않는 응답에는 마무리 말도 신호도 넣지 않는다. 신호 없이 "그럼 통화 종료하겠습니다", "끊겠습니다", "여기까지 하겠습니다"처럼 네가 통화를 마치겠다는 말을 어떤 표현으로도 하지 않는다.';
const NONE_BEFORE =
  '- **통화를 끝내는 것은 상대다 — 너는 끝내지 않는다.** "그럼 통화 종료하겠습니다", "끊겠습니다", "여기까지 하겠습니다"처럼 네가 통화를 마치겠다는 말을 어떤 표현으로도 하지 않는다. 상대가 침묵하거나 대화가 소강 상태가 되어도 네 쪽에서 마무리 인사를 하지 않고, 상황에 맞는 말로 대화를 이어 둔다. 상대가 스스로 끊는 것은 상대의 몫이다.';

const BANNED = ["이번", "한 번", "첫", "셋째", "확인 중", "기다", "확인됐습니다", "처리됐습니다"];

/** F11 검출기 — 사본 0: 컴파일된 `promptAssembly.test.js`의 정본 검출기를 잘라 실행한다(G612와 같은 방식). */
function loadCounterDetector(): (text: string) => string[] {
  const js = readFileSync(path.resolve(__dirname, "promptAssembly.test.js"), "utf8");
  const start = js.indexOf("const NATIVE_NUMERALS");
  const end = js.indexOf("function extractVerifyInterceptBlock(");
  assert.ok(start >= 0 && end > start, "F11 검출기를 컴파일 산출물에서 찾지 못했다");
  return new Function(`${js.slice(start, end)}\nreturn findCounterExpressions;`)() as (text: string) => string[];
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}
function headOf(rule: string, tailStart: string): string {
  const at = rule.indexOf(tailStart);
  assert.ok(at > 0, `꼬리 시작 ${tailStart}를 찾지 못했다`);
  return rule.slice(0, at - 1); // 꼬리 앞 공백 1개 제외
}

/** G622 판정 — CASES 정확 일치 · C7-a 자리 · C7-b 자리(제외 문장 뒤 · 끝) · 각 1회. */
function g622(cases: string): boolean {
  if (cases !== G622_CASES_CANON) return false;
  if (count(cases, C7_A) !== 1 || count(cases, C7_B) !== 1) return false;
  if (!cases.includes(`이체를 마쳤거나${C7_A}, 네가 요구한 정보`)) return false;
  const exAt = cases.indexOf(EXCLUSION);
  const bAt = cases.indexOf(C7_B);
  return bAt > exAt && bAt > cases.indexOf(SECOND_CASE) && cases.endsWith(C7_B);
}

test("[G622] CASES = §79.22 (4) ① 정본 정확 일치 — TOOL · SIGNAL 공통 머리 · C7-a는 '이체를 마쳤거나' 바로 뒤 · C7-b는 끝 · 각 1회", () => {
  const toolHead = headOf(HANGUP_RULE_TOOL, "**끊기로 했으면");
  const signalHead = headOf(HANGUP_RULE_SIGNAL, "**이번 응답에서");
  assert.equal(toolHead, G622_CASES_CANON, "TOOL 공통 머리가 §79.22 (4) ① 정본과 다르다");
  assert.equal(signalHead, G622_CASES_CANON, "SIGNAL 공통 머리가 §79.22 (4) ① 정본과 다르다(AC-103 (f) 대칭)");
  assert.ok(g622(toolHead));
});

test("[G622] TOOL · SIGNAL 꼬리 · NONE은 C7 전과 바이트 동일 · NONE에는 C7 문장 0", () => {
  assert.equal(HANGUP_RULE_TOOL, `${G622_CASES_CANON} ${TOOL_TAIL_BEFORE}`, "TOOL 꼬리가 바뀌었다(⛔ §79.22 (0) 1)");
  assert.equal(HANGUP_RULE_SIGNAL, `${G622_CASES_CANON} ${SIGNAL_TAIL_BEFORE}`, "SIGNAL 꼬리가 바뀌었다(⛔ §79.22 (0) 2)");
  assert.equal(HANGUP_RULE_NONE, NONE_BEFORE, "NONE이 바뀌었다(G505)");
  assert.equal(HANGUP_RULE_NONE.includes(C7_A) || HANGUP_RULE_NONE.includes(C7_B), false);
});

test("[G622 · G130] 새 두 문장에 숫자 0 · 금지 어휘 0 · F11 카운터 0", () => {
  const findCounters = loadCounterDetector();
  assert.ok(findCounters("첫째, 둘째").length > 0, "F11 검출기가 아무것도 잡지 않는다 — 로딩이 깨졌다(대조군)");
  for (const sentence of [C7_A, C7_B]) {
    assert.equal(/[0-9０-９]/.test(sentence), false, `숫자: ${sentence}`);
    for (const w of BANNED) assert.equal(sentence.includes(w), false, `"${w}": ${sentence}`);
    assert.deepEqual(findCounters(sentence), [], `카운터 표현: ${sentence}`);
  }
});

test("[G622 역검증] C7-a를 뺀 사본 · C7-b를 뺀 사본 · C7-b를 '둘째,' 앞으로 옮긴 사본 · C7 전 CASES는 판정에 걸린다", () => {
  assert.equal(g622(G622_CASES_CANON), true, "정본은 통과(대조군)");
  const noA = G622_CASES_CANON.replace(C7_A, "");
  const noB = G622_CASES_CANON.replace(` ${C7_B}`, "");
  const moved = G622_CASES_CANON.replace(` ${C7_B}`, "").replace(SECOND_CASE, `${C7_B} ${SECOND_CASE}`);
  for (const [label, copy] of [["C7-a 제거", noA], ["C7-b 제거", noB], ["C7-b 이동", moved], ["C7 전", G622_OLD_CASES]] as const) {
    assert.notEqual(copy, G622_CASES_CANON, `${label}: 사본이 원본과 같다 — 앵커가 깨졌다`);
    assert.equal(g622(copy), false, `${label} 사본이 통과했다`);
  }
  // 자리 판정만으로도 잡히는가(정확 일치를 뺀 판정) — 이동 사본은 '끝' 조건에서 걸린다.
  assert.equal(moved.endsWith(C7_B), false);
  assert.ok(moved.indexOf(C7_B) < moved.indexOf(SECOND_CASE));
});

// ── T192 C7 · §79.22 (12) ① ② M1-3 — C7-b 앞절 정정(요구의 내용으로 대상을 잡는다 · 새 것/반복 구분 0) ──────────────
/** 4f047e2 시점의 옛 C7-b(M1 정정 전) — 역검증용. */
const G622_OLD_C7_B = "네가 새 요구를 꺼내거나 결정을 재촉한 응답에서는 끊지 않는다 — 그 말에 대한 상대의 답을 들은 뒤에 끊을지 다시 판단한다.";

test("[G622 · M1] C7-b 앞절 — '돈·정보·행동' 정확히 1회 · '새 요구' · '결정을 재촉' 0 · 대시 뒤 무변경", () => {
  const head = headOf(HANGUP_RULE_TOOL, "**끊기로 했으면");
  assert.equal(count(head, "돈·정보·행동"), 1);
  assert.equal(head.includes("새 요구"), false, "옛 앞절 '새 요구'가 남았다");
  assert.equal(head.includes("결정을 재촉"), false, "옛 앞절 '결정을 재촉'이 남았다");
  assert.ok(head.endsWith("— 그 말에 대한 상대의 답을 들은 뒤에 끊을지 다시 판단한다."), "대시 뒤가 바뀌었다");
});

test("[G622 · M1 역검증] 옛 C7-b(새 요구를 꺼내거나 결정을 재촉한) 사본은 정확 일치에 실패한다", () => {
  const oldCopy = G622_CASES_CANON.replace(C7_B, G622_OLD_C7_B);
  assert.notEqual(oldCopy, G622_CASES_CANON, "역검증 사본이 원본과 같다 — 앵커가 깨졌다");
  assert.equal(g622(oldCopy), false, "옛 C7-b 사본이 통과했다");
  assert.notEqual(headOf(HANGUP_RULE_TOOL, "**끊기로 했으면"), oldCopy);
});
