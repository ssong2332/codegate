// T194-b(docs/Architecture.md §84.3.6 · §84.3.7 · UX-008 v1.38 (1) · D-120 · PRD AC-104 (c)(f)) — "상대가 먼저 꺼낸 '내 정보'"
// 판정(순수 함수 — Firestore · LLM import 0).
//
// ⭐ 판정은 리포트 생성 때 **서버가 결정론적으로** 한다 — 통화 중 쓰기 0 · 클라 이벤트 0 · 자유텍스트 분류 0(§84.0 X9).
//    서버가 만든 카드 값의 토큰이 전사 줄에 **문자열로 포함**되는지만 본다.
// ⭐ "먼저 말했다"(R-1)는 기록이 1건 이상일 때만 단정한다(D-120 · J-6). 기록이 0이면 R-2(조건문)다.
// 오차 방향(§84.3.6): 거짓 음성(전사 오기 · 다른 표기) → R-2로 떨어진다 = 안전 쪽. 거짓 양성(사기범이 우연히 같은 지역명을 말함)이어도
//    R-1 문면 "내가 말하기 전에 먼저 말했습니다"는 문자 그대로 참이다(근거 = `scammerTurnIndex`).
import { PERSONA_REGION_POOL } from "../scenarios/personaCardCatalog";
import type {
  PersonaBlock,
  PersonaBlockContext,
  PersonaBlockItem,
  PersonaBlockState,
  PersonaCard,
  PersonaCardItem,
} from "../shared/types";

/** 판정 입력 줄 — 리포트 생성이 이미 읽은 `messages` 스냅샷의 부분 뷰(추가 read 0). */
export type PersonaTranscriptLine = {
  role: "scammer" | "user";
  textMasked: string;
  turnIndex: number;
  /** §55 D3 — 참가자에게 도달하지 않은 줄(부재 = 도달함). 판정에서 뺀다 — 듣지 못한 말을 "먼저 말함"으로 세면 거짓이다. */
  notSpoken?: true;
};

const KOREAN_DIGIT = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"] as const;

