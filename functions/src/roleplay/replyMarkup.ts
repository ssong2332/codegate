// 사기범 대사 표기 정리(PR-A3, 2026-10-20 — 감사 B 매트릭스 1일차 #5 · #6 · #8). 순수 함수.
//
// 채팅에 그대로 보인 모델 표기 잔재 3종을 저장 전에 지운다. 마커 추출(링크 · 문자 · 신호)이 **모두 끝난 뒤**,
// 실존 금융회사명 치환 · 문장 수 상한 **앞**에서 부른다(호출부 2곳: `roleplay/index.ts` sendMessage · `roleplay/openingLine.ts`).
// 마커 자리에서 생기는 잔재(빈 백틱 · "링크 에")는 `linkMarker.ts`가 마커 자리 기준으로 먼저 지운다 — 여기서는 마커와 무관하게
// 모델이 직접 쓴 표기만 다룬다.
//
// | # | 대상 | 처리 | 근거(감사 B 1일차) |
// |---|---|---|---|
// | 1 | 굵게 표기 `**…**` (한 줄 안 · 짝이 맞을 때만) | 별표만 지우고 안의 글은 남긴다 | #5 friend-loan 고급 S6 "**비밀번호 4자리**" |
// | 2 | 빈 백틱 "``" (앞뒤에 다른 백틱이 붙지 않은 두 개) | 지운다 | #6 subsidy 중급 S3 "안내드리는 `` 주소로" |
// | 3 | 지문 괄호 — 괄호 안이 아래 지문 어휘로 **시작**하고(어휘 바로 뒤 = `)`·공백·쉼표·말줄임) 12자 이하 | 괄호째 지운다 | #8 subsidy 초급 S5 "(잠시 후) 여보세요?" |
// | 4 | 1~3으로 생긴 연속 공백 · 줄머리 · 줄끝 공백 · 구두점 앞 공백 | 정리한다(줄바꿈은 그대로) | — |
//
// ⛔ 지문 어휘는 **허용 목록**이다 — 괄호 일반("(주)" · "(1588-…)" · "(가상)")은 건드리지 않는다. 목록 밖 지문은 남는다(과소 정리가
// 문면 훼손보다 낫다). ⛔ 마커(`[[…]]`)는 이 함수 앞에서 이미 빠졌다 — 이 함수는 마커를 만들거나 해석하지 않는다(AC-024).
// ⛔ 대사 내용(요구 · 수법 · 숫자)은 바꾸지 않는다 — 표기만이다.

const BOLD_PAIR = /\*\*([^*\n]+?)\*\*/g;
const EMPTY_BACKTICKS = /(?<!`)``(?!`)/g;
const STAGE_DIRECTION_HEADS = [
  "잠시\\s*(?:후|뒤|만|침묵)",
  "한숨",
  "웃음",
  "웃으며",
  "울먹이며",
  "흐느끼며",
  "침묵",
  "머뭇거리며",
  "목소리를\\s*낮추며",
  "작은\\s*목소리로",
  "통화\\s*연결음",
  "전화\\s*연결음",
  "연결음",
  "신호음",
  "벨\\s*소리",
  "효과음",
];
// 리뷰 Minor 1 — 지문 어휘 **바로 뒤**가 `)` · 공백 · 쉼표 · 말줄임일 때만 지문이다("(잠시만요 고객님)"·"(침묵을 지켜 주세요)"는 대사라 남긴다).
const STAGE_DIRECTION = new RegExp(
  `[ \\t]*\\((?=(?:${STAGE_DIRECTION_HEADS.join("|")})(?:\\)|[ \\t,…]|\\.\\.\\.))[^()\\n]{1,12}\\)`,
  "g",
);

export type ReplyMarkupResult = {
  text: string;
  /** 지운 표기 수(로그용 숫자 — 대사 본문은 로그에 싣지 않는다 · G170). */
  removedCount: number;
};

export function tidyScammerReplyMarkup(text: string): ReplyMarkupResult {
  let removedCount = 0;
  const count = () => {
    removedCount += 1;
  };
  const tidied = text
    .replace(BOLD_PAIR, (_m, inner: string) => {
      count();
      return inner;
    })
    .replace(EMPTY_BACKTICKS, () => {
      count();
      return "";
    })
    .replace(STAGE_DIRECTION, () => {
      count();
      return "";
    });
  if (removedCount === 0) return { text, removedCount };
  const normalized = tidied
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/ ([.,!?])/g, "$1")
    .trim();
  return { text: normalized, removedCount };
}
