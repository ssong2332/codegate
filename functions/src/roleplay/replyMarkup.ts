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
// | 3-c | D-f2 맨 앞 짧은 괄호 지문 — 대사 **맨 앞**의 한글 괄호(2~15자 · 숫자 · 라틴 0)가 지문 끝맺음("-음" · "-며" · "중" · "후" · "뒤" · "채" · "듯" · "-히")으로 끝남 | 괄호째 지운다(지우면 빈 대사면 그대로) | P2 확인 실측 2026-11-01 지인 메신저 fv-42wd "(통화 맺음) 확인해 보니…" |
// | 3-d | R11(#477 실측) 지시 해설 괄호 — 괄호 안이 진행 해설 어휘(참가자 · 신호 · 기록 · 재촉 · 되풀이 · 다음 단계 · 지시 · 앱 화면 …)를 담고 해라체("-다")로 끝남 | 괄호째 지운다(지우면 빈 대사면 그대로) | 메신저 자녀 사칭 verbalInstall S3 · S8 · S10 |
// | 4 | 메타 표식 — 대괄호 · 괄호 · 겹낫표 안이 아래 메타 어휘를 담은 짧은 표기("[훈련 종료]" · "(시뮬레이션 끝)") | 괄호째 지운다 | 2026-10-21 실기 신고 6 friend-loan "…보내줘.[훈련 종료]" |
// | 4-b | §129 D10 자리표시 이름 — "나 ㅇㅇ이야"처럼 이름 자리를 자음 "ㅇㅇ"으로 채운 자기소개 | "나야"로 바꾼다(이름을 지어내지 않는다) | 프로브 2026-10-24 지인 카톡 고급 거절 S1 |
// | 3-b | §131(9) 괄호 속 혼잣말 — 띄어쓰기 있는 한국어 문장 + 종결 어미로 끝나는 괄호(숫자 0) | 괄호째 지운다(지우면 빈 대사면 그대로) | 프로브 2026-10-24b D6 |
// | 4-d | §131(10) 동그라미 자리표시 이름("○○님" · "상담원 ○○○입니다" · "나 ○○야") | "고객님" · 이름 삭제 · "나야" | 프로브 2026-10-24b D10 |
// | 4-e | §132.12 동그라미 자리표시 — "○○ 씨" · 기관 이름 앞("○○경찰서") · 직함 앞("○○○ 수사관") | 자리표시만 지운다("본인 맞으세요" · "경찰서" · "수사관") | 메인 라이브 2026-10-24 자녀 납치 초급 폴백 오프닝 |
// | 4-f | §132.14 한 글자 성 + 동그라미("김○○ 씨" · "김○○님" · "저는 김○○입니다" · "김○○ 수사관") | 성째 "본인" · "고객님" · "저는 담당자입니다" · 성만 남겨 "김 수사관" | 메인 라이브 2026-10-25 자녀 납치 초급 폴백 오프닝("거기 혹시 김맞으세요?") |
// | 4-c | §129 (A) 대사 전체를 감싼 따옴표 · 닫는 짝 없는 맨 앞 여는 따옴표(메타 표식 4행은 "도구 호출 · 시스템 메시지" 어휘도 본다) | 따옴표만 지운다 | 메인 라이브 확인 2026-10-24 기관 사칭 고급 폴백 |
// | 5 | 1~4로 생긴 연속 공백 · 줄머리 · 줄끝 공백 · 구두점 앞 공백 | 정리한다(줄바꿈은 그대로) | — |
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
  // §129 D6(프로브 2026-10-24 지인 카톡 고급 — "(잠시 말이 없다가)" · "(잠깐 머뭇거리다)"가 남았다).
  "잠시\\s*말(?:이|을)",
  "잠깐\\s*(?:머뭇거리[가-힣]*|멈칫[가-힣]*|말이|침묵|뜸)",
  "머뭇거리(?:다|더니|고|는)",
  "멈칫(?:하며|하다|하더니)?",
  "말없이",
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
// §131(9)(프로브 2026-10-24b D6 — "(잠시 침묵 후, 여전히 친절한 말투로)"가 남았다) — 머리 어휘가 맞으면 지문이므로 길이 상한을 12 → 30자로 넓힌다.
const STAGE_DIRECTION = new RegExp(
  `[ \\t]*\\((?=(?:${STAGE_DIRECTION_HEADS.join("|")})(?:\\)|[ \\t,…]|\\.\\.\\.))[^()\\n]{1,30}\\)`,
  "g",
);

