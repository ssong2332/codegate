// 2026-10-21 통화 종료 즉시성 — 전사 제출 인계(통화 화면 → 종료 화면) 순수 계약 + 배선 소스 스캔.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  awaitTranscriptFlush,
  handOffTranscriptFlush,
  resetTranscriptFlushHandoffForTest,
  TRANSCRIPT_FLUSH_WAIT_CAP_MS,
} from "./transcriptFlushHandoff.ts";

beforeEach(() => resetTranscriptFlushHandoffForTest());

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("인계가 없으면 즉시 끝난다", async () => {
  let done = false;
  await awaitTranscriptFlush("s1").then(() => (done = true));
  assert.equal(done, true);
});

test("같은 세션의 제출이 끝날 때까지 기다린다(endSession보다 제출이 먼저 — §79.9 E5)", async () => {
  const d = deferred();
  handOffTranscriptFlush("s1", d.promise);
  let waited = false;
  const w = awaitTranscriptFlush("s1").then(() => (waited = true));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(waited, false, "제출 전에 풀렸다");
  d.resolve();
  await w;
  assert.equal(waited, true);
});

test("제출 실패도 기다림을 푼다(던지지 않는다 — AC-006 종료는 항상 성공)", async () => {
  const d = deferred();
  handOffTranscriptFlush("s1", d.promise);
  const w = awaitTranscriptFlush("s1");
  d.reject(new Error("network"));
  await assert.doesNotReject(w);
});

test("다른 세션의 인계는 기다리지 않는다", async () => {
  handOffTranscriptFlush("s1", new Promise<void>(() => {}));
  let done = false;
  await awaitTranscriptFlush("s2").then(() => (done = true));
  assert.equal(done, true);
});

test("영영 끝나지 않는 제출은 상한에서 끊는다 · 상한 = httpsCallable 기본 타임아웃 70초", async () => {
  assert.equal(TRANSCRIPT_FLUSH_WAIT_CAP_MS, 70_000);
  handOffTranscriptFlush("s1", new Promise<void>(() => {}));
  const t0 = Date.now();
  await awaitTranscriptFlush("s1", 30);
  assert.ok(Date.now() - t0 >= 25);
});

test("끝난 인계는 비워진다(다음 기다림은 즉시)", async () => {
  handOffTranscriptFlush("s1", Promise.resolve());
  await awaitTranscriptFlush("s1");
  await new Promise((r) => setTimeout(r, 0));
  const t0 = Date.now();
  await awaitTranscriptFlush("s1", 5_000);
  assert.ok(Date.now() - t0 < 50);
});

// ── 배선(화면은 테스트에서 렌더할 수 없다 — 소스 스캔) ─────────────────────────────────────────────

function codeOnly(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("{/*");
    })
    .join("\n");
}
const play = codeOnly(readFileSync("src/app/session/play/page.tsx", "utf8"));
const end = codeOnly(readFileSync("src/app/session/end/page.tsx", "utf8"));

function slice(code: string, startToken: string, endToken: string): string {
  const start = code.indexOf(startToken);
  assert.ok(start >= 0, `시작 앵커 없음: ${startToken}`);
  const stop = code.indexOf(endToken, start + startToken.length);
  assert.ok(stop > start, `끝 앵커 없음: ${endToken}`);
  return code.slice(start, stop);
}

test("[통화 화면] 즉시 이동 경로는 제출을 기다리지 않는다 — 시작 → 인계 → 사유 → 이동, 끊김 표시만 기록 완료를 기다린다", () => {
  const body = slice(play, "const endCall = async (", "const handleEndTraining = async (");
  assert.equal(body.includes("await flushTranscript()"), false, "이동이 다시 제출 왕복 뒤로 밀렸다");
  const order = [
    "realtime.stop();",
    "setLocalHangup(true);",
    "const flushDone = flushTranscript();",
    "if (sessionId) handOffTranscriptFlush(sessionId, flushDone);",
    "if (sessionId) setPendingEndReason(sessionId, ending.reason);",
    "if (noticeWait) await Promise.all([flushDone, noticeWait]);",
    'router.push("/session/end");',
  ];
  let last = -1;
  for (const token of order) {
    const at = body.indexOf(token, last + 1);
    assert.ok(at > last, `순서 위반 또는 누락: ${token}`);
    last = at;
  }
});

test("[통화 화면] 즉시 피드백 — 통화 종료 상태 줄이 타이머를 대체한다 · 종료 화면을 미리 받는다", () => {
  assert.match(play, /\(phase === "opening" \|\| phase === "live"\) && !localHangup \? \(/);
  assert.match(play, /router\.prefetch\("\/session\/end"\)/);
});

test("[종료 화면] endSession 앞에서 같은 세션의 제출을 기다린다", () => {
  const effect = slice(end, "await awaitTranscriptFlush(sessionId);", "setState(\"ended\");");
  assert.ok(effect.indexOf("await requestEndSession(sessionId, endReason);") > 0, "기다림이 endSession 뒤에 있다");
});
