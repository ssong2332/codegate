// 흐름 변형 배정 · 회전 게이트 — T191 S5 / PRD AC-096 (e)(f)(g) ⓒ · User 결정 D6.
// 설계: T191 흐름 변형 설계(Architecture T191 절 "배정 · 회전(D6) — 인덱스 0" · 게이트 표 "회전" 행).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Firestore } from "firebase-admin/firestore";
import {
  assignFlowVariantForChallenge,
  assignFlowVariantForSession,
  commitSessionWithVariant,
  settleRotation,
  pickChallengeVariantId,
  pickRotatedVariantId,
  rotationDocKey,
} from "../variantAssignment";
import { FLOW_VARIANTS, assignablePool, listFlowVariants } from "../../scenarios/flowVariants";
import { resolveSessionEscalation } from "../../scenarios/escalation";
import { PUBLIC_SCENARIOS } from "../../scenarios/publicMeta";
import { DIFFICULTY_LEVELS } from "../../shared/difficulty";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const FUNCTIONS_SRC = path.resolve(__dirname, "../../../src");

/** 회전 문서 키 조회만 흉내 내는 가짜 Firestore — 호출 수를 센다. 쿼리 메서드는 부르면 실패한다. */
function fakeDb(stored: Record<string, unknown> | undefined, opts: { failRead?: boolean } = {}) {
  const calls = { get: 0, paths: [] as string[] };
  const doc = (p: string): unknown => ({
    collection: (name: string) => collection(`${p}/${name}`),
    get: async () => {
      calls.get += 1;
      calls.paths.push(p);
      if (opts.failRead) throw new Error("read failed");
      return { exists: stored !== undefined, get: (k: string) => stored?.[k] };
    },
  });
  const collection = (p: string): unknown => ({
    doc: (id: string) => doc(`${p}/${id}`),
    where: () => assert.fail("회전은 키 조회여야 한다 — where 쿼리 금지(설계 금지 X6)"),
    orderBy: () => assert.fail("orderBy 금지(새 복합 인덱스)"),
  });
  return { db: { collection } as unknown as Firestore, calls };
}

test("[T191 S5 회전 · AC-096 (e)] 후보 2개 이상이면 직전과 같은 변형이 연속 배정되지 않는다 · 역방향 ⓒ", (t) => {
  const candidates = listFlowVariants("institutional-impersonation", "advanced").map((v) => v.variantId);
  assert.ok(candidates.length >= 2, "회전 표본 = 기관 사칭 고급 2벌");
  let last: string | undefined;
  const sequence: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const next = pickRotatedVariantId(candidates, last);
    if (last !== undefined) assert.notEqual(next, last, "연속 같은 변형");
    sequence.push(next);
    last = next;
  }
  // 역방향 ⓒ — 직전 값을 무시하는 잘못된 회전(항상 첫 번째)은 연속 배정을 만든다.
  const broken = (c: readonly string[]) => c[0];
  const brokenSeq = [broken(candidates), broken(candidates)];
  t.diagnostic(`정상 회전 ${sequence.join("→")} / 고장난 회전 ${brokenSeq.join("→")}`);
  assert.equal(brokenSeq[0], brokenSeq[1], "역방향 표본이 실제로 연속 배정을 만든다");
  assert.notEqual(pickRotatedVariantId(candidates, brokenSeq[0]), brokenSeq[0]);
  // 직전이 목록에 없으면(데이터 교체) 첫 번째로.
  assert.equal(pickRotatedVariantId(candidates, "fv-gone"), candidates[0]);
  assert.throws(() => pickRotatedVariantId([], undefined));
});

test("[T191 S5 회전] 세션 배정은 회전 문서 **키 조회 1건**(users/{uid}/variantRotation/{scenarioId}__{level}) · 후보 1개면 조회 0건", async () => {
  const { db, calls } = fakeDb({ lastVariantId: "fv-c5fj" });
  const result = await assignFlowVariantForSession(db, "u1", "institutional-impersonation", "advanced");
  assert.equal(calls.get, 1);
  assert.deepEqual(calls.paths, ["users/u1/variantRotation/institutional-impersonation__advanced"]);
  assert.equal(result.flowVariantId, "fv-pgqt", "직전 fv-c5fj의 다음 순번");
  assert.ok(result.rotationRef, "후보 ≥ 2면 같은 배치에서 쓸 회전 문서 참조를 돌려준다");
  assert.equal(rotationDocKey("x", "beginner"), "x__beginner");

  const single = fakeDb(undefined);
  const one = await assignFlowVariantForSession(single.db, "u1", "loan-refinance-scam", "beginner");
  assert.equal(single.calls.get, 0, "후보 1개면 Firestore 접근 0");
  assert.equal(one.rotationRef, undefined);
  assert.equal(one.flowVariantId, listFlowVariants("loan-refinance-scam", "beginner")[0].variantId);
});

