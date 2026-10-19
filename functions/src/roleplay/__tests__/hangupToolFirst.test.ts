import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  HANGUP_RULE_NONE,
  HANGUP_RULE_SIGNAL,
  HANGUP_RULE_TOOL,
  HANGUP_RULE_TOOL_VERIFY_SUFFIX,
} from "../promptAssembly";

// T192 C6-F2 · G616~G619(Architecture.md §79.21 (3) · (7) · (10) ① ④) — TOOL 꼬리 "그 응답에서는 어떤 말보다도 먼저 도구" + 도구 결과 전
// 알림 · 종료 · 작별 금지 1문장. ⭐ 정본은 **사본**으로 들고 있다(소스 상수에서 읽지 않는다 — 상수를 고치면 같이 빨개져야 한다).
// ⚠️ 줄바꿈 리터럴 앵커 0(CRLF 체크아웃 대비) — 전부 한 줄 문자열.

/** §79.21 (10) ① 최종 정본 전문(사본). */
const G616_TOOL_CANON =
  '- **통화는 상대가 끝내는 것이 원칙이다 — 네가 먼저 끊는 것은 아래 두 경우뿐이다.** 첫째, 네가 원하던 것을 얻었다: 상대가 문자로 온 이체 화면에서 이체를 마쳤거나, 네가 요구한 정보(인증번호·계좌번호·카드번호 등)를 불러 주었다. 원하던 것을 얻었고 상대에게 더 요구할 것이 남지 않았다면, 통화를 붙잡아 두지 말고 그때 끊는다. 둘째, 상대가 거절이나 의심을 되풀이해 더는 진행할 수 없다. 상대가 침묵하거나 대화가 소강 상태이거나 시간이 오래 걸린다는 이유로는 끊지 않는다. **끊기로 했으면 그 응답에서는 어떤 말보다도 먼저 `end_call` 도구를 부르고, 결과가 허락한 뒤에만** 짧은 마무리 한마디를 하고 더 말하지 않는다. 끊기로 한 그 응답에서는 도구 결과를 받기 전에 확인 결과를 알리는 말도, 끝내겠다는 말도, 작별 인사도 하지 않는다. 결과가 허락하지 않으면 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어간다. 도구를 부르지 않은 응답에서는 "그럼 통화 종료하겠습니다", "끊겠습니다", "여기까지 하겠습니다"처럼 네가 통화를 마치겠다는 말을 어떤 표현으로도 하지 않는다.';

/** §79.21 (3) 판본(범위 어구 없음 — (10) ①이 대체) — 역검증용. */
const G616_PREV_TOOL =
  '- **통화는 상대가 끝내는 것이 원칙이다 — 네가 먼저 끊는 것은 아래 두 경우뿐이다.** 첫째, 네가 원하던 것을 얻었다: 상대가 문자로 온 이체 화면에서 이체를 마쳤거나, 네가 요구한 정보(인증번호·계좌번호·카드번호 등)를 불러 주었다. 원하던 것을 얻었고 상대에게 더 요구할 것이 남지 않았다면, 통화를 붙잡아 두지 말고 그때 끊는다. 둘째, 상대가 거절이나 의심을 되풀이해 더는 진행할 수 없다. 상대가 침묵하거나 대화가 소강 상태이거나 시간이 오래 걸린다는 이유로는 끊지 않는다. **끊기로 했으면 그 응답에서는 어떤 말보다도 먼저 `end_call` 도구를 부르고, 결과가 허락한 뒤에만** 짧은 마무리 한마디를 하고 더 말하지 않는다. 도구 결과를 받기 전에는 확인 결과를 알리는 말도, 끝내겠다는 말도, 작별 인사도 하지 않는다. 결과가 허락하지 않으면 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어간다. 도구를 부르지 않은 응답에서는 "그럼 통화 종료하겠습니다", "끊겠습니다", "여기까지 하겠습니다"처럼 네가 통화를 마치겠다는 말을 어떤 표현으로도 하지 않는다.';

