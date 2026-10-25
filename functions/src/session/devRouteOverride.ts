// 개발 단계 루트 강제 지정(2026-10-25 · 사용자 지시 "현재는 개발 중이니까 다중 루트 강제화 해서 테스트 진행").
// 화면이 시나리오 URL의 `?route=fv-xxxx`를 `createSession` 요청 `forceVariantId`로 싣는다(`src/lib/devroute/devRouteOverride.ts`).
//
// | # | If | Then |
// |---|---|---|
// | F0 | `forceVariantId` 부재 · 빈 값 | 종전 배정(로그 0) |
// | F1 | 서버 파라미터 `DEV_ROUTE_OVERRIDE` ≠ `"true"` | 무시 + 경고 1줄(`reason: "disabled"`) |
// | F2 | 값이 문자열이 아니거나 `fv-` 꼴이 아님 | 무시 + 경고 1줄(`reason: "malformed"`) |
// | F3 | 이 시나리오 · 난이도의 배정 가능 풀(`assignablePool` — 자가 세션)에 없음 | 무시 + 경고 1줄(`reason: "not-in-pool"`) |
// | F4 | 그 밖 | 그 변형으로 확정 · **회전 문서(variantRotation)는 읽지도 쓰지도 않는다** · 세션 문서 `routeOverride: "forced"` · 로그 1줄 `flow_variant_forced` |
// ⛔ 무시는 통화를 막지 않는다(에러 0 — 종전 배정으로 진행). 2인 챌린지 수신자 세션은 이 콜러블을 거치지 않아 대상이 아니다
//    (풀도 `challengeId` 없이 = 자가 세션 풀로만 본다).
// ⛔ 출시 전 `DEV_ROUTE_OVERRIDE=false` — 켜 두면 참가자가 루트를 고를 수 있다(AC-096 (e)).
import type { DifficultyLevel } from "../shared/difficulty";
import { assignablePool } from "../scenarios/variantPool";

const VARIANT_ID_RE = /^fv-[a-z0-9]{4}$/;

export type DevRouteOverrideDecision =
  | { applied: true; variantId: string }
  | { applied: false; reason?: "disabled" | "malformed" | "not-in-pool" };

export function decideDevRouteOverride(input: {
  enabled: boolean;
  requested: unknown;
  scenarioId: string;
  level: DifficultyLevel;
}): DevRouteOverrideDecision {
  if (input.requested === undefined || input.requested === null || input.requested === "") return { applied: false };
  if (!input.enabled) return { applied: false, reason: "disabled" };
  if (typeof input.requested !== "string" || !VARIANT_ID_RE.test(input.requested)) {
    return { applied: false, reason: "malformed" };
  }
  const requested = input.requested;
  if (!assignablePool(input.scenarioId, input.level).some((v) => v.variantId === requested)) {
    return { applied: false, reason: "not-in-pool" };
  }
  return { applied: true, variantId: requested };
}

/** 판정 + 로그 1줄(F1~F4). 요청값은 형식이 맞을 때만 싣는다(임의 문자열을 로그에 남기지 않는다). */
export function resolveDevRouteOverride(input: {
  enabled: boolean;
  requested: unknown;
  scenarioId: string;
  level: DifficultyLevel;
}): DevRouteOverrideDecision {
  const decision = decideDevRouteOverride(input);
  const { scenarioId, level } = input;
  if (decision.applied) {
    console.info(JSON.stringify({ event: "flow_variant_forced", scenarioId, level, flowVariantId: decision.variantId }));
  } else if (decision.reason) {
    const requested =
      typeof input.requested === "string" && VARIANT_ID_RE.test(input.requested) ? input.requested : undefined;
    console.warn(
      JSON.stringify({ event: "flow_variant_force_ignored", reason: decision.reason, scenarioId, level, requested }),
    );
  }
  return decision;
}
