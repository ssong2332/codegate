// §142 D1(확인 실측 2026-11-02 — `docs/research/card-rebuild-probe-2026-11-02.md`) — 마지막이 아닌 레그의 **넘김**을 서버가 아는 레그 상태로 이끈다
// (R17 · R18처럼 단계 진행을 모델 기억이 아니라 서버 `relay`로 정한다). 잎 모듈 · Firestore 0. 호출부 = `inCallSms/index.ts`(문자 콜러블).
//
// 실측: 감독기관 첫 레그(나감 = transfer · 문자 선언 0)가 "검사에게 연결해 드릴게요, 잠시만요"만 되풀이하고 `end_call`을 부르지 않은 채
// 마지막 레그의 일(안전계좌 이체)로 건너뛰었고, 그 레그에 없는 transfer 문자를 3~4회 요청했다(2/2).
import type { FlowVariant } from "../scenarios/flowVariants";
import { currentLegIndex, legStartUserTurns, type RelayState } from "./legPlan";

/** 넘김 지시(백스톱 응답 `wrapUpInstruction` 자리 — 클라가 레그마다 1회 맥락 주입 · `end_call`을 막지 않는 마무리 지시로 처리). */
export const LEG_TRANSFER_HANDOFF_INSTRUCTION =
  "(이 통화에서 할 일은 다음 사람에게 넘기는 것만 남았다. 지금까지 한 말을 되풀이하지 말고 새 요구도 꺼내지 마라. 돈 · 계좌 · 이체 이야기는 이 통화의 일이 아니다. 상대의 마지막 말에 짧게 답하면서 연결해 드리겠다고 한마디 하고, 그 응답에서 `end_call` 도구를 불러 이 통화를 끝내라.)";

/** 뒤 레그 문자를 이 레그에서 부를 때의 거절 문면(종전 `SMS_DECLINE_NOT_ALLOWED` 대신). */
export const LEG_LATER_SMS_DECLINE =
  "(그 문자는 이 통화에서 보낼 단계가 아니다 — 그 일은 다음 통화에서 다른 사람이 한다. 문자를 보냈다고 말하지 말고 그 이야기도 꺼내지 마라. 이 통화의 마지막 단계를 마쳤으면 [진행 강제]의 끊기 규칙대로 지금 이 통화를 끝내라.)";

/** 넘김 지시를 내기 전 이 레그에서 들을 최소 발화 = 레그 `minUserTurns` + 이 값(판단값 — 실측으로 조정). */
export const LEG_HANDOFF_EXTRA_USER_TURNS = 1;

type LegVariant = Pick<FlowVariant, "multiCall" | "legs" | "sms">;

/**
 * 백스톱 질의에서 남은 필수 문자가 없을 때(`none_pending`) 이 레그의 넘김 판정.
 * | # | If | Then |
 * |---|---|---|
 * | 1 | 다통화 아님 · 마지막 레그 · 나감이 transfer가 아님 | `undefined`(종전 처리) |
 * | 2 | 이 레그에 문자 선언이 있다(그 문자 · 화면 단계가 넘김 전 일이다 — 종전 처리) | `undefined` |
 * | 3 | 레그 시작 뒤 발화 < `minUserTurns + LEG_HANDOFF_EXTRA_USER_TURNS` | `"wait"`(클라가 다음 발화에 다시 묻게 — `goal_pending`) |
 * | 4 | 그 밖 | `"handoff"`(넘김 지시) |
 */
export function planLegHandoff(variant: LegVariant | undefined, relay: RelayState | undefined, userTurns: number): "wait" | "handoff" | undefined {
  if (!variant?.multiCall) return undefined;
  const legIndex = currentLegIndex(variant, relay);
  if (legIndex >= variant.legs.length - 1) return undefined;
  const leg = variant.legs[legIndex];
  if (leg.exit !== "transfer") return undefined;
  if (variant.sms.some((item) => (item.leg ?? 0) === legIndex)) return undefined;
  const since = userTurns - legStartUserTurns(relay, legIndex);
  return since < (leg.minUserTurns ?? 0) + LEG_HANDOFF_EXTRA_USER_TURNS ? "wait" : "handoff";
}

/** 모델이 부른 목적이 이 레그가 아니라 **뒤 레그**에 선언돼 있는가(다통화만 · 서버 `relay` 기준). */
export function isLaterLegSmsPurpose(variant: LegVariant | undefined, relay: RelayState | undefined, purpose: unknown): boolean {
  if (!variant?.multiCall || typeof purpose !== "string") return false;
  const legIndex = currentLegIndex(variant, relay);
  return variant.sms.some((item) => item.purpose === purpose && (item.leg ?? 0) > legIndex);
}