test("[T191 S5 회전] 회전 문서 조회 실패 → 첫 순번으로 강등(통화를 막지 않는다 — P-4) · 0개 허용이면 failed-precondition", async () => {
  const { db } = fakeDb(undefined, { failRead: true });
  const result = await assignFlowVariantForSession(db, "u1", "institutional-impersonation", "advanced");
  assert.equal(result.flowVariantId, listFlowVariants("institutional-impersonation", "advanced")[0].variantId);
  await assert.rejects(
    () => assignFlowVariantForSession(fakeDb(undefined).db, "u1", "card-delivery-call", "beginner"),
    (err: { code?: string; details?: { reason?: string } }) =>
      err.code === "failed-precondition" && err.details?.reason === "flow-variant-unavailable",
    "허용 변형 0개를 조용히 임의 배정하지 않는다(AC-096 (f))",
  );
});

test("[T191 S5 챌린지 수신자] 회전 문서 없이 challengeId 해시로 결정론 배정(같은 챌린지 = 같은 변형 · 후보 안)", () => {
  const candidates = listFlowVariants("institutional-impersonation", "advanced").map((v) => v.variantId);
  const a = assignFlowVariantForChallenge("institutional-impersonation", "advanced", "challenge-abc");
  assert.equal(a, assignFlowVariantForChallenge("institutional-impersonation", "advanced", "challenge-abc"));
  assert.ok(candidates.includes(a));
  const spread = new Set(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map((id) => pickChallengeVariantId(candidates, id)));
  assert.equal(spread.size, 2, "해시가 한쪽으로만 쏠리지 않는다(8건 표본)");
});