// 3-b행(§131(9) — 프로브 D6 "(잠깐 확인하는 중이라 답이 늦어졌어요ㅠ)" · "(그 이름은 제가 정확히 떠오르지 않네요ㅠ)") — 괄호 속 혼잣말.
// 머리 어휘 목록으로는 잡히지 않는다. 괄호 안이 **띄어쓰기가 있는 한국어 문장**이고 **혼잣말 어미**(ㅠ · ㅜ로 끝남 · "-네요 · -군요 · -는데요 ·
// -거든요" · 과거 "-었/였어요")로 끝나며 숫자가 없을 때만 지운다. ⛔ 시키는 말("(침묵을 지켜 주세요)" — PR-A3 리뷰 Minor 1)은 대사라 남긴다.
// "(주)" · "(가상)" · "(1588-…)" · "(OO은행 고객센터)"도 남는다. 지우면 대사가 빈 경우는 지우지 않는다(아래).
const PAREN_MONOLOGUE =
  /[ \t]*\((?=[^()\n]*\s)(?:[^()\n\d]{4,60}?[ㅠㅜ]+|[^()\n\d]{4,60}?(?:네요|군요|는데요|거든요|[었였]어요|[었였]네)[ㅠㅜ]*)[.!?~…]*\)/g;

// 3-c행(D-f2 — P2 확인 실측 2026-11-01 지인 메신저 "(통화 맺음) 확인해 보니 이체가 들어가지 않았어요.") — 머리 어휘 목록(3행) 밖 지문이 대사 맨 앞에 붙은 것.
// 맨 앞 한 개만 · 한글 낱말 1~4개 · 끝 글자가 지문 끝맺음일 때만. ⛔ "(주)"(1자) · "(가상)" · "(참고로)" · "(OO은행 고객센터)"(라틴) · 가운데 괄호는 남는다.
const LEADING_STAGE_DIRECTION = /^\s*\((?=[가-힣\s]{2,15}\))(?:[가-힣]+\s){0,3}[가-힣]*(?:음|며|중|후|뒤|채|듯|히)\)[ \t]*/;

// R11(#477 실측 2026-11-01 — "(앱 설치 확인 신호가 없으니 아직 설치된 것으로 보지 않는다.)"처럼 지시 해설이 괄호째 대사에 섞였다) — 괄호 안이
// 진행 해설 어휘(참가자 · 신호 · 기록 · 재촉 · 되풀이 · 다음 단계 · 지시 · 앱 화면 …)를 담고 해라체("-다")로 끝나면 괄호째 지운다. 인물 대사는 이런 괄호를 쓰지 않는다.
const DIRECTIVE_COMMENTARY = /[ \t]*\((?=[^()\n]*(?:참가자|상대(?:가|의|는|에게)|신호|기록|재촉|되풀이|다음\s*단계|지시|넘어가지|앱\s*(?:화면|알림|확인)))[^()\n]{4,240}?다\.?\)/g;

// 4행 — 모델이 대사 밖 진행 표기(훈련 · 대화가 끝났다는 표시)를 대사에 붙인 것. 사기범 인물은 이런 표기를 할 이유가 없으므로
// 메타 어휘가 들어간 짧은 괄호만 지운다. ⛔ "[지원금 안내]" 같은 문자 머리표는 메타 어휘가 없어 남는다.
// §129 (A)(메인 라이브 확인 2026-10-24 · 기관 사칭 고급 폴백 — *"[문자 발송 도구 호출: 본인 확인용 인증번호 문자 발송] 고객님, …"*) — 도구 · 시스템 서술 어휘.
const META_TAG_WORDS =
  "훈련|시뮬레이션|롤플레이|역할극|모의|세션\\s*종료|대화\\s*종료|상황\\s*종료|도구\\s*(?:호출|실행|사용)|시스템\\s*(?:메시지|안내|호출|처리)|함수\\s*호출";
