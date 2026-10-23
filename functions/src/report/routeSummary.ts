// §119(DECISIONS #234 · 사용자 결정 D-3 b) — 리포트 머리의 "이번 결말" 한 줄 입력. 리포트 생성 때 1회 계산해 스냅샷으로 남긴다.
//
// | If | Then |
// |---|---|
// | `flowVariantId` 부재(변형 도입 이전 세션) · 알 수 없는 ID · 다른 시나리오 ID | 없음(줄 0 — 무소급) |
// | 그 세션 종류(자가 · 챌린지)의 배정 풀에 루트 키가 1가지뿐 | 없음 — 고를 결말이 없는 칸에 "1가지" 문구는 정보가 아니다 |
// | 루트 키 ≥ 2 | `{ label: 배정 변형의 routeLabel, routeCount: 풀의 서로 다른 루트 키 수 }` |
//
// ⛔ 세션 **중**에는 이 값이 서버 밖으로 나가지 않는다 — 리포트는 세션이 끝난 뒤에만 만들어진다(설계 금지 X1의 범위를 "세션 중"으로
// 좁힌 #234). 변형 ID · 단계 · 수법 문면은 싣지 않는다(이름과 개수만).
import type { DifficultyLevel } from "../shared/difficulty";
import { findFlowVariant } from "../scenarios/flowVariants";
import { assignablePool } from "../scenarios/variantPool";

export type RouteSummary = { label: string; routeCount: number };

export function resolveRouteSummary(session: {
  scenarioId: string;
  difficultyLevel: DifficultyLevel;
  flowVariantId?: string;
  challengeId?: string;
}): RouteSummary | undefined {
  const variant = findFlowVariant(session.flowVariantId);
  if (!variant || variant.scenarioId !== session.scenarioId) return undefined;
  const pool = assignablePool(session.scenarioId, session.difficultyLevel, session.challengeId);
  const routeCount = new Set(pool.map((v) => v.routeKey)).size;
  if (routeCount < 2) return undefined;
  return { label: variant.routeLabel, routeCount };
}
