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
// ⚠️ 호출부 규칙: sendMessage는 `shouldLimitReplySentences(turnChoice)`로 적용 여부를 정한다 —
// "예고 완료"를 **마킹하는** 지시 2종(`verify_announce`·`install_consent`)이 주입된 턴만 면제한다.
// 예고 문장이 잘려도 `wasTurnInstructionSpoken`은 참으로 마킹하므로 "말하지 않은 예고" 결함(G343)이
// 재발하기 때문이다. 오프닝은 항상 적용한다(예고 계열 아님 · 마킹 없음).
//
// ⚠️ 한계: Live 음성 경로(오디오)에는 적용할 수 없다.

import type { FallbackTurnChoice } from "../verifyIntercept/fallbackTurn";

/**
 * 이번 턴 사기범 대사에 문장 수 상한을 걸지 판정한다(순수 함수, 판정표 전수 테스트로 고정).
 *
 * | turnChoice | 상한 | 이유 |
 * |---|---|---|
 * | `none` | 적용 | 지시 없음 |
 * | `sms_announce` | 적용 | 마킹 없음(announceMarking.ts 헤더의 전수 확인) — 잘려도 상태 기록이 틀어지지 않는다 |
 * | `verify_reconnect` | 적용 | 마킹 없음 — 같은 이유 |
 * | `verify_announce` | 미적용 | `announcedAt` 마킹(G343) |
 * | `install_consent` | 미적용 | `consentAnnouncedAt` 마킹(G343) |
 *
 * 근거(2026-10-18 라이브): 문자 도착 턴(`sms_announce`)이 5문장이었다 — 이전 조건
 * (`turnInstruction === undefined`)은 지시 4종을 모두 면제했다.
 * ⚠️ 한계: 상한을 적용하는 2종에서 모델이 예고 문장을 4번째 이후에 두면 그 문장이 잘린다(상태
 * 기록은 안 틀어지지만 그 턴의 예고 대사가 빠진다).
 */
export function shouldLimitReplySentences(turnChoice: FallbackTurnChoice): boolean {
  switch (turnChoice) {
    case "none":
    case "sms_announce":
    case "verify_reconnect":
      return true;
    case "verify_announce":
    case "install_consent":
      return false;
  }
}

/** CONVERSATION_STYLE "한 번에 1~3문장"(promptAssembly.ts:23)과 같은 값 — 두 곳을 함께 바꾼다(T167 참고). */
export const MAX_SCAMMER_REPLY_SENTENCES = 3;

/** 문장 끝 부호 후보. 점만으로 된 2개 이상 연속·`…`는 말줄임표(머뭇거림)라 경계가 아니다. */
const PUNCTUATION = new Set([".", "?", "!", "？", "！", "…"]);
/** 물음표·느낌표가 하나라도 섞이면 점이 붙어도(`?...`) 문장 끝이다. */
const STRONG_TERMINAL = /[?!？！]/;
/** 문장 끝 부호 뒤에 붙을 수 있는 닫는 따옴표·괄호. */
const CLOSERS = new Set(['"', "'", "”", "’", "」", "』", ")", "]"]);

/** 쉼표 경계에 쓰는 쉼표(반각·전각). */
const COMMAS = new Set([",", "，"]);
/**
 * 쉼표 경계 판정표 — **공손한 종결어미 + 쉼표 + 공백**이면 문장 끝으로 센다(이 목록만).
 * 근거(2026-10-18 조정 세션): 오프닝 `안녕하십니까, …`가 쉼표 때문에 앞 문장에 붙어 3문장으로
 * 세어져 상한이 걸리지 않았다(읽는 사람은 4문장으로 본다).
 * ⛔ `요` 단독은 넣지 않는다 — `그런데요,`·`근데요,` 같은 연결이 흔하다. `다름이 아니라,`·`하는데,`도
 * 이 목록에 걸리지 않아 경계가 아니다.
 */
export const POLITE_COMMA_ENDINGS = [
  "니다",
  "니까",
  "세요",
  "에요",
  "예요",
  "어요",
  "아요",
  "해요",
  "지요",
  "죠",
] as const;

function endsWithPoliteEnding(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 2), index);
  return POLITE_COMMA_ENDINGS.some((ending) => before.endsWith(ending));
}

type SentenceEnd = { end: number; comma: boolean };

/**
 * 내용이 있는 문장들의 끝 위치(배타적 인덱스)를 앞에서부터 돌려준다.
 * 경계: (1) 줄바꿈, (2) 단독 마침표 또는 물음표·느낌표가 섞인 부호 묶음 + 닫는 부호 0개 이상 +
 * 공백·줄바꿈·문자열 끝, (3) 공손한 종결어미(`POLITE_COMMA_ENDINGS`) + 쉼표 + 공백·줄바꿈(쉼표
 * 바로 뒤가 문자열 끝이거나 글자면 경계가 아니다). 공백뿐인 조각은 세지 않고, 끝 부호 없는 마지막
 * 조각도 내용이 있으면 센다. `comma`는 (3)으로 끝난 문장 표시다.
 */
