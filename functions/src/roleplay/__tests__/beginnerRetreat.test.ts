// D4(2026-11-07 Edge 실사용 시험 판 29 · 판 32 — `docs/research/edge-scenario-test-2026-11-07.md`) — 초급 설명("의심하면 쉽게
// 물러섭니다")과 실제 대화가 달랐다. 원인은 초급 블록이 [말투/톤]의 재설득만 면제하고, 모든 난이도에 실리는 [진행 강제]의
// "같은 압박을 반복하지 않는다 — 매번 다른 카드" · "상대가 응하면 … 비밀 유지 요구"를 남겨 둔 것, 그리고 물러선 뒤의 끝점이 없던 것.
// 이 파일은 조립 결과(음성 Live 경로 = TOOL · 메신저 경로 = NONE)를 단언한다. 중급 · 고급 무변경도 함께 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BEGINNER_ENDING_HANGUP,
  BEGINNER_ENDING_NO_HANGUP,
  buildSystemPrompt,
  type HangupMode,
} from "../promptAssembly";
import { asksIdentityCheck } from "../personaAuthority";
import { isL3Procedural } from "../l3Depth";
import { SCENARIO_PROMPTS } from "../../scenarios";

const RETREAT_PRIORITY =
  '위 [진행 강제]의 "같은 압박을 반복하지 않는다"에 적힌 다른 카드(다른 수법으로 갈아타기, 요구 조건을 낮춰 다시 제안하기, 더 강한 압박으로 올리기)도 이 난이도에서는 꺼내지 않는다.';
const RETREAT_ORDER = "그러고도 상대가 다시 의심하거나 거절하면 요구를 거두고 마무리한다.";
const RETREAT_ACCEPT = '"네, 그럼 확인해 보세요"처럼 상대의 말을 받아들이며 물러선다.';
const NO_SECRECY = '위 [진행 강제]의 "상대가 응하면 실제로 진행시킨다"에 예로 든 비밀 유지 요구도 이 난이도에서는 하지 않는다.';
/** 초급 마무리 줄이 가리키는 끊기 규칙 문장 — TOOL · SIGNAL 조립에 실제로 있어야 참조가 성립한다. */
const HANGUP_GIVEUP_CASE = "상대가 거절이나 의심을 되풀이해 더는 진행할 수 없다";

/** 음성 Live 경로(`realtime/geminiProvider.ts`)와 같은 옵션 모양 — 끊기 도구 선언 = TOOL · Live 말투 켬. */
function liveOpts(id: string, level: "beginner" | "intermediate" | "advanced", hangupMode: HangupMode = "tool") {
  return {
    difficultyLevel: level,
    identityCheckAllowed: asksIdentityCheck(id),
    l3Procedural: isL3Procedural(id),
    toolDrivenTiming: true,
    liveSpeechStyle: true,
    hangupMode,
  } as const;
}

/** 메신저 텍스트 경로(`roleplay/index.ts` sendMessage)와 같은 옵션 모양 — 허용 턴이 아니면 NONE. */
function messengerOpts(id: string, level: "beginner" | "intermediate" | "advanced", hangupMode: HangupMode = "none") {
  return {
    difficultyLevel: level,
    identityCheckAllowed: asksIdentityCheck(id),
    l3Procedural: isL3Procedural(id),
    hangupMode,
  } as const;
}

function beginnerBlockOf(assembled: string): string {
  const start = assembled.indexOf("[난이도 — 초급: 수법이 눈에 띄게 드러나게]");
  assert.ok(start >= 0, "초급 블록 머리가 없다");
  const end = assembled.indexOf("\n\n", start);
  return assembled.slice(start, end < 0 ? assembled.length : end);
}

test("[D4 판 29] 기관 사칭 초급(음성 Live · TOOL) — 물러섬 우선순위 · 순서 · 끊기 마무리가 조립된다", () => {
  const id = "institutional-impersonation";
  const assembled = buildSystemPrompt(SCENARIO_PROMPTS[id], liveOpts(id, "beginner"));
  const block = beginnerBlockOf(assembled);
  for (const line of [RETREAT_PRIORITY, RETREAT_ORDER, RETREAT_ACCEPT, NO_SECRECY, BEGINNER_ENDING_HANGUP]) {
    assert.ok(block.includes(line), `초급 블록에 없다: ${line.slice(0, 40)}`);
  }
  assert.ok(!block.includes(BEGINNER_ENDING_NO_HANGUP), "TOOL 경로에 NONE 마무리 줄이 섞였다");
  assert.ok(!assembled.includes("{{"), "치환되지 않은 슬롯이 남았다");
  // 마무리 줄이 가리키는 끊기 규칙 문장이 같은 프롬프트에, 초급 블록보다 앞에 있다("위 끊기 규칙").
  const hangupAt = assembled.indexOf(HANGUP_GIVEUP_CASE);
  assert.ok(hangupAt >= 0 && hangupAt < assembled.indexOf(block), "끊기 규칙 둘째 경우가 초급 블록 앞에 없다");
  // 우선순위 문장이 덮는 [진행 강제]의 "다른 카드" 문장도 같은 프롬프트에 앞서 있다(가리키는 대상 실재).
  const cardAt = assembled.indexOf("매번 다른 카드를 꺼낸다");
  assert.ok(cardAt >= 0 && cardAt < assembled.indexOf(block));
});

