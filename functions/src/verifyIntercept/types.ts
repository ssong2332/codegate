// deliverVerifyOffer / deliverVerifyReconnect 콜러블 계약 — src/lib/api/types.ts(클라 계약)와 1:1
// (API.md 관례, ADR-0001 "계약 원천 2곳").
//
// ⚠️ **요청 스키마에 전화번호·URL·발신 대상 필드가 없다는 점이 설계다**(AC-019 하드) — 이 화면에는
// 자유 입력 필드가 없고, 참가자가 할 수 있는 것은 "안내받은 번호로 걸어보기" 버튼 탭뿐이다.
// ⚠️ 응답에 창구명·번호가 없다는 점도 설계다 — 화면은 `sessions/{sid}/verifyIntercept` 구독
// (onSnapshot) 하나로만 그린다(양 경로 단일 렌더 소스, DECISIONS #12 계승). 응답은 "기록했다 +
// 캐릭터가 말하게 할 1줄 지시"만 돌려준다.

/** 앵커 계산에 쓰는 명시 판별자 — 부재를 판별자로 오버로드하지 않는다(§14.9.1 원칙, §16.3.2). */
export type VerifyCallMode = "realtime" | "fallback";

export type DeliverVerifyOfferRequest = {
  sessionId: string;
  callMode: VerifyCallMode;
  /** `callMode==="realtime"`일 때 **필수**(없으면 invalid-argument). 폴백은 서버가 직접 센다. */
  scammerTurns?: number;
};
export type DeliverVerifyOfferResponse = {
  offerId: string;
  /** 클라가 **같은 Live 세션에 텍스트 턴으로 주입**해 캐릭터가 확인을 권하게 하는 1줄(실시간). */
  announceInstruction: string;
};

export type DeliverVerifyReconnectRequest = {
  sessionId: string;
  offerId: string;
  callMode: VerifyCallMode;
  scammerTurns?: number;
};
export type DeliverVerifyReconnectResponse = {
  /** 재연결 직후 캐릭터가 **다른 담당자**로 응대하게 하는 1줄(실시간 주입 / 폴백은 다음 턴). */
  reconnectInstruction: string;
};
