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

// ── 진행 중인 미리 받기 재사용(2026-10-18, 라이브 d13e718 회귀) ─────────────────────────────────
// T190에서 벨 직전 고지(`pre-call-notice`)와 "준비됐어요" 뒤 짧은 정적이 생겨 `incoming`이 늦게 시작되자, 받기를
// 빨리 누르면 미리 받기 응답이 오기 전에 `start()`가 불렸다. 예전 `start()`는 *완료된* 결과만 보고 "없다"고 판단해
// 같은 세션의 자격증명을 **한 번 더** 발급했다(서버 왕복 2회 · 콜드 스타트면 받기→자격증명 7.5초 실측).
// 아래 두 함수가 그 판단을 소유한다 — 훅은 결과대로만 움직인다(신선도 규칙은 위 `isPrefetchFresh` 그대로).

/** 진행 중인 미리 받기 요청의 식별 부분(Promise 자체는 훅이 들고 있다). */
export type PrefetchInflight = { sessionId: string };

/**
 * 받기 시점에 자격증명을 어디서 가져올지.
 * - `settled`: 이미 받아 둔 신선한 결과를 그대로 쓴다.
 * - `inflight`: 같은 세션의 요청이 아직 진행 중이다 — 새로 발급하지 말고 그 결과를 기다린다.
 * - `mint`: 둘 다 없거나(다른 세션·상함) — 지금 새로 발급한다.
 */
export type CredentialSource = "settled" | "inflight" | "mint";

export function chooseCredentialSource(
  settled: PrefetchTimestamp | null,
  inflight: PrefetchInflight | null,
  sessionId: string,
  nowMs: number,
  staleMs: number,
): CredentialSource {
  if (isPrefetchFresh(settled, sessionId, nowMs, staleMs)) return "settled";
  if (inflight != null && inflight.sessionId === sessionId) return "inflight";
  return "mint";
}

/**
 * 미리 받기를 (다시) 걸어야 하는가. 같은 세션의 요청이 진행 중이거나 신선한 결과가 이미 있으면 걸지 않는다.
 * ⭐ 고지 화면에서 오래 머물러 결과가 상했으면 벨(`incoming`)에서 한 번 더 받는다(받기 때 새 발급을 피한다).
 */
export function shouldStartPrefetch(
  settled: PrefetchTimestamp | null,
  inflight: PrefetchInflight | null,
  sessionId: string,
  nowMs: number,
  staleMs: number,
): boolean {
  return chooseCredentialSource(settled, inflight, sessionId, nowMs, staleMs) === "mint";
}

/**
 * 미리 받기 슬롯 — 완료 결과 1개 + 진행 중 요청 1개를 들고, 받기 시점에 그중 쓸 것을 꺼낸다.
 * `useRealtimeCall`이 이것을 ref 하나에 담아 쓴다(React · 경로 별칭 의존 0 — 이 파일에서 직접 단위 테스트한다).
 *
 * - `prefetch`: 쓸 것이 없을 때만 발급을 건다. 자리를 **먼저** 잡고 요청을 띄운다(바로 뒤의 받기가 "진행 중"으로 본다).
 *   실패는 조용히 삼킨다(P-4 비차단 — 받기 때 새로 발급한다).
 * - `take`: 신선한 완료 결과 → 같은 세션의 진행 중 요청 결과(기다린다) 순으로 꺼낸다. 꺼낸 결과는 **소모**한다.
 *   쓸 것이 없으면(`mint` · 진행 중 요청 실패 · 상함 · 다른 세션) `issued: null` + `source: "mint"` — 호출부가 새로 발급한다.
 */
export type PrefetchSlot<T> = {
  prefetch: (sessionId: string) => void;
  take: (sessionId: string) => Promise<{ issued: T | null; source: CredentialSource }>;
};

export function createPrefetchSlot<T>(deps: {
  mint: (sessionId: string) => Promise<T>;
  now: () => number;
  staleMs: number;
  /** 언마운트 뒤 늦게 온 결과는 보관하지 않는다. */
  isAlive: () => boolean;
}): PrefetchSlot<T> {
  type Settled = { sessionId: string; issued: T; mintedAt: number };
  let settled: Settled | null = null;
  let inflight: { sessionId: string; promise: Promise<Settled | null> } | null = null;

  const prefetch = (sessionId: string) => {
    if (!shouldStartPrefetch(settled, inflight, sessionId, deps.now(), deps.staleMs)) return;
    const entry: { sessionId: string; promise: Promise<Settled | null> } = {
      sessionId,
      promise: Promise.resolve(null),
    };
    inflight = entry;
    entry.promise = (async () => {
      try {
        const issued = await deps.mint(sessionId);
        if (!deps.isAlive()) return null;
        const result: Settled = { sessionId, issued, mintedAt: deps.now() };
        settled = result;
        return result;
      } catch {
        return null;
      } finally {
        if (inflight === entry) inflight = null;
      }
    })();
  };

  const take = async (sessionId: string): Promise<{ issued: T | null; source: CredentialSource }> => {
    const source = chooseCredentialSource(settled, inflight, sessionId, deps.now(), deps.staleMs);
    let candidate: Settled | null = settled;
    if (source === "inflight" && inflight) candidate = await inflight.promise;
    settled = null; // 어느 쪽이든 소모 — 재사용하지 않는다.
    if (source === "mint" || candidate === null) return { issued: null, source: "mint" };
    return isPrefetchFresh(candidate, sessionId, deps.now(), deps.staleMs)
      ? { issued: candidate.issued, source }
      : { issued: null, source: "mint" };
  };

  return { prefetch, take };
}
