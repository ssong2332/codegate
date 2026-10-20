// T194-b(docs/Architecture.md §84.3.6 · §84.3.7 · UX-008 v1.38 (1) · D-120 · PRD AC-104 (c)(f)) — "상대가 먼저 꺼낸 '내 정보'"
// 판정(순수 함수 — Firestore · LLM import 0).
//
// ⭐ 판정은 리포트 생성 때 **서버가 결정론적으로** 한다 — 통화 중 쓰기 0 · 클라 이벤트 0 · 자유텍스트 분류 0(§84.0 X9).
//    서버가 만든 카드 값의 토큰이 전사 줄에 **문자열로 포함**되는지만 본다.
// ⭐ "먼저 말했다"(R-1)는 기록이 1건 이상일 때만 단정한다(D-120 · J-6). 기록이 0이면 R-2(조건문)다.
// 오차 방향(§84.3.6): 거짓 음성(전사 오기 · 다른 표기) → R-2로 떨어진다 = 안전 쪽. 거짓 양성(사기범이 우연히 같은 지역명을 말함)이어도
//    R-1 문면 "내가 말하기 전에 먼저 말했습니다"는 문자 그대로 참이다(근거 = `scammerTurnIndex`).
import { PERSONA_REGION_POOL } from "../scenarios/personaCardCatalog";
import type { PersonaBlock, PersonaBlockItem, PersonaBlockState, PersonaCard, PersonaCardItem } from "../shared/types";

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
  }
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
  if (item.key !== "name") return tokens;
  const given = givenName(item.value.replace(/ /g, ""));
  return given ? [...new Set([...tokens, given])] : tokens;
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
    const firstOf = (role: PersonaTranscriptLine["role"]): number | undefined =>
      spoken.find(
        (line) => line.role === role && (role === "user" ? userTokens : tokens).some((token) => line.textMasked.includes(token)),
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
  return { state, items: blockItems, ...(personaCard?.v === 2 ? { inputBy: personaCard.inputBy } : {}) };
}
