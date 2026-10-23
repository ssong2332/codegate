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
  drawFromDeck,
  pickChallengeVariantId,
  readDeckState,
  rotationDocKey,
  settleDeck,
} from "../variantAssignment";
import { FLOW_VARIANTS, listFlowVariants, type FlowVariant } from "../../scenarios/flowVariants";
// T194-c-1(§84.16.1 · G590 갱신) — 배정 풀은 `variantPool.ts`로 옮겼다(순환 회피) · 통화 중 설치 문자 항이 더해졌다.
import { assignablePool, declaresInCallInstall, expectsInCallInstall } from "../../scenarios/variantPool";
import { resolveDeclaredSms } from "../../inCallSms/smsGate";
import { sessionReachableLandingIds } from "../../scenarios/reachability";
import { resolveSessionEscalation } from "../../scenarios/escalation";
import { PUBLIC_SCENARIOS, isAdvancedOnlyScenario } from "../../scenarios/publicMeta";
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

/** 섞기가 순서를 바꾸지 않는 난수(Fisher-Yates에서 j = i) — 결정적 기대값용. */
const keepOrder = (n: number) => n - 1;
/** 시드 고정 의사 난수(mulberry32) — 분포 · 연속 검사용. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

test("[§119 섞은 덱 · D-1 · AC-096 (e)] 후보 n개 — 연속 같은 루트 0 · 한 바퀴(n세션) 안 반복 0 · 순서가 고정되지 않는다 · 역방향 ⓒ", (t) => {
  const c = ["fv-a", "fv-b", "fv-c"];
  const orders = new Set<string>();
  for (let seed = 1; seed <= 30; seed += 1) {
    const rng = seeded(seed);
    let state: { lastVariantId?: string; deck?: readonly string[] } = {};
    const seq: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const { flowVariantId, deck } = drawFromDeck(c, state, rng);
      if (state.lastVariantId !== undefined) assert.notEqual(flowVariantId, state.lastVariantId, `seed ${seed}: 연속 같은 루트`);
      seq.push(flowVariantId);
      state = { lastVariantId: flowVariantId, deck };
    }
    for (let k = 0; k < seq.length; k += 3) {
      assert.equal(new Set(seq.slice(k, k + 3)).size, 3, `seed ${seed}: 한 바퀴 안에서 반복 ${seq.join("→")}`);
    }
    orders.add(seq.slice(0, 3).join("→"));
  }
  t.diagnostic(`[§119] 시드 30개의 첫 바퀴 순서 ${orders.size}가지`);
  assert.ok(orders.size >= 4, "무작위가 아니다(첫 바퀴 순서가 거의 고정)");
  // 역방향 ⓒ — 바퀴 경계에서 직전 검사를 빼면(새 덱을 섞기만 하면) 연속 배정이 생긴다.
  const brokenNewDeck = (cands: readonly string[], rng: (n: number) => number) => {
    const out = [...cands];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = rng(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  let repeats = 0;
  for (let seed = 1; seed <= 30; seed += 1) {
    const rng = seeded(seed);
    const firstLap = brokenNewDeck(c, rng);
    const secondLap = brokenNewDeck(c, rng);
    if (firstLap[firstLap.length - 1] === secondLap[0]) repeats += 1;
  }
  t.diagnostic(`[§119 역방향] 직전 검사 없는 덱 — 바퀴 경계 연속 ${repeats}/30`);
  assert.ok(repeats > 0, "역방향 표본이 실제로 연속 배정을 만든다");
  assert.notEqual(drawFromDeck(["fv-a", "fv-b"], { lastVariantId: "fv-a" }, () => 0).flowVariantId, "fv-a");
  assert.throws(() => drawFromDeck([], {}, keepOrder));
});

test("[§119 섞은 덱] 옛 회전 문서(lastVariantId만) · 데이터에서 빠진 ID · 남은 덱 첫 장이 직전 — 모두 연속 0", () => {
  const c = ["fv-a", "fv-b"];
  // 옛 문서 — 덱 없음 → 새 덱, 첫 장이 직전이면 바꾼다.
  assert.deepEqual(drawFromDeck(c, { lastVariantId: "fv-a" }, keepOrder), { flowVariantId: "fv-b", deck: ["fv-a"] });
  // 은퇴 · 교체로 빠진 ID는 걸러 낸다(남은 덱 유지).
  assert.deepEqual(drawFromDeck(c, { lastVariantId: "fv-a", deck: ["fv-gone", "fv-b"] }, keepOrder), { flowVariantId: "fv-b", deck: [] });
  // 데이터 교체로만 생기는 모양 — 남은 덱 첫 장 = 직전.
  assert.equal(drawFromDeck(["fv-a", "fv-b", "fv-c"], { lastVariantId: "fv-a", deck: ["fv-a", "fv-c"] }, keepOrder).flowVariantId, "fv-c");
  assert.equal(drawFromDeck(c, { lastVariantId: "fv-a", deck: ["fv-a"] }, keepOrder).flowVariantId, "fv-b");
  // 후보 1개 — 직전과 같아도 그것.
  assert.equal(drawFromDeck(["fv-z"], { lastVariantId: "fv-z" }, keepOrder).flowVariantId, "fv-z");
  // 문서 모양 해석 — 문자열 배열이 아니면 버린다.
  const snap = (data: Record<string, unknown>) => ({ exists: true, get: (k: string) => data[k] });
  assert.deepEqual(readDeckState(snap({ lastVariantId: "fv-a", deck: ["fv-b"] })), { lastVariantId: "fv-a", deck: ["fv-b"] });
  assert.deepEqual(readDeckState(snap({ lastVariantId: 3, deck: [1] })), {});
  assert.deepEqual(readDeckState({ exists: false, get: () => undefined }), {});
});

test("[T191 S5 회전] 세션 배정은 회전 문서 **키 조회 1건**(users/{uid}/variantRotation/{scenarioId}__{level}) · 후보 1개면 조회 0건", async () => {
  const { db, calls } = fakeDb({ lastVariantId: "fv-x7ue" });
  const result = await assignFlowVariantForSession(db, "u1", "card-company-impersonation", "advanced", keepOrder);
  assert.equal(calls.get, 1);
  assert.deepEqual(calls.paths, ["users/u1/variantRotation/card-company-impersonation__advanced"]);
  assert.equal(result.flowVariantId, "fv-w3dq", "직전 fv-x7ue와 다른 루트");
  assert.ok(result.rotationRef, "후보 ≥ 2면 같은 배치에서 쓸 회전 문서 참조를 돌려준다");
  assert.deepEqual(result.previewState, { lastVariantId: "fv-x7ue" });
  assert.deepEqual(result.previewDeck, ["fv-x7ue"]);
  assert.equal(rotationDocKey("x", "beginner"), "x__beginner");

  const single = fakeDb(undefined);
  const one = await assignFlowVariantForSession(single.db, "u1", "loan-refinance-scam", "beginner");
  assert.equal(single.calls.get, 0, "후보 1개면 Firestore 접근 0");
  assert.equal(one.rotationRef, undefined);
  assert.equal(one.flowVariantId, listFlowVariants("loan-refinance-scam", "beginner")[0].variantId);
});

test("[T191 S5 회전] 회전 문서 조회 실패 → 빈 상태(새 덱)로 강등(통화를 막지 않는다 — P-4) · 0개 허용이면 failed-precondition", async () => {
  const { db } = fakeDb(undefined, { failRead: true });
  const result = await assignFlowVariantForSession(db, "u1", "card-company-impersonation", "advanced", keepOrder);
  assert.equal(result.flowVariantId, assignablePool("card-company-impersonation", "advanced")[0].variantId);
  assert.deepEqual(result.previewState, {});
  await assert.rejects(
    () => assignFlowVariantForSession(fakeDb(undefined).db, "u1", "card-delivery-call", "beginner"),
    (err: { code?: string; details?: { reason?: string } }) =>
      err.code === "failed-precondition" && err.details?.reason === "flow-variant-unavailable",
    "허용 변형 0개를 조용히 임의 배정하지 않는다(AC-096 (f))",
  );
});

test("[T191 S5 챌린지 수신자] 회전 문서 없이 challengeId 해시로 결정론 배정(같은 챌린지 = 같은 변형 · 후보 안)", () => {
  const a = assignFlowVariantForChallenge("institutional-impersonation", "advanced", "challenge-abc");
  assert.equal(a, assignFlowVariantForChallenge("institutional-impersonation", "advanced", "challenge-abc"));
  assert.ok(listFlowVariants("institutional-impersonation", "advanced").some((v) => v.variantId === a));
  const spread = new Set(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map((id) => pickChallengeVariantId(["fv-a", "fv-b"], id)));
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
  // §119 — 운영 난수는 서버 암호 난수다(Math.random 0).
  assert.ok(/randomInt\(maxExclusive\)/.test(code));
  assert.equal(/Math\.random\(/.test(code), false);
  // §119 D-11 — 기관 사칭 고급은 fv-pgqt 은퇴 뒤 1벌(옛 세션 해석은 유지).
  assert.deepEqual(listFlowVariants("institutional-impersonation", "advanced").map((v) => v.variantId), ["fv-c5fj", "fv-q7cn", "fv-g2ld"]); // §124 새 루트 2
  assert.equal(FLOW_VARIANTS.find((v) => v.variantId === "fv-pgqt")?.retired, true);
});

test("[§119 덱 경합 · M3] 트랜잭션 확정 순수 함수 — 상태가 미리보기 때와 같으면 미리보기 값 그대로 · 다르면 그 상태에서 다시 뽑는다(raced 표기)", () => {
  const c = ["fv-a", "fv-b"];
  const preview = { flowVariantId: "fv-b", state: { lastVariantId: "fv-a" }, deck: ["fv-a"] };
  // 무작위라도 경합이 없으면 오프닝(미리보기)과 확정이 같다.
  assert.deepEqual(settleDeck(c, { lastVariantId: "fv-a" }, preview, () => 0), { flowVariantId: "fv-b", deck: ["fv-a"], raced: false });
  // 다른 생성이 먼저 fv-b를 커밋 → 남은 덱 [fv-a]에서 fv-a.
  assert.deepEqual(settleDeck(c, { lastVariantId: "fv-b", deck: ["fv-a"] }, preview, keepOrder), { flowVariantId: "fv-a", deck: [], raced: true });
  for (const last of [undefined, "fv-a", "fv-b"]) {
    for (let seed = 1; seed <= 10; seed += 1) {
      const { flowVariantId } = settleDeck(c, last ? { lastVariantId: last } : {}, preview, seeded(seed));
      if (last !== undefined) assert.notEqual(flowVariantId, last, "확정값은 트랜잭션이 읽은 직전값과 절대 같지 않다");
    }
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

test("[§119 덱 경합 · M3] 같은 미리보기로 동시에 생성해도 두 세션이 다른 변형으로 확정되고 세션 · 회전 문서(직전 · 남은 덱)가 같은 트랜잭션으로 쓰인다", async () => {
  const { db, store, ref } = fakeTxDb();
  const rotationRef = ref("users/u1/variantRotation/k") as never;
  const candidates = ["fv-a", "fv-b"];
  store.set("users/u1/variantRotation/k", { lastVariantId: "fv-a" });
  const preview = { flowVariantId: "fv-b", candidates, rotationRef, previewState: { lastVariantId: "fv-a" }, previewDeck: ["fv-a"] };
  const first = await commitSessionWithVariant(db, ref("sessions/s1") as never, { uid: "u1" }, preview, 1, keepOrder);
  const second = await commitSessionWithVariant(db, ref("sessions/s2") as never, { uid: "u1" }, preview, 2, keepOrder);
  assert.equal(first, "fv-b");
  assert.equal(second, "fv-a", "경합에서 두 번째 세션은 직전(fv-b)과 다른 변형으로 확정된다");
  assert.equal(store.get("sessions/s1")?.flowVariantId, "fv-b");
  assert.equal(store.get("sessions/s2")?.flowVariantId, "fv-a");
  assert.equal(store.get("users/u1/variantRotation/k")?.lastVariantId, "fv-a");
  assert.deepEqual(store.get("users/u1/variantRotation/k")?.deck, []);
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
        // T194-c-1(§84.16.4) — 고급 전용 시나리오도 챌린지가 거부된다(`challenge/index.ts` AC-097 (g)) — card-delivery-call 챌린지 풀 = 0(정상).
        if (challengeId && isAdvancedOnlyScenario(id)) continue;
        const pool = assignablePool(id, level, challengeId);
        const label = `${id}/${level}/${challengeId ? "챌린지" : "자가"}`;
        assert.ok(pool.length > 0, `${label}: 배정 풀 0 — failed-precondition으로 막힌다`);
        const escalates = Boolean(resolveSessionEscalation({ scenarioId: id, difficultyLevel: level, challengeId }, PUBLIC_SCENARIOS));
        for (const v of pool) assert.equal(Boolean(v.escalatesToVoice), escalates, `${label}: ${v.variantId}`);
        // T194-c-1 G590 갱신(§84.16.4) — 풀의 모든 변형이 **두 항을 함께** 만족한다(통화 중 설치 문자 선언 = 세션의 기대).
        const expectsInstall = expectsInCallInstall(id, level, challengeId);
        for (const v of pool) assert.equal(declaresInCallInstall(v), expectsInstall, `${label}: ${v.variantId} — 설치 문자 항`);
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
  // T194-c-1 G590 갱신 — 정의 위치는 `variantPool.ts` 1곳(소스 스캔 — `flowVariants.ts`에 정의 0 · 재수출 0).
  const flowSrc = fs.readFileSync(path.join(FUNCTIONS_SRC, "scenarios/flowVariants.ts"), "utf8").replace(/\/\/[^\n]*/g, "");
  const poolSrc = fs.readFileSync(path.join(FUNCTIONS_SRC, "scenarios/variantPool.ts"), "utf8").replace(/\/\/[^\n]*/g, "");
  assert.equal(/function assignablePool\b|assignablePool\s*[,}]/.test(flowSrc), false, "flowVariants.ts에 assignablePool 정의 · 재수출이 있다");
  assert.equal((poolSrc.match(/export function assignablePool\(/g) ?? []).length, 1);
});

