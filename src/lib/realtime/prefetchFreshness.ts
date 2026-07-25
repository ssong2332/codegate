// 실시간 통화 자격증명 프리페치 신선도 판정 (순수 함수, 2026-07-25).
//
// useRealtimeCall.ts에서 분리한 이유는 pcm.ts/userSpeechLevel.ts와 동일하다 — 브라우저 전용 API나
// "@/lib/api" 같은 경로 별칭 임포트가 전혀 없어야 별도 node:test 프로세스(경로 별칭을 해석하지
// 못하는 플레인 node 실행)에서 이 파일만 단위 테스트할 수 있다.
export type PrefetchTimestamp = { sessionId: string; mintedAt: number };

/**
 * Gemini 자격증명(ephemeral token)은 발급 시점부터 newSessionExpireTime(geminiProvider.ts, 2분)
 * 안에만 새 세션을 시작할 수 있다. 전화가 울리는 동안 미리 받아 둔 자격증명이 "받기" 시점까지도
 * 재사용할 만큼 신선한지(같은 세션 대상 + staleMs 이내에 발급됨) 판단한다.
 */
export function isPrefetchFresh(
  prefetched: PrefetchTimestamp | null,
  sessionId: string,
  nowMs: number,
  staleMs: number,
): boolean {
  return (
    prefetched != null && prefetched.sessionId === sessionId && nowMs - prefetched.mintedAt < staleMs
  );
}
