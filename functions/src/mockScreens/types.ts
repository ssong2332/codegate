// recordMockScreenEvent 콜러블 계약 — src/lib/api/types.ts(클라 계약)와 1:1
// (API.md 부록 A, ADR-0001 "계약 원천 2곳").
//
// ⚠️ **이 콜러블은 참가자 입력을 받지 않는다** — 인자는 세션 id·랜딩 id·고정 enum 3개뿐이다.
// AC-045의 "입력값 서버 미전송"이 kind 추가 후에도 그대로 성립한다. 실 URL·앱명·권한 목록에
// 해당하는 필드가 요청·응답 어디에도 **존재하지 않는다**(AC-072).

// T123/AC-080 — `submitted`는 **"이 랜딩의 입력 폼을 제출했다"**는 사실 하나다.
// ⛔ `consented`("가짜 **권한 허용**에 응했다" — `kind==="app-install"` 전용)와 **의미가 다르다.**
//    재사용하면 kind 가드를 약화해야 하고, 과거 리포트의 `consented:true`가 두 의미가 된다.
// ⛔ 참가자 입력값은 이 요청에 실리지 않는다 — 담을 필드가 타입에 **존재하지 않는다**(AC-045).
export type MockScreenEvent = "shown" | "consented" | "submitted";

export type RecordMockScreenEventRequest = {
  sessionId: string;
  landingId: string;
  event: MockScreenEvent;
};
export type RecordMockScreenEventResponse = { ok: true };
