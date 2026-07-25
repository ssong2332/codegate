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