const META_TAG = new RegExp(
  `[ \\t]*(?:\\[[^\\[\\]\\n]{0,24}(?:${META_TAG_WORDS})[^\\[\\]\\n]{0,24}\\]` +
    `|\\([^()\\n]{0,24}(?:${META_TAG_WORDS})[^()\\n]{0,24}\\)` +
    `|【[^【】\\n]{0,24}(?:${META_TAG_WORDS})[^【】\\n]{0,24}】)`,
  "g",
);

// 4-b행 — "ㅇㅇ"은 "응응"이라는 뜻으로도 쓰므로 **자기소개 어형**("(나) ㅇㅇ(이)야/이에요/예요")만 본다.
const PLACEHOLDER_SELF_NAME = /(?:나\s*)?ㅇㅇ\s*(?:이)?(?:야|이에요|예요|에요)/g;

// 4-d행(§131(10) — 프로브 D10 "혹시 ○○님 맞으시죠?" · "상담원 ○○○입니다.") — 이름 자리를 동그라미 기호로 채운 표기. ⛔ 라틴 "OO"(OO은행 —
// 가상 표기)는 건드리지 않는다. 호칭형("○○님")은 "고객님"으로 · 자기소개형("상담원 ○○○입니다")은 이름만 뺀다 · 반말 자기소개("나 ○○야")는 "나야"로.
// 4-f행(§132.14 — 메인 라이브 2026-10-25 자녀 납치 초급 폴백 오프닝 "거기 혹시 김맞으세요?") — 모델이 "김○○ 씨"처럼 **한 글자 성 + 자리표시**로 쓰면
// 4-e가 "○○ 씨"만 지워 성이 남았다. 성은 자리표시와 한 덩어리로 본다(성 바로 뒤에 공백 없이 동그라미가 붙을 때만 — 앞 글자가 한글이면 성이 아니다).
// 호칭 · "씨"는 성째 바꾸고, 직함 앞은 성을 남겨 "김 수사관"으로, 주어 자기소개("저는 김○○입니다")는 "저는 담당자입니다"로 한다(이름을 지어내지 않는다).
const SURNAME =
  "김|이|박|최|정|강|조|윤|장|임|한|오|서|신|권|황|안|송|류|유|홍|전|고|문|양|손|배|백|허|남|심|노|하|곽|성|차|주|우|구|민|진|나|지|엄|채|원|천|방|공|현|함|변|염|여|추|도|소|석|선|설|마|길|연|위|표|명|기|반|왕|금|옥|육|맹|제|모|탁|국|어|편|용|예|봉|경";
const PLACEHOLDER_CIRCLE_HONORIFIC = new RegExp(`(?:(^|[^가-힣])(?:${SURNAME})(?=[○◯●]))?[○◯●]{2,3}\\s*님`, "g");
const PLACEHOLDER_CIRCLE_SUBJECT_SELF = new RegExp(`(저는|전)\\s+(?:(?:${SURNAME})(?=[○◯●]))?[○◯●]{2,3}\\s*(?=입니다|이에요|예요|에요)`, "g");
const PLACEHOLDER_CIRCLE_SELF = new RegExp(`\\s*(?:(?:${SURNAME})(?=[○◯●]))?[○◯●]{2,3}\\s*(?=입니다|이에요|예요|에요|이고|인데)`, "g");
const PLACEHOLDER_CIRCLE_CASUAL = new RegExp(`(?:나\\s*)?(?:(?:${SURNAME})(?=[○◯●]))?[○◯●]{2,3}\\s*(?:이)?야`, "g");
// 4-e행(§132.12 — 메인 라이브 "거기 혹시 ○○ 씨 본인 맞으세요? 저는 시내 ○○경찰서 수사과 소속입니다.") — "씨" 호칭 · 기관 이름 · 직함 앞의 자리표시.
// ⛔ "○○학원" · "○○이 지금 여기 있습니다"(납치 고급 수법이 정한 가린 표기 · 되받기 틀)는 대상이 아니다 — 학원 · 학교는 목록에 넣지 않는다.
// 4-f — "씨" 호칭은 성째 "본인"으로 바꾼다(뒤에 "본인"이 이미 있으면 그것 하나만 · 조사는 받침에 맞춘다 — "김○○ 씨는" → "본인은").
const PLACEHOLDER_CIRCLE_SSI = new RegExp(`(?:(^|[^가-힣])(?:${SURNAME})(?=[○◯●]))?[○◯●]{2,3}\\s*씨(는|가|를)?\\s*(?:본인\\s*)?`, "g");
const SSI_PARTICLE: Record<string, string> = { 는: "은", 가: "이", 를: "을" };
const PLACEHOLDER_CIRCLE_ORG = /[○◯●]{2,3}\s*(?=(?:지방)?(?:경찰서|경찰청|검찰청|지검|지청|법원|은행|카드|병원|구청|시청|군청|센터|본부|금융감독원|금감원))/g;
const PLACEHOLDER_CIRCLE_TITLE = new RegExp(
  `(\\s*)(?:(${SURNAME})(?=[○◯●]))?[○◯●]{2,3}\\s*(?=(?:수사관|검사|형사|팀장|과장|대리|주임|경위|경사|경장|순경|변호사|실장|부장))`,
  "g",
);

