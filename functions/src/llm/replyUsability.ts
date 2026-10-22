// 사기범 대사로 쓸 수 없는 응답 판정 (2026-10-22, Architecture.md §102 판정표가 정본 · DECISIONS #217).
//
// 근거(라이브 실측 2026-10-22): 메신저 지인 사칭 중급 첫 메시지가 `I'm sorry, but I can’t comply with that.`
// 로 나왔다 — 1차 Gemini가 503·단계 시간 초과로 실패해 3차 예비 Groq(openai/gpt-oss-120b)가 응답했고,
// 그 모델이 사기범 역할을 거절한 문장이 아무 검사 없이 화면에 나갔다.
//
// | 순서 | 조건(마커 `[[…]]`·URL을 지운 본문 기준)                                   | 판정 | 사유              |
// |------|---------------------------------------------------------------------------|------|-------------------|
// | 1    | 원문이 공백뿐                                                              | 불가 | `empty`           |
// | 1-b  | 마커·URL을 지우면 빈 문자열(링크만 보내는 응답)                             | 가능 | —                 |
// | 2    | 영어 거절·사과 문구(`ENGLISH_REFUSAL_PATTERNS`)                             | 불가 | `english-refusal` |
// | 3    | 한국어 AI 자기 지칭 거절(`KOREAN_AI_REFUSAL_PATTERNS` — "AI로서"·"역할극은 할 수 없") | 불가 | `korean-ai-refusal` |
// | 4    | 한글(음절·자모)이 0자                                                       | 불가 | `no-hangul`       |
// | 5    | 라틴 문자 수 > 한글 수 × 2                                                  | 불가 | `mostly-foreign`  |
// | 6    | 그 밖                                                                      | 가능 | —                 |
//
// ⛔ 한국어 사과("죄송합니다"·"미안해")는 **정상**이다 — 사기범 대사에 흔히 나온다. 한국어 행(3)은 모델이
//    자신을 AI·언어 모델로 지칭하거나 역할극 자체를 거절하는 문형만 본다("저는 OO은행 AI 상담원입니다"는 통과).
// ⛔ 이 판정은 사기범 대사 경로(`purpose: "scammer-reply"`)에만 쓴다 — 되감기 판정(JSON 응답)에는 쓰지 않는다.
// ⛔ 로그·에러 메시지에 응답 본문을 싣지 않는다(G170) — 사유 코드만.

/** 판정 불가 사유 코드(로그에 싣는 값). */
export type UnusableReplyReason = "empty" | "english-refusal" | "korean-ai-refusal" | "no-hangul" | "mostly-foreign";

const MARKER_PATTERN = /\[\[[^\]]*\]\]/g;
const URL_PATTERN = /https?:\/\/\S+/gi;
const HANGUL_PATTERN = /[가-힣ㄱ-ㆎ]/g;
const LATIN_PATTERN = /[A-Za-z]/g;

/** 영어 거절·사과 문형. 아포스트로피는 곧은 것(')과 둥근 것(’) 둘 다 받는다(실측 문장은 둥근 것). */
export const ENGLISH_REFUSAL_PATTERNS: readonly RegExp[] = [
  /\bI(?:['’]m| am) sorry\b/i,
  /\bsorry,? but\b/i,
  /\bI apologi[sz]e\b/i,
  /\bI (?:can['’]?t|cannot|can not|won['’]t|will not|am unable|['’]m unable|am not able)\b/i,
  /\b(?:can['’]?t|cannot|unable to|not able to) (?:comply|help|assist|provide|fulfil+|continue|engage|participate|role-?play)\b/i,
  /\bas an AI\b/i,
];

/** 한국어 AI 자기 지칭 거절 문형 — 좁게 둔다(정상 대사 오탐 방지). */
export const KOREAN_AI_REFUSAL_PATTERNS: readonly RegExp[] = [
  /(?:AI|인공지능|언어\s*모델|AI\s*어시스턴트)\s*(?:로서|으로서)/i,
  /(?:역할\s*극|사기범\s*(?:의\s*)?역할|사기꾼\s*(?:의\s*)?역할).{0,12}(?:할|드릴|수행할|연기할|계속할)\s*수\s*없/,
];

/** 판정 결과 — 가능이면 `undefined`, 불가면 사유 코드. */
export function judgeScammerReplyUsability(text: string): UnusableReplyReason | undefined {
  const body = text.replace(MARKER_PATTERN, " ").replace(URL_PATTERN, " ");
  if (text.trim() === "") return "empty";
  // 마커·URL만 있는 응답(예: 링크만 보내는 문자)은 행동으로서 정상이다 — 한글 행(4·5)을 적용하지 않는다.
  if (body.trim() === "") return undefined;
  if (ENGLISH_REFUSAL_PATTERNS.some((pattern) => pattern.test(body))) return "english-refusal";
  if (KOREAN_AI_REFUSAL_PATTERNS.some((pattern) => pattern.test(body))) return "korean-ai-refusal";
  const hangul = (body.match(HANGUL_PATTERN) ?? []).length;
  if (hangul === 0) return "no-hangul";
  const latin = (body.match(LATIN_PATTERN) ?? []).length;
  if (latin > hangul * 2) return "mostly-foreign";
  return undefined;
}

/** 사기범 대사로 쓸 수 없는 응답 — 다음 단계(Groq 예비 · Mock 강등)로 넘기는 신호다. 메시지에 본문 없음(G170). */
export class UnusableReplyError extends Error {
  constructor(readonly reason: UnusableReplyReason) {
    super(`LLM 응답을 사기범 대사로 쓸 수 없습니다(사유: ${reason}).`);
    this.name = "UnusableReplyError";
  }
}
