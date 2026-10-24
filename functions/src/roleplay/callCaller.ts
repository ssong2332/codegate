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

// §128(4)(2026-10-24 메인 세션 라이브 실측 — 자녀 사칭 카톡 고급 · 마이크 차단 = 텍스트 폴백) — 참가자가 보이스톡을 걸었는데 폴백 사기범이
// *"아빠 전화 받아줘서 고마워"* 라고 했다. 위 턴 지시 1줄은 실려 있었지만, 같은 프롬프트의 페르소나 블록(`CHILD_CALL_PHASE_RULE` — *"통화는 네가
// 먼저 건 전화다"*)이 반대로 말해 모델이 그쪽을 따랐다(추정 — 확인: 같은 이력으로 폴백 1턴 재생성). 두 겹으로 막는다.
// | 겹 | 참가자가 건 통화(폴백 턴) | 사기범이 건 통화 · 메신저 단계 |
// |---|---|---|
// | 프롬프트 | 페르소나의 "네가 먼저 건 전화" 문장을 "참가자가 건 보이스톡을 받았다"로 바꾼다(`resolveParticipantCalledPersona`) | 무변경(바이트 동일) |
// | 대사 | "전화 받아줘서 · 받아 주셔서 · 받아 줬네"를 "전화해 줘서 · 해 주셔서 · 해 줬네"로 고친다(`fixParticipantCalledReply`) | 무변경 |

const SCAMMER_CALLED_PERSONA_LINE = '통화는 네가 먼저 건 전화다. 메시지로 하던 이야기에 이어서 거는 것이므로 첫 마디는 "나야, 톡으로 말한 거 때문에 전화했어"처럼';
const PARTICIPANT_CALLED_PERSONA_LINE =
  '통화는 참가자가 너에게 건 보이스톡이고 너는 그 전화를 받았다(네가 건 전화가 아니다). 메시지로 하던 이야기에 이어지는 통화이므로 첫 마디는 "어, 전화했네? 톡으로 말한 거 말이야"처럼';

/** 참가자가 건 통화면 페르소나의 "네가 먼저 건 전화" 문장을 바꾼다(그 문장이 없는 페르소나는 그대로). */
export function resolveParticipantCalledPersona(personaPrompt: string): string {
  return personaPrompt.includes(SCAMMER_CALLED_PERSONA_LINE)
    ? personaPrompt.replace(SCAMMER_CALLED_PERSONA_LINE, PARTICIPANT_CALLED_PERSONA_LINE)
    : personaPrompt;
}

const ANSWERED_THANKS: readonly [RegExp, string][] = [
  [/전화\s*(?:를\s*)?받아\s*주셔서/g, "전화해 주셔서"],
  [/전화\s*(?:를\s*)?받아\s*줘서/g, "전화해 줘서"],
  [/전화\s*(?:를\s*)?받아\s*줬네/g, "전화해 줬네"],
];

/** 참가자가 건 통화의 사기범 대사에서 "전화 받아 줘서"류(네가 걸었다는 뜻)를 "전화해 줘서"로 고친다. */
export function fixParticipantCalledReply(text: string): string {
  return ANSWERED_THANKS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}
