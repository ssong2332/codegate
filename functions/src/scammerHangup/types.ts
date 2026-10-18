// T192 C1 — `requestScammerHangup` 요청/응답(Architecture.md §79.5 · src/lib/api/types.ts와 1:1).
import type { ScammerHangupStatus } from "./decide";

export type RequestScammerHangupRequest = {
  sessionId: string;
  /** 클라가 센 사기범 턴 수(Live `turnComplete` 기준 — 클라 주장값, OQ-A120). */
  scammerTurns: number;
  /** 클라 주장 — 보류 중인 지시 큐가 비어 있지 않거나 도구 응답 대기 중. */
  pendingInstruction: boolean;
  /** 모델의 `end_call` 인자 `reason`. 누락 · 오기입은 `unspecified`(거절하지 않는다). */
  kind?: string;
};

export type RequestScammerHangupResponse = {
  status: ScammerHangupStatus;
  /** 서버 소유 문면(모델에게만 — 클라는 그대로 `sendToolResponse`에 싣는다, G386). */
  guidance: string;
};
