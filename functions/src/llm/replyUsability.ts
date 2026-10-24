// 사기범 대사로 쓸 수 없는 응답 판정 (2026-10-22, Architecture.md §102 판정표가 정본 · DECISIONS #217).
//
// 근거(라이브 실측 2026-10-22): 메신저 지인 사칭 중급 첫 메시지가 `I'm sorry, but I can’t comply with that.`
// 로 나왔다 — 1차 Gemini가 503·단계 시간 초과로 실패해 3차 예비 Groq(openai/gpt-oss-120b)가 응답했고,
// 그 모델이 사기범 역할을 거절한 문장이 아무 검사 없이 화면에 나갔다.
//
// | 순서 | 조건(마커 `[[…]]`·URL을 지운 본문 기준)                                   | 판정 | 사유              |
// |------|---------------------------------------------------------------------------|------|-------------------|
// | 1    | 원문이 공백뿐                                                              | 불가 | `empty`           |
// | 1-b  | 마커·URL을 지우면 빈 문자열이고 링크·문자 마커나 URL이 있다(링크만 보내는 응답) | 가능 | —                 |
// | 1-c  | 마커·URL을 지우면 빈 문자열이고 신호 마커뿐이다 — §129 D1(빈 말풍선)         | 불가 | `empty`           |
// | 2    | 영어 거절·사과 문구(`ENGLISH_REFUSAL_PATTERNS`)                             | 불가 | `english-refusal` |
// | 3    | 한국어 AI 자기 지칭 거절(`KOREAN_AI_REFUSAL_PATTERNS` — "AI로서"·"역할극은 할 수 없") | 불가 | `korean-ai-refusal` |
// | 3-b  | 훈련 메타 · 고지 문형(`TRAINING_META_PATTERNS` — "[훈련 …", "훈련 시뮬레이션", "이 훈련은", "연습을 위해", "이 장면은", 역할극 언급 · §129 "이 응답은" · "훈련에서는 여기서 멈추" · "실제 사기였다면") — §120 | 불가 | `training-meta` |
// | 3-c  | 본문이 괄호 표기(지문 · 메타)뿐이고 링크·문자 마커가 없다 — §129 D1            | 불가 | `empty`           |
// | 4    | 한글(음절·자모)이 0자                                                       | 불가 | `no-hangul`       |
// | 5    | 라틴 문자 수 > 한글 수 × 2                                                  | 불가 | `mostly-foreign`  |
// | 6    | 그 밖                                                                      | 가능 | —                 |
//
// ⛔ 한국어 사과("죄송합니다"·"미안해")는 **정상**이다 — 사기범 대사에 흔히 나온다. 한국어 행(3)은 모델이
//    자신을 AI·언어 모델로 지칭하거나 역할극 자체를 거절하는 문형만 본다("저는 OO은행 AI 상담원입니다"는 통과).
// ⛔ 이 판정은 사기범 대사 경로(`purpose: "scammer-reply"`)에만 쓴다 — 되감기 판정(JSON 응답)에는 쓰지 않는다.
// ⛔ 로그·에러 메시지에 응답 본문을 싣지 않는다(G170) — 사유 코드만.

/** 판정 불가 사유 코드(로그에 싣는 값). */
export type UnusableReplyReason =
  | "empty"
  | "english-refusal"
  | "korean-ai-refusal"
  | "training-meta"
  | "no-hangul"
  | "mostly-foreign";

const MARKER_PATTERN = /\[\[[^\]]*\]\]/g;
const URL_PATTERN = /https?:\/\/\S+/gi;
/** `g` 없는 사본 — `.test()`가 lastIndex를 이어 쓰지 않게. */
const HAS_URL = /https?:\/\/\S+/i;
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

