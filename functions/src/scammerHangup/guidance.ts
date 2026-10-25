// T192 C1 — 끊기 판정의 서버 소유 문면(Architecture.md §79.5 정본 · G516 — 상수 1곳 · 클라 한국어 저작 0).
// ⛔ 모델에게만 도달한다(화면 0). ⛔ 횟수 · 턴 번호 0(F11/G130) · 거절 사유를 모델에게 설명하지 않는다.
// 잎 모듈(값 import 0) — C3의 `liveTools.ts`가 실패 문면을 여기서 가져갈 수 있게 분리했다.
import type { ScammerHangupStatus } from "./decide";

/** 승인(`accepted` · `already_accepted`). */
export const SCAMMER_HANGUP_ACCEPTED_GUIDANCE =
  "(통화가 곧 끊긴다. 작별 인사를 아직 하지 않았다면 상황에 맞는 짧은 마무리 한마디만 하고 더는 말하지 마라. 이미 했다면 아무 말도 하지 마라.)";

/** 거절(공통). */
export const SCAMMER_HANGUP_DECLINED_GUIDANCE =
  "(아직 통화를 끝낼 때가 아니다. 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)";

/** 거절(`blocked_transfer`). */
export const SCAMMER_HANGUP_BLOCKED_TRANSFER_GUIDANCE =
  "(확인 부서로 통화를 넘기기 전에는 끝낼 수 없다. 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)";

/**
 * ⭐ §115(DECISIONS #230 · 사용자 지적 "같은 말 반복") — 거절(`blocked_transfer`) 중 **후속 단계가 남아 막힌 경우**(변형 `goalFollowUpUserTurns` ·
 * 4행 C-5 미충족). 종전 문면의 "하던 이야기를 그대로 이어가라"가 같은 안내 되풀이로 이어졌다(실 키 관측 1/2 — §115.5). 막힌 사유에 맞춰
 * 다음 단계로 넘어가거나, 다 꺼냈으면 한 번만 묻고 기다리게 한다. ⛔ 횟수 · 턴 번호 0(G130).
 */
export const SCAMMER_HANGUP_FOLLOW_UP_PENDING_GUIDANCE =
  "(아직 통화를 끝낼 때가 아니다. 끝내겠다는 말을 하지 말고, 방금 한 안내를 같은 말로 되풀이하지 마라. 아직 꺼내지 않은 단계가 남아 있으면 그 단계로 넘어가고, 다 꺼냈으면 상대가 어떻게 하겠는지 짧게 한 번만 묻고 답을 기다려라.)";

/**
 * ⭐ §115 — 후속 단계까지 할 일을 모두 마친 순간(4행 C-5가 참이 된 첫 백스톱 질의) 클라가 **한 번만** 맥락 주입하는 마무리 지시.
 * 전사에 남지 않는다(맥락 주입). 끊을지 판단은 여전히 모델이고 판정은 서버(`requestScammerHangup`)다 — 이 줄은 되풀이를 끊는 신호다.
 */
export const GOAL_WRAP_UP_INSTRUCTION =
  "(이번 통화에서 할 일은 모두 마쳤다. 지금까지 한 요구 · 안내를 다시 되풀이하지 말고 새 요구도 꺼내지 마라. 상대의 마지막 말에 짧게 답한 뒤 `end_call` 도구를 불러 통화를 끝내라.)";

/**
 * ⭐ §127(DECISIONS #243 · 2026-10-24 사용자 실기 — 운영 세션 243a51df · 기관 사칭 고급 현금 전달형 추정) — 할 일을 마친 뒤(4행 할 일 완료 참) 6행
 * (지시 대기 · 문자 대기)에 막힌 경우. 종전 공통 문면 "아직 통화를 끝낼 때가 아니다 … 그대로 이어가라"를 받은 모델이 다시 끊지 않고 같은 안내를
 * 되풀이했다(사용자가 "끝입니까?" · "안 끊습니까?"를 반복). 막힘은 잠시뿐이므로 다음 말에 짧게 답하고 **다시** 끊게 한다. ⛔ 횟수 · 턴 번호 0(G130)
 * · 막힌 사유는 설명하지 않는다(머리 주석).
 */
export const SCAMMER_HANGUP_RETRY_AFTER_GOAL_GUIDANCE =
  "(지금 바로는 끊을 수 없다. 새 요구나 같은 안내를 되풀이하지 말고, 상대의 다음 말에 짧게 답한 뒤 다시 `end_call` 도구를 불러 통화를 끝내라.)";

/**
 * ⭐ §127(메인 세션 라이브 확인 2026-10-24 · 텍스트 폴백 · 기관 사칭 고급 현금 전달형) — 폴백 경로판 마무리 지시. 실시간은 클라가 `GOAL_WRAP_UP_INSTRUCTION`을
 * 1회 맥락 주입하지만 폴백에는 그 지시가 없어 "찾으시면 다시 연락 주세요" 뒤에도 끊지 않았다. 폴백 끊기는 응답 끝 신호(`HANGUP_RULE_SIGNAL`)라
 * 도구 대신 신호를 붙이게 한다. 사전 판정이 승인(신호 모드)이고 후속 단계 변형의 할 일이 끝난 턴에만 실린다(`roleplay/index.ts`).
 */
export const FALLBACK_GOAL_WRAP_UP_INSTRUCTION =
  "(이번 통화에서 할 일은 모두 마쳤다. 지금까지 한 요구 · 안내를 다시 되풀이하지 말고 새 요구도 꺼내지 마라. 상대의 마지막 말에 짧게 답한 뒤 응답 맨 끝에 [[SIGNAL:END_CALL_GOAL]]을 붙여 통화를 끝내라.)";

/** 실패(콜러블 미도달) — `createRealtimeCall.liveTools.endCallFailureInstruction`의 원천(배선은 C3). */
export const SCAMMER_HANGUP_FAILURE_INSTRUCTION =
  "(지금은 통화를 끝낼 수 없다. 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)";

/** 판정 결과 → 모델에게 돌려줄 문면. */
export function scammerHangupGuidance(
  status: ScammerHangupStatus,
  options: { followUpPending?: boolean; goalActionDone?: boolean } = {},
): string {
  if (status === "accepted" || status === "already_accepted") return SCAMMER_HANGUP_ACCEPTED_GUIDANCE;
  // §127 — 할 일을 마친 뒤 6행에 막히면 다시 끊게 한다(그 밖 6행 · 다른 status는 종전 문면).
  if (status === "blocked_pending" && options.goalActionDone === true) return SCAMMER_HANGUP_RETRY_AFTER_GOAL_GUIDANCE;
  // §115 — 후속 단계가 남아 막힌 경우만 되풀이 금지 문면(그 밖 확인 무력화 세션은 종전 문면 그대로).
  // §132.13 — 4-b행(후속 단계가 남음)도 같은 문면.
  if (status === "blocked_follow_up") return SCAMMER_HANGUP_FOLLOW_UP_PENDING_GUIDANCE;
  if (status === "blocked_transfer" && options.followUpPending === true) return SCAMMER_HANGUP_FOLLOW_UP_PENDING_GUIDANCE;
  if (status === "blocked_transfer") return SCAMMER_HANGUP_BLOCKED_TRANSFER_GUIDANCE;
  return SCAMMER_HANGUP_DECLINED_GUIDANCE;
}