// ── T194-c-1 G611(docs/Architecture.md §84.16.4 · PRD AC-105 갱신 고지 3 ④ ⓙ · DECISIONS #192) — 챌린지 기대값 ─────────────

/** ⓙ 사본 — 통화 중 설치 문자 항을 끈 풀(T194-c-1 이전 `assignablePool` 원문 그대로 · 에스컬레이션 항만). */
function assignablePoolBeforeQ2(scenarioId: string, level: (typeof DIFFICULTY_LEVELS)[number], challengeId?: string): FlowVariant[] {
  const escalates = Boolean(resolveSessionEscalation({ scenarioId, difficultyLevel: level, challengeId }, PUBLIC_SCENARIOS));
  return listFlowVariants(scenarioId, level).filter((v) => Boolean(v.escalatesToVoice) === escalates);
}

/** 챌린지 풀 위반 = 챌린지 고급 card-company · loan 풀에 Q2 설치 문자 선언 변형이 들어간 것. */
function challengeQ2Leaks(pool: typeof assignablePool): string[] {
  const leaks: string[] = [];
  for (const id of ["card-company-impersonation", "loan-refinance-scam"]) {
    for (const v of pool(id, "advanced", "c1")) if (declaresInCallInstall(v)) leaks.push(`${id}/챌린지/${v.variantId}`);
  }
  return leaks;
}