// 4-c행(§129 (A)) — 대사 전체를 감싼 따옴표(모델이 대사를 인용문처럼 낸 것). 안에 다른 따옴표가 없을 때만 벗긴다 · 닫는 따옴표 없이 맨 앞에만 있으면 그것만 지운다.
const WRAPPING_QUOTE = /^\s*[“"]([^“”"]+)[”"]\s*$/;
const LONE_OPENING_QUOTE = /^\s*“(?![^”]*”)/;

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
  // 3-b행 — 괄호 속 혼잣말을 지워도 대사가 남을 때만 지운다(빈 말풍선 0 — §129 D1).
  const withoutMonologue = text.replace(PAREN_MONOLOGUE, "");
  const monologueFree = withoutMonologue !== text && withoutMonologue.trim().length > 0 ? withoutMonologue : text;
  if (monologueFree !== text) count();
  // 3-c행 — 맨 앞 짧은 괄호 지문(지우면 빈 대사면 그대로).
  const withoutLeading = monologueFree.replace(LEADING_STAGE_DIRECTION, "");
  const leadingFree = withoutLeading !== monologueFree && withoutLeading.trim().length > 0 ? withoutLeading : monologueFree;
  if (leadingFree !== monologueFree) count();
  // 3-d행 — 지시 해설 괄호(지우면 빈 대사면 그대로).
  const withoutCommentary = leadingFree.replace(DIRECTIVE_COMMENTARY, "");
  const commentaryFree = withoutCommentary !== leadingFree && withoutCommentary.trim().length > 0 ? withoutCommentary : leadingFree;
  if (commentaryFree !== leadingFree) count();
  const tidied = commentaryFree
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
    })
    .replace(META_TAG, () => {
      count();
      return "";
    })
    .replace(PLACEHOLDER_SELF_NAME, () => {
      count();
      return "나야";
    })
    .replace(PLACEHOLDER_CIRCLE_HONORIFIC, (_m, lead: string | undefined) => {
      count();
      return `${lead ?? ""}고객님`;
    })
    .replace(PLACEHOLDER_CIRCLE_SUBJECT_SELF, (_m, subject: string) => {
      count();
      return `${subject} 담당자`;
    })
    .replace(PLACEHOLDER_CIRCLE_CASUAL, () => {
      count();
      return "나야";
    })
    .replace(PLACEHOLDER_CIRCLE_SELF, () => {
      count();
      return "";
    })
    .replace(PLACEHOLDER_CIRCLE_SSI, (_m, lead: string | undefined, particle: string | undefined) => {
      count();
      return `${lead ?? ""}본인${particle ? SSI_PARTICLE[particle] : ""} `;
    })
    .replace(PLACEHOLDER_CIRCLE_ORG, () => {
      count();
      return "";
    })
    .replace(PLACEHOLDER_CIRCLE_TITLE, (_m, space: string, surname: string | undefined) => {
      count();
      // 4-f — 성이 있으면 "김 수사관"으로 남긴다.
      return surname ? `${space}${surname} ` : space.length > 0 ? " " : "";
    })
    .replace(WRAPPING_QUOTE, (_m, inner: string) => {
      count();
      return inner;
    })
    .replace(LONE_OPENING_QUOTE, () => {
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
