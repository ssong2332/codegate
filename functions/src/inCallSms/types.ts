// deliverInCallSms / recordInCallSmsEvent 콜러블 계약 — src/lib/api/types.ts(클라 계약)와 1:1
// (API.md 관례, ADR-0001 "계약 원천 2곳").
//
// ⚠️ 응답에 본문·인증번호가 없다는 점이 설계다 — 화면은 `sessions/{sid}/inCallSms` 구독(onSnapshot)
// 하나로만 그린다(실시간·폴백 단일 렌더 소스, DECISIONS #12 계승). 응답은 "도착시켰다 + 캐릭터가
// 알리게 할 1줄 지시"만 돌려준다.

export type DeliverInCallSmsRequest = { sessionId: string; smsId: string };
export type DeliverInCallSmsResponse = {
  smsId: string;
  /** 클라가 **같은 Live 세션에 텍스트 턴으로 주입**해 캐릭터가 문자 발송을 알리게 하는 1줄. */
  announceInstruction: string;
};

export type InCallSmsEvent = "opened" | "link_tapped";
export type RecordInCallSmsEventRequest = {
  sessionId: string;
  smsId: string;
  event: InCallSmsEvent;
};
export type RecordInCallSmsEventResponse = { recorded: true };
