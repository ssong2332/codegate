// §66.3/§66.11 G409 — createSession 롤링 윈도우 진리표(순수 함수 단독).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCreateSessionRateLimited } from "../rateLimit";
import { CREATE_SESSION_WINDOW_MAX, CREATE_SESSION_WINDOW_MS } from "../../shared/constants";

const NOW = 1_700_000_000_000;

test("[G409-a] 창 안(10분 이내) 6건 ⇒ true(거부)", () => {
  const recentCreatedAtMs = Array.from({ length: CREATE_SESSION_WINDOW_MAX }, (_, i) => NOW - i * 1000);
  assert.equal(isCreateSessionRateLimited({ recentCreatedAtMs, nowMs: NOW }), true);
});

test("[G409-b] 창 안 5건 + 창 밖 10건 ⇒ false — 역검증: 오래된 문서가 사람을 가두지 않는다", () => {
  const inWindow = Array.from({ length: CREATE_SESSION_WINDOW_MAX - 1 }, (_, i) => NOW - i * 1000);
  const outOfWindow = Array.from(
    { length: 10 },
    (_, i) => NOW - CREATE_SESSION_WINDOW_MS - (i + 1) * 1000,
  );
  assert.equal(
    isCreateSessionRateLimited({ recentCreatedAtMs: [...inWindow, ...outOfWindow], nowMs: NOW }),
    false,
    "창 밖의 오래된 문서가 카운트에 섞여 정상 사용자를 가뒀다",
  );
});

test("[G409-c] 정확히 nowMs - WINDOW인 문서는 세지 않는다(`>` 경계, `>=` 아님)", () => {
  const boundary = NOW - CREATE_SESSION_WINDOW_MS;
  const recentCreatedAtMs = [
    ...Array.from({ length: CREATE_SESSION_WINDOW_MAX - 1 }, (_, i) => NOW - i * 1000),
    boundary,
  ];
  assert.equal(
    isCreateSessionRateLimited({ recentCreatedAtMs, nowMs: NOW }),
    false,
    "경계값(정확히 10분 전) 문서가 세어져 상한에 닿았다 — `>` 경계가 아니다",
  );
});

test("[G409-d] 빈 배열 ⇒ false", () => {
  assert.equal(isCreateSessionRateLimited({ recentCreatedAtMs: [], nowMs: NOW }), false);
});

test("[G409-e] 창 안 정확히 CREATE_SESSION_WINDOW_MAX-1건 ⇒ false(상한 미달)", () => {
  const recentCreatedAtMs = Array.from({ length: CREATE_SESSION_WINDOW_MAX - 1 }, (_, i) => NOW - i * 1000);
  assert.equal(isCreateSessionRateLimited({ recentCreatedAtMs, nowMs: NOW }), false);
});
