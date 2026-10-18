// 고급 전용 시나리오 난이도 강제 — T191 S5 / PRD AC-097 (b) · UX 계약 C-2 · AC-064 갱신 고지 2.
// 설계: T191 흐름 변형 설계(Architecture T191 절 "고급 전용 3종 — 강제 지점").
//
// ⭐ **판정은 정규화 *전* 원값으로 한다.** `normalizeDifficultyLevel`(AC-064 폴백)을 먼저 타면 난이도
// 미전달이 중급이 되어 거부 사유가 흐려진다 — 고급 전용에서는 **미전달도 거부**한다(C-2 "중급 폴백
// 금지"). 기존 시나리오는 이 술어가 항상 true라 AC-064 원문(세 난이도 모두 생성)이 그대로다.
//
// ⛔ 호출 위치가 설계다: `createSession`·`createChallenge`의 **인증 · 시나리오 존재 확인 직후, 어떤
// 쓰기 · LLM · 음성 호출보다 앞**(AC-097 (b) "거부는 LLM · 외부 음성 호출 0회 · 서버 쓰기 0회로").
// `__tests__/difficultyAllowance.test.ts`가 두 호출부의 순서를 소스 스캔으로 고정한다.
import { HttpsError } from "firebase-functions/v2/https";
import { isAdvancedOnlyScenario } from "../scenarios/publicMeta";

/** 화면이 일반 오류와 구분하는 사유 코드(UX 계약 C-2 — `HttpsError.details.reason`). */
export const DIFFICULTY_NOT_ALLOWED_REASON = "difficulty-not-allowed";

/** 이 시나리오를 이 원값(정규화 전) 난이도로 만들 수 있는가. */
export function isDifficultyAllowed(scenarioId: string, rawDifficultyLevel: unknown): boolean {
  if (!isAdvancedOnlyScenario(scenarioId)) return true;
  return rawDifficultyLevel === "advanced";
}

/** 허용되지 않으면 `failed-precondition` + `{ reason: "difficulty-not-allowed" }`로 거부한다. */
export function assertDifficultyAllowed(scenarioId: string, rawDifficultyLevel: unknown): void {
  if (isDifficultyAllowed(scenarioId, rawDifficultyLevel)) return;
  throw new HttpsError("failed-precondition", "이 시나리오는 고급으로만 훈련할 수 있습니다.", {
    reason: DIFFICULTY_NOT_ALLOWED_REASON,
  });
}
