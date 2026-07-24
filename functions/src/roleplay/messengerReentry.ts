// 메신저 재진입 이후 턴 수 계산 (T31급 리뷰 Major #2 수정, 2026-07-24, §13.3/AC-034/039).
//
// 문제: max-turn 폴백(MESSENGER_ESCALATION_FALLBACK_TURNS)이 세션 전체 누적 turnCount를 그대로
// 비교하고 있었다 — turnCount는 sendMessage가 호출될 때마다(메신저 단계에서만) 세션 수명 내내
// 계속 늘어나기만 하고 절대 줄지 않는다. T40(보이스→메신저 역방향 전이)으로 메신저에 복귀한 뒤
// 다시 메시지를 보내면, 그 전에 이미 6턴을 넘긴 세션이라면 복귀 첫 메시지에서 즉시(그리고
// 그 이후 영원히) maxturn_fallback이 재발화해 사용자를 곧바로 보이스로 도로 밀어낸다("핑퐁").
//
// 해법: "세션 누적 turnCount"가 아니라 "가장 최근에 메신저로 (재)진입한 시점 이후의 턴 수"를 본다.
// channelHistory에서 `to==="messenger"`인 가장 최근 항목의 turnCountAtTransition을 기준점으로 삼고
// (T40의 requestReverseEscalation이 전이 시점에 기록, channelTransition.ts 참고), 그런 항목이
// 아직 없으면(=세션이 시작된 이래 메신저를 벗어난 적이 없다) 기준점은 0이다.
import type { ChannelTransitionEntry } from "../shared/types";

export function turnsSinceMessengerEntry(
  turnCount: number,
  channelHistory: readonly ChannelTransitionEntry[] | undefined,
): number {
  if (!channelHistory || channelHistory.length === 0) {
    return turnCount;
  }
  const messengerEntries = channelHistory.filter((entry) => entry.to === "messenger");
  if (messengerEntries.length === 0) {
    return turnCount;
  }
  const mostRecent = messengerEntries[messengerEntries.length - 1];
  const baseline = mostRecent.turnCountAtTransition ?? 0;
  return Math.max(0, turnCount - baseline);
}
