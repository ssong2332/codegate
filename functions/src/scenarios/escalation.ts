// T194-a(docs/Architecture.md §84.4.1 · PRD AC-106 · AC-106 (i) · J-1) — 메신저 → 통화 전이 여부의 **(시나리오 × 난이도)
// 단일 술어**(서버 쪽).
//
// **왜 술어로 바꿨나**: 예전에는 전이 여부가 공개 메타 1필드(`escalation`)라 서버 5곳 · 클라 4곳이 그 필드를 직접 읽었다.
// AC-106은 `messenger-parcel-smishing-sms`의 **고급만** 통화로 이어지게 한다 — 시나리오 속성으로는 표현할 수 없다.
// ⇒ 직접 읽기를 전부 이 파일의 두 함수로 바꿨다(복사 0 — G63 · §59 Critical #2 계보). 직접 읽기 허용목록과 클라 구현과의
// 일치는 `__tests__/escalation.test.ts`(서버 소스 스캔) · 루트 `src/content/scenarios/escalation.test.ts`(두 구현 대조)가 고정한다.
//
// 쓰는 곳(서버): `createSession` maxUserTurns(S-1) · `requestEscalation`(S-2) · `sendMessage` 자동 전이(S-3) ·
//   리포트 단계 파생(S-4) · 모의 화면 도달 술어(`mockScreens.ts` `isMockScreenReachable`) · 화자 성별 세션 해석.
// ⛔ 무변경: `createChallenge`의 에스컬레이션 시나리오 거부(S-6)는 시나리오 단위 그대로다(parcel 챌린지는 계속 허용되고
//   수신자는 현행 고급 — AC-106 (g) 기본값).
// ⚠️ 이 값은 (시나리오 × 난이도) 값이지 배정된 흐름 변형 값이 아니다 — 변형 데이터(`escalatesToVoice`)와의 정합은
//   `__tests__/flowVariants.test.ts`(G581 — AC-106 (i))가 고정한다.
// ⚠️ 잎 모듈이다(타입 import만) — 루트 테스트 러너가 이 파일을 직접 불러와 클라 구현과 대조한다.
import type { EscalationConfig, ScenarioMeta } from "./publicMeta";

/** 술어가 읽는 메타 필드 2개만. */
export type EscalationMetaView = Pick<ScenarioMeta, "escalation" | "advancedEscalation">;

/**
 * (시나리오 × 난이도) → 전이 설정. `escalation`이 있으면 세 난이도 모두 그 값, 없으면 **고급에서만** `advancedEscalation`.
 * `level`은 원값을 받는다 — `normalizeDifficultyLevel`(shared/difficulty.ts)은 정확히 `"advanced"`만 고급으로 확정하므로
 * (부재 · 오타 · enum 밖 = 중급) `level === "advanced"` 비교와 결과가 같다(테스트가 대조한다).
 */
export function resolveScenarioEscalation(
  meta: EscalationMetaView | null | undefined,
  level: unknown,
): EscalationConfig | undefined {
  if (!meta) return undefined;
  return meta.escalation ?? (level === "advanced" ? meta.advancedEscalation : undefined);
}

/** 세션 문서에서 술어가 읽는 값(`SessionDoc`이 그대로 들어간다). */
export type EscalationSessionView = {
  scenarioId: string;
  difficultyLevel?: unknown;
  challengeId?: unknown;
};

/**
 * 세션 단위 전이 설정 — 2인 챌린지 수신자 세션은 **시나리오 단위 값 그대로**(PRD AC-106 (g) 기본값 — 챌린지에서는 현행 고급).
 * `catalog`는 호출부가 `PUBLIC_SCENARIOS`를 넘긴다(잎 모듈 유지 — 위 머리말).
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
