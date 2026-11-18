// 저장소 감사 C5 — 신고가 삭제된 챌린지를 되살리지 않는다(판정표 RP · challenge/reportGate.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import type { Firestore } from "firebase-admin/firestore";
import { decideReport, reportChallengeInTransaction } from "../reportGate";
import type { ChallengeStatus } from "../../shared/types";

type DocData = Record<string, unknown>;

/** 메모리 가짜 — runTransaction · tx.get · tx.update만. 트랜잭션 밖 ref.update는 throw. */
class FakeDb {
  readonly store = new Map<string, DocData>();
  writes = 0;
  collection(name: string) {
    return {
      doc: (id: string) => ({
        path: `${name}/${id}`,
        update: () => {
          throw new Error("트랜잭션 밖 쓰기");
        },
      }),
    };
  }
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const pending: Array<[string, DocData]> = [];
    const tx = {
      get: async (ref: { path: string }) => {
        const data = this.store.get(ref.path);
        return { exists: data !== undefined, data: () => data };
      },
      update: (ref: { path: string }, data: DocData) => {
        pending.push([ref.path, data]);
        return tx;
      },
    };
    const result = await fn(tx);
    for (const [p, data] of pending) {
      this.writes += 1;
      this.store.set(p, { ...(this.store.get(p) ?? {}), ...data });
    }
    return result;
  }
  asFirestore(): Firestore {
    return this as unknown as Firestore;
  }
}

const FIELDS = { status: "reported" as const, reportReason: "spam" as never };

const WRITE_ROWS: ChallengeStatus[] = ["pending", "consented", "in_progress", "completed", "expired"];

for (const status of WRITE_ROWS) {
  test(`[C5 RP1] status=${status} → 신고 기록(쓰기 1 · status reported)`, async () => {
    const db = new FakeDb();
    db.store.set("challenges/c1", { status });
    assert.equal(await reportChallengeInTransaction(db.asFirestore(), "c1", FIELDS), "write");
    assert.equal(db.writes, 1);
    assert.equal(db.store.get("challenges/c1")?.status, "reported");
  });
}

test("[C5 RP2] 이미 reported → 쓰기 0 · 첫 신고 사유 유지(멱등)", async () => {
  const db = new FakeDb();
  db.store.set("challenges/c1", { status: "reported", reportReason: "first" });
  assert.equal(await reportChallengeInTransaction(db.asFirestore(), "c1", FIELDS), "already_reported");
  assert.equal(db.writes, 0);
  assert.equal(db.store.get("challenges/c1")?.reportReason, "first");
});

test("[C5 RP3] deleted → 쓰기 0 · gone(되살리지 않는다)", async () => {
  const db = new FakeDb();
  db.store.set("challenges/c1", { status: "deleted" });
  assert.equal(await reportChallengeInTransaction(db.asFirestore(), "c1", FIELDS), "gone");
  assert.equal(db.writes, 0);
  assert.equal(db.store.get("challenges/c1")?.status, "deleted");
});

test("[C5 RP4] 문서 없음 → 쓰기 0 · gone", async () => {
  const db = new FakeDb();
  assert.equal(await reportChallengeInTransaction(db.asFirestore(), "c1", FIELDS), "gone");
  assert.equal(db.writes, 0);
  assert.equal(db.store.size, 0);
});

test("[C5] decideReport 7상태 전수 = 판정표 RP", () => {
  const expected: Record<ChallengeStatus, string> = {
    pending: "write",
    consented: "write",
    in_progress: "write",
    completed: "write",
    expired: "write",
    reported: "already_reported",
    deleted: "gone",
  };
  for (const [status, decision] of Object.entries(expected)) {
    assert.equal(decideReport(status as ChallengeStatus), decision, status);
  }
});

// 배선 — reportChallenge가 헬퍼로만 쓰고(옛 무조건 update 0) gone이면 not-found로 거절한다.
const SRC = readFileSync(path.join(__dirname, "../../../src/challenge/userAccess.ts"), "utf8");
function reportBody(src: string): string {
  const start = src.indexOf("export const reportChallenge = onCall<");
  const end = src.indexOf("export function deriveChallengeResultSummary", start);
  assert.ok(start > -1 && end > start, "reportChallenge 정의를 찾을 수 없다");
  return src.slice(start, end);
}

test("[C5 배선] reportChallenge — 헬퍼 호출 1건 · 트랜잭션 밖 challenges update 0 · gone이면 not-found", () => {
  const body = reportBody(SRC);
  assert.equal(body.split("reportChallengeInTransaction(").length - 1, 1);
  assert.doesNotMatch(body, /\.doc\(resolved\.challengeId\)\.update\(/);
  assert.match(body, /decision === "gone"\)\s*\{\s*throw new HttpsError\("not-found"/);
});

test("[C5 배선 역검증] 옛 무조건 update를 다시 넣은 사본은 배선 단언에 걸린다", () => {
  const polluted = reportBody(SRC).replace(
    "const decision = await reportChallengeInTransaction(db, resolved.challengeId, update);",
    'await db.collection("challenges").doc(resolved.challengeId).update(update);\n    const decision = "write";',
  );
  assert.notEqual(polluted, reportBody(SRC), "치환 앵커가 없다");
  assert.match(polluted, /\.doc\(resolved\.challengeId\)\.update\(/);
});
