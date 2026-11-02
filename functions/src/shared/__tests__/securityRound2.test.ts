// 외부 보안 점검 2차(2026-11-02) — SEC-05 세션 생성 슬롯 · SEC-06 되감기 슬롯 · SEC-07 입력 검증 · SEC-08 발급 · 카톡 예산 · 전사 재전송.
//
// 동시성은 "직렬화된 트랜잭션"을 흉내 내는 가짜 Firestore로 잰다 — 같은 문서를 읽고 쓰는 Firestore 트랜잭션은 충돌하면 재시도되어
// 결과가 순서대로 실행한 것과 같다(`variantAssignment.test.ts` `fakeTxDb`와 같은 관례). 각 항목의 [재현] 테스트는 **옛 방식**(트랜잭션 밖에서
// 세고 · AI 호출 뒤 쓰기)을 같은 가짜 위에서 돌려 상한을 넘는 것을 먼저 보이고, 새 함수가 막는 것을 보인다. 실제 콜러블 경로는
// `scripts/emulator-security-round2-smoke.mjs`(에뮬레이터 · main 빌드 대 이 브랜치 빌드)가 잰다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { isDocId, readDocId } from "../requestValidation";
import { decideCreateSlot, releaseCreateSessionSlot, reserveCreateSessionSlot, CREATE_SLOT_INFLIGHT_TTL_MS } from "../../session/createSlot";
import { nextRewindSlot, reserveRewindSlot } from "../../rewind/attemptSlot";
import { nextRealtimeIssue, realtimeIssueLegKey, reserveRealtimeIssue, REALTIME_ISSUE_MAX_PER_LEG, REALTIME_ISSUE_WINDOW_MS } from "../../realtime/issueBudget";
import { chatDuringCallBudgetExceeded } from "../../roleplay/chatDuringCall";
import { prepareTranscriptTurns, readTranscriptRequest, transcriptBatchKey } from "../../realtime/transcriptRequest";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const ts = (ms: number) => ({ toMillis: () => ms });
const MIN = 60_000;