/** 두 자리 수(10~99)의 한글 읽기 — 전사가 숫자 대신 한글로 받아 적은 경우(예: "육십일년")를 잡는다(추정 변형). */
function koreanTwoDigits(n: number): string {
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${tens === 1 ? "" : KOREAN_DIGIT[tens]}십${KOREAN_DIGIT[ones]}`;
}

/**
 * 항목의 대조 토큰(서버 소유). 가림 값(`card` · `loan`)은 고유 토큰이 없어 **대조하지 않는다**(빈 배열).
 * - name: 전체 이름 · 성 뺀 이름(3자 이상일 때) / birthYear: "1961" · "61년" · "육십일년" / region: 시 · 도 이름 + 줄임말 / bank: 은행명 그대로
 * - birthDate(§88 후속): 연도 토큰(birthYear와 같다) + `" 3월 2일생"` · `" 3월2일생"`(앞 공백 — 월 부분 일치 방지). ⚠️ `"3월 2일"`만으로는 세지 않는다 — 사기범이
 *   결제일 · 배송일로 같은 날짜를 말하면 "먼저 말했다"(R-1) 오단정이 된다(거짓 양성 방지 · 끝 "생"까지 요구).
 */
export function personaMatchTokens(item: PersonaCardItem): string[] {
  switch (item.key) {
    case "name": {
      // §88 — 이름은 이제 사용자가 넣는다(풀 밖). 성 뺀 이름 2자(예: "하나" · "보람")는 일상어와 겹쳐 사기범 쪽 거짓 양성
      // (R-1 "먼저 말했습니다" 오단정)을 만든다 ⇒ 사기범 대조는 전체 이름 · 붙여 쓴 이름 · 호칭이 붙은 이름(님 · 씨)만.
      // 참가자 쪽은 `personaUserMatchTokens`가 성 뺀 이름도 센다(넓게 = R-2 쪽 = 안전).
      const compact = item.value.replace(/ /g, "");
      const tokens = new Set([item.value, compact]);
      const given = givenName(compact);
      if (given) for (const suffix of ["님", " 님", "씨", " 씨"]) tokens.add(`${given}${suffix}`);
      return [...tokens];
    }
    case "birthYear": {
      const match = /^(\d{4})년생$/.exec(item.value);
      return match ? yearTokens(match[1]!) : [];
    }
    case "birthDate": {
      const match = /^(\d{4})년 (\d{1,2})월 (\d{1,2})일생$/.exec(item.value);
      if (!match) return [];
      // 앞 공백을 붙인다 — `"2월 2일생"`이 `"12월 2일생"`에 부분 일치하는 거짓 양성 방지(리뷰 Minor 1). 줄 맨 앞 "3월 2일생"은
      // 놓치지만(→ R-2 = 안전 쪽) 연도와 함께 말하면 연도 토큰이 잡는다.
      return [...yearTokens(match[1]!), ` ${match[2]}월 ${match[3]}일생`, ` ${match[2]}월${match[3]}일생`];
    }
    case "region": {
      // §88 — 입력 카드(v2) 값 = 시 · 도 정식 명칭 그대로 · 옛 카드(v1) 값 = `"{도} ○○시"`. 둘 다 같은 목록으로 대조한다.
      const entry = PERSONA_REGION_POOL.find((r) => item.value === r.name || item.value.startsWith(`${r.name} `));
      return entry ? [entry.name, ...entry.shortNames] : [];
    }
    case "bank":
      return [item.value];
    case "card":
    case "loan":
      return [];
    // §92 — 하는 일 · 학원 = 고정 선택지 값 그대로(일상어와 겹치지 않는 낱말만 선택지에 있다 — "회사"가 아니라 "회사원").
    case "job":
    case "childAcademy":
      return [item.value, item.value.replace(/(학원|도장)$/, " $1")].filter((t, i, all) => all.indexOf(t) === i);
    case "childGrade":
      return childGradeTokens(item.value);
    case "childName":
      return childNameTokens(item.value);
  }
}

/**
 * §92 — 자녀 학년 토큰. "초등학교 3학년" → 그대로 · "초등 3학년" · "초3" / "유치원생" → "유치원". ⚠️ "3학년"만으로는 세지 않는다
 * (사기범이 다른 맥락에서 학년을 말할 여지는 작지만, 학교급 없이 맞혔다고 단정하지 않는 쪽 — 거짓 음성 = R-2 = 안전).
 */
function childGradeTokens(value: string): string[] {
  if (value === "유치원생") return ["유치원"];
  const match = /^(초등|중|고등)학교 (\d)학년$/.exec(value);
  if (!match) return [value];
  const short = match[1] === "초등" ? "초" : match[1] === "중" ? "중" : "고";
  return [value, `${match[1]} ${match[2]}학년`, `${short}${match[2]}`];
}

// 리뷰 Major 1 · 2(2026-10-21) — 성 뺀 이름 + 조사("하나는" · "하나도" · "보람이")는 일상어와 겹쳐 R-1("먼저 말했습니다") 오단정을
// 만든다 ⇒ 협박범이 아이를 부르는 꼴(프롬프트 `spokenChildName`과 같은 규칙 — 받침이면 "이")에 **뒤 낱말을 고정한** 앵커만 센다.
// 프롬프트가 시키는 대사("'민준이 지금 여기 있습니다'" · "'지우 지금 여기 있습니다'")는 "{부르는 꼴} 지금"으로 잡힌다.
const CHILD_CALL_NEXT_WORDS = ["지금", "여기", "데리고", "우리", "학원", "울고"] as const;
const CHILD_CALL_PARTICLES = ["", "가", "를", "는", "도", "랑"] as const;

/**
 * §92 — 자녀 이름 토큰: 전체 이름 · 붙여 쓴 이름(한글 2자 = 일상어 겹침이라 제외) + 부르는 꼴(한글 3자 = 성 뗌 · 2자 = 그대로)
 * × 조사(없음 · 가 · 를 · 는 · 도 · 랑) × 뒤 낱말(지금 · 여기 · 데리고 · 우리 · 학원 · 울고).
 */
function childNameTokens(value: string): string[] {
  const compact = value.replace(/ /g, "");
  const short = /^[가-힣]{2}$/.test(compact);
  const tokens = new Set(short ? [] : [value, compact]);
  const given = /^[가-힣]{3}$/.test(compact) ? compact.slice(1) : short ? compact : undefined;
  if (given) {
    const code = given.charCodeAt(given.length - 1) - 0xac00;
    const call = code >= 0 && code <= 11171 && code % 28 !== 0 ? `${given}이` : given;
    for (const particle of CHILD_CALL_PARTICLES) for (const word of CHILD_CALL_NEXT_WORDS) tokens.add(`${call}${particle} ${word}`);
  }
  return [...tokens];
}

/** 네 자리 연도의 대조 토큰 — "1961" · "61년" · "육십일년". */
function yearTokens(year: string): string[] {
  const yy = Number(year) % 100;
  return [year, `${String(yy).padStart(2, "0")}년`, `${koreanTwoDigits(yy)}년`];
}

/** 한글 3~4자 이름의 성 뺀 이름(그 밖 = `undefined`). */
function givenName(compact: string): string | undefined {
  return /^[가-힣]{3,4}$/.test(compact) ? compact.slice(1) : undefined;
}

/**
 * 참가자 쪽 대조 토큰 — 사기범 토큰 + 성 뺀 이름 그대로. 참가자가 먼저 말했는지는 **넓게** 본다(오차 방향 = R-2 = 안전 · §84.3.6).
 */
export function personaUserMatchTokens(item: PersonaCardItem): string[] {
  const tokens = personaMatchTokens(item);
  if (item.key !== "name" && item.key !== "childName") return tokens;
  const compact = item.value.replace(/ /g, "");
  // 자녀 이름 2자는 사기범 토큰에서 맨몸을 뺐다 — 참가자 쪽은 넓게(= R-2 = 안전) 맨몸 그대로 센다.
  if (item.key === "childName" && /^[가-힣]{2}$/.test(compact)) return [...new Set([...tokens, compact])];
  const given = item.key === "childName" ? (/^[가-힣]{3}$/.test(compact) ? compact.slice(1) : undefined) : givenName(compact);
  return given ? [...new Set([...tokens, given])] : tokens;
}

// 2026-10-21 메인 세션 라이브 실측 — 카드 사는 곳 "서울특별시", 사기범은 *"서울중앙지방검찰청"* 이라고만 말했는데 리포트가 "사는 곳: 서울특별시"를
// "상대가 먼저 꺼낸 '내 정보'"(R-1)로 표시했다. 원인: 지역 토큰 "서울"을 줄 안 **어디에든** 부분 일치로 셌다(기관명 · 은행명 안의 지명 포함).
// ⇒ 사기범 쪽 지역 대조만 **지명 낱말로 끝나는 자리**로 좁힌다(아래 판정표). 참가자 쪽은 종전대로 넓게 센다(오차 방향 = R-2 = 안전 · §84.3.6).
// | # | 토큰 뒤(위에서 첫 일치) | 셈 |
// |---|---|---|
// | 1 | (공백을 건너뛴) 다음 낱말이 기관 · 회사 낱말(`REGION_INSTITUTION_WORD` — 검찰청 · 경찰서 · 법원 · 은행 · 대학 …)로 끝난다 | 안 센다("서울중앙지방검찰청" · "서울 경찰청" · "부산은행" · "서울도봉경찰서") |
// | 2 | 줄 끝 · 한글이 아닌 글자(공백 · 문장부호 · 숫자) | 센다("서울 사시죠" · "서울, 맞으시죠") |
// | 3 | 조사 · 주소 문맥 꼴(`REGION_FOLLOWERS`, 꼴 뒤는 줄 끝 · 비한글이거나 그 꼴 자체가 낱말 앞부분) | 센다("서울에" · "서울이시고" · "서울사시는" · "서울시에") |
// | 4 | 그 밖의 한글(고유명사가 이어짐) | 안 센다("서울이랜드" · "서울은평" · "서울사이버대" · "충남대") |
// ⚠️ 남는 한계(리뷰 2026-10-21): 사건 발생지("서울에서 발생한")와 거주지를 구분하지 못한다 · 같은 이름의 다른 지명("경기 광주시")은 그 시 · 도로 센다.
const REGION_INSTITUTION_WORD = /^\s*[가-힣]*(검찰청|지검|지청|경찰청|경찰서|법원|지법|고법|고검|시청|도청|구청|세무서|국세청|은행|대학교|대학|대|가스|공사)(?![가-힣])/;
// 한 글자 조사는 **뒤가 줄 끝 · 비한글일 때만**("서울도봉"의 "도" · "서울은평"의 "은"을 막는다). 여러 글자 꼴은 낱말 앞부분이면 된다.
const REGION_PARTICLES_1 = ["에", "이", "은", "는", "도", "로", "서", "과", "의", "시"] as const;
const REGION_FOLLOWERS = [
  "에서", "에도", "에는", "에요", "이시", "이세", "이신", "이고", "이요", "인데", "인가", "인지", "이죠", "은요", "는요", "도요", "로요",
  "쪽", "사시", "사세", "사신", "사는", "살고", "살아", "살면", "거주", "출신",
  "시에", "시이", "시죠", "시고", "시는", "시가", "시로", "시의", "시요",
] as const;

/** 사기범 줄에 지역 토큰이 **지명 낱말로서** 나오는가(위 판정표). */
export function regionMentioned(text: string, token: string): boolean {
  let from = 0;
  for (;;) {
    const at = text.indexOf(token, from);
    if (at < 0) return false;
    from = at + 1;
    const rest = text.slice(at + token.length);
    if (REGION_INSTITUTION_WORD.test(rest)) continue;
    const next = rest.charAt(0);
    if (next === "" || !/[가-힣]/.test(next)) return true;
    const after = (n: number) => rest.charAt(n);
    if (REGION_PARTICLES_1.some((p) => rest.startsWith(p) && (after(1) === "" || !/[가-힣]/.test(after(1))))) return true;
    if (REGION_FOLLOWERS.some((f) => rest.startsWith(f))) return true;
  }
}

export type PersonaFirstMention = { key: PersonaCardItem["key"]; scammerTurnIndex: number };

/** 항목별 첫 언급 대조 — 사기범 첫 언급 turnIndex < 참가자 첫 언급 turnIndex(없으면 ∞)인 항목만. */
export function resolvePersonaFirstMentions(
  items: readonly PersonaCardItem[],
  lines: readonly PersonaTranscriptLine[],
): PersonaFirstMention[] {
  const spoken = lines.filter((line) => line.notSpoken !== true).slice().sort((a, b) => a.turnIndex - b.turnIndex);
  const out: PersonaFirstMention[] = [];
  for (const item of items) {
    const tokens = personaMatchTokens(item);
    if (tokens.length === 0) continue;
    const userTokens = personaUserMatchTokens(item);
    const mentions = (role: PersonaTranscriptLine["role"], text: string, token: string): boolean =>
      role === "scammer" && item.key === "region" ? regionMentioned(text, token) : text.includes(token);
    const firstOf = (role: PersonaTranscriptLine["role"]): number | undefined =>
      spoken.find(
        (line) => line.role === role && (role === "user" ? userTokens : tokens).some((token) => mentions(role, line.textMasked, token)),
      )?.turnIndex;
    const s = firstOf("scammer");
    if (s === undefined) continue;
    const u = firstOf("user");
    if (u === undefined || s < u) out.push({ key: item.key, scammerTurnIndex: s });
  }
  return out;
}

export type PersonaBlockStateInput = {
  hasCard: boolean;
  /**
   * 이 세션에 AC-105 리포트 카드 V-1 · V-2(직접 건 확인 전화가 가로채짐)가 있는가. ⚠️ U2(T194-d)가 아직 없어
   * 운영 호출부는 항상 `false`를 넘긴다 — 상태표(R-3 포함)는 설계대로 미리 고정해 둔다.
   */
  selfDialIntercepted: boolean;
  firstMentionCount: number;
};

/** 상태 선택(위에서 첫 일치 — UX-008 v1.38 (1) · §84.3.7). 카드 없음 = `undefined`(= R-4 · 필드 부재). */
export function resolvePersonaBlockState(input: PersonaBlockStateInput): PersonaBlockState | undefined {
  if (!input.hasCard) return undefined;
  if (input.selfDialIntercepted) return "R-3";
  if (input.firstMentionCount >= 1) return "R-1";
  return "R-2";
}

/**
 * 리포트 문서의 `personaBlock`. R-1(또는 기록 ≥ 1인 R-3) = 먼저 말한 항목만 + 앵커 / R-2(또는 기록 0인 R-3) = 카드 항목 전부.
 * 카드 없는 세션 = `undefined`(필드 부재).
 */
export function buildPersonaBlock(
  personaCard: PersonaCard | undefined,
  lines: readonly PersonaTranscriptLine[],
  selfDialIntercepted: boolean,
  /** §92 — 협박형 시나리오의 카드면 교훈 문면 분기(부재 = 기관형 · 종전 문면). 호출부가 카탈로그 종류에서 고른다. */
  context?: PersonaBlockContext,
): PersonaBlock | undefined {
  const items = personaCard?.items ?? [];
  const mentions = resolvePersonaFirstMentions(items, lines);
  const state = resolvePersonaBlockState({
    hasCard: personaCard !== undefined && items.length > 0,
    selfDialIntercepted,
    firstMentionCount: mentions.length,
  });
  if (!state) return undefined;
  const blockItems: PersonaBlockItem[] =
    mentions.length > 0
      ? mentions.map((m) => {
          const item = items.find((i) => i.key === m.key)!;
          return { key: item.key, label: item.label, value: item.value, scammerTurnIndex: m.scammerTurnIndex };
        })
      : items.map((item) => ({ key: item.key, label: item.label, value: item.value }));
  // §88 — 누가 넣은 카드인지(리포트 문면 분기 — UX D-131 (6)(7)). 옛 v1 카드 = 필드 부재(종전 문면).
  return {
    state,
    items: blockItems,
    ...(personaCard?.v === 2 ? { inputBy: personaCard.inputBy } : {}),
    ...(context ? { context } : {}),
  };
}
