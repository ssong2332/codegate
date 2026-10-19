// T194-b(docs/Architecture.md §84.3.1 · §84.3.2 · PRD AC-104) — 훈련용 가상 신상 카드의 **대상 술어 · 생성**(순수 — Firestore · LLM import 0).
//
// ⛔ 금지(§84.0 X1 · X2):
//   - 클라이언트가 보낸 값이 카드 값 · 대상 판정에 들어가는 경로 0 — `buildPersonaCard`의 입력은 서버가 정한 세 값뿐이다.
//   - 사용자 계정 정보(표시 이름 · 이메일 · 계정 식별자) 사용 0 — 매개변수 키가 `{sessionId, scenarioId, fictionalBankName}`로 고정이다(G566).
// ⭐ 술어는 `createSession` 안에서 **한 번** 평가되고, 결과는 세션 문서 `personaCard` 필드의 **존재/부재**로만 남는다.
//    다른 경로(프롬프트 조립 · 통화 화면 · 리포트)는 술어를 다시 평가하지 않고 필드만 읽는다(§84.3.1).
import { FICTIONAL_BANK_NAMES, hash } from "../shared/fictionalBank";
import type { DifficultyLevel } from "../shared/difficulty";
import type { MessengerChannel, PersonaCard, PersonaCardItem, PersonaCardKey } from "../shared/types";
import {
  PERSONA_BIRTH_YEAR_MAX,
  PERSONA_BIRTH_YEAR_MIN,
  PERSONA_CARD_FIXED_VALUES,
  PERSONA_CARD_LABELS,
  PERSONA_CARD_ROWS,
  PERSONA_CARD_SCENARIOS,
  PERSONA_NAME_POOL,
  PERSONA_REGION_MASK_SUFFIX,
  PERSONA_REGION_POOL,
} from "../scenarios/personaCardCatalog";

export type PersonaCardEligibilityInput = {
  scenarioId: string;
  /** 정규화(`normalizeDifficultyLevel`) 뒤 값. */
  difficultyLevel: DifficultyLevel;
  /**
   * ⭐ 필수 키(옵셔널이면 호출부 누락이 "자가 세션"으로 조용히 통과한다). 2인 챌린지 수신자 세션이면 그 ID —
   * 수신자에게는 카드가 없다(2026-10-20 User 결정 · AC-104 (g)). 자가 세션 = `undefined`를 **명시**로 넘긴다.
   */
  challengeId: string | undefined;
  /** 세션 시작 채널(부재 = voice). 대상 4종은 전부 통화형이라 메신저 시작은 대상 밖이다. */
  channel: MessengerChannel | undefined;
};

/** 대상 술어(§84.3.1) — 대상 시나리오 ∧ 고급 ∧ 자가 훈련 ∧ 통화 시작. */
export function personaCardEligible(input: PersonaCardEligibilityInput): boolean {
  return (
    PERSONA_CARD_SCENARIOS.includes(input.scenarioId) &&
    input.difficultyLevel === "advanced" &&
    input.challengeId === undefined &&
    (input.channel === undefined || input.channel === "voice")
  );
}

/** ⛔ 이 타입의 키가 곧 G566의 고정 목록이다 — 계정 정보 키를 더하면 G566이 실패한다. */
export type BuildPersonaCardInput = {
  sessionId: string;
  scenarioId: string;
  /** 이 세션의 가상 은행명(§81 — 계좌 문자 · 사기범 대사의 "OO은행"을 채우는 값). 카드 은행은 이것과 **다른** 이름이다. */
  fictionalBankName: string;
};

/** 시드에서 필드마다 다른 자리를 고른다(같은 시드 → 같은 카드 · 테스트 재현). */
function pick(seed: number, salt: number, size: number): number {
  return (Math.imul(seed ^ salt, 0x9e3779b1) >>> 0) % size;
}

/**
 * 카드 거래 은행 — 세션 가상 은행명과 **다른** 이름(§84.3.2 ⭐: 같으면 사기범이 수취 계좌 은행을 말한 것이
 * "내 거래 은행을 먼저 말했다"로 집계된다). 인덱스 = (세션 은행 인덱스 + 1 + 시드 mod 7) mod 8.
 * 세션 은행명이 목록 밖이면(방어 — `createSession`은 항상 목록 안의 이름을 넘긴다) 목록의 어느 이름도 그것과 다르므로
 * 시드로 하나를 고른다.
 */
export function pickPersonaCardBank(fictionalBankName: string, seed: number): string {
  const n = FICTIONAL_BANK_NAMES.length;
  const at = FICTIONAL_BANK_NAMES.indexOf(fictionalBankName);
  if (at < 0) return FICTIONAL_BANK_NAMES[seed % n]!;
  return FICTIONAL_BANK_NAMES[(at + 1 + (seed % (n - 1))) % n]!;
}

/** 카드 생성 — 대상 밖 시나리오면 `undefined`(호출부는 필드를 만들지 않는다). */
export function buildPersonaCard({ sessionId, scenarioId, fictionalBankName }: BuildPersonaCardInput): PersonaCard | undefined {
  const rows = PERSONA_CARD_ROWS[scenarioId];
  if (!rows) return undefined;
  const seed = hash(`${sessionId}:persona`);
  const valueOf: Record<PersonaCardKey, () => string> = {
    name: () => PERSONA_NAME_POOL[pick(seed, 0x01, PERSONA_NAME_POOL.length)]!,
    birthYear: () =>
      `${PERSONA_BIRTH_YEAR_MIN + pick(seed, 0x02, PERSONA_BIRTH_YEAR_MAX - PERSONA_BIRTH_YEAR_MIN + 1)}년생`,
    region: () => `${PERSONA_REGION_POOL[pick(seed, 0x03, PERSONA_REGION_POOL.length)]!.name} ${PERSONA_REGION_MASK_SUFFIX}`,
    bank: () => pickPersonaCardBank(fictionalBankName, seed),
    card: () => PERSONA_CARD_FIXED_VALUES.card,
    loan: () => PERSONA_CARD_FIXED_VALUES.loan,
  };
  const items: PersonaCardItem[] = rows.map((key) => ({ key, label: PERSONA_CARD_LABELS[key], value: valueOf[key]() }));
  return { v: 1, items };
}

/**
 * `createSession` 전용 조합 — 술어가 참일 때만 카드를 만들고, 생성이 throw하면 **필드 부재로 진행**한다
 * (UF-014 Failure (a) · §84.3.5 — 카드 0 · 프롬프트 블록 0 = 원자성 유지).
 */
export function resolveSessionPersonaCard(
  eligibility: PersonaCardEligibilityInput,
  build: BuildPersonaCardInput,
  builder: (input: BuildPersonaCardInput) => PersonaCard | undefined = buildPersonaCard,
): PersonaCard | undefined {
  if (!personaCardEligible(eligibility)) return undefined;
  try {
    return builder(build);
  } catch {
    return undefined;
  }
}
