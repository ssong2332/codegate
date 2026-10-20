// T192 C1 — 끊기 판정의 서버 소유 문면(Architecture.md §79.5 정본 · G516 — 상수 1곳 · 클라 한국어 저작 0).
// ⛔ 모델에게만 도달한다(화면 0). ⛔ 횟수 · 턴 번호 0(F11/G130) · 거절 사유를 모델에게 설명하지 않는다.
// 잎 모듈(값 import 0) — C3의 `liveTools.ts`가 실패 문면을 여기서 가져갈 수 있게 분리했다.
import type { ScammerHangupStatus } from "./decide";

/** 승인(`accepted` · `already_accepted`). T192 C7(§79.22 (4) ② · G623 · 79.14 #2의 1회분) — 승인 뒤 말의 길이 · 내용. */
export const SCAMMER_HANGUP_ACCEPTED_GUIDANCE =
  "(통화가 곧 끊긴다. 작별 인사를 아직 하지 않았다면 상황에 맞는 짧은 마무리 한마디만 하고 거기서 말을 멈춰라. 그 한마디 앞뒤에 대답이나 설명, 당부, 새 요구를 붙이지 마라. 이미 했다면 아무 말도 하지 마라.)";

/** 거절(공통). */
export const SCAMMER_HANGUP_DECLINED_GUIDANCE =
  "(아직 통화를 끝낼 때가 아니다. 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)";

/** 거절(`blocked_transfer`). */
export const SCAMMER_HANGUP_BLOCKED_TRANSFER_GUIDANCE =
  "(확인 부서로 통화를 넘기기 전에는 끝낼 수 없다. 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)";

/** 실패(콜러블 미도달) — `createRealtimeCall.liveTools.endCallFailureInstruction`의 원천(배선은 C3). */
export const SCAMMER_HANGUP_FAILURE_INSTRUCTION =
  "(지금은 통화를 끝낼 수 없다. 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)";

/** 판정 결과 → 모델에게 돌려줄 문면. */
export function scammerHangupGuidance(status: ScammerHangupStatus): string {
  if (status === "accepted" || status === "already_accepted") return SCAMMER_HANGUP_ACCEPTED_GUIDANCE;
  if (status === "blocked_transfer") return SCAMMER_HANGUP_BLOCKED_TRANSFER_GUIDANCE;
  return SCAMMER_HANGUP_DECLINED_GUIDANCE;
}
