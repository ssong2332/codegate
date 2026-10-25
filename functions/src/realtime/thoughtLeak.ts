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
// | 2-c| §132.8 — 한국어 대사에 없는 문자 체계(데바나가리 · 키릴 · 태국 · 아랍 · 가나 등 — `FOREIGN_SCRIPT`)    | 그 글자만 지운다(전사 · 자막만 — 소리는 되돌릴 수 없다) |
// | 2-d| §132.12 — 동그라미 자리표시("○○님" · "○○ 씨" · "○○경찰서")                                         | "고객님" · 자리표시만 지운다            |
// | 2-e| §132.14 — 한 글자 성 + 동그라미("김○○ 씨" · "김○○님" · "김○○ 수사관")                               | 성째 "본인" · "고객님" · "김 수사관"    |
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

/** 행 2-b(§129 (A)) — 대괄호 도구 · 시스템 서술("[문자 발송 도구 호출: …]" · "[시스템 메시지 …]"). */
const BRACKET_TOOL_TEXT = /\[[^\[\]\n]{0,24}(?:도구\s*(?:호출|실행|사용)|시스템\s*(?:메시지|안내|호출|처리)|함수\s*호출)[^\[\]\n]{0,40}\]/g;

/**
 * 행 2-c(§132.8 · 실 키 회귀 프로브 2026-10-24b N3 — 가족 사고 초급 "다른 사람에겐 절대 말하지 मा세요.") — 한국어 대사에 나올 일이 없는
 * 문자 체계(그리스 · 키릴 · 아르메니아 · 히브리 · 아랍 · 인도계 · 태국 · 라오 · 미얀마 · 조지아 · 에티오피아 · 크메르 · 일본 가나). 한자 · 라틴은 대상이 아니다.
 * ES2017(루트 빌드)에서도 쓰도록 `\p{Script=…}` 대신 코드 범위로 적는다.
 */
const FOREIGN_SCRIPT =
  /[\u0370-\u03FF\u0400-\u04FF\u0530-\u058F\u0590-\u05FF\u0600-\u06FF\u0900-\u0DFF\u0E00-\u0EFF\u1000-\u109F\u10A0-\u10FF\u1200-\u137F\u1780-\u17FF\u3040-\u30FF]+/g;

/**
 * 행 2-d(§132.12 · 메인 라이브 2026-10-24 자녀 납치 초급 "거기 혹시 ○○ 씨 본인 맞으세요? 저는 시내 ○○경찰서 …") — 이름 · 기관 자리를 동그라미로 채운
 * 자리표시. 폴백 대사는 `replyMarkup.ts` 4-d · 4-e가 정리한다 — 여기는 실시간 전사 · 자막. "○○님" = "고객님" · "씨" · 기관 이름 · 직함 앞 = 자리표시만 지운다("○○학원" 같은 가린 표기는 그대로 — 4-e와 같은 목록).
 */
/**
 * 행 2-e(§132.14 · 메인 라이브 2026-10-25 "거기 혹시 김맞으세요?") — 한 글자 성 + 자리표시("김○○ 씨" · "김○○님" · "김○○ 수사관"). 성 바로 뒤에 공백 없이 동그라미가
 * 붙고 성 앞 글자가 한글이 아닐 때만 성으로 본다. "씨" = 성째 "본인"(뒤 "본인"은 하나만 · 조사는 받침에 맞춘다) · "님" = 성째 "고객님" · 직함 앞 = 성만 남긴다("김 수사관").
 * 폴백 `replyMarkup.ts` 4-f와 같은 성 목록이다.
 */
const CIRCLE_SURNAME =
  "김|이|박|최|정|강|조|윤|장|임|한|오|서|신|권|황|안|송|류|유|홍|전|고|문|양|손|배|백|허|남|심|노|하|곽|성|차|주|우|구|민|진|나|지|엄|채|원|천|방|공|현|함|변|염|여|추|도|소|석|선|설|마|길|연|위|표|명|기|반|왕|금|옥|육|맹|제|모|탁|국|어|편|용|예|봉|경";
const CIRCLE_LEAD_SURNAME = `(?:(^|[^가-힣])(?:${CIRCLE_SURNAME})(?=[○◯●]))?`;
const CIRCLE_HONORIFIC = new RegExp(`${CIRCLE_LEAD_SURNAME}[○◯●]{2,3}\\s*님`, "g");
const CIRCLE_SSI = new RegExp(`${CIRCLE_LEAD_SURNAME}[○◯●]{2,3}\\s*씨(는|가|를)?\\s*(?:본인\\s*)?`, "g");
const CIRCLE_SSI_PARTICLE: Record<string, string> = { 는: "은", 가: "이", 를: "을" };
const CIRCLE_ORG = /[○◯●]{2,3}\s*(?=(?:지방)?(?:경찰서|경찰청|검찰청|지검|지청|법원|은행|카드|병원|구청|시청|군청|센터|본부|금융감독원|금감원))/g;
const CIRCLE_TITLE = new RegExp(
  `(?:(${CIRCLE_SURNAME})(?=[○◯●]))?[○◯●]{2,3}\\s*(?=(?:수사관|검사|형사|팀장|과장|대리|주임|경위|경사|경장|순경|변호사|실장|부장))`,
  "g",
);

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
  rest = rest.replace(BRACKET_TOOL_TEXT, () => {
    stripped = true;
    return " ";
  });
  rest = rest.replace(TOOL_CALL_TEXT, () => {
    stripped = true;
    return " ";
  });
  rest = rest.replace(FOREIGN_SCRIPT, () => {
    stripped = true;
    return "";
  });
  rest = rest.replace(CIRCLE_HONORIFIC, (_m, lead: string | undefined) => {
    stripped = true;
    return `${lead ?? ""}고객님`;
  });
  rest = rest.replace(CIRCLE_SSI, (_m, lead: string | undefined, particle: string | undefined) => {
    stripped = true;
    return `${lead ?? ""}본인${particle ? CIRCLE_SSI_PARTICLE[particle] : ""} `;
  });
  rest = rest.replace(CIRCLE_ORG, () => {
    stripped = true;
    return "";
  });
  rest = rest.replace(CIRCLE_TITLE, (_m, surname: string | undefined) => {
    stripped = true;
    return surname ? `${surname} ` : "";
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
