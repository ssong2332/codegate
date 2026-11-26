import { callCallable } from "./callable";

/** §143.22 서버 기동 단계(`functions/src/voice/warm.ts` 판정표 WT · 같은 값). off = 대상 아님 · 미설정 · 한도(대기 화면 없이 종전 흐름). */
export type CloneWarmPhase = "off" | "booting" | "loading" | "warming" | "ready" | "failed";

/**
 * §143.5 W1 · W3 — 복제 목소리 합성 서비스를 미리 띄운다. 기다리지 않고 부른다(실패 · 미설정은 조용히 무시 — 통화 발급이 최종 판정).
 * sessionId = 챌린지 받는 사람(그 세션이 복제 목소리일 때만 서버가 데운다).
 */
export function warmCloneEngine(sessionId?: string): void {
  void callCallable<{ sessionId?: string }, { warmed: boolean }>("warmCloneEngine", sessionId ? { sessionId } : {}, 130_000).catch(() => {});
}

/** §143.22 — 챌린지 링크 토큰으로(동의 전 · 로그인 없음) 데우고 지금 단계를 받는다. 실패는 "failed". */
export async function warmCloneEngineByLink(challengeToken: string): Promise<CloneWarmPhase> {
  try {
    const r = await callCallable<{ challengeToken: string }, { phase?: CloneWarmPhase }>("warmCloneEngine", { challengeToken }, 130_000);
    return r.phase ?? "ready"; // phase 없는 옛 서버 = 응답 = 기동 끝
  } catch {
    return "failed";
  }
}