/** C6-F2 이전 TOOL 정본(§79.6 ① + C6-F 문장) — 역검증용. */
const G616_OLD_TOOL =
  '- **통화는 상대가 끝내는 것이 원칙이다 — 네가 먼저 끊는 것은 아래 두 경우뿐이다.** 첫째, 네가 원하던 것을 얻었다: 상대가 문자로 온 이체 화면에서 이체를 마쳤거나, 네가 요구한 정보(인증번호·계좌번호·카드번호 등)를 불러 주었다. 원하던 것을 얻었고 상대에게 더 요구할 것이 남지 않았다면, 통화를 붙잡아 두지 말고 그때 끊는다. 둘째, 상대가 거절이나 의심을 되풀이해 더는 진행할 수 없다. 상대가 침묵하거나 대화가 소강 상태이거나 시간이 오래 걸린다는 이유로는 끊지 않는다. **끊기로 했으면 작별 인사를 하기 전에 먼저 `end_call` 도구를 부르고, 결과가 허락한 뒤에만** 짧은 마무리 한마디를 하고 더 말하지 않는다. 결과가 허락하지 않으면 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어간다. 도구를 부르지 않은 응답에서는 "그럼 통화 종료하겠습니다", "끊겠습니다", "여기까지 하겠습니다"처럼 네가 통화를 마치겠다는 말을 어떤 표현으로도 하지 않는다.';

/** NONE · SIGNAL 사본(G505 `G505_NONE_ORIGINAL` · `G505_SIGNAL_CANON`과 같은 값 — 무변경 고정 G617). */
const G617_NONE =
  '- **통화를 끝내는 것은 상대다 — 너는 끝내지 않는다.** "그럼 통화 종료하겠습니다", "끊겠습니다", "여기까지 하겠습니다"처럼 네가 통화를 마치겠다는 말을 어떤 표현으로도 하지 않는다. 상대가 침묵하거나 대화가 소강 상태가 되어도 네 쪽에서 마무리 인사를 하지 않고, 상황에 맞는 말로 대화를 이어 둔다. 상대가 스스로 끊는 것은 상대의 몫이다.';
const G617_VERIFY_SUFFIX = "확인 부서로 통화를 넘기기 전에는 어떤 경우에도 끊지 않는다.";

const TAIL_START = "**끊기로 했으면";
const SIGNAL_TAIL_START = "**이번 응답에서";
const TOOL_FIRST = "그 응답에서는 어떤 말보다도 먼저 `end_call` 도구를 부르고";
const OLD_PHRASE = "작별 인사를 하기 전에 먼저 `end_call`";
const TOOL_CALL = "`end_call` 도구를 부르고";
const BEFORE_RESULT = "끊기로 한 그 응답에서는 도구 결과를 받기 전에 확인 결과를 알리는 말도, 끝내겠다는 말도, 작별 인사도 하지 않는다.";
/** §79.21 (10) ④ G616 — 문장2 범위 어구(정확히 1회). */
const SCOPED_PHRASE = "끊기로 한 그 응답에서는 도구 결과를 받기 전에";
const DECLINED = "결과가 허락하지 않으면";
const MARKER_TOOL = "먼저 `end_call` 도구를 부르고";
/** 프로브 `scripts/live-hangup-probe.mjs` `FAREWELL_WORDS` 사본(⛔ 프로브 상수는 바꾸지 않는다) + §79.21 (7) 추가 3어. */
const FAREWELL_WORDS = [
  "끊겠", "끊을게", "끊습니다", "끊을께", "종료하", "종료할", "이만", "들어가세요", "들어가십시오",
  "수고하", "마치겠", "마칠게", "안녕히", "연락드리겠", "통화 끝",
];
const PRE_TOOL_BANNED = [...FAREWELL_WORDS, "작별", "마무리", "끝내겠"];

