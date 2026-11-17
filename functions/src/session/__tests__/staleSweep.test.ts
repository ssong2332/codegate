// 2026-11-17 감사 '꼭 고칠 것 5' — 버려진 active 세션 정리(`session/staleSweep.ts` 판정표 S1 ~ S4 · 예약 함수 배선).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MAX_SESSION_MS } from "../../shared/constants";
import { TOKEN_EXPIRE_MINUTES } from "../../realtime/geminiProvider";
import { realtimeSessionTimeExceeded } from "../../realtime/issueBudget";
import {
  judgeStaleSession,
  STALE_SESSION_END_REASON,
  STALE_SESSION_GRACE_MS,
  STALE_SESSION_SWEEP_LIMIT,
  staleSessionCreatedBeforeMs,
} from "../staleSweep";
import { END_SESSION_ALLOWED_REASONS } from "../endReason";

const ROOT = path.resolve(__dirname, "../../../..");
const readRepo = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const MIN = 60_000;
const NOW = Date.parse("2026-11-17T12:00:00Z");
const DEAD_AFTER = MAX_SESSION_MS + STALE_SESSION_GRACE_MS;

test("[재현] createSession 뒤 버려진 세션(3시간 전 생성 · 대화 0 · active)은 종료 대상이다(S4 · limit_reached)", () => {
  const abandoned = { status: "active", createdAtMs: NOW - 180 * MIN, maxSessionMs: MAX_SESSION_MS };
  assert.deepEqual(judgeStaleSession(abandoned, NOW), { action: "end", row: "S4" });
  assert.equal(STALE_SESSION_END_REASON, "limit_reached");
  // 새 종료 사유를 만들지 않는다 — endSession 허용 목록 안의 값이다(리포트 · 종료 사유 시험 영향 0).
  assert.ok((END_SESSION_ALLOWED_REASONS as readonly string[]).includes(STALE_SESSION_END_REASON));
});

test("[S1] 이미 끝난 세션 · 클론 대기(created) · 상태 부재는 건드리지 않는다", () => {
  const old = NOW - 24 * 60 * MIN;
  for (const status of ["ended", "created", undefined, "ACTIVE"]) {
    assert.deepEqual(judgeStaleSession({ status, createdAtMs: old }, NOW), { action: "keep", row: "S1" }, String(status));
  }
});

test("[S2] 기점이 숫자가 아닌 깨진 문서는 유지(fail-closed)", () => {
  assert.deepEqual(judgeStaleSession({ status: "active" }, NOW), { action: "keep", row: "S2" });
  assert.deepEqual(judgeStaleSession({ status: "active", createdAtMs: Number.NaN }, NOW), { action: "keep", row: "S2" });
});

test("[S3] 진행 중인 정상 세션은 유지 — 20분 통화 · 한도 직전 발급 뒤 통화 · 다통화 · 재연결(받은 시각 기점)", () => {
  // 방금 받은 20분 통화
  assert.equal(judgeStaleSession({ status: "active", createdAtMs: NOW - 21 * MIN, answeredAtMs: NOW - 20 * MIN }, NOW).action, "keep");
  // 기점 + 59분에 마지막 토큰을 받은 통화가 토큰 수명(30분) 끝까지 이어지는 순간
  const anchor = NOW - (59 + TOKEN_EXPIRE_MINUTES) * MIN;
  assert.equal(judgeStaleSession({ status: "active", createdAtMs: anchor, answeredAtMs: anchor }, NOW).action, "keep");
  // 다통화 · 메신저 → 통화 · 재연결: 생성은 오래전이어도 받은 시각이 최근이면 기점은 받은 시각이다
  const multiLeg = { status: "active", createdAtMs: NOW - 5 * 60 * MIN, answeredAtMs: NOW - 70 * MIN, maxSessionMs: MAX_SESSION_MS };
  assert.deepEqual(judgeStaleSession(multiLeg, NOW), { action: "keep", row: "S3" });
});

