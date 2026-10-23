// §123(사용자 실기 신고 2026-10-23 원문 *"내가 보이스톡을 했는데, AI가 전화를 본인이 했다고 이야기하는 것도 수정하자"*) — 지금 통화를
// 누가 걸었는가. 통화 첫마디 신호(클라 `escalatedOpening.ts`) · Live 맥락(`realtime/priorChatContext.ts`) · 폴백 턴 지시가 같은 값을 본다.
//
// 판정표(`currentCallCaller`):
// | 가장 최근 메신저→통화 전환 기록 | 건 쪽 |
// |---|---|
// | `caller: "participant"`(대화방 보이스톡 발신 — `requestEscalation({ via: "voice_talk_dial" })`) | 참가자 |
// | 필드 없음(사기범 신호 · 최대 턴 · 문자형 "전화로 확인" = 사기범이 다시 건다 — 수신 화면) | 사기범(종전) |
// | 전환 기록 없음 | 사기범(종전) |
import type { ChannelTransitionEntry } from "../shared/types";

export type CallCaller = "participant" | "scammer";

export function currentCallCaller(channelHistory: readonly Pick<ChannelTransitionEntry, "from" | "to" | "caller">[] | undefined): CallCaller {
  const history = channelHistory ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i]!;
    if (entry.from === "messenger" && entry.to === "voice") return entry.caller === "participant" ? "participant" : "scammer";
  }
  return "scammer";
}

/** 폴백(텍스트) 통화 턴의 맥락 1줄 — 참가자가 건 통화에서만 싣는다(사기범이 건 통화는 종전 문면 바이트 동일). */
export const PARTICIPANT_CALLED_INSTRUCTION =
  "(이 통화는 참가자가 너에게 건 보이스톡이다 — 네가 전화한 것이 아니다. '내가 전화했어' · '전화 걸었어'처럼 말하지 않는다. 시스템 지시의 '네가 먼저 건 전화'라는 문장보다 이 줄이 우선한다.)";