test("[G618 전제] FAREWELL_WORDS 사본 = 프로브 원본(측정 변수 고정 — 프로브 상수가 바뀌면 이 사본도 같이 본다)", () => {
  const probe = readFileSync(path.resolve(__dirname, "../../../../scripts/live-hangup-probe.mjs"), "utf8");
  const m = /export const FAREWELL_WORDS = \[([\s\S]*?)\];/.exec(probe);
  assert.ok(m, "프로브에서 FAREWELL_WORDS를 찾지 못했다");
  const words = [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(words, FAREWELL_WORDS);
});

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}
function tailOf(rule: string): string {
  const at = rule.indexOf(TAIL_START);
  assert.ok(at > 0, "TOOL 꼬리 시작을 찾지 못했다");
  return rule.slice(at);
}

/** G616 판정 — 정본 정확 일치 · 새 구절 1회 · 범위 어구 1회 · 옛 구절 0회. */
function g604(rule: string): boolean {
  const tail = tailOf(rule);
  return (
    rule === G616_TOOL_CANON &&
    count(tail, TOOL_FIRST) === 1 &&
    count(tail, SCOPED_PHRASE) === 1 &&
    count(rule, OLD_PHRASE) === 0
  );
}

/** G618 판정 — 도구 지시 앞 종료 · 작별 어휘 0 · 결과 전 문장이 도구 지시 뒤 · 거절 문장 앞. */
function g606(rule: string): boolean {
  const tail = tailOf(rule);
  const callAt = tail.indexOf(TOOL_CALL);
  if (callAt < 0) return false;
  const pre = tail.slice(0, callAt);
  if (PRE_TOOL_BANNED.some((w) => pre.includes(w))) return false;
  const beforeAt = tail.indexOf(BEFORE_RESULT);
  const declinedAt = tail.indexOf(DECLINED);
  return beforeAt > callAt && declinedAt > beforeAt;
}

test("[G616] HANGUP_RULE_TOOL = §79.21 (10) ① 최종 정본 정확 일치 · 새 구절 1회 · 범위 어구 1회 · 옛 구절 0회", () => {
  assert.equal(HANGUP_RULE_TOOL, G616_TOOL_CANON, "TOOL 문면이 §79.21 (10) ① 정본과 다르다");
  assert.equal(count(tailOf(HANGUP_RULE_TOOL), TOOL_FIRST), 1);
  assert.equal(count(tailOf(HANGUP_RULE_TOOL), SCOPED_PHRASE), 1, "문장2 범위 어구가 정확히 1회가 아니다");
  assert.equal(count(HANGUP_RULE_TOOL, OLD_PHRASE), 0, "옛 구절(작별 인사 전에 먼저)이 남았다");
  assert.ok(g604(HANGUP_RULE_TOOL));
});

test("[G616 역검증] 옛 TOOL 정본 사본 · 범위 어구 없는 (3) 판본 사본은 G616 판정에 걸린다", () => {
  assert.notEqual(G616_OLD_TOOL, G616_TOOL_CANON);
  assert.equal(g604(G616_OLD_TOOL), false, "옛 정본이 통과했다 — G616 단언이 죽었다");
  assert.notEqual(G616_PREV_TOOL, G616_TOOL_CANON);
  assert.equal(count(tailOf(G616_PREV_TOOL), SCOPED_PHRASE), 0);
  assert.equal(g604(G616_PREV_TOOL), false, "범위 어구 없는 (3) 판본이 통과했다");
});

test("[G617] 무변경 — NONE 바이트 동일 · SIGNAL · 확인 무력화 1문장 · TOOL/SIGNAL 공통 머리(CASES) 바이트 동일", () => {
  assert.equal(HANGUP_RULE_NONE, G617_NONE, "NONE이 바뀌었다(G505)");
  assert.equal(HANGUP_RULE_TOOL_VERIFY_SUFFIX, G617_VERIFY_SUFFIX);
  const toolHead = HANGUP_RULE_TOOL.slice(0, HANGUP_RULE_TOOL.indexOf(TAIL_START));
  const signalHead = HANGUP_RULE_SIGNAL.slice(0, HANGUP_RULE_SIGNAL.indexOf(SIGNAL_TAIL_START));
  assert.ok(toolHead.length > 0 && signalHead.length > 0);
  assert.equal(toolHead, signalHead, "TOOL · SIGNAL 공통 머리가 갈라졌다");
  // 옛 TOOL 정본의 머리와도 같다(꼬리만 바뀌었다).
  assert.equal(toolHead, G616_OLD_TOOL.slice(0, G616_OLD_TOOL.indexOf(TAIL_START)));
  // SIGNAL 꼬리에는 이번 TOOL 문장이 번지지 않았다.
  assert.equal(HANGUP_RULE_SIGNAL.includes(BEFORE_RESULT), false);
  assert.equal(HANGUP_RULE_SIGNAL.includes(TOOL_FIRST), false);
});

