// Groq 전송 전 개인식별정보 가명 처리 (2026-10-18, Architecture.md §74.5 판정표가 정본).
//
// 왜 Groq에만: 3차 예비 공급자는 이 서비스가 새로 데이터를 보내는 외부 처리자다. Gemini 경로까지
// 같은 처리를 넓힐지는 **정책 결정 사항**이라 이 모듈은 Groq 단계에서만 쓴다(§74.9 선택지).
//
// 입력 상태: 사용자 발화는 저장 전에 이미 `maskPII`(이메일·주민번호·전화·8자리 이상 숫자 → 토큰)를
// 거친다(roleplay/index.ts:100). 그래서 여기서는 그 규칙을 **사용자 턴에 한 번 더**(멱등 방어선) 적용하고,
// `maskPII`가 다루지 않는 **이름·생년월일**을 가명으로 바꾼다.
//
// | 대상 | 탐지 규칙 | 전송값 | 응답 복원 |
// |---|---|---|---|
// | 이메일·주민번호·전화·계좌(8자리+) | `maskPII` 재적용(사용자 턴만) | `[이메일]` 등 토큰 | 아니요(Gemini 경로와 같은 토큰) |
// | 이름 | ① 사용자 턴 "이름/성함 은·는·:" 뒤 한글 2~4자 ② 직전 사기범 턴이 이름/성함을 물었고 사용자 턴이 이름으로 시작 — 둘 다 첫 글자 성씨 · 절에 물음표 없음 · 흔한 말 제외 | 가명(`GROQ_NAME_PSEUDONYMS`) | 예 |
// | 생년월일 | 사용자 턴 "YYYY년 M월 D일"·"YY년 M월 D일"·"YYYY.MM.DD"(-,/) · 첫 6자리 숫자 1개(같은 턴 또는 직전 사기범 턴에 생년월일/생일 단서) | 가짜 날짜 | 예 |
//
// 탐지된 원문 값은 **사용자 턴과 사기범 턴 모두**에서 같은 가명으로 바꾼다(사기범이 이름을 되불렀을 수 있다).
// 사기범 턴에는 `maskPII`를 적용하지 않는다 — 사기범의 가상 계좌·번호가 `[계좌]` 토큰으로 바뀌면 모델이
// 그 토큰을 그대로 읊을 수 있다(2026-09-06 "[계좌]" 리터럴 노출 사고와 같은 부류).
// 응답 복원: 모델이 가명을 되부르면 사용자에게는 원래 이름·날짜가 보여야 몰입이 안 깨진다 → `restore()`.
//
// ⚠️ 한계(자기 고지): 단서 없는 이름("저는 홍길동입니다")·자유 서술 날짜("구십년 일월 일일")는 잡지 않는다.
// "저는 X입니다"를 이름으로 보면 "학생입니다"까지 가명으로 바뀌어 **뜻이 바뀐다** — 과소 탐지를 택했다.
// ⛔ 탐지 결과(원문 값)를 로그에 싣지 말 것 — 개수만 남긴다(G170).
import { maskPII } from "../guardrails";
import type { LlmMessage } from "./types";

/** 이름 가명(순서대로 배정). 원문에 이미 있는 가명은 건너뛴다. */
export const GROQ_NAME_PSEUDONYMS: readonly string[] = ["정하윤", "한지호", "오서준", "윤채원", "남궁민"];
/** 생년월일 가명(순서대로 배정). */
export const GROQ_BIRTHDATE_PSEUDONYMS: readonly string[] = [
  "1971년 3월 14일",
  "1968년 9월 27일",
  "1975년 11월 5일",
  "1963년 6월 18일",
];

