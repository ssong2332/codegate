// §110.3(실기 신고 12 · 2026-10-22) — 메신저에서 넘어온 통화의 첫 턴 신호.
//
// 종전 오프닝 트리거(`GeminiVoiceSession` OPENING_TRIGGER_TURN)는 "신분과 전화를 건 이유를 밝혀라"라서, 카톡으로 이미 이야기하던
// 사기범이 통화에서 "엄마 나야, 폰이 깨져서…"부터 다시 시작했다. 앞선 대화 자체는 서버가 Live 시스템 프롬프트에 싣는다
// (`functions/src/realtime/priorChatContext.ts`) — 이 신호는 **첫 마디의 방향**만 바꾼다(대화 내용 0 · 전사에 기록하지 않는다).
//
// 판정표(통화 화면 `resumeTurn` 자리):
// | If | Then |
// |---|---|
// | 다시 연결(connectionSeq > 0) | 종전 재연결 맥락(`buildResumeTurn`) |
// | 메신저 시나리오(= 메신저에서 넘어온 통화)의 첫 연결 | 이 신호 |
// | 그 밖 | `null`(종전 오프닝 트리거) |

export const ESCALATED_CALL_OPENING_TURN =
  "(방금 네가 건 전화가 연결됐다. 이 통화는 시스템 지시에 적힌 메시지 대화에 이어서 거는 전화다. 처음부터 다시 소개하거나 같은 사정을 다시 설명하지 말고, 메시지로 하던 이야기 때문에 전화했다는 짧은 첫 마디(5초 안팎)로 시작한 뒤 멈춰서 상대의 대답을 기다려라.)";

// §123(실기 신고 2026-10-23 *"내가 보이스톡을 했는데, AI가 전화를 본인이 했다고 이야기하는 것도 수정하자"*) — 참가자가 건 보이스톡이면
// 위 신호("방금 네가 건 전화")가 틀린다. 건 쪽은 세션 전환 기록(`channelHistory[].caller` — 서버 `roleplay/callCaller.ts`와 같은 표)이 정한다.
// | 메신저발 첫 연결의 건 쪽 | 신호 |
// |---|---|
// | 사기범(기록 없음 · 종전) | `ESCALATED_CALL_OPENING_TURN` |
// | 참가자(`caller: "participant"` — 대화방 보이스톡 발신) | `PARTICIPANT_CALLED_OPENING_TURN` |
export const PARTICIPANT_CALLED_OPENING_TURN =
  "(상대가 너에게 건 보이스톡을 너는 방금 받았다 — 네가 전화한 것이 아니다. '내가 전화했어'처럼 말하지 말고, \"어, 전화했네? 나 지금…\"처럼 전화를 받은 사람의 짧은 첫 마디(5초 안팎)로 시작하라. 처음부터 다시 소개하거나 같은 사정을 다시 설명하지 말고, 메시지로 하던 이야기를 이어 간 뒤 멈춰서 상대의 대답을 기다려라.)";

export type CallCaller = "participant" | "scammer";

/** 가장 최근 메신저→통화 전환 기록의 건 쪽(서버 `currentCallCaller`와 같은 표 — 기록 없음 = 사기범). */
export function callCallerFrom(channelHistory: unknown): CallCaller {
  const history = Array.isArray(channelHistory) ? (channelHistory as { from?: unknown; to?: unknown; caller?: unknown }[]) : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry?.from === "messenger" && entry?.to === "voice") return entry.caller === "participant" ? "participant" : "scammer";
  }
  return "scammer";
}

export function openingTurnFor(input: {
  connectionSeq: number;
  resumeTurn: string | null;
  escalatedFromMessenger: boolean;
  /** §123 — 부재 = 사기범(종전). */
  caller?: CallCaller;
}): string | null {
  if (input.connectionSeq > 0) return input.resumeTurn;
  if (!input.escalatedFromMessenger) return null;
  return input.caller === "participant" ? PARTICIPANT_CALLED_OPENING_TURN : ESCALATED_CALL_OPENING_TURN;
}
