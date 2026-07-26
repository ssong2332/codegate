// recordMockScreenEvent 콜러블 계약 — src/lib/api/types.ts(클라 계약)와 1:1
// (API.md 부록 A, ADR-0001 "계약 원천 2곳").
//
// ⚠️ **이 콜러블은 참가자 입력을 받지 않는다** — 인자는 세션 id·랜딩 id·고정 enum 3개뿐이다.
// AC-045의 "입력값 서버 미전송"이 kind 추가 후에도 그대로 성립한다. 실 URL·앱명·권한 목록에
// 해당하는 필드가 요청·응답 어디에도 **존재하지 않는다**(AC-072).

export type MockScreenEvent = "shown" | "consented";

export type RecordMockScreenEventRequest = {
  sessionId: string;
  landingId: string;
  event: MockScreenEvent;
};
export type RecordMockScreenEventResponse = { ok: true };
