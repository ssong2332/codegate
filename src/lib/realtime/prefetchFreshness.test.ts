import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrefetchFresh } from "./prefetchFreshness.ts";

test("isPrefetchFresh: null이면 항상 false다", () => {
  assert.equal(isPrefetchFresh(null, "s1", 1_000_000, 90_000), false);
});

test("isPrefetchFresh: sessionId가 다르면 false다(다른 세션의 프리페치는 재사용하지 않는다)", () => {
  const prefetched = { sessionId: "s1", mintedAt: 1_000_000 };
  assert.equal(isPrefetchFresh(prefetched, "s2", 1_000_100, 90_000), false);
});

test("isPrefetchFresh: staleMs 이내면 true다", () => {
  const prefetched = { sessionId: "s1", mintedAt: 1_000_000 };
  assert.equal(isPrefetchFresh(prefetched, "s1", 1_089_999, 90_000), true);
});

test("isPrefetchFresh: staleMs를 넘기면 false다(경계값 포함)", () => {
  const prefetched = { sessionId: "s1", mintedAt: 1_000_000 };
  assert.equal(isPrefetchFresh(prefetched, "s1", 1_090_000, 90_000), false);
  assert.equal(isPrefetchFresh(prefetched, "s1", 1_200_000, 90_000), false);
});

// ── 진행 중 미리 받기 재사용(2026-10-18, 라이브 d13e718 회귀 — 받기→자격증명 7456ms · 발급 2회) ──────────────
import { chooseCredentialSource, createPrefetchSlot, shouldStartPrefetch } from "./prefetchFreshness.ts";

test("chooseCredentialSource: 신선한 완료 결과 > 같은 세션 진행 중 > 새 발급", () => {
  const settled = { sessionId: "s1", mintedAt: 1_000_000 };
  assert.equal(chooseCredentialSource(settled, null, "s1", 1_000_100, 90_000), "settled");
  assert.equal(chooseCredentialSource(null, { sessionId: "s1" }, "s1", 1_000_100, 90_000), "inflight");
  assert.equal(chooseCredentialSource(null, { sessionId: "s2" }, "s1", 1_000_100, 90_000), "mint", "다른 세션");
  assert.equal(chooseCredentialSource(settled, null, "s1", 1_090_000, 90_000), "mint", "상함");
  assert.equal(chooseCredentialSource(null, null, "s1", 1_000_100, 90_000), "mint");
});

test("shouldStartPrefetch: 진행 중이거나 신선하면 다시 걸지 않고, 상했으면 다시 건다", () => {
  assert.equal(shouldStartPrefetch(null, { sessionId: "s1" }, "s1", 0, 90_000), false);
  assert.equal(shouldStartPrefetch({ sessionId: "s1", mintedAt: 0 }, null, "s1", 10, 90_000), false);
  assert.equal(shouldStartPrefetch({ sessionId: "s1", mintedAt: 0 }, null, "s1", 90_000, 90_000), true);
  assert.equal(shouldStartPrefetch(null, null, "s1", 0, 90_000), true);
});

/** 발급 호출을 세고, 각 호출의 완료를 테스트가 직접 정하는 가짜 발급기. */
function fakeMint() {
  const calls: Array<{ sessionId: string; resolve: (v: string) => void; reject: (e: Error) => void }> = [];
  let n = 0;
  const mint = (sessionId: string) =>
    new Promise<string>((resolve, reject) => {
      n += 1;
      calls.push({ sessionId, resolve, reject });
    });
  return { mint, calls, count: () => n };
}

/** 받기(start) 모형 — 훅의 `start()`와 같은 순서: 슬롯에서 꺼내고, 없으면 새로 발급한다. */
async function acceptLikeStart(slot: ReturnType<typeof createPrefetchSlot<string>>, mint: (s: string) => Promise<string>, sessionId: string) {
  const taken = await slot.take(sessionId);
  return { issued: taken.issued ?? (await mint(sessionId)), source: taken.source, reused: taken.issued !== null };
}

test("② 진행 중 미리 받기가 있으면 받기는 두 번째 발급을 하지 않고 그 결과를 기다려 쓴다", async () => {
  const f = fakeMint();
  let now = 1_000;
  const slot = createPrefetchSlot<string>({ mint: f.mint, now: () => now, staleMs: 90_000, isAlive: () => true });
  slot.prefetch("s1"); // 고지 화면
  slot.prefetch("s1"); // 벨 화면 전이 — 진행 중이므로 다시 걸지 않는다
  assert.equal(f.count(), 1);
  const accepted = acceptLikeStart(slot, f.mint, "s1"); // 응답 전에 받기
  now += 300;
  f.calls[0].resolve("token-A");
  const result = await accepted;
  assert.equal(f.count(), 1, "발급은 정확히 1회");
  assert.deepEqual(result, { issued: "token-A", source: "inflight", reused: true });
  // 한 번 쓰면 소모 — 다음 받기는 새로 발급한다.
  const again = acceptLikeStart(slot, f.mint, "s1");
  for (let i = 0; i < 5 && f.calls.length < 2; i += 1) await Promise.resolve();
  assert.equal(f.calls.length, 2, "소모 뒤 받기는 새 발급");
  f.calls[1].resolve("token-B");
  assert.equal((await again).reused, false);
});