test("[경계] 기점 + 한도 + 유예 정확히 = 종료 · 1ms 전 = 유지", () => {
  const anchor = NOW - DEAD_AFTER;
  assert.equal(judgeStaleSession({ status: "active", createdAtMs: anchor }, NOW).action, "end");
  assert.equal(judgeStaleSession({ status: "active", createdAtMs: anchor }, NOW - 1).action, "keep");
  // 문서 한도가 더 길면 그만큼 기다린다 · 깨진 한도는 기본값
  assert.equal(judgeStaleSession({ status: "active", createdAtMs: anchor, maxSessionMs: 2 * MAX_SESSION_MS }, NOW).action, "keep");
  assert.equal(judgeStaleSession({ status: "active", createdAtMs: anchor, maxSessionMs: "x" }, NOW).action, "end");
  assert.equal(judgeStaleSession({ status: "active", createdAtMs: anchor, maxSessionMs: 0 }, NOW).action, "end");
});

test("[근거] 종료 시점에는 새 실시간 발급이 이미 막혀 있고(issueBudget) 유예는 토큰 수명보다 길다", () => {
  const anchor = NOW - DEAD_AFTER;
  const session = { createdAt: { toMillis: () => anchor }, maxSessionMs: MAX_SESSION_MS } as never;
  assert.equal(realtimeSessionTimeExceeded(session, NOW), true);
  assert.ok(STALE_SESSION_GRACE_MS > TOKEN_EXPIRE_MINUTES * MIN);
});

test("[쿼리 상한] createdAt이 상한보다 늦은 세션은 기점이 무엇이든 S4가 아니다(1차 필터가 대상을 놓치지 않는다)", () => {
  const cutoff = staleSessionCreatedBeforeMs(NOW);
  assert.equal(judgeStaleSession({ status: "active", createdAtMs: cutoff }, NOW).action, "end");
  for (const createdAtMs of [cutoff + 1, cutoff + 30 * MIN, NOW]) {
    for (const answeredAtMs of [undefined, createdAtMs, createdAtMs + 10 * MIN]) {
      assert.equal(judgeStaleSession({ status: "active", createdAtMs, answeredAtMs }, NOW).action, "keep");
    }
  }
});

test("[배선] 예약 함수 export · 쿼리 limit · 트랜잭션 재판정 · 복합 색인 · 리포트/LLM import 0", () => {
  assert.match(readRepo("functions/src/index.ts"), /export \{ endStaleSessions \} from "\.\/session\/staleSweepSchedule";/);
  const src = readRepo("functions/src/session/staleSweepSchedule.ts");
  assert.match(src, /onSchedule\("every 60 minutes"/);
  assert.match(src, /\.where\("status", "==", "active"\)/);
  assert.match(src, /\.orderBy\("createdAt", "asc"\)/);
  assert.match(src, /\.limit\(STALE_SESSION_SWEEP_LIMIT\)/);
  assert.match(src, /runTransaction[\s\S]*tx\.get\(doc\.ref\)[\s\S]*judgeStaleSession[\s\S]*tx\.update/);
  assert.doesNotMatch(src, /^import .*(\.\.\/report|\.\.\/llm|\.\.\/roleplay|\.\.\/voice|\.\/index)/m);
  assert.ok(STALE_SESSION_SWEEP_LIMIT > 0 && STALE_SESSION_SWEEP_LIMIT <= 500);
  const indexes = JSON.parse(readRepo("firestore.indexes.json")) as {
    indexes: { collectionGroup: string; fields: { fieldPath: string; order: string }[] }[];
  };
  assert.ok(
    indexes.indexes.some(
      (ix) =>
        ix.collectionGroup === "sessions" &&
        JSON.stringify(ix.fields) ===
          JSON.stringify([
            { fieldPath: "status", order: "ASCENDING" },
            { fieldPath: "createdAt", order: "ASCENDING" },
          ]),
    ),
  );
});
