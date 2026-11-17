// 2026-11-17 저장소 감사 1 — 통화 전사 제출 실패 시 유실(`transcriptSubmitQueue.ts` 표 Q).
// [재현]은 옛 `flushTranscript`(먼저 비우고 실패하면 0)를 같은 가짜 서버에 돌려 통화 1 대화가 사라지는 것을 먼저 보인다.
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 CRLF→LF로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  drainTranscriptQueue,
  enqueueTranscriptTurns,
  isPermanentSubmitError,
  TRANSCRIPT_BATCH_MAX_TURNS,
  type QueuedBatch,
} from "./transcriptSubmitQueue.ts";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
type Turn = { role: "user" | "scammer"; text: string };
const t = (text: string, role: Turn["role"] = "user"): Turn => ({ role, text });

/** 가짜 서버 — `transcriptBatches`처럼 같은 batchId는 한 번만 저장한다. `fail` = 다음 n번 호출은 저장 없이 네트워크 오류. */
function fakeServer() {
  const stored: Turn[] = [];
  const seen = new Set<string>();
  let failNext = 0;
  let loseResponseNext = 0;
  return {
    stored,
    failNext: (n: number) => (failNext = n),
    loseResponseNext: (n: number) => (loseResponseNext = n),
    async submit(turns: Turn[], batchId: string): Promise<number> {
      if (failNext > 0) {
        failNext -= 1;
        throw Object.assign(new Error("network"), { code: "functions/unavailable" });
      }
      const written = seen.has(batchId) ? 0 : (seen.add(batchId), stored.push(...turns), turns.length);
      if (loseResponseNext > 0) {
        loseResponseNext -= 1;
        throw Object.assign(new Error("deadline"), { code: "functions/deadline-exceeded" });
      }
      return written;
    },
  };
}

let idSeq = 0;
const newId = () => `batch${String((idSeq += 1)).padStart(4, "0")}`;

/** 새 방식 — `page.tsx` flushTranscript와 같은 순서(큐에 넣기 → 앞에서부터 보내기 → 끝난 batch 빼기). */
function newClient(server: ReturnType<typeof fakeServer>) {
  let ref: Turn[] = [];
  let queue: QueuedBatch<Turn>[] = [];
  return {
    say: (turn: Turn) => ref.push(turn),
    async flush() {
      queue = enqueueTranscriptTurns(queue, ref, newId);
      ref = [];
      const { written, settled } = await drainTranscriptQueue(queue, (b) => server.submit(b.turns, b.batchId));
      queue = queue.filter((b) => !settled.includes(b.batchId));
      return written;
    },
  };
}

test("[감사 1 재현] 통화 1 끊기 제출이 실패하면 — 옛 방식은 통화 1 대화가 사라지고, 새 방식은 종료 제출에 함께 실린다", async () => {
  // 옛 방식(수정 전 page.tsx 그대로): 먼저 비우고, 실패하면 0.
  const oldServer = fakeServer();
  let oldRef: Turn[] = [];
  const oldFlush = async () => {
    const turns = oldRef;
    if (turns.length === 0) return 0;
    oldRef = [];
    try {
      return await oldServer.submit(turns, newId());
    } catch {
      return 0;
    }
  };
  const newServer = fakeServer();
  const client = newClient(newServer);
  for (const turn of [t("통화1 사기범", "scammer"), t("통화1 답")]) {
    oldRef.push(turn);
    client.say(turn);
  }
  oldServer.failNext(1);
  newServer.failNext(1);
  await oldFlush(); // 통화 1 끊기(실패)
  await client.flush();
  for (const turn of [t("통화2 사기범", "scammer"), t("통화2 답")]) {
    oldRef.push(turn);
    client.say(turn);
  }
  await oldFlush(); // 최종 endSession 전 제출
  await client.flush();
  assert.deepEqual(oldServer.stored.map((x) => x.text), ["통화2 사기범", "통화2 답"], "옛 방식: 통화 1 유실");
  assert.deepEqual(newServer.stored.map((x) => x.text), ["통화1 사기범", "통화1 답", "통화2 사기범", "통화2 답"], "새 방식: 순서대로 전부");
});