test("[T194-c-1 G611 · ⓙ] 챌린지 고급 card-company = [fv-akj5] 문자 0 · loan = [fv-6s5p] 선언 {loan-apply-link, loan-account} 도달 [loan-refinance-apply] · 자가 Q2 3종 = Q2 변형 / 설치 항을 끈 사본은 챌린지에 Q2 변형을 준다", (t) => {
  const ids = (pool: FlowVariant[]) => pool.map((v) => v.variantId);
  // 챌린지 기대값(#192 — base 선언 그대로).
  assert.deepEqual(ids(assignablePool("card-company-impersonation", "advanced", "c1")), ["fv-akj5"]);
  assert.deepEqual(resolveDeclaredSms("card-company-impersonation", "fv-akj5").declared, []);
  assert.deepEqual(ids(assignablePool("loan-refinance-scam", "advanced", "c1")), ["fv-6s5p"]);
  assert.deepEqual(resolveDeclaredSms("loan-refinance-scam", "fv-6s5p").declared.map((d) => d.smsId).sort(), ["loan-account", "loan-apply-link"]);
  assert.deepEqual(sessionReachableLandingIds("loan-refinance-scam", "fv-6s5p"), ["loan-refinance-apply"]);
  // 자가 고급 Q2 3종 풀 = Q2 변형(전부 설치 문자 선언).
  const selfPools = {
    "card-delivery-call": ids(assignablePool("card-delivery-call", "advanced")),
    "card-company-impersonation": ids(assignablePool("card-company-impersonation", "advanced")),
    "loan-refinance-scam": ids(assignablePool("loan-refinance-scam", "advanced")),
  };
  assert.deepEqual(selfPools, { "card-delivery-call": ["fv-tvnj", "fv-e5mv", "fv-u9fz"], "card-company-impersonation": ["fv-x7ue", "fv-w3dq"], "loan-refinance-scam": ["fv-m3hd", "fv-d8pw", "fv-r4hc"] }); // §92 — 카드사 흡수 변형 fv-w3dq · §124 새 루트
  // 전 시나리오 챌린지 풀 변형의 설치 문자 선언 = 거짓.
  const challengeInstall: string[] = [];
  for (const id of Object.keys(PUBLIC_SCENARIOS)) {
    for (const level of DIFFICULTY_LEVELS) {
      for (const v of assignablePool(id, level, "c1")) if (declaresInCallInstall(v)) challengeInstall.push(`${id}/${level}/${v.variantId}`);
    }
  }
  assert.deepEqual(challengeInstall, []);
  // ⓙ 역방향 — 설치 항을 끈 사본.
  const normalLeaks = challengeQ2Leaks(assignablePool);
  const poisonedLeaks = challengeQ2Leaks(assignablePoolBeforeQ2);
  t.diagnostic(`[G611 정상] 챌린지 card-company ${JSON.stringify(ids(assignablePool("card-company-impersonation", "advanced", "c1")))} · loan ${JSON.stringify(ids(assignablePool("loan-refinance-scam", "advanced", "c1")))} · 자가 ${JSON.stringify(selfPools)} · 챌린지 Q2 누수 ${JSON.stringify(normalLeaks)}`);
  t.diagnostic(`[G611 ⓙ 역방향] 설치 항을 끈 사본 → 챌린지 Q2 누수 ${JSON.stringify(poisonedLeaks)} — 실패 재현`);
  assert.deepEqual(normalLeaks, []);
  assert.deepEqual(poisonedLeaks, ["card-company-impersonation/챌린지/fv-x7ue", "card-company-impersonation/챌린지/fv-w3dq", "loan-refinance-scam/챌린지/fv-m3hd", "loan-refinance-scam/챌린지/fv-d8pw", "loan-refinance-scam/챌린지/fv-r4hc"]); // §92 — fv-w3dq · §124
});

test("[T194-c-1 G611] 수신자 배정 — 40개 챌린지 ID 전부 base 변형(fv-akj5 · fv-6s5p)만 · 자가 회전은 Q2 변형", async () => {
  const challengeIds = Array.from({ length: 40 }, (_, i) => `challenge-${i}`);
  for (const [id, expected] of [["card-company-impersonation", "fv-akj5"], ["loan-refinance-scam", "fv-6s5p"]] as const) {
    const received = new Set(challengeIds.map((c) => assignFlowVariantForChallenge(id, "advanced", c)));
    assert.deepEqual([...received], [expected], `${id}: 수신자는 현행 선언 변형만`);
  }
  const { db } = fakeDb(undefined);
  assert.equal((await assignFlowVariantForSession(db, "u1", "card-company-impersonation", "advanced", keepOrder)).flowVariantId, "fv-x7ue");
  assert.equal((await assignFlowVariantForSession(db, "u1", "loan-refinance-scam", "advanced", keepOrder)).flowVariantId, "fv-m3hd");
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