// 이름 탐지는 **값이 서술된 경우만** 잡는다(리뷰 M1 — "이름이 뭐예요?"·"성함이 어떻게 되세요?" 같은 *질문*의
// 어휘를 이름으로 오탐해 사기범 턴까지 치환하던 문제). 세 겹으로 좁힌다:
//   ① 단서는 "이름/성함 + 은·는·:"만(질문은 보통 "이름이 …?"라 `이`를 뺐다)
//   ② 첫 글자가 한국 성씨(SURNAMES)여야 한다
//   ③ 그 절(쉼표·마침표 전까지)에 물음표가 있으면 버리고, 흔한 말 목록(NOT_A_NAME)도 버린다.
const NAME_SUFFIX = "(?=이에요|에요|예요|입니다|이고|이구요|이요|요|이라고|라고|이며|[\\s.,!~]|$)";
const NAME_CUE_RE = new RegExp(`(?:이름|성함)\\s*(?:은|는|:)\\s*([가-힣]{2,4}?)${NAME_SUFFIX}`, "g");
const LEADING_NAME_RE = new RegExp(`^\\s*(?:네[,\\s]*)?([가-힣]{2,4}?)${NAME_SUFFIX}`);
const ASKS_NAME_RE = /이름|성함/;
const ASKS_BIRTHDATE_RE = /생년월일|생일/;
/** 흔한 한국 성씨(1글자). 첫 글자가 여기 없으면 이름으로 보지 않는다. */
const SURNAMES = new Set(
  "김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국봉경태목형피두감호".split(""),
);
/** 성씨 글자로 시작하지만 이름이 아닌 흔한 말 — 가명으로 바꾸면 뜻이 바뀐다. */
const NOT_A_NAME = new Set([
  "정말", "정확", "지금", "진짜", "진짜요", "조금", "잠깐", "이거", "이건", "이게", "이제", "이미", "이상",
  "이유", "하지", "하나", "한번", "안돼", "안해", "안녕", "오늘", "오케이", "고객", "고객님", "고마워",
  "문제", "신고", "경찰", "금감원", "금융", "검찰", "주소", "전화", "장난", "차라리", "최근", "방금", "서류",
  "송금", "사기", "우리", "우선", "나중", "남편", "강제", "권한", "황당", "유선", "노노", "마음", "여기",
  "연락", "명의", "공무원", "도대체", "소리", "선생", "설마", "마침", "모르", "모르겠", "모름", "제가", "제발",
  "저기", "확인", "본인", "비밀", "민원", "구청", "국세청", "경찰서", "은행", "기다", "기억", "반대", "변호사",
]);

function isNameCandidate(value: string | undefined, clause: string): value is string {
  if (!value || NOT_A_NAME.has(value)) return false;
  if (!SURNAMES.has(value[0])) return false;
  return !clause.includes("?");
}

/** `text`에서 `index`가 속한 절(쉼표·마침표·줄바꿈 사이)을 돌려준다. */
function clauseAround(text: string, start: number, end: number): string {
  const before = text.slice(0, start).search(/[^,.\n]*$/);
  const afterMatch = /[,.\n]/.exec(text.slice(end));
  return text.slice(before, afterMatch ? end + afterMatch.index : text.length);
}

const BIRTHDATE_RES: readonly RegExp[] = [
  /(?:19|20)\d{2}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/g,
  /(?<!\d)\d{2}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/g,
  /(?<!\d)(?:19|20)\d{2}\s*[.\-/]\s*\d{1,2}\s*[.\-/]\s*\d{1,2}(?!\d)/g,
];
const SIX_DIGIT_RE = /(?<!\d)\d{6}(?!\d)/g;

export interface PseudonymizeResult {
  readonly messages: LlmMessage[];
  /** 응답 텍스트의 가명을 원문으로 되돌린다. */
  readonly restore: (text: string) => string;
  readonly nameCount: number;
  readonly birthdateCount: number;
}

function collectNames(messages: readonly LlmMessage[]): string[] {
  const found: string[] = [];
  const add = (value: string | undefined, clause: string): void => {
    if (!isNameCandidate(value, clause) || found.includes(value)) return;
    found.push(value);
  };
  messages.forEach((message, index) => {
    if (message.role !== "user") return;
    const utterance = stripDataWrapper(message.content);
    for (const m of utterance.matchAll(NAME_CUE_RE)) {
      add(m[1], clauseAround(utterance, m.index ?? 0, (m.index ?? 0) + m[0].length));
    }
    const previous = messages[index - 1];
    if (previous?.role === "assistant" && ASKS_NAME_RE.test(previous.content)) {
      const m = LEADING_NAME_RE.exec(utterance);
      if (m) add(m[1], clauseAround(utterance, m.index, m.index + m[0].length));
    }
  });
  return found;
}