function sentenceEnds(text: string): SentenceEnd[] {
  const ends: SentenceEnd[] = [];
  let segmentStart = 0;
  const close = (end: number, comma = false): void => {
    if (text.slice(segmentStart, end).trim().length > 0) ends.push({ end, comma });
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
    if (
      COMMAS.has(ch) &&
      i + 1 < text.length &&
      /\s/.test(text[i + 1]) &&
      endsWithPoliteEnding(text, i)
    ) {
      close(i + 1, true);
      i += 1;
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
 * `maxSentences`문장의 끝까지 자르고 `trimEnd()`한다. 잘린 끝이 쉼표 경계면 그 쉼표를 마침표로
 * 바꿔 끝낸다(`안녕하십니까,` → `안녕하십니까.`).
 */
export function limitReplySentences(
  text: string,
  maxSentences: number = MAX_SCAMMER_REPLY_SENTENCES,
  keep?: RegExp,
): { text: string; originalSentences: number; keptSentences: number; trimmed: boolean } {
  // §132 — `keep`이 있으면 그 문장을 잘라 내지 않는다(`limitReplySentencesKeeping` 표). 없으면 종전과 바이트 동일.
  return keep ? limitReplySentencesKeeping(text, keep, maxSentences) : cutReplySentences(text, maxSentences);
}

function cutReplySentences(
  text: string,
  maxSentences: number,
): { text: string; originalSentences: number; keptSentences: number; trimmed: boolean } {
  if (!Number.isInteger(maxSentences) || maxSentences < 1) {
    throw new RangeError(`maxSentences는 1 이상의 정수여야 한다: ${maxSentences}`);
  }
  const ends = sentenceEnds(text);
  if (ends.length <= maxSentences) {
    return { text, originalSentences: ends.length, keptSentences: ends.length, trimmed: false };
  }
  const cut = ends[maxSentences - 1];
  const kept = text.slice(0, cut.end).trimEnd();
  return {
    text: cut.comma ? `${kept.slice(0, -1)}.` : kept,
    originalSentences: ends.length,
    keptSentences: maxSentences,
    trimmed: true,
  };
}

/** §132 — 문자 도착 턴(`sms_announce`)에 상한이 잘라 내면 안 되는 문자 언급 문장. */
export const SMS_MENTION_SENTENCE = /문자|인증\s*번호|메시지/;

/**
 * ⭐ §132(DECISIONS #248 · 메인 세션 라이브 확인 2026-10-24 — 기관 사칭 고급 · 텍스트 폴백) — 문자 백스톱이 도착한 턴의 대사가
 * 5문장이라 상한이 3문장으로 자르면서, 4번째 이후에 있던 "방금 인증번호 문자를 보내 드렸습니다"가 빠졌다(운영 로그: 같은 턴
 * `문자 판정 delivered` → `문장 상한 적용 5→3`). 그 문장은 다음 턴에야 나와 문자가 말보다 한 턴 먼저 온 것처럼 보였다.
 *
 * | 경우 | 결과 |
 * |---|---|
 * | 상한 이하 | 입력 그대로(`limitReplySentences`와 같음) |
 * | 남는 앞 문장에 `keep` 문장이 이미 있다 | `limitReplySentences`와 같음 |
 * | 잘리는 쪽에만 `keep` 문장이 있다 | 앞 `maxSentences - 1`문장 + 그 첫 `keep` 문장(문장 수는 그대로 상한) |
 * | 어디에도 없다 | `limitReplySentences`와 같음(지어내지 않는다) |
 */
export function limitReplySentencesKeeping(
  text: string,
  keep: RegExp,
  maxSentences: number = MAX_SCAMMER_REPLY_SENTENCES,
): { text: string; originalSentences: number; keptSentences: number; trimmed: boolean } {
  const base = cutReplySentences(text, maxSentences);
  if (!base.trimmed) return base;
  const ends = sentenceEnds(text);
  const sentence = (i: number): string => text.slice(i === 0 ? 0 : ends[i - 1].end, ends[i].end).trim();
  for (let i = 0; i < maxSentences; i += 1) if (keep.test(sentence(i))) return base;
  let found = -1;
  for (let i = maxSentences; i < ends.length; i += 1) {
    if (keep.test(sentence(i))) {
      found = i;
      break;
    }
  }
  if (found < 0) return base;
  const raw = sentence(found);
  const tail = ends[found].comma ? `${raw.slice(0, -1)}.` : raw;
  const head = maxSentences > 1 ? cutReplySentences(text, maxSentences - 1).text : "";
  return { ...base, text: head ? `${head} ${tail}` : tail };
}
