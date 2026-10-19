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
  /**
   * T194-c-1(§84.5.3 · G584) — `entrySurface === "in-call-sms"` 항목에만 **필수**(부재면 `invalid-argument`) · 그 밖 항목은 무시(메신저 경로
   * 무변경). ⛔ 응낙 시점의 클라 계수(`scammerTurns`)는 받지 않는다 — 앵커는 서버가 그 설치 문자 문서에서 복사한다(§84.15.3 · Q-X5 · G606).
   * c-1에서는 기록 · 관측용이다(실시간 응낙 지시 동봉 판정은 T194-c-2).
   */
  callMode?: "realtime" | "fallback";
};
/** T194-c-1(docs/Architecture.md §84.5.3 · §84.15.3) — 통화 중 설치 화면(Q2) 기록 때 그 통화의 경로(위 요청 필드와 같은 리터럴). */
export type MockScreenCallMode = NonNullable<RecordMockScreenEventRequest["callMode"]>;
export type RecordMockScreenEventResponse = { ok: true };
