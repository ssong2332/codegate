// 합쳐진 시나리오의 새 세션 거부 — §92(docs/Architecture.md · DECISIONS #206 · UX D-135).
//
// `card-delivery-call`은 카드사 부정결제 고급의 흐름 변형으로 흡수됐다. 공개 메타 · 프롬프트 · 변형은 옛 세션 · 리포트
// 해석용으로 남기고(무소급), **새로 만드는 것만** 막는다. 옛 화면(HTML 캐시)에서 고른 경우 화면이 사유 코드로 1줄 안내한다.
//
// ⛔ 호출 위치가 설계다: `createSession`의 시나리오 존재 확인 직후 · `assertDifficultyAllowed`와 같은 자리(어떤 쓰기 · LLM ·
// 음성 호출보다 앞). 챌린지는 흡수 대상이 고급 전용이라 `createChallenge`가 이미 거부한다(같은 함수를 두 번 걸지 않는다).
import { HttpsError } from "firebase-functions/v2/https";
import { isMergedScenario } from "../scenarios/publicMeta";

/** 화면이 일반 오류와 구분하는 사유 코드(`src/lib/difficulty` `SCENARIO_MERGED_REASON`과 같은 문자열). */
export const SCENARIO_MERGED_REASON = "scenario-merged";

/** 합쳐진 시나리오면 `failed-precondition` + `{ reason: "scenario-merged" }`로 거부한다. */
export function assertScenarioNotMerged(scenarioId: string): void {
  if (!isMergedScenario(scenarioId)) return;
  throw new HttpsError("failed-precondition", "이 훈련은 다른 훈련으로 합쳐졌습니다.", {
    reason: SCENARIO_MERGED_REASON,
  });
}
