// 사기범(LLM) 대사 문장 수 상한 — 텍스트 경로(sendMessage·오프닝) 출력 후처리. 순수 함수, 부수효과 0.
//
// ⛔ **왜 필요한가**: 라이브(2026-10-17, institutional-impersonation·중급·텍스트 폴백)에서 사기범 5턴이
// 전부 5~7문장이었다(오프닝 포함). 규칙은 `promptAssembly.ts` CONVERSATION_STYLE의 "한 번에
// 1~3문장"이지만 문면은 확률적 지시라 보증이 없다. 그 문면은 T167(OQ-A70/A71, 사용자 결정 대기)이
// 다루므로 여기서 강화하지 않고, **텍스트 경로에 결정적 런타임 상한**을 둔다.
//
// ⛔ **왜 `maxOutputTokens`가 아닌가**: 토큰 상한은 문장 중간·링크 마커(`[[LINK:…]]`) 중간을 자르고,
// 추론 토큰이 상한을 잠식하면 빈 응답 → Mock 강등이 된다(T98과 같은 부류의 조용한 장애). 이 모듈은
// 마커 추출이 끝난 텍스트를 **문장 경계에서만** 자른다.
//
// ⚠️ 호출부 규칙: sendMessage에서 이번 턴에 `turnInstruction`(문자 예고·확인 예고·재연결·설치 응낙)이
// 주입됐으면 **적용하지 않는다** — 예고 문장이 잘려도 `wasTurnInstructionSpoken`은 참으로 마킹하므로
// "말하지 않은 예고" 결함(G343)이 재발한다. 오프닝은 항상 적용한다(예고 계열 아님 · 마킹 없음).
//
// ⚠️ 한계: Live 음성 경로(오디오)에는 적용할 수 없다.

/** CONVERSATION_STYLE "한 번에 1~3문장"(promptAssembly.ts:23)과 같은 값 — 두 곳을 함께 바꾼다(T167 참고). */
export const MAX_SCAMMER_REPLY_SENTENCES = 3;

/** 문장 끝 부호 후보. 점만으로 된 2개 이상 연속·`…`는 말줄임표(머뭇거림)라 경계가 아니다. */
const PUNCTUATION = new Set([".", "?", "!", "？", "！", "…"]);
/** 물음표·느낌표가 하나라도 섞이면 점이 붙어도(`?...`) 문장 끝이다. */
const STRONG_TERMINAL = /[?!？！]/;
/** 문장 끝 부호 뒤에 붙을 수 있는 닫는 따옴표·괄호. */
const CLOSERS = new Set(['"', "'", "”", "’", "」", "』", ")", "]"]);

/**
 * 내용이 있는 문장들의 끝 위치(배타적 인덱스)를 앞에서부터 돌려준다.
 * 경계: (1) 줄바꿈, (2) 단독 마침표 또는 물음표·느낌표가 섞인 부호 묶음 + 닫는 부호 0개 이상 +
 * 공백·줄바꿈·문자열 끝. 공백뿐인 조각은 세지 않고, 끝 부호 없는 마지막 조각도 내용이 있으면 센다.
 */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  let segmentStart = 0;
  const close = (end: number): void => {
    if (text.slice(segmentStart, end).trim().length > 0) ends.push(end);
    segmentStart = end;
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\n" || ch === "\r") {
      close(i);
      i += 1;
      segmentStart = i;
      continue;
    }
    if (PUNCTUATION.has(ch)) {
      let runEnd = i;
      while (runEnd < text.length && PUNCTUATION.has(text[runEnd])) runEnd += 1;
      const run = text.slice(i, runEnd);
      const terminal = run === "." || STRONG_TERMINAL.test(run);
      let after = runEnd;
      while (after < text.length && CLOSERS.has(text[after])) after += 1;
      if (terminal && (after === text.length || /\s/.test(text[after]))) {
        close(after);
        i = after;
        continue;
      }
      i = runEnd;
      continue;
    }
    i += 1;
  }
  close(text.length);
  return ends;
}

export function countSentences(text: string): number {
  return sentenceEnds(text).length;
}

/**
 * 문장 수가 `maxSentences` 이하면 **입력 문자열을 그대로**(바이트 동일) 돌려준다. 초과면 앞
 * `maxSentences`문장의 끝까지 자르고 `trimEnd()`한다.
 */
export function limitReplySentences(
  text: string,
  maxSentences: number = MAX_SCAMMER_REPLY_SENTENCES,
): { text: string; originalSentences: number; keptSentences: number; trimmed: boolean } {
  if (!Number.isInteger(maxSentences) || maxSentences < 1) {
    throw new RangeError(`maxSentences는 1 이상의 정수여야 한다: ${maxSentences}`);
  }
  const ends = sentenceEnds(text);
  if (ends.length <= maxSentences) {
    return { text, originalSentences: ends.length, keptSentences: ends.length, trimmed: false };
  }
  return {
    text: text.slice(0, ends[maxSentences - 1]).trimEnd(),
    originalSentences: ends.length,
    keptSentences: maxSentences,
    trimmed: true,
  };
}