// ── 가짜 Firestore(직렬화 트랜잭션) ──
type Data = Record<string, unknown>;
type Filter = { field: string; value: unknown };
function fakeDb() {
  const store = new Map<string, Data>();
  let queue: Promise<unknown> = Promise.resolve();
  const snapOf = (p: string) => {
    const data = store.get(p);
    return { exists: data !== undefined, id: p.split("/").pop(), get: (k: string) => data?.[k], data: () => data };
  };
  const runQuery = (q: { path: string; filters: Filter[]; order?: string; n?: number }) => {
    const depth = q.path.split("/").length + 1;
    let docs = [...store.entries()]
      .filter(([p]) => p.startsWith(`${q.path}/`) && p.split("/").length === depth)
      .filter(([, d]) => q.filters.every((f) => d[f.field] === f.value))
      .map(([p, d]) => ({ id: p.split("/").pop() as string, get: (k: string) => d[k] }));
    if (q.order) {
      const key = q.order;
      docs = docs.sort((a, b) => ((b.get(key) as { toMillis(): number })?.toMillis() ?? 0) - ((a.get(key) as { toMillis(): number })?.toMillis() ?? 0));
    }
    if (q.n !== undefined) docs = docs.slice(0, q.n);
    return { docs, size: docs.length };
  };
  const query = (p: string, filters: Filter[] = [], order?: string, n?: number) => ({
    kind: "query" as const,
    path: p,
    filters,
    order,
    n,
    where: (field: string, _op: string, value: unknown) => query(p, [...filters, { field, value }], order, n),
    orderBy: (field: string) => query(p, filters, field, n),
    limit: (k: number) => query(p, filters, order, k),
    doc: (id: string) => docRef(`${p}/${id}`),
  });
  const applyUpdate = (p: string, patch: Data) => {
    const cur: Data = { ...(store.get(p) ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      const parts = k.split(".");
      let obj = cur;
      for (const part of parts.slice(0, -1)) obj = (obj[part] = { ...((obj[part] as Data) ?? {}) });
      const last = parts[parts.length - 1];
      if (v instanceof Object && "isEqual" in v && (v as { isEqual(o: unknown): boolean }).isEqual(FieldValue.delete())) delete obj[last];
      else obj[last] = v;
    }
    store.set(p, cur);
  };
  const deepMerge = (a: Data, b: Data): Data => {
    const out: Data = { ...a };
    for (const [k, v] of Object.entries(b)) {
      out[k] = v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" ? deepMerge(a[k] as Data, v as Data) : v;
    }
    return out;
  };
  function docRef(p: string): { kind: "doc"; path: string; id: string; collection(c: string): ReturnType<typeof query>; update(patch: Data): Promise<void> } {
    return {
      kind: "doc",
      path: p,
      id: p.split("/").pop() as string,
      collection: (c: string) => query(`${p}/${c}`),
      update: async (patch: Data) => applyUpdate(p, patch),
    };
  }
  const db = {
    collection: (c: string) => query(c),
    runTransaction: <R>(fn: (tx: unknown) => Promise<R>): Promise<R> => {
      const run = queue.then(async () => {
        const writes: (() => void)[] = [];
        const tx = {
          get: async (r: { kind: string; path: string }) =>
            r.kind === "doc" ? snapOf(r.path) : runQuery(r as unknown as Parameters<typeof runQuery>[0]),
          set: (r: { path: string }, data: Data, opts?: { merge?: boolean }) => {
            writes.push(() => store.set(r.path, opts?.merge ? deepMerge(store.get(r.path) ?? {}, data) : data));
          },
        };
        const result = await fn(tx);
        for (const w of writes) w();
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
  return { db: db as unknown as Firestore, store, docRef };
}
const codeOf = (e: unknown) => (e instanceof HttpsError ? e.code : String(e));
async function settle<T>(ps: Promise<T>[]) {
  const r = await Promise.allSettled(ps);
  return { ok: r.filter((x) => x.status === "fulfilled").length, rejected: r.filter((x) => x.status === "rejected").map((x) => codeOf((x as PromiseRejectedResult).reason)) };
}

// ── SEC-05 ──
test("[SEC-05] 판정표 — 창 안 세션 + 진행 중 예약을 함께 세고, 같은 id는 한 번 · 오래된 예약은 빼고 지운다", () => {
  const now = 10_000_000;
  const five = [1, 2, 3, 4, 5].map((i) => ({ id: `s${i}`, createdAtMs: now - i * 1000 }));
  assert.equal(decideCreateSlot({ recent: five, inflight: {}, slotId: "n", nowMs: now }).limited, false);
  assert.equal(decideCreateSlot({ recent: five, inflight: { x: now - 1000 }, slotId: "n", nowMs: now }).limited, true, "진행 중 예약도 센다");
  assert.equal(decideCreateSlot({ recent: five, inflight: { s5: now - 1000 }, slotId: "n", nowMs: now }).limited, false, "세션 문서가 이미 있는 예약은 한 번만");
  const pruned = decideCreateSlot({ recent: five, inflight: { old: now - CREATE_SLOT_INFLIGHT_TTL_MS }, slotId: "n", nowMs: now });
  assert.equal(pruned.limited, false);
  assert.deepEqual(pruned.inflight, { n: now }, "오래된 예약은 지우고 이번 예약만 남긴다");
  assert.equal(
    decideCreateSlot({ recent: [...five, { id: "s6", createdAtMs: undefined }], inflight: {}, slotId: "n", nowMs: now }).limited,
    false,
    "createdAt 부재 문서는 세지 않는다(§66.3 그대로)",
  );
  assert.equal(decideCreateSlot({ recent: five, inflight: { y: "bad" }, slotId: "n", nowMs: now }).limited, false, "깨진 예약 값은 버린다");
});

test("[SEC-05 재현] 옛 방식(트랜잭션 밖 셈 → AI 호출 → 쓰기)은 기존 5개 상태의 동시 요청 2개가 둘 다 통과해 7개 · AI 2회가 된다", async () => {
  const { store } = fakeDb();
  const now = Date.now();
  for (let i = 1; i <= 5; i += 1) store.set(`sessions/s${i}`, { uid: "u1", createdAt: ts(now - i * 1000) });
  let aiCalls = 0;
  const oldHandler = async (id: string) => {
    // 트랜잭션 밖 셈(§66.3 옛 롤링 윈도우 — 최근 7개 중 창 안 개수).
    const inWindow = [...store.entries()].filter(([k, d]) => k.startsWith("sessions/") && d.uid === "u1").length;
    if (inWindow >= 6) throw new HttpsError("resource-exhausted", "limit");
    await new Promise((r) => setTimeout(r, 5)); // 오프닝 대사(LLM)
    aiCalls += 1;
    store.set(`sessions/${id}`, { uid: "u1", createdAt: ts(Date.now()) });
  };
  const r = await settle([oldHandler("a"), oldHandler("b")]);
  assert.equal(r.ok, 2, "옛 방식은 둘 다 통과한다(결함 재현)");
  assert.equal(aiCalls, 2);
  assert.equal([...store.keys()].filter((k) => k.startsWith("sessions/")).length, 7);
});

test("[SEC-05] 새 방식 — 같은 상태의 동시 요청 2개 중 1개만 성공 · 최종 6개 · AI 호출 1회", async () => {
  const { db, store } = fakeDb();
  const now = Date.now();
  for (let i = 1; i <= 5; i += 1) store.set(`sessions/s${i}`, { uid: "u1", createdAt: ts(now - i * 1000) });
  let aiCalls = 0;
  const handler = async (id: string) => {
    await reserveCreateSessionSlot(db, "u1", id);
    await new Promise((r) => setTimeout(r, 5));
    aiCalls += 1;
    store.set(`sessions/${id}`, { uid: "u1", createdAt: ts(Date.now()) });
    await releaseCreateSessionSlot(db, "u1", id);
  };
  const r = await settle([handler("a"), handler("b")]);
  assert.equal(r.ok, 1);
  assert.deepEqual(r.rejected, ["resource-exhausted"]);
  assert.equal(aiCalls, 1);
  assert.equal([...store.keys()].filter((k) => k.startsWith("sessions/")).length, 6);
  assert.deepEqual(store.get("users/u1/limits/createSession")?.inflight, {}, "성공한 예약은 커밋 뒤 해제된다");
  // 창이 지나면 다시 만들 수 있다(정상 사용 회귀 0).
  await assert.doesNotReject(reserveCreateSessionSlot(db, "u1", "later", () => now + 11 * MIN));
});

test("[SEC-05 배선] createSession — 예약이 동의 게이트 뒤 · 흐름 변형 배정 · 오프닝 대사(LLM) 앞, 해제는 세션 커밋 뒤", () => {
  const src = read("session/index.ts");
  const handler = src.slice(src.indexOf("export const createSession"), src.indexOf("export const endSession"));
  const reserve = handler.indexOf("await reserveCreateSessionSlot(db, request.auth.uid, sessionRef.id);");
  assert.ok(reserve > -1);
  assert.ok(handler.indexOf('"훈련 참여 동의가 필요합니다."') < reserve);
  assert.ok(reserve < handler.indexOf("await assignFlowVariantForSession("));
  assert.ok(reserve < handler.indexOf("await generateOpeningLine("));
  const commit = handler.indexOf("await commitSessionWithVariant(");
  const release = handler.indexOf("await releaseCreateSessionSlot(db, request.auth.uid, sessionRef.id);");
  assert.ok(commit > -1 && release > commit);
  assert.equal(/isCreateSessionRateLimited\(\{/.test(handler), false, "트랜잭션 밖 롤링 윈도우 셈이 남았다");
  const slot = read("session/createSlot.ts");
  assert.match(slot, /db\.runTransaction\(async \(tx\) => \{\n\s*const \[slotSnap, recentSnap\] = await Promise\.all\(\[tx\.get\(ref\), tx\.get\(recentQuery\)\]\);/);
});

// ── SEC-06 ──
test("[SEC-06] 판정표 — 슬롯 문서 없음 = 기존 기록 수부터 · 50이면 거절 · 깨진 값은 거절", () => {
  assert.equal(nextRewindSlot({ storedUsed: undefined, existingAttempts: 0 }), 1);
  assert.equal(nextRewindSlot({ storedUsed: undefined, existingAttempts: 49 }), 50);
  assert.equal(nextRewindSlot({ storedUsed: undefined, existingAttempts: 50 }), null);
  assert.equal(nextRewindSlot({ storedUsed: 49, existingAttempts: 0 }), 50);
  assert.equal(nextRewindSlot({ storedUsed: 50, existingAttempts: 0 }), null);
  for (const broken of ["49", -1, 1.5, null]) assert.equal(nextRewindSlot({ storedUsed: broken, existingAttempts: 0 }), null, String(broken));
});

test("[SEC-06 재현 → 수정] 기록 49개 상태의 동시 요청 3개 — 옛 방식은 52개, 새 방식은 50개 · 추가 판정 1회", async () => {
  const seed = (store: Map<string, Data>) => {
    store.set("reports/r1", { uid: "u1" });
    for (let i = 0; i < 49; i += 1) store.set(`reports/r1/rewindAttempts/a${i}`, { verdict: "x" });
  };
  const count = (store: Map<string, Data>) => [...store.keys()].filter((k) => k.startsWith("reports/r1/rewindAttempts/")).length;
  const old = fakeDb();
  seed(old.store);
  let oldJudge = 0;
  const oldHandler = async (n: number) => {
    const existing = count(old.store);
    if (existing >= 50) throw new HttpsError("resource-exhausted", "limit");
    await new Promise((r) => setTimeout(r, 5));
    oldJudge += 1;
    old.store.set(`reports/r1/rewindAttempts/new${n}`, { verdict: "x" });
  };
  await settle([oldHandler(1), oldHandler(2), oldHandler(3)]);
  assert.equal(count(old.store), 52, "옛 방식은 상한을 넘는다(결함 재현)");
  assert.equal(oldJudge, 3);

  const fresh = fakeDb();
  seed(fresh.store);
  let judge = 0;
  const handler = async (n: number) => {
    await reserveRewindSlot(fresh.db, fresh.docRef("reports/r1") as never);
    await new Promise((r) => setTimeout(r, 5));
    judge += 1;
    fresh.store.set(`reports/r1/rewindAttempts/new${n}`, { verdict: "x" });
  };
  const r = await settle([handler(1), handler(2), handler(3)]);
  assert.equal(r.ok, 1);
  assert.deepEqual(r.rejected, ["resource-exhausted", "resource-exhausted"]);
  assert.equal(count(fresh.store), 50);
  assert.equal(judge, 1, "추가 판정 호출 1회 이하");
  assert.deepEqual(Object.keys(fresh.store.get("reports/r1") ?? {}), ["uid"], "리포트 문서는 그대로다(AC-007)");
});

test("[SEC-06 배선] judgeRewindAnswer — 슬롯 확보가 판정(LLM) · 사기범 대사 read 앞, 슬롯 모듈의 쓰기는 슬롯 문서 하나", () => {
  const src = read("rewind/index.ts");
  const reserve = src.indexOf("await reserveRewindSlot(db, reportRef);");
  assert.ok(reserve > -1);
  assert.ok(reserve < src.indexOf("await judgeRewindAnswerWith("));
  assert.ok(reserve < src.indexOf("await findScammerLineMasked("));
  assert.equal(/attemptsRef\.limit\(REWIND_ATTEMPT_LIMIT\)\.get\(\)/.test(src), false, "트랜잭션 밖 셈이 남았다");
  const slot = read("rewind/attemptSlot.ts").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.deepEqual(slot.match(/tx\.(set|update|create|delete)\([^,]+/g), ["tx.set(slotRef"]);
  assert.match(slot, /reportRef\.collection\("limits"\)\.doc\("rewind"\)/);
  assert.equal(/\.update\(|reportRef\.set\(|collection\("users"\)|collection\("sessions"\)/.test(slot), false);
});

// ── SEC-07 ──
test("[SEC-07] 문서 ID 판독 — 문자열 · [A-Za-z0-9_-] 1~128자만", () => {
  for (const ok of ["abc", "A1_b-2", "x".repeat(128), "fv-x7ue", "card-company-impersonation"]) assert.equal(isDocId(ok), true, ok);
  for (const bad of [123, {}, [], null, undefined, "", "a/b", ".", "..", "__x__", "x".repeat(129), "a b", "세션", true]) {
    assert.equal(isDocId(bad), false, JSON.stringify(bad));
    assert.throws(() => readDocId(bad, "sessionId"), (e: unknown) => codeOf(e) === "invalid-argument");
  }
});

test("[SEC-07] 전사 판독 — 숫자 · 객체 sessionId, null 항목, 잘못된 역할, 숫자 본문, 문자 atMs는 모두 invalid-argument", () => {
  const ok = { sessionId: "s1", turns: [{ role: "user", text: "네" }, { role: "scammer", text: "여보세요", atMs: 1200 }] };
  assert.deepEqual(readTranscriptRequest(ok).turns, ok.turns);
  const bad: unknown[] = [
    { ...ok, sessionId: 123 },
    { ...ok, sessionId: { a: 1 } },
    { ...ok, sessionId: "a/b" },
    { ...ok, turns: [null] },
    { ...ok, turns: [{ role: "admin", text: "x" }] },
    { ...ok, turns: [{ text: "x" }] },
    { ...ok, turns: [{ role: "user", text: 5 }] },
    { ...ok, turns: [{ role: "user", text: "x", atMs: "1" }] },
    { ...ok, turns: "x" },
    { ...ok, turns: Array.from({ length: 201 }, () => ({ role: "user", text: "x" })) },
    { ...ok, openingNotSpoken: "yes" },
    { ...ok, answeredAtMs: "1" },
    { ...ok, batchId: "short" },
    { ...ok, batchId: 123 },
    null,
  ];
  for (const data of bad) assert.throws(() => readTranscriptRequest(data), (e: unknown) => codeOf(e) === "invalid-argument", JSON.stringify(data)?.slice(0, 80));
});

test("[SEC-07 배선] 콜러블 전부 — 문서 ID는 첫 Firestore 접근 전에 판독하고 옛 truthy 검사(`if (!sessionId)`)가 남지 않는다", () => {
  const files: [string, string][] = [
    ["report/index.ts", 'readDocId(sessionId, "sessionId")'],
    ["voice/index.ts", 'readDocId(sessionId, "sessionId")'],
    ["realtime/index.ts", 'readDocId(sessionId, "sessionId")'],
    ["realtime/submitTranscript.ts", "readTranscriptRequest(request.data)"],
    ["inCallSms/index.ts", 'readDocId(sessionId, "sessionId")'],
    ["mockScreens/index.ts", 'readDocId(landingId, "landingId")'],
    ["verifyIntercept/index.ts", 'readDocId(sessionId, "sessionId")'],
    ["roleplay/screenActionFollowUp.ts", 'readDocId(landingId, "landingId")'],
    ["roleplay/index.ts", "!isDocId(sessionId) || typeof userText !== \"string\""],
    ["rewind/index.ts", "!isDocId(reportId)"],
    ["session/index.ts", 'readDocId(scenarioId, "scenarioId")'],
    ["challenge/index.ts", 'readDocId(challengeId, "challengeId")'],
    ["scenarios/beginnerBriefing.ts", 'readDocId(scenarioId, "scenarioId")'],
    ["callLegs/request.ts", "!isDocId(sessionId)"],
    ["scammerHangup/readRequest.ts", "!isDocId(sessionId)"],
  ];
  for (const [file, marker] of files) {
    const code = read(file);
    assert.ok(code.includes(marker), `${file}: ${marker} 없음`);
    assert.equal(/if \(!sessionId\) \{/.test(code), false, `${file}: 옛 truthy 검사가 남았다`);
    // 핸들러(첫 `export const`) 안에서 — 위쪽 도우미 함수(loadOwnedSession 등)의 `.doc(sessionId)`는 핸들러가 판독 뒤에 부른다.
    const handlerStart = Math.max(0, code.indexOf("export const"));
    const handler = code.slice(handlerStart);
    const firstAccess = handler.search(/\.doc\((sessionId|reportId|challengeId)\)|loadOwned\w*\(sessionId/);
    if (firstAccess > -1 && handler.includes(marker)) assert.ok(handler.indexOf(marker) < firstAccess, `${file}: 판독이 첫 문서 접근보다 뒤다`);
  }
  // createSession — enum · 상속 키.
  const session = read("session/index.ts");
  assert.match(session, /readOptionalEnum\(channel, "channel", \["voice", "messenger"\]\)/);
  assert.match(session, /Object\.prototype\.hasOwnProperty\.call\(SCENARIO_PROMPTS, scenarioId\)/);
  assert.ok(read("verifyIntercept/index.ts").includes('readDocId(offerId, "offerId")'), "deliverVerifyReconnect offerId 판독 없음");
  // reportChallenge note(1차 점검 후속).
  assert.match(read("challenge/userAccess.ts"), /typeof note !== "string"/);
});

// ── SEC-08 ──
test("[SEC-08] 발급 판정표 — 구간별 6회 · 최초 발급 후 25분 · 깨진 기록은 거절", () => {
  const t0 = 1_000_000;
  assert.deepEqual(nextRealtimeIssue(undefined, t0), { count: 1, firstIssuedAtMs: t0 });
  assert.deepEqual(nextRealtimeIssue({ count: 5, firstIssuedAtMs: t0 }, t0 + MIN), { count: 6, firstIssuedAtMs: t0 });
  assert.equal(nextRealtimeIssue({ count: REALTIME_ISSUE_MAX_PER_LEG, firstIssuedAtMs: t0 }, t0 + MIN), null);
  assert.equal(nextRealtimeIssue({ count: 1, firstIssuedAtMs: t0 }, t0 + REALTIME_ISSUE_WINDOW_MS), null);
  assert.notEqual(nextRealtimeIssue({ count: 1, firstIssuedAtMs: t0 }, t0 + REALTIME_ISSUE_WINDOW_MS - 1), null);
  assert.equal(REALTIME_ISSUE_WINDOW_MS, 25 * MIN);
  assert.equal(nextRealtimeIssue({ count: "1", firstIssuedAtMs: t0 }, t0), null);
});

test("[SEC-08] 구간 키 — 처음부터 통화 voice0 · 메신저→통화 voice1 · 재진입 voice2 · 다통화 레그 leg<n>", () => {
  const entry = (to: "voice" | "messenger") => ({ from: to === "voice" ? "messenger" : "voice", to, at: ts(0), trigger: "manual_button" }) as never;
  assert.equal(realtimeIssueLegKey({}, undefined), "voice0");
  assert.equal(realtimeIssueLegKey({ channelHistory: [entry("voice")] }, undefined), "voice1");
  assert.equal(realtimeIssueLegKey({ channelHistory: [entry("voice"), entry("messenger"), entry("voice")] }, undefined), "voice2");
  assert.equal(realtimeIssueLegKey({ channelHistory: [entry("voice")] }, { legIndex: 0 }), "leg0");
  assert.equal(realtimeIssueLegKey({}, { legIndex: 2 }), "leg2");
});

test("[SEC-08] 한 구간 7번째 발급 거절 · 동시 2건 중 1건만 · 다통화 다음 레그는 자기 예산(startCallLeg 전환 유지)", async () => {
  const { db, store, docRef } = fakeDb();
  const session = docRef("sessions/s1") as never;
  const now = 5_000_000;
  for (let i = 0; i < 5; i += 1) await reserveRealtimeIssue(db, session, "voice0", () => now + i);
  const r = await settle([reserveRealtimeIssue(db, session, "voice0", () => now + 10), reserveRealtimeIssue(db, session, "voice0", () => now + 11)]);
  assert.equal(r.ok, 1, "동시 요청도 6회를 넘지 않는다");
  assert.deepEqual(r.rejected, ["resource-exhausted"]);
  await assert.rejects(reserveRealtimeIssue(db, session, "voice0", () => now + 20), (e: unknown) => codeOf(e) === "resource-exhausted");
  // 다통화 — startCallLeg가 레그를 올리면 새 구간(`leg1`)이라 새 예산이다.
  await assert.doesNotReject(reserveRealtimeIssue(db, session, "leg1", () => now + 30));
  const legs = store.get("sessions/s1/limits/realtimeCall")?.legs as Record<string, { count: number }>;
  assert.equal(legs.voice0.count, 6);
  assert.equal(legs.leg1.count, 1);
  // 25분 지난 오래된 구간은 다시 받지 못한다.
  await reserveRealtimeIssue(db, session, "voice1", () => now);
  await assert.rejects(reserveRealtimeIssue(db, session, "voice1", () => now + 25 * MIN), (e: unknown) => codeOf(e) === "resource-exhausted");
});

test("[SEC-08 배선] createRealtimeCall — 예산 판정이 외부 호출(자격증명 발급) · 앞선 대화 read 앞이고 구간 키는 서버 relay 기준", () => {
  const src = read("realtime/index.ts");
  const reserve = src.indexOf("await reserveRealtimeIssue(db, db.collection(\"sessions\").doc(sessionId), realtimeIssueLegKey(session, callLeg));");
  assert.ok(reserve > -1);
  assert.ok(src.indexOf("const callLeg = resolveSessionCallLeg(") < reserve);
  assert.ok(reserve < src.indexOf("await provider.createCallCredentials("));
  assert.ok(reserve < src.indexOf('collection("messages").orderBy("turnIndex", "asc").get()'));
  assert.ok(src.indexOf('if (session.status !== "active")') < reserve, "종료 세션 거절이 먼저다");
});

test("[SEC-08] 통화 중 카톡 예산 — 누적 100턴 또는 받은 뒤 60분이면 거절(받은 시각 없으면 생성 시각)", () => {
  const now = 100 * MIN;
  const base = { createdAt: ts(now - 10 * MIN), maxSessionMs: 60 * MIN } as const;
  assert.equal(chatDuringCallBudgetExceeded({ ...base, turnCount: 99 } as never, now), false);
  assert.equal(chatDuringCallBudgetExceeded({ ...base, turnCount: 100 } as never, now), true);
  assert.equal(chatDuringCallBudgetExceeded({ ...base, turnCount: 5, answeredAt: ts(now - 60 * MIN) } as never, now), true);
  assert.equal(chatDuringCallBudgetExceeded({ ...base, turnCount: 5, answeredAt: ts(now - 59 * MIN) } as never, now), false);
  assert.equal(chatDuringCallBudgetExceeded({ turnCount: 5, createdAt: ts(now - 61 * MIN) } as never, now), true, "maxSessionMs 부재 = 60분");
});

test("[SEC-08 배선] 통화 중 카톡 — 예산 판정이 턴 확보 트랜잭션 안 · 사용자 메시지 쓰기와 LLM 앞", () => {
  const src = read("roleplay/chatDuringCall.ts");
  const fn = src.slice(src.indexOf("export async function replyChatDuringCall"));
  const check = fn.indexOf("if (chatDuringCallBudgetExceeded(fresh, Date.now())) {");
  assert.ok(check > -1);
  assert.ok(fn.indexOf("const claim = await db.runTransaction(") < check);
  assert.ok(check < fn.indexOf("tx.create(messagesRef.doc(),"));
  assert.ok(check < fn.indexOf("await completeWithFallback("));
});

// ── 전사 재전송 ──
test("[전사 재전송] 중복 키 — batchId가 있으면 그것, 없으면 가린 내용 해시(원문 번호 · 기기 백업의 [전화]가 같은 키)", () => {
  const turns = readTranscriptRequest({ sessionId: "s1", turns: [{ role: "user", text: "제 번호는 010-1234-5678이요", atMs: 100 }, { role: "scammer", text: "네", atMs: 900 }] }).turns;
  const prepared = prepareTranscriptTurns(turns);
  assert.equal(transcriptBatchKey("abcdef0123456789", prepared), "b_abcdef0123456789");
  const key = transcriptBatchKey(undefined, prepared);
  assert.match(key, /^h_[0-9a-f]{64}$/);
  assert.equal(transcriptBatchKey(undefined, prepareTranscriptTurns(turns)), key, "같은 제출 = 같은 키");
  const backup = prepareTranscriptTurns([{ role: "user", text: "제 번호는 [전화]이요", atMs: 100 }, { role: "scammer", text: "네", atMs: 900 }]);
  assert.equal(transcriptBatchKey(undefined, backup), key, "기기 백업(먼저 가린 본문)으로 다시 보내도 같은 키");
  assert.notEqual(transcriptBatchKey(undefined, prepareTranscriptTurns([{ role: "user", text: "제 번호는 010-1234-5678이요", atMs: 101 }, { role: "scammer", text: "네", atMs: 900 }])), key);
  assert.deepEqual(prepareTranscriptTurns([{ role: "user", text: "   " }]), [], "빈 줄은 저장하지 않는다(종전 그대로)");
});

test("[전사 재전송 배선] submitRealtimeTranscript — 표시 문서를 트랜잭션 안에서 이력보다 먼저 읽고, 있으면 저장 0 · 없으면 같은 커밋으로 만든다 · 종료 세션은 막지 않는다", () => {
  const src = read("realtime/submitTranscript.ts");
  const handler = src.slice(src.indexOf("export const submitRealtimeTranscript"));
  const readBatch = handler.indexOf("const batchSnap = await tx.get(batchRef);");
  assert.ok(readBatch > -1);
  assert.match(handler, /const batchSnap = await tx\.get\(batchRef\);\n\s*if \(batchSnap\.exists\) return 0;/);
  assert.ok(readBatch < handler.indexOf('const historySnap = await tx.get(messagesRef.orderBy("turnIndex", "asc"));'));
  assert.ok(handler.indexOf("tx.create(batchRef, { written: count, createdAt: Timestamp.fromMillis(baseTime) });") > handler.indexOf("prepared.forEach("));
  assert.equal(/status !== "active"|status === "ended"/.test(handler), false, "종료된 세션 전사 제출을 막으면 안 된다");
  assert.match(handler, /collection\("transcriptBatches"\)\.doc\(transcriptBatchKey\(batchId, prepared\)\)/);
});

test("[규칙 · 인덱스] 새 카운터 문서는 기존 전면 거부 규칙 아래 경로라 firestore.rules · 인덱스 변경이 없다", () => {
  const rules = readFileSync(path.resolve(SRC, "../../firestore.rules"), "utf8").replace(/\r\n/g, "\n");
  assert.match(rules, /match \/\{document=\*\*\} \{\n\s*allow read, write: if false;/);
  for (const sub of ["limits", "transcriptBatches"]) assert.equal(rules.includes(`match /${sub}/`), false, `${sub}에 허용 규칙이 생겼다`);
});
