// §130.6(2026-10-24 에뮬레이터 재측정 N5 — "이지수이(가) 입력 중입니다.") — 이름 · 번호 뒤 조사를 받침에 맞춰 고른다.
// ⚠️ 잎 모듈(아무것도 import하지 않는다) — 테스트가 직접 읽는다.
//
// 판정표(마지막 글자 기준 · 공백 · 문장부호 · 괄호는 건너뛴다):
// | 마지막 글자 | 받침 | "이/가" | "으로/로" |
// |---|---|---|---|
// | 한글 · 받침 없음 | 없음 | 가 | 로 |
// | 한글 · 받침 ㄹ | ㄹ | 이 | 로 |
// | 한글 · 그 밖 받침 | 있음 | 이 | 으로 |
// | 숫자 2 · 4 · 5 · 9(이 · 사 · 오 · 구) | 없음 | 가 | 로 |
// | 숫자 1 · 7 · 8(일 · 칠 · 팔) | ㄹ | 이 | 로 |
// | 숫자 0 · 3 · 6(영 · 삼 · 육) | 있음 | 이 | 으로 |
// | 그 밖(영문 · 빈 문자열) | 모름 | 이(가) | (으)로 — 종전 표기 |

export type JosaPair = "이/가" | "으로/로";

type Final = "none" | "rieul" | "other" | "unknown";

const DIGIT_FINAL: Record<string, Final> = {
  "0": "other",
  "1": "rieul",
  "2": "none",
  "3": "other",
  "4": "none",
  "5": "none",
  "6": "other",
  "7": "rieul",
  "8": "rieul",
  "9": "none",
};

function finalOf(word: string): Final {
  const trimmed = word.replace(/[\s.,!?·)\]}"'’”-]+$/u, "");
  const last = trimmed.slice(-1);
  if (!last) return "unknown";
  if (last in DIGIT_FINAL) return DIGIT_FINAL[last];
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "unknown";
  const jong = (code - 0xac00) % 28;
  if (jong === 0) return "none";
  return jong === 8 ? "rieul" : "other";
}

/** `word` 뒤에 붙일 조사(위 표). 받침을 알 수 없으면 종전 괄호 표기를 돌려준다. */
export function josa(word: string, pair: JosaPair): string {
  const final = finalOf(word);
  if (pair === "이/가") return final === "unknown" ? "이(가)" : final === "none" ? "가" : "이";
  return final === "unknown" ? "(으)로" : final === "other" ? "으로" : "로";
}

/** `word` + 조사. */
export function withJosa(word: string, pair: JosaPair): string {
  return `${word}${josa(word, pair)}`;
}
