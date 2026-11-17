// 2026-11-17 저장소 감사 1 — 통화 전사 제출 실패 시 유실 막기(잎 모듈 · Firebase import 0 — 테스트가 직접 부른다).
//
// 전: `flushTranscript`가 `transcriptRef`를 먼저 비우고 제출이 실패하면 그 턴을 버렸다(다통화에서 통화 1 대화가 리포트에서 사라짐).
// 후: 제출할 턴을 batch(ID 고정 · 200턴 이하)로 큐에 넣고, 성공한 batch만 뺀다. 다시 보낼 때는 **같은 batchId**를 쓴다 —
// 응답만 잃고 서버는 저장한 경우에도 서버 `transcriptBatches` 표시 문서가 중복 저장을 막는다(멱등 유지).
//
// 판정표 Q(batch 하나의 제출 결과):
// | 결과 | 행동 |
// |---|---|
// | Q1 성공 | 큐에서 뺀다 · 다음 batch |
// | Q2 실패 · 영구 코드(invalid-argument · permission-denied · not-found · failed-precondition · resource-exhausted) | 버린다(같은 요청은 또 거절된다) · 다음 batch |
// | Q3 실패 · 그 밖(네트워크 · unavailable · internal · deadline-exceeded · unauthenticated · 인증 차단) | 큐에 남기고 멈춘다(뒤 batch를 먼저 보내면 turnIndex 순서가 뒤집힌다) |
export type QueuedBatch<T> = { batchId: string; turns: T[] };

/** 서버 `TRANSCRIPT_MAX_TURNS`(호출당 200)와 같다 — 넘으면 요청 전체가 invalid-argument다. */
export const TRANSCRIPT_BATCH_MAX_TURNS = 200;

const PERMANENT_CODES = new Set(["invalid-argument", "permission-denied", "not-found", "failed-precondition", "resource-exhausted"]);

/** 표 Q2 — 콜러블 오류 코드(`functions/<code>` 또는 `<code>`)가 영구 거절인가. */
export function isPermanentSubmitError(err: unknown): boolean {
  const code = typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
  return typeof code === "string" && PERMANENT_CODES.has(code.replace(/^functions\//, ""));
}

/** 새 턴을 200턴 이하 batch로 나눠 큐 뒤에 붙인다(입력 배열은 바꾸지 않는다). */
export function enqueueTranscriptTurns<T>(queue: readonly QueuedBatch<T>[], turns: readonly T[], newId: () => string): QueuedBatch<T>[] {
  const next = [...queue];
  for (let i = 0; i < turns.length; i += TRANSCRIPT_BATCH_MAX_TURNS) {
    next.push({ batchId: newId(), turns: turns.slice(i, i + TRANSCRIPT_BATCH_MAX_TURNS) });
  }
  return next;
}

/** 큐를 앞에서부터 보낸다(표 Q). 돌려주는 `settled` = 큐에서 뺄 batchId(성공 · 영구 거절). */
export async function drainTranscriptQueue<T>(
  queue: readonly QueuedBatch<T>[],
  send: (batch: QueuedBatch<T>) => Promise<number>,
): Promise<{ written: number; settled: string[] }> {
  let written = 0;
  const settled: string[] = [];
  for (const batch of queue) {
    try {
      written += await send(batch);
    } catch (err) {
      if (!isPermanentSubmitError(err)) break; // Q3
    }
    settled.push(batch.batchId); // Q1 · Q2
  }
  return { written, settled };
}
