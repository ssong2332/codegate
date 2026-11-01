// T192 C1 — `requestScammerHangup` 요청/응답(Architecture.md §79.5 · src/lib/api/types.ts와 1:1).
// T192 C3(§79.19 (2) 8 · (5)) — 요청의 하한 입력을 사기범 턴에서 사용자 발화 `userTurns`로 바꿨다(화면 호출 0일 때만 무비용 — §79.19 (0) 4).
import type { ScammerHangupStatus } from "./decide";

export type RequestScammerHangupRequest = {
  sessionId: string;
  /** 클라가 센 사용자 발화 수(+ 응답 중 발화 1 — S5b `send_prepared_sms`와 같은 식 · 클라 주장값, OQ-A120). */
  userTurns: number;
  /** 클라 주장 — 지시 큐 ∨ busy ∨ 교대 대기 ∨ 같은 배치의 다른 도구(⛔ 컴포넌트 `toolPending` 제외 — §79.19 (3)). */
  pendingInstruction: boolean;
  /** 모델의 `end_call` 인자 `reason`. 누락 · 오기입은 `unspecified`(거절하지 않는다). */
  kind?: string;
};

export type RequestScammerHangupResponse = {
  status: ScammerHangupStatus;
  /** 서버 소유 문면(모델에게만 — 클라는 그대로 `sendToolResponse`에 싣는다, G386). */
  guidance: string;
  /**
   * §142 — 다통화 변형의 마지막이 아닌 레그에서 승인된 끊기 = **레그 끝**(세션은 이어진다). 클라는 통화를 내리고 `exit`대로 다음 레그를 연다
   * (`dial` = 전화 앱 다이얼 · `transfer` = 대기음 뒤 자동 연결). 부재 = 종전(세션 끝).
   */
  legEnd?: { exit: "dial" | "transfer" };
};
