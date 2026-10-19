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
 * - name: 전체 이름 · 이름 2자 / birthYear: "1961" · "61년" · "육십일년" / region: 도 이름 + 줄임말 / bank: 은행명 그대로
 */
export function personaMatchTokens(item: PersonaCardItem): string[] {
  switch (item.key) {
    case "name":
      return item.value.length >= 3 ? [item.value, item.value.slice(1)] : [item.value];
    case "birthYear": {
      const match = /^(\d{4})년생$/.exec(item.value);
      if (!match) return [];
      const yy = Number(match[1]) % 100;
      return [match[1]!, `${String(yy).padStart(2, "0")}년`, `${koreanTwoDigits(yy)}년`];
    }
    case "region": {
      const entry = PERSONA_REGION_POOL.find((r) => item.value.startsWith(`${r.name} `));
      return entry ? [entry.name, ...entry.shortNames] : [];
    }
    case "bank":
      return [item.value];
    case "card":
    case "loan":
      return [];
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
    const firstOf = (role: PersonaTranscriptLine["role"]): number | undefined =>
      spoken.find((line) => line.role === role && tokens.some((token) => line.textMasked.includes(token)))?.turnIndex;
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
  return { state, items: blockItems };
}