test("[G618] 순서 — 도구 지시 앞 종료 · 작별 어휘 0 · 결과 전 문장은 도구 지시 뒤 · 거절 문장 앞", () => {
  assert.ok(g606(HANGUP_RULE_TOOL));
  assert.ok(g606(`${HANGUP_RULE_TOOL} ${HANGUP_RULE_TOOL_VERIFY_SUFFIX}`), "확인 무력화 세션 조립본");
});

test("[G618 역검증] 도구 지시 앞에 종료 선언을 끼운 사본 · 새 문장을 뺀 사본은 각각 실패한다", () => {
  const declared = HANGUP_RULE_TOOL.replace(TAIL_START, `${TAIL_START} 이제 통화 끝내겠습니다.`);
  assert.notEqual(declared, HANGUP_RULE_TOOL);
  assert.equal(g606(declared), false, "도구 앞 종료 선언 사본이 통과했다");
  const removed = HANGUP_RULE_TOOL.replace(` ${BEFORE_RESULT}`, "");
  assert.notEqual(removed, HANGUP_RULE_TOOL);
  assert.equal(g606(removed), false, "결과 전 문장을 뺀 사본이 통과했다");
  const late = HANGUP_RULE_TOOL.replace(` ${BEFORE_RESULT}`, "") + ` ${BEFORE_RESULT}`;
  assert.equal(g606(late), false, "결과 전 문장을 거절 문장 뒤로 보낸 사본이 통과했다");
});

test("[G619] G130 · 경계 — 꼬리 숫자 0 · `첫 ` 0 · 기다림 어휘 0 · A-1 예시 리터럴 0 · 표지 1회", () => {
  const tail = tailOf(HANGUP_RULE_TOOL);
  for (const [label, text] of [["tool", HANGUP_RULE_TOOL], ["toolVerify", `${HANGUP_RULE_TOOL} ${HANGUP_RULE_TOOL_VERIFY_SUFFIX}`]] as const) {
    assert.equal(/[0-9０-９]/.test(text), false, `${label}: 숫자`);
    assert.equal(/첫\s/.test(text), false, `${label}: 검출기가 못 보는 서수 "첫 …"`);
    assert.equal(count(text, MARKER_TOOL), 1, `${label}: 표지 정확히 1회`);
  }
  for (const w of ["확인 중", "기다", "침묵", "소강"]) {
    assert.equal(tail.includes(w), false, `꼬리에 "${w}"`);
  }
  for (const w of ["확인됐습니다", "처리됐습니다"]) {
    assert.equal(HANGUP_RULE_TOOL.includes(w), false, `A-1 예시 리터럴 "${w}"를 인용했다`);
  }
});

test("[G619 역검증] 꼬리에 `첫 행동` · 숫자 · A-1 리터럴을 끼운 사본은 각 단언에 걸린다", () => {
  const ordinal = HANGUP_RULE_TOOL.replace(TOOL_FIRST, `첫 행동으로 ${TOOL_FIRST}`);
  assert.equal(/첫\s/.test(ordinal), true);
  const digit = HANGUP_RULE_TOOL.replace(TOOL_FIRST, `1 ${TOOL_FIRST}`);
  assert.equal(/[0-9]/.test(digit), true);
  const literal = HANGUP_RULE_TOOL.replace(BEFORE_RESULT, `"확인됐습니다" 같은 ${BEFORE_RESULT}`);
  assert.equal(literal.includes("확인됐습니다"), true);
  assert.notEqual(literal, HANGUP_RULE_TOOL);
});
