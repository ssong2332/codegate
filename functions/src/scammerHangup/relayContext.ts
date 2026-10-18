// T192 C1 — 끊기 판정의 릴레이 입력 해석 단일 지점(Architecture.md §79.2 끝 · §79.18 (1) · G526 ⓓ).
// `flowVariants.ts`를 import하므로 잎 모듈 `decide.ts` 밖에 둔다.
//
// ⭐ 클라 값을 쓰지 않는다 — `legIndex`는 세션 문서의 서버 필드(S7 `startRelayLeg`만 씀), `legCount`는 서버 카탈로그.
// ⛔ `RELAY_RUNTIME_AVAILABLE === false`이면 **항상 `undefined`**. legs ≥ 2 변형이 데이터로는 있지만 S7 전에는 한
//    화자가 통화 전체를 맡는다 — 그 화자가 곧 마지막 화자다. 그대로 읽으면 그 변형들에서 끊기가 조용히 0이 된다(79.1 #22).
// 폴백 `sendMessage`(C3) · `requestScammerHangup` · 토큰 발급(`declaresEndCall` — C3)이 이 함수를 부른다.
import { RELAY_RUNTIME_AVAILABLE, findFlowVariant, type FlowVariant } from "../scenarios/flowVariants";
import type { HangupRelayContext } from "./decide";

/** S7 전 `SessionDoc.relay`가 없으므로 구조 타입으로 받는다(S7이 필드를 더해도 시그니처 무변경 — §79.18 (1)). */
export type HangupRelaySessionView = { flowVariantId?: string; relay?: { legIndex: number } };

/** 판정 본체 — 런타임 플래그와 카탈로그 조회를 인자로 받아 역검증할 수 있게 분리했다. */
export function resolveHangupRelayWith(
  session: HangupRelaySessionView,
  runtimeAvailable: boolean,
  findVariant: (variantId: string | undefined) => Pick<FlowVariant, "legs"> | undefined,
): HangupRelayContext | undefined {
  if (!runtimeAvailable) return undefined;
  const variant = findVariant(session.flowVariantId);
  if (!variant || variant.legs.length < 2) return undefined;
  return { legIndex: session.relay?.legIndex ?? 0, legCount: variant.legs.length };
}

export function resolveHangupRelay(session: HangupRelaySessionView): HangupRelayContext | undefined {
  return resolveHangupRelayWith(session, RELAY_RUNTIME_AVAILABLE, findFlowVariant);
}
