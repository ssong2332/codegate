import { callCallable } from "./callable";

/**
 * §143.5 W1 · W3 — 복제 목소리 합성 서비스를 미리 띄운다. 기다리지 않고 부른다(실패 · 미설정은 조용히 무시 — 통화 발급이 최종 판정).
 * sessionId = 챌린지 받는 사람(그 세션이 복제 목소리일 때만 서버가 데운다).
 */
export function warmCloneEngine(sessionId?: string): void {
  void callCallable<{ sessionId?: string }, { warmed: boolean }>("warmCloneEngine", sessionId ? { sessionId } : {}, 130_000).catch(() => {});
}
