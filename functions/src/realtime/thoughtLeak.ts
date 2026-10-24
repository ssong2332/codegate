// 실시간 통화 사기범 전사에 섞인 모델의 영어 사고 문장 제거 (2026-10-23, Architecture.md §116 판정표가 정본 · DECISIONS #231).
//
// 근거(실 키 프로브 2026-10-23 · PR #386 확인 ② · gemini-3.8-live · fv-c5fj): 사기범 3턴 출력 전사(`outputTranscription`)가
// `thought\nThe user asked, "Oh, is that so? What should I do?" which means … asset size.협조해 주시면 …` 로 왔다 —
// 영어 사고 문단(약 100단어) 바로 뒤에 한국어 대사가 붙었다. 3.8 Live는 사고를 끌 수 없다(`thinkingLevel`·`thinkingConfig`
// 미지원 — ai.google.dev/gemini-api/docs/models/gemini-3.8-live "Omit `thinking_level` (or `thinking_config`)").
//
// | 행 | 조건                                                                        | 처리                                   |
// |----|-----------------------------------------------------------------------------|----------------------------------------|
// | 1  | 앞머리가 `thought` 표지(대소문자 무관 · 앞 공백·`*` 허용 · 뒤가 공백·`:`·끝) | 표지 ~ 첫 한글 직전까지 지운다         |
// | 2  | 한글이 없는 구간에 라틴 단어가 `THOUGHT_SPAN_MIN_WORDS`(8)개 이상            | 그 구간을 지운다(앞 문장부호는 남긴다) |
// | 2-b| §129 D3 — 도구 호출 문자열(밑줄 식별자 + 괄호 인자 · 백틱 허용, 예: `send_prepared_sms(purpose="transfer")`) | 지운다(전사만 — 이미 나간 소리는 되돌릴 수 없다) |
// | 3  | 그 밖(OTP · ATM · SMS 같은 짧은 영어 · 숫자)                                | 원문 그대로(바이트 동일)               |
// | 4  | 지운 뒤 남은 글이 없다                                                      | 빈 문자열                              |
//
// ⛔ 사기범(scammer) 전사에만 쓴다 — 참가자 발화는 걸러내지 않는다(참가자가 영어로 말한 것도 기록이다).
// ⚠️ 8단어는 판단값이다 — 실측 문단은 약 100단어, 정상 대사의 한글 없는 구간은 영문 약어 1~3단어였다.
// ⚠️ 행 1에서 사고 문단 안에 한글 인용(예: `The user said "네"`)이 있으면 그 인용부터 남는다 — 그 뒤 영어는 행 2가 지운다.
// ⛔ 로그에 본문을 싣지 않는다(G170) — 호출부는 "지웠다"는 사실만 셀 수 있다.
//
// ⛔ 아래 "사본 시작" ~ "사본 끝" 구간은 `src/lib/realtime/thoughtLeak.ts`와 **글자까지 같아야 한다**
//    (루트 `thoughtLeak.test.ts`가 두 파일을 읽어 대조한다 — 빌드 루트가 달라 import로 공유하지 않는다).

// ── 사본 시작 ──
/** 행 2의 문턱 — 한글 없는 구간에 이만큼 이상 라틴 단어가 있으면 사고 문장으로 본다(판단값). */
export const THOUGHT_SPAN_MIN_WORDS = 8;

const HANGUL = /[가-힣ㄱ-ㆎ]/;
const NON_HANGUL_SPAN = /[^가-힣ㄱ-ㆎ]+/g;
const LATIN_WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
const THOUGHT_MARKER = /^[\s*]*thought(?=[\s:*]|$)[\s:*]*/i;
const LEADING_PUNCT = /^[.,!?…~。]*/;
/** 행 2-b(§129 D3) — 도구 호출 문자열(`send_prepared_sms(purpose="transfer")`처럼 밑줄 식별자 + 괄호 인자, 백틱 감싸기 허용). */
const TOOL_CALL_TEXT = /`*\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\s*\([^()\n]{0,80}\)`*/g;

function latinWordCount(text: string): number {
  return (text.match(LATIN_WORD) ?? []).length;
}

/** 앞머리 `thought` 표지(행 1)가 있는가. */
export function hasThoughtMarker(text: string): boolean {
  return THOUGHT_MARKER.test(text);
}

/** 사기범 전사 1턴에서 사고 문장을 지운다. 지울 것이 없으면 원문을 그대로 돌려준다(행 3). */
export function stripLeakedThought(text: string): string {
  let rest = text;
  let stripped = false;
  const marker = rest.match(THOUGHT_MARKER);
  if (marker) {
    const after = rest.slice(marker[0].length);
    const firstHangul = after.search(HANGUL);
    rest = firstHangul < 0 ? "" : after.slice(firstHangul);
    stripped = true;
  }
  rest = rest.replace(TOOL_CALL_TEXT, () => {
    stripped = true;
    return " ";
  });
  rest = rest.replace(NON_HANGUL_SPAN, (span) => {
    if (latinWordCount(span) < THOUGHT_SPAN_MIN_WORDS) return span;
    stripped = true;
    return `${span.match(LEADING_PUNCT)?.[0] ?? ""} `;
  });
  if (!stripped) return text;
  return rest.replace(/\s+/g, " ").trim();
}
// ── 사본 끝 ──