test("[감사 1] 응답만 잃은 경우 같은 batchId로 다시 보내 중복 저장 0(멱등 유지)", async () => {
  const server = fakeServer();
  const client = newClient(server);
  client.say(t("한 번만"));
  server.loseResponseNext(1);
  assert.equal(await client.flush(), 0, "응답 유실 = 이번 제출 0으로 센다");
  client.say(t("다음 말"));
  assert.equal(await client.flush(), 1, "재전송 batch는 서버가 0 · 새 batch 1");
  assert.deepEqual(server.stored.map((x) => x.text), ["한 번만", "다음 말"]);
});

test("[감사 1] 판정표 Q — 일시 실패는 멈춤(순서 유지) · 영구 거절은 버리고 계속 · 200턴씩 나눔", async () => {
  const sent: string[] = [];
  const queue: QueuedBatch<Turn>[] = [
    { batchId: "a0000001", turns: [t("1")] },
    { batchId: "b0000002", turns: [t("2")] },
    { batchId: "c0000003", turns: [t("3")] },
  ];
  const transient = await drainTranscriptQueue(queue, async (b) => {
    sent.push(b.batchId);
    if (b.batchId === "b0000002") throw Object.assign(new Error("x"), { code: "functions/unavailable" });
    return 1;
  });
  assert.deepEqual(transient, { written: 1, settled: ["a0000001"] }, "Q3 — b에서 멈추고 c를 먼저 보내지 않는다");
  assert.deepEqual(sent, ["a0000001", "b0000002"]);
  const permanent = await drainTranscriptQueue(queue, async (b) => {
    if (b.batchId === "b0000002") throw Object.assign(new Error("x"), { code: "functions/resource-exhausted" });
    return 1;
  });
  assert.deepEqual(permanent, { written: 2, settled: ["a0000001", "b0000002", "c0000003"] }, "Q2 — 버리고 계속");
  for (const code of ["invalid-argument", "permission-denied", "not-found", "failed-precondition", "resource-exhausted"]) {
    assert.equal(isPermanentSubmitError({ code: `functions/${code}` }), true, code);
  }
  for (const code of ["functions/unavailable", "functions/internal", "functions/deadline-exceeded", "functions/unauthenticated"]) {
    assert.equal(isPermanentSubmitError({ code }), false, code);
  }
  assert.equal(isPermanentSubmitError(new Error("no code")), false, "코드 없는 오류(네트워크 · 인증 차단) = 일시");
  const big = enqueueTranscriptTurns([], Array.from({ length: 401 }, (_, i) => t(String(i))), newId);
  assert.deepEqual(big.map((b) => b.turns.length), [TRANSCRIPT_BATCH_MAX_TURNS, TRANSCRIPT_BATCH_MAX_TURNS, 1]);
  assert.deepEqual(enqueueTranscriptTurns([], [], newId), [], "빈 턴 = batch 0(제출 호출 0)");
});

test("[감사 1 배선] page.tsx — 큐로 보내고 batchId를 싣는다 · 먼저 비우고 실패하면 버리던 catch 0 · 계좌 추출은 미제출 턴 포함", () => {
  const page = read("src/app/session/play/page.tsx");
  const start = page.indexOf("const flushTranscript = useCallback(");
  const body = page.slice(start, page.indexOf("}, [sessionId]);", start));
  assert.match(body, /enqueueTranscriptTurns\(transcriptQueueRef\.current, transcriptRef\.current, newTranscriptBatchId\)/);
  assert.match(body, /drainTranscriptQueue\(queue,/);
  assert.match(body, /batchId: batch\.batchId,/);
  assert.match(body, /transcriptQueueRef\.current = transcriptQueueRef\.current\.filter\(\(batch\) => !settled\.includes\(batch\.batchId\)\)/);
  assert.equal(/catch \{\n\s*\/\/ 무시 — 다음 단계\(endSession→리포트\)는 그대로 진행한다\.\n\s*return 0;/.test(body), false, "옛 실패 = 0 경로가 남아 있다");
  // 백업에 큐에 남은 턴도 싣는다(새로고침 복원 때 되살아나게).
  assert.equal(page.match(/transcriptQueueRef\.current\.flatMap\(\(batch\) => batch\.turns\)/g)?.length, 3);
  assert.equal(page.match(/spokenAccountFrom\(\[\.\.\.messages, \.\.\.unsubmittedTurns\(\)\], realBankMentionsIn\)/g)?.length, 2);
  assert.equal(/spokenAccountFrom\(\[\.\.\.messages, \.\.\.transcriptRef\.current\]/.test(page), false);
});
