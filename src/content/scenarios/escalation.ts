// T194-a(docs/Architecture.md §83.4.1 · PRD AC-106 (i) · UX D-124) — 메신저 → 통화 전이 여부의 **(시나리오 × 난이도)
// 단일 술어**(클라 쪽). 서버 `functions/src/scenarios/escalation.ts`와 **같은 식**이며, 루트 테스트
// (`src/content/scenarios/escalation.test.ts`)가 전 시나리오 × 3난이도 × {자가 · 챌린지}에서 두 구현이 같은 값을 내는지 대조한다.
//
// ⛔ 화면이 `scenario.escalation` · `scenario.advancedEscalation`을 직접 읽지 않는다 — 이 파일만 읽는다(G576).
//   쓰는 곳: 난이도 화면(UX-025로 갈지 — D-124 ①) · 목소리 선택 진입 가드(UX-025) · 메신저 셸의 시작 고지 열과
//   "전화로 확인" 버튼(D-124 ② — 둘이 같은 값). 2인 발송 목록 필터(`scenarios/messenger/page.tsx`)는 시나리오 단위
//   그대로다(§83.4.1 C-5 — 서버 챌린지 거부와 짝).
// ⚠️ 이 값은 **(시나리오 × 난이도)** 값이다 — 같은 난이도 안에서 어느 흐름이 배정됐는지와 무관하다(PRD AC-096 읽기 고지 4 ·
//   AC-106 (i)). 그 전제(같은 난이도의 허용 흐름은 통화 단계 유무가 같다)는 서버 테스트가 고정한다.
// ⚠️ 잎 모듈이다(타입 import만) — 루트 테스트 러너(`node --experimental-strip-types`)가 직접 불러온다.
import type { EscalationConfig, ScenarioDoc } from "./familyAccidentDeepvoice";

/** 술어가 읽는 메타 필드 2개만. */
export type EscalationMetaView = Pick<ScenarioDoc, "escalation" | "advancedEscalation">;

/**
 * (시나리오 × 난이도) → 전이 설정. `escalation`이 있으면 세 난이도 모두 그 값, 없으면 **고급에서만** `advancedEscalation`.
 * `level`은 원값을 받는다 — 서버 정규화(`normalizeDifficultyLevel`)는 정확히 `"advanced"`만 고급으로 확정하므로
 * (부재 · 오타 · enum 밖 = 중급) `level === "advanced"` 비교와 결과가 같다.
 */
export function resolveScenarioEscalation(
  meta: EscalationMetaView | null | undefined,
  level: unknown,
): EscalationConfig | undefined {
  if (!meta) return undefined;
  return meta.escalation ?? (level === "advanced" ? meta.advancedEscalation : undefined);
}

/** 세션(또는 세션 전 선택) 문서에서 술어가 읽는 값. */
export type EscalationSessionView = {
  scenarioId: string;
  difficultyLevel?: unknown;
  challengeId?: unknown;
};

/**
 * 세션 단위 전이 설정 — 2인 챌린지 수신자 세션은 **시나리오 단위 값 그대로**(PRD AC-106 (g) 기본값 — 챌린지에서는 현행 고급).
 */
export function resolveSessionEscalation(
  session: EscalationSessionView,
  catalog: Readonly<Record<string, EscalationMetaView>>,
): EscalationConfig | undefined {
  const meta = catalog[session.scenarioId];
  if (!meta) return undefined;
  if (typeof session.challengeId === "string" && session.challengeId.length > 0) return meta.escalation;
  return resolveScenarioEscalation(meta, session.difficultyLevel);
}