test("③ 미리 받기가 실패하면 받기는 새로 발급한다", async () => {
  const f = fakeMint();
  const slot = createPrefetchSlot<string>({ mint: f.mint, now: () => 1_000, staleMs: 90_000, isAlive: () => true });
  slot.prefetch("s1");
  const accepted = acceptLikeStart(slot, f.mint, "s1");
  f.calls[0].reject(new Error("cold"));
  // 진행 중 요청의 실패가 전파된 뒤 새 발급이 나간다.
  for (let i = 0; i < 5 && f.calls.length < 2; i += 1) await Promise.resolve();
  assert.equal(f.calls.length, 2, "실패 뒤 새 발급 1회");
  f.calls[1].resolve("token-B");
  assert.deepEqual(await accepted, { issued: "token-B", source: "mint", reused: false });
});

test("③ 다른 세션의 진행 중 요청은 기다리지 않고 새로 발급한다 · 상한 결과도 쓰지 않는다", async () => {
  const f = fakeMint();
  let now = 1_000;
  const slot = createPrefetchSlot<string>({ mint: f.mint, now: () => now, staleMs: 90_000, isAlive: () => true });
  slot.prefetch("s-other");
  const accepted = acceptLikeStart(slot, f.mint, "s1");
  for (let i = 0; i < 5 && f.calls.length < 2; i += 1) await Promise.resolve();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].sessionId, "s1");
  f.calls[1].resolve("token-s1");
  assert.equal((await accepted).source, "mint");

  // 완료됐지만 90초가 지난 결과 → 벨에서 다시 받기를 건다(고지 화면에 오래 머문 경우).
  const g = fakeMint();
  const slot2 = createPrefetchSlot<string>({ mint: g.mint, now: () => now, staleMs: 90_000, isAlive: () => true });
  slot2.prefetch("s1");
  g.calls[0].resolve("old");
  await Promise.resolve();
  await Promise.resolve();
  now += 90_000;
  slot2.prefetch("s1");
  assert.equal(g.count(), 2, "상한 결과는 다시 받는다");
});

test("②③ 역검증 — 진행 중 요청을 못 보는 옛 판단(완료 결과만 봄)은 같은 시나리오에서 발급 2회가 된다", async () => {
  // 옛 `start()`의 판단을 그대로 흉내 낸다: 완료된 결과가 신선할 때만 재사용, 아니면 즉시 새 발급.
  const f = fakeMint();
  let settled: { sessionId: string; mintedAt: number; issued: string } | null = null;
  const oldPrefetch = (sessionId: string) => {
    void f.mint(sessionId).then((issued) => {
      settled = { sessionId, mintedAt: 1_000, issued };
    });
  };
  const oldStart = async (sessionId: string) => {
    const fresh = settled !== null && isPrefetchFresh(settled, sessionId, 1_100, 90_000);
    return fresh ? "reused" : await f.mint(sessionId);
  };
  oldPrefetch("s1");
  const accepted = oldStart("s1");
  f.calls[0].resolve("token-A");
  f.calls[1].resolve("token-B");
  await accepted;
  assert.equal(f.count(), 2, "옛 판단은 발급 2회(회귀 재현)");
  // 같은 시나리오를 새 슬롯으로 돌리면 1회다(위 ② 테스트와 같은 함수).
  const g = fakeMint();
  const slot = createPrefetchSlot<string>({ mint: g.mint, now: () => 1_000, staleMs: 90_000, isAlive: () => true });
  slot.prefetch("s1");
  const ok = acceptLikeStart(slot, g.mint, "s1");
  g.calls[0].resolve("token-A");
  await ok;
  assert.equal(g.count(), 1);
});

test("언마운트 뒤 도착한 미리 받기 결과는 보관하지 않는다", async () => {
  const f = fakeMint();
  let alive = true;
  const slot = createPrefetchSlot<string>({ mint: f.mint, now: () => 1_000, staleMs: 90_000, isAlive: () => alive });
  slot.prefetch("s1");
  alive = false;
  f.calls[0].resolve("late");
  await Promise.resolve();
  await Promise.resolve();
  const taken = await slot.take("s1");
  assert.equal(taken.issued, null);
});