/**
 * 훈련 메타 · 고지 문형(§120 — 실기 신고 2026-10-23: 사진 턴에 1차 Claude가 *"[훈련 시뮬레이션 — 실제 신분증 사진은 받지 않습니다.
 * 이 훈련은 여기서 종료됩니다.] 이 장면은 … 연습을 위해 마무리합니다."* 를 사기범 대사로 냈다). 사기범이 할 리 없는 말만 잡는다.
 * ⛔ 오탐 주의: "대출 한도 시뮬레이션" · "예비군 훈련" · "[OO은행]"/"[Web발신]" 머리말은 정상이다 — 그래서 단독 "시뮬레이션"·"훈련"이 아니라 결합형만 본다.
 */
export const TRAINING_META_PATTERNS: readonly RegExp[] = [
  /[\[［]\s*(?:훈련|시뮬레이션|모의\s*훈련|교육용|안내\s*[:：—-])/,
  /(?:훈련|예방|교육|모의)\s*(?:용\s*)?시뮬레이션|시뮬레이션\s*(?:훈련|상황|입니다|이며|이므로|이라서|을\s*(?:종료|마무리|마칩))/,
  /(?:^|[^가-힣])(?:이|본)\s*훈련(?:은|을|이|에서|의)|훈련\s*(?:을|은|이|에서는?)?\s*여기서\s*(?:종료|마무리|마칩|끝|멈추|멈춥)|훈련\s*참가자/,
  /연습(?:을|하기)\s*위해|(?:알아차리|대응하|구별하|판단하|거절하)는\s*연습/,
  /이\s*장면은/,
  /역할\s*극|롤\s*플레이/,
  // §129(프로브 2026-10-24 D1 · D2) — "(이 응답은 훈련을 마무리하는 내용입니다.)" · "실제 사기였다면 어떤 일이 벌어지는지 되짚어 보시면 됩니다".
  /이\s*응답은/,
  /실제\s*(?:사기|상황)(?:였|이었)다면/,
];

/** §129 D1 — 화면에 무언가를 남기는 마커(링크 칩 · 문자). 신호(`[[SIGNAL:…]]`)만 있는 응답은 말풍선이 빈다. */
const VISIBLE_MARKER_PATTERN = /\[\[(?:LINK|SMS):[^\]]*\]\]/;
/** §129 D1 — 본문이 괄호 표기뿐인가(대사 없이 지문 · 메타 표기만 — 저장 전 `roleplay/replyMarkup.ts`가 지우면 말풍선이 빈다). 어휘를 가리지 않는 근사다. */
const PAREN_ONLY_BODY = /^(?:\s*(?:\([^()\n]{0,40}\)|\[[^\[\]\n]{0,40}\]|【[^【】\n]{0,40}】))+\s*$/;

/** 판정 결과 — 가능이면 `undefined`, 불가면 사유 코드. */
export function judgeScammerReplyUsability(text: string): UnusableReplyReason | undefined {
  const body = text.replace(MARKER_PATTERN, " ").replace(URL_PATTERN, " ");
  if (text.trim() === "") return "empty";
  // 마커·URL만 있는 응답(예: 링크만 보내는 문자)은 행동으로서 정상이다 — 한글 행(4·5)을 적용하지 않는다.
  // §129 D1 — 단, 보이는 것을 남기는 마커(링크 · 문자)나 URL이 없으면(신호만) 말풍선이 비므로 불가다.
  if (body.trim() === "") {
    return VISIBLE_MARKER_PATTERN.test(text) || HAS_URL.test(text) ? undefined : "empty";
  }
  if (ENGLISH_REFUSAL_PATTERNS.some((pattern) => pattern.test(body))) return "english-refusal";
  if (KOREAN_AI_REFUSAL_PATTERNS.some((pattern) => pattern.test(body))) return "korean-ai-refusal";
  if (TRAINING_META_PATTERNS.some((pattern) => pattern.test(body))) return "training-meta";
  // §129 D1 — 괄호 표기만 남은 본문("(잠시 침묵)")도 저장 전에 지워져 말풍선이 빈다(메타 문형은 바로 위 행이 먼저 잡는다).
  if (PAREN_ONLY_BODY.test(body) && !VISIBLE_MARKER_PATTERN.test(text)) return "empty";
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
