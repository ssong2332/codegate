// 흐름 변형 **배정 가능 풀** — 세션 종류(자가 · 2인 챌린지 수신자)별로 배정해도 되는 변형만 거른다.
// (T194-a docs/Architecture.md §84.13.5 · G590 → T194-c-1 §84.16.1 · G590 갱신 · G611 · DECISIONS #192)
//
// ⛔ **잎 모듈이다 — 이 파일을 import하는 `scenarios/*` 모듈은 0이어야 한다.** 판별에 `mockScreens.ts`가 필요한데
//    `mockScreens → reachability → flowVariants` 이므로 `flowVariants.ts`(또는 `reachability.ts`)에 두면 import 순환이 생긴다
//    (§84.16.1 "위치"). 재수출도 순환이라 두지 않는다. 쓰는 곳: `session/variantAssignment.ts`(배정) · `realtime/provider.ts`(라우팅 술어).
//
// ── 풀 판정표(⛔ 두 항의 AND — 이 표대로만) ─────────────────────────────────────────────────────────
// | 항 | 변형 쪽 값 | 세션 쪽 값 | 출처 |
// |---|---|---|---|
// | 에스컬레이션 | `Boolean(v.escalatesToVoice)` | `Boolean(resolveSessionEscalation(...))` | §84.13.5 처방 1(T194-a) |
// | 통화 중 설치 문자(Q2) | `declaresInCallInstall(v)` | `expectsInCallInstall(scenarioId, level, challengeId)` | §84.16.1(T194-c-1) |
// 결과: 자가 고급 Q2 3종 = Q2 변형만 · 챌린지 고급 card-company · loan = base 변형(`fv-akj5` · `fv-6s5p`)만 · 그 밖 전부 항등
// (두 값이 모두 거짓 — 다른 시나리오는 설치 문자를 선언하지 않는다).
import type { DifficultyLevel } from "../shared/difficulty";
import { resolveSessionEscalation } from "./escalation";
import { findFlowVariant, listFlowVariants, type FlowVariant } from "./flowVariants";
import { IN_CALL_INSTALL_SCENARIOS, isInCallInstallSms } from "./mockScreens";
import { PUBLIC_SCENARIOS } from "./publicMeta";

/**
 * 이 변형이 **통화 중 설치 문자**(Q2)를 선언하는가 — 선언 문자 중 하나라도 카탈로그 랜딩이 `app-install`이면 참.
 * 변형 데이터에서 도출한다(새 필드 · `audience` 0 — 플래그를 따로 두면 데이터와 갈라진다 · §84.16.1).
 */
export function declaresInCallInstall(v: Pick<FlowVariant, "scenarioId" | "sms">): boolean {
  return v.sms.some((item) => isInCallInstallSms(v.scenarioId, item.smsId));
}

/**
 * 이 세션 종류가 Q2 설치 문자를 **기대하는가** = 자가 훈련(챌린지 아님) ∧ 고급 ∧ 허용목록 시나리오(#192 · AC-105 갱신 고지 3 ①).
 * 허용목록은 `mockScreens.ts` `IN_CALL_INSTALL_SCENARIOS`를 그대로 쓴다(두 목록 금지).
 */
export function expectsInCallInstall(scenarioId: string, level: DifficultyLevel, challengeId?: string): boolean {
  return !challengeId && level === "advanced" && IN_CALL_INSTALL_SCENARIOS.includes(scenarioId);
}

/**
 * ⭐ **배정 가능 풀**(J-1 — 자가 `assignFlowVariantForSession` · 수신자 `assignFlowVariantForChallenge`가 `candidatesOrThrow`로 이 함수 하나를 쓴다).
 * 허용 변형(`listFlowVariants`) 중 위 판정표의 두 항을 **함께** 만족하는 것만.
 */
export function assignablePool(scenarioId: string, level: DifficultyLevel, challengeId?: string): FlowVariant[] {
  const escalates = Boolean(
    resolveSessionEscalation({ scenarioId, difficultyLevel: level, challengeId }, PUBLIC_SCENARIOS),
  );
  const expectsInstall = expectsInCallInstall(scenarioId, level, challengeId);
  return listFlowVariants(scenarioId, level).filter(
    (v) => Boolean(v.escalatesToVoice) === escalates && declaresInCallInstall(v) === expectsInstall,
  );
}

/**
 * T194-c-1 G610(§84.15.4 J-4 · §84.16.3) — 이 **세션**(시나리오 × 변형)이 Q2 설치 문자를 선언했는가. 실시간 프로바이더 라우팅 술어
 * (`realtime/provider.ts` `requiresServerPromptProvider`)의 항이 이 함수를 쓴다 — 판별자는 `declaresInCallInstall` 하나(두 정의 금지).
 * 변형 부재 · 알 수 없는 ID · 다른 시나리오의 ID ⇒ 거짓(문자 선언 0 — `resolveDeclaredSms`의 무소급 규칙과 같은 갈래).
 */
export function sessionDeclaresInCallInstall(scenarioId: string, flowVariantId: string | undefined): boolean {
  const variant = findFlowVariant(flowVariantId);
  return variant !== undefined && variant.scenarioId === scenarioId && declaresInCallInstall(variant);
}