/** `wrapUserInputAsData`가 붙인 구분자 줄을 건너뛰고 실제 발화의 첫 줄부터 본다. */
function stripDataWrapper(content: string): string {
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  const inner = lines.filter((line) => !/^[<\[].*[>\]]$/.test(line.trim()));
  return (inner.length > 0 ? inner : lines).join("\n");
}

function collectBirthdates(messages: readonly LlmMessage[]): string[] {
  const found: string[] = [];
  const add = (value: string): void => {
    if (!found.includes(value)) found.push(value);
  };
  messages.forEach((message, index) => {
    if (message.role !== "user") return;
    for (const re of BIRTHDATE_RES) for (const m of message.content.matchAll(re)) add(m[0]);
    const previous = messages[index - 1];
    const cued =
      ASKS_BIRTHDATE_RE.test(message.content) ||
      (previous?.role === "assistant" && ASKS_BIRTHDATE_RE.test(previous.content));
    // 단서가 있는 턴의 **첫 6자리 하나만**(리뷰 m3 — 같은 턴의 인증번호까지 날짜로 바꾸지 않게).
    if (cued) {
      const first = message.content.match(SIX_DIGIT_RE)?.[0];
      if (first) add(first);
    }
  });
  return found;
}

function assignPseudonyms(
  originals: readonly string[],
  pool: readonly string[],
  corpus: string,
): Array<[string, string]> {
  const available = pool.filter((candidate) => !corpus.includes(candidate));
  const pairs: Array<[string, string]> = [];
  originals.forEach((original, index) => {
    const pseudonym = available[index];
    // 가명이 바닥나면 그 값은 바꾸지 않는다(대화 5턴 남짓에서 5개 초과는 비현실적 — 조용히 넘기지 않게 개수는 로그에 남는다).
    if (pseudonym) pairs.push([original, pseudonym]);
  });
  return pairs;
}

function replaceAll(text: string, pairs: ReadonlyArray<readonly [string, string]>): string {
  // 긴 원문부터 바꾼다("홍길동"보다 "남궁홍길"이 먼저).
  const sorted = [...pairs].sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [from, to] of sorted) out = out.split(from).join(to);
  return out;
}

/** 판정표(머리 주석)대로 메시지를 가명 처리하고, 응답 복원 함수를 돌려준다. systemPrompt는 다루지 않는다(사용자 데이터 없음). */
export function pseudonymizeForGroq(messages: readonly LlmMessage[]): PseudonymizeResult {
  const corpus = messages.map((m) => m.content).join("\n");
  const names = collectNames(messages);
  const birthdates = collectBirthdates(messages);
  const pairs = [
    ...assignPseudonyms(birthdates, GROQ_BIRTHDATE_PSEUDONYMS, corpus),
    ...assignPseudonyms(names, GROQ_NAME_PSEUDONYMS, corpus),
  ];

  const out = messages.map((message) => ({
    role: message.role,
    content: replaceAll(message.role === "user" ? maskPII(message.content) : message.content, pairs),
  }));
  // maskPII 이후에 바꾸면 6자리 생년월일은 maskPII(8자리 이상만 계좌)와 겹치지 않는다. 바꾼 순서는
  // 가명 처리 → maskPII가 아니라 maskPII → 가명이라, 가명 날짜("1971년 3월 14일")가 maskPII에 걸릴 일도 없다.
  const reverse = pairs.map(([original, pseudonym]) => [pseudonym, original] as const);
  return {
    messages: out,
    restore: (text: string) => replaceAll(text, reverse),
    nameCount: names.length,
    birthdateCount: birthdates.length,
  };
}
