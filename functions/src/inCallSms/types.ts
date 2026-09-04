// deliverInCallSms / recordInCallSmsEvent 콜러블 계약 — src/lib/api/types.ts(클라 계약)와 1:1
// (API.md 관례, ADR-0001 "계약 원천 2곳").
//
// ⚠️ 응답에 본문·인증번호가 없다는 점이 설계다 — 화면은 `sessions/{sid}/inCallSms` 구독(onSnapshot)
// 하나로만 그린다(실시간·폴백 단일 렌더 소스, DECISIONS #12 계승). 응답은 "도착시켰다 + 캐릭터가
// 알리게 할 1줄 지시"만 돌려준다.

export type DeliverInCallSmsRequest = { sessionId: string; smsId: string };
export type DeliverInCallSmsResponse = {
  smsId: string;
  /**
   * 클라가 **같은 Live 세션에 텍스트 턴으로 주입**해 캐릭터가 문자 발송을 알리게 하는 1줄.
   *
   * ⭐ **§53.6 (3)(T118/R-1과 동형, Architecture.md §53)** — 이 문자가 연 확인 시도 무력화
   * 오퍼에 이미 `placedAt`이 있으면(=호 전환이 끝난 뒤면) **생략된다.** 전환 이후에는 원
   * 사기범이 아니라 확인 데스크 화자만 남아 있고, 그 화자가 "내가 방금 이 문자를 보냈다"고
   * 말하면 참가자가 겪은 사실과 모순된다. 값이 없으면 클라는 **주입하지 않는다** — 문서
   * 자체(계좌·링크)는 전환 여부와 무관하게 그대로 도착한다.
   */
  announceInstruction?: string;
};

// T123/AC-080 — `landing_submitted`는 **"그 문자가 연 가짜 랜딩의 폼을 제출했다"**는 사실 하나다.
// ⛔ 참가자가 입력한 값은 이 요청에 실리지 않는다 — 담을 필드가 타입에 **존재하지 않는다**(AC-045).
// ⛔ `link_tapped`(링크를 눌렀다)와 의미가 다르다: 탭은 속은 순간으로 승격되지 않고 제출만 된다
//    (AC-080 (b) — 의심해서 열어보고 닫은 참가자를 실패로 낙인찍지 않기 위해서다).
export type InCallSmsEvent = "opened" | "link_tapped" | "landing_submitted";
export type RecordInCallSmsEventRequest = {
  sessionId: string;
  smsId: string;
  event: InCallSmsEvent;
};
export type RecordInCallSmsEventResponse = { recorded: true };