test("[T191 S5 인덱스 0 · 설계 금지 X6] 배정 모듈에 쿼리 0 · firestore.indexes.json 인덱스 수 3 불변 · 회전 문서는 클라 명시 거부", () => {
  const code = fs
    .readFileSync(path.join(FUNCTIONS_SRC, "session/variantAssignment.ts"), "utf-8")
    .replace(/\/\/[^\n]*/g, "");
  assert.equal(/\.where\(|\.orderBy\(|\.limit\(/.test(code), false);
  const indexes = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "firestore.indexes.json"), "utf-8"));
  assert.equal(indexes.indexes.length, 3, "복합 인덱스 수가 바뀌었다 — 인덱스 배포 누락 장애(§66) 위험");
  const rules = fs.readFileSync(path.join(REPO_ROOT, "firestore.rules"), "utf-8");
  assert.match(rules, /match \/variantRotation\/\{rotationKey\} \{\s*allow read, write: if false;\s*\}/);
  // 세션 문서와 회전 문서가 **한 트랜잭션**으로 커밋된다(M3 — 동시 생성 경합 대비).
  const session = fs
    .readFileSync(path.join(FUNCTIONS_SRC, "session/index.ts"), "utf-8")
    .replace(/\/\/[^\n]*/g, "");
  const handler = session.slice(session.indexOf("export const createSession"), session.indexOf("export const endSession"));
  assert.ok(handler.includes("await commitSessionWithVariant("), "createSession이 트랜잭션 기록 함수를 쓰지 않는다");
  assert.equal(/sessionRef\.set\(sessionDoc|db\.batch\(\)/.test(handler), false, "세션 문서를 트랜잭션 밖에서 쓰는 옛 경로가 남았다");
  assert.ok(/db\.runTransaction\(/.test(code), "variantAssignment가 runTransaction을 쓰지 않는다");
  assert.ok(/tx\.get\(assignment\.rotationRef\)/.test(code), "트랜잭션 안에서 회전 문서를 다시 읽지 않는다");
  // 변형 데이터 순서 = 회전 순서 — 표본 2벌의 순서를 못박는다.
  assert.deepEqual(
    FLOW_VARIANTS.filter((v) => v.scenarioId === "institutional-impersonation" && v.level === "advanced").map((v) => v.variantId),
    ["fv-c5fj", "fv-pgqt"],
  );
});

test("[T191 S5 회전 경합 · M3] 트랜잭션 확정 순수 함수 — 다른 생성이 먼저 커밋한 직전값을 기준으로 다시 고른다(raced 표기)", () => {
  const c = ["fv-a", "fv-b"];
  // 두 요청이 같은 직전값(fv-a)으로 미리보기 → 둘 다 fv-b. 먼저 커밋한 쪽이 fv-b를 쓰면 다음 쪽은 fv-a로 확정.
  assert.deepEqual(settleRotation(c, "fv-a", "fv-b"), { flowVariantId: "fv-b", raced: false });
  assert.deepEqual(settleRotation(c, "fv-b", "fv-b"), { flowVariantId: "fv-a", raced: true });
  for (const last of [undefined, "fv-a", "fv-b"]) {
    const { flowVariantId } = settleRotation(c, last, "fv-a");
    if (last !== undefined) assert.notEqual(flowVariantId, last, "확정값은 트랜잭션이 읽은 직전값과 절대 같지 않다");
  }
});

/** 직렬화된 트랜잭션을 흉내 내는 가짜 Firestore — 커밋은 순서대로 적용된다(Firestore 낙관적 동시성의 결과와 같다). */
function fakeTxDb() {
  const store = new Map<string, Record<string, unknown>>();
  const ref = (p: string) => ({ path: p });
  const db = {
    runTransaction: async <R>(fn: (tx: unknown) => Promise<R>): Promise<R> => {
      const writes: [string, Record<string, unknown>][] = [];
      const tx = {
        get: async (r: { path: string }) => {
          const data = store.get(r.path);
          return { exists: data !== undefined, get: (k: string) => data?.[k] };
        },
        set: (r: { path: string }, data: Record<string, unknown>) => {
          writes.push([r.path, data]);
        },
      };
      const result = await fn(tx);
      for (const [p, d] of writes) store.set(p, { ...(store.get(p) ?? {}), ...d });
      return result;
    },
  } as unknown as Firestore;
  return { db, store, ref };
}

test("[T191 S5 회전 경합 · M3] 같은 미리보기로 동시에 생성해도 두 세션이 다른 변형으로 확정되고 세션 · 회전 문서가 같은 트랜잭션으로 쓰인다", async () => {
  const { db, store, ref } = fakeTxDb();
  const rotationRef = ref("users/u1/variantRotation/k") as never;
  const candidates = ["fv-a", "fv-b"];
  store.set("users/u1/variantRotation/k", { lastVariantId: "fv-a" });
  const preview = { flowVariantId: "fv-b", candidates, rotationRef };
  const first = await commitSessionWithVariant(db, ref("sessions/s1") as never, { uid: "u1" }, preview, 1);
  const second = await commitSessionWithVariant(db, ref("sessions/s2") as never, { uid: "u1" }, preview, 2);
  assert.equal(first, "fv-b");
  assert.equal(second, "fv-a", "경합에서 두 번째 세션은 직전(fv-b)과 다른 변형으로 확정된다");
  assert.equal(store.get("sessions/s1")?.flowVariantId, "fv-b");
  assert.equal(store.get("sessions/s2")?.flowVariantId, "fv-a");
  assert.equal(store.get("users/u1/variantRotation/k")?.lastVariantId, "fv-a");
  // 후보 1개 — 회전 문서를 읽지도 쓰지도 않고 세션만 쓴다.
  const one = await commitSessionWithVariant(db, ref("sessions/s3") as never, {}, { flowVariantId: "fv-z", candidates: ["fv-z"] }, 3);
  assert.equal(one, "fv-z");
  assert.equal(store.has("users/u1/variantRotation/other"), false);
});

// ── T194-a G590 — 배정 가능 풀 `assignablePool` (docs/Architecture.md §84.13.5 · PRD AC-106 (g) · AC-096 (e)) ──

test("[T194-a G590] 풀 진리표 — 전 시나리오 × 3난이도 × {자가 · 챌린지}(거부 조합 제외) 비어 있지 않음 · 풀의 변형은 통화 단계 유무 = 세션 술어", (t) => {
  let cells = 0;
  for (const id of Object.keys(PUBLIC_SCENARIOS)) {
    for (const level of DIFFICULTY_LEVELS) {
      if (listFlowVariants(id, level).length === 0) continue; // 고급 전용 시나리오의 초급 · 중급
      for (const challengeId of [undefined, "c1"]) {
        // 챌린지는 에스컬레이션 메타 시나리오에서 거부된다(`challenge/index.ts` S-6) — 그 조합은 풀 대상이 아니다.
        if (challengeId && PUBLIC_SCENARIOS[id].escalation) continue;
        const pool = assignablePool(id, level, challengeId);
        const label = `${id}/${level}/${challengeId ? "챌린지" : "자가"}`;
        assert.ok(pool.length > 0, `${label}: 배정 풀 0 — failed-precondition으로 막힌다`);
        const escalates = Boolean(resolveSessionEscalation({ scenarioId: id, difficultyLevel: level, challengeId }, PUBLIC_SCENARIOS));
        for (const v of pool) assert.equal(Boolean(v.escalatesToVoice), escalates, `${label}: ${v.variantId}`);
        cells += 1;
      }
    }
  }
  t.diagnostic(`[G590] 풀 ${cells}칸 · parcel 고급 자가 ${JSON.stringify(assignablePool("messenger-parcel-smishing-sms", "advanced").map((v) => v.variantId))} / 챌린지 ${JSON.stringify(assignablePool("messenger-parcel-smishing-sms", "advanced", "c1").map((v) => v.variantId))}`);
  // 다른 시나리오는 필터가 항등이다(§84.13.5 처방 3) — 풀 = 허용 변형 전체.
  assert.deepEqual(
    assignablePool("institutional-impersonation", "advanced", "c1").map((v) => v.variantId),
    listFlowVariants("institutional-impersonation", "advanced").map((v) => v.variantId),
  );
});

test("[T194-a G590] 두 배정 함수가 같은 풀을 쓴다 — 자가 고급 parcel = fv-g454 · 수신자 = fv-k7qm(현행 고급) · 역방향: 필터를 끈 사본은 수신자에게 fv-g454를 준다", async (t) => {
  // 소스 스캔 — candidatesOrThrow가 assignablePool을 쓰고, 두 배정 함수가 candidatesOrThrow를 거친다(수신자는 challengeId까지 넘긴다).
  const code = fs.readFileSync(path.join(FUNCTIONS_SRC, "session/variantAssignment.ts"), "utf8").replace(/\/\/[^\n]*/g, "");
  assert.match(code, /const candidates = assignablePool\(scenarioId, level, challengeId\)\.map\(\(v\) => v\.variantId\);/);
  assert.match(code, /const candidates = candidatesOrThrow\(scenarioId, level\);/);
  assert.match(code, /pickChallengeVariantId\(candidatesOrThrow\(scenarioId, level, challengeId\), challengeId\)/);
  assert.equal(/listFlowVariants\(/.test(code), false, "배정이 허용 변형 전체를 직접 읽으면 필터가 우회된다");

  const { db } = fakeDb(undefined);
  const self = await assignFlowVariantForSession(db, "u1", "messenger-parcel-smishing-sms", "advanced");
  assert.equal(self.flowVariantId, "fv-g454");
  const ids = Array.from({ length: 40 }, (_, i) => `challenge-${i}`);
  const received = new Set(ids.map((id) => assignFlowVariantForChallenge("messenger-parcel-smishing-sms", "advanced", id)));
  assert.deepEqual([...received], ["fv-k7qm"], "수신자는 어떤 챌린지 ID에서도 현행 고급 변형만 받는다(AC-106 (g))");

  // 역방향 — 필터를 끈 풀(허용 변형 전체)로 같은 결정론 배정을 돌리면 일부 챌린지가 fv-g454(3단계)를 받는다 → 정합 검사 실패.
  const unfiltered = listFlowVariants("messenger-parcel-smishing-sms", "advanced").map((v) => v.variantId);
  const leaked = ids.filter((id) => pickChallengeVariantId(unfiltered, id) === "fv-g454");
  const consistent = (variantId: string) =>
    Boolean(FLOW_VARIANTS.find((v) => v.variantId === variantId)?.escalatesToVoice) ===
    Boolean(resolveSessionEscalation({ scenarioId: "messenger-parcel-smishing-sms", difficultyLevel: "advanced", challengeId: "c1" }, PUBLIC_SCENARIOS));
  t.diagnostic(`[G590 역방향] 필터 해제 시 3단계 변형을 받은 챌린지 ${leaked.length}/${ids.length} · 정합(정상 fv-k7qm=${consistent("fv-k7qm")} / 누수 fv-g454=${consistent("fv-g454")})`);
  assert.ok(leaked.length > 0, "역방향 샘플이 만들어지지 않았다 — 필터 해제 시 누수가 재현돼야 한다");
  assert.equal(consistent("fv-k7qm"), true);
  assert.equal(consistent("fv-g454"), false, "필터를 끈 사본의 배정은 정합 검사에 걸려야 한다");
});
