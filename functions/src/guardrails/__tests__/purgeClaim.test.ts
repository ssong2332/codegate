// 저장소 감사 C6 — onSessionEnded 재전달 시 두 번째 실행은 폐기 0(판정표 PC · guardrails/purge.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import type { Firestore, Timestamp } from "firebase-admin/firestore";
import { claimSessionPurge, purgeSessionArtifacts, type PurgeDeps } from "../purge";

type DocData = Record<string, unknown>;

class FakeDb {
  readonly store = new Map<string, DocData>();
  writes = 0;
  collection(name: string) {
    return { doc: (id: string) => ({ path: `${name}/${id}` }) };
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

const NOW = { seconds: 1 } as unknown as Timestamp;

test("[C6 PC1] 선점 표식 없음 → claimed · 쓰기 1(purgeClaimedAt)", async () => {
  const db = new FakeDb();
  db.store.set("sessions/s1", { status: "ended", voiceId: "v1" });
  assert.equal(await claimSessionPurge(db.asFirestore(), "s1", NOW), "claimed");
  assert.equal(db.writes, 1);
  assert.equal(db.store.get("sessions/s1")?.purgeClaimedAt, NOW);
});

test("[C6 PC2] 선점 표식 있음 → already_claimed · 쓰기 0", async () => {
  const db = new FakeDb();
  db.store.set("sessions/s1", { status: "ended", purgeClaimedAt: NOW });
  assert.equal(await claimSessionPurge(db.asFirestore(), "s1", NOW), "already_claimed");
  assert.equal(db.writes, 0);
});

test("[C6 PC3] 세션 문서 없음 → missing · 쓰기 0", async () => {
  const db = new FakeDb();
  assert.equal(await claimSessionPurge(db.asFirestore(), "s1", NOW), "missing");
  assert.equal(db.writes, 0);
});

/** onSessionEnded 폐기 블록 흉내 — 이벤트 스냅숏의 voiceId로 돈다(재전달도 같은 스냅숏). */
function harness() {
  const db = new FakeDb();
  db.store.set("sessions/s1", { status: "ended", uid: "u1", voiceId: "v1" });
  const storage = new Set(["users/u1/sessions/s1/voice_input.webm"]);
  const voices = new Set(["v1"]);
  let deleteVoiceCalls = 0;
  const logs: unknown[] = [];
  const deps: PurgeDeps = {
    listStorageFiles: async (prefix) => [...storage].filter((p) => p.startsWith(prefix)),
    deleteStorageFile: async (p) => {
      storage.delete(p);
    },
    deleteVoice: async (id) => {
      deleteVoiceCalls += 1;
      if (!voices.delete(id)) throw new Error("없는 voice");
    },
  };
  const purgeOnce = async () => {
    logs.push(await purgeSessionArtifacts("s1", "u1", "v1", deps));
  };
  return { db, logs, purgeOnce, deleteVoiceCalls: () => deleteVoiceCalls };
}

test("[C6] 같은 종료 이벤트 2회 전달 — 선점하면 deletionLogs 1 · deleteVoice 1", async () => {
  const h = harness();
  for (let i = 0; i < 2; i += 1) {
    if ((await claimSessionPurge(h.db.asFirestore(), "s1", NOW)) === "claimed") await h.purgeOnce();
  }
  assert.equal(h.logs.length, 1);
  assert.equal(h.deleteVoiceCalls(), 1);
});

test("[C6 대조군] 선점 없이 2회(옛 동작) — deletionLogs 2 · deleteVoice 2 · 두 번째 로그 failed(판별력)", async () => {
  const h = harness();
  await h.purgeOnce();
  await h.purgeOnce();
  assert.equal(h.logs.length, 2);
  assert.equal(h.deleteVoiceCalls(), 2);
  assert.equal((h.logs[1] as { overallResult: string }).overallResult, "failed");
});

// 배선 — 트리거가 purgeSession 앞에서 선점하고, claimed일 때만 폐기한다.
const SRC = readFileSync(path.join(__dirname, "../../../src/guardrails/index.ts"), "utf8");

test("[C6 배선] onSessionEnded — claimSessionPurge 1건이 purgeSession 호출 앞 · claimed 분기 안에서만 폐기", () => {
  const start = SRC.indexOf("export const onSessionEnded");
  const body = SRC.slice(start);
  const claimAt = body.indexOf("claimSessionPurge(");
  const purgeAt = body.indexOf("purgeSession(");
  assert.equal(body.split("claimSessionPurge(").length - 1, 1);
  assert.ok(claimAt > -1 && purgeAt > claimAt, "선점이 폐기 앞이어야 한다");
  assert.match(body.slice(claimAt, purgeAt), /if \(claim === "claimed"\) \{\s*const log = await $/);
});