test("[D4 판 32] 자녀 사칭 카카오톡 초급(메신저 · NONE) — 끊지 않는 경로는 '요구를 거둔 채 짧게 받기'로 마무리한다", () => {
  const id = "messenger-child-impersonation-kakao";
  const assembled = buildSystemPrompt(SCENARIO_PROMPTS[id], messengerOpts(id, "beginner"));
  const block = beginnerBlockOf(assembled);
  for (const line of [RETREAT_PRIORITY, RETREAT_ORDER, RETREAT_ACCEPT, NO_SECRECY, BEGINNER_ENDING_NO_HANGUP]) {
    assert.ok(block.includes(line), `초급 블록에 없다: ${line.slice(0, 40)}`);
  }
  assert.ok(!block.includes(BEGINNER_ENDING_HANGUP), "NONE 경로에 끊기 마무리 줄이 섞였다");
  // NONE 끊기 규칙("너는 끝내지 않는다")과 함께 실린다 — 마무리 줄은 끝내겠다는 말을 시키지 않는다.
  assert.ok(assembled.includes("통화를 끝내는 것은 상대다 — 너는 끝내지 않는다."));
  assert.ok(!BEGINNER_ENDING_NO_HANGUP.includes("끊"), "NONE 마무리 줄이 끊기를 지시한다");
  assert.ok(!assembled.includes("{{"));
});

test("[D4] 메신저 허용 턴(SIGNAL)도 끊기 마무리 줄을 받는다 — 같은 끊기 규칙 문장을 가리킨다", () => {
  const id = "messenger-child-impersonation-kakao";
  const assembled = buildSystemPrompt(SCENARIO_PROMPTS[id], messengerOpts(id, "beginner", "signal"));
  assert.ok(beginnerBlockOf(assembled).includes(BEGINNER_ENDING_HANGUP));
  assert.ok(assembled.includes(HANGUP_GIVEUP_CASE));
});

test("[D4] 전 시나리오 × 끊기 변형 — 초급은 슬롯이 남지 않고 마무리 줄이 정확히 1개, 중급 · 고급에는 초급 문장이 없다", () => {
  const modes: HangupMode[] = ["none", "tool", "signal"];
  let checked = 0;
  for (const id of Object.keys(SCENARIO_PROMPTS)) {
    for (const mode of modes) {
      const beginner = buildSystemPrompt(SCENARIO_PROMPTS[id], messengerOpts(id, "beginner", mode));
      assert.ok(!beginner.includes("{{BEGINNER_ENDING}}"), `${id}/${mode}: 슬롯 미치환`);
      const endings = [BEGINNER_ENDING_HANGUP, BEGINNER_ENDING_NO_HANGUP].filter((l) => beginner.includes(l));
      assert.equal(endings.length, 1, `${id}/${mode}: 마무리 줄이 정확히 1개여야 한다`);
      assert.equal(endings[0], mode === "none" ? BEGINNER_ENDING_NO_HANGUP : BEGINNER_ENDING_HANGUP);
      for (const level of ["intermediate", "advanced"] as const) {
        const other = buildSystemPrompt(SCENARIO_PROMPTS[id], messengerOpts(id, level, mode));
        for (const line of [RETREAT_PRIORITY, RETREAT_ORDER, NO_SECRECY, BEGINNER_ENDING_HANGUP, BEGINNER_ENDING_NO_HANGUP]) {
          assert.ok(!other.includes(line), `${id}/${level}/${mode}: 초급 문장이 새어 들어갔다`);
        }
      }
      checked += 1;
    }
    // 중급 = 블록 없는 기준선(옵션 미전달과 같은 문자열) — 끊기 변형이 같으면 바이트 동일.
    assert.equal(
      buildSystemPrompt(SCENARIO_PROMPTS[id], { difficultyLevel: "intermediate" }),
      buildSystemPrompt(SCENARIO_PROMPTS[id]),
      `${id}: 중급이 기준선과 달라졌다`,
    );
  }
  assert.ok(checked >= 3 * 10, `검사한 조합이 너무 적다(${checked})`);
});

test("[D4 · G130] 새 초급 문장에 숫자 · 서수 · 반복 부사가 없다(모델이 셀 수 없는 조건 금지)", () => {
  for (const line of [RETREAT_PRIORITY, RETREAT_ORDER, RETREAT_ACCEPT, NO_SECRECY, BEGINNER_ENDING_HANGUP, BEGINNER_ENDING_NO_HANGUP]) {
    assert.equal(/[0-9０-９]/.test(line), false, `숫자: ${line}`);
    assert.equal(/번째|차례째|첫째|둘째|재차|거듭|누차|(?:한|두|세)\s*번/.test(line), false, `횟수 표현: ${line}`);
  }
});
