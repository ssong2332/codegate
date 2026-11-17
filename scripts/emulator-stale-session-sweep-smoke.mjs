#!/usr/bin/env node
// 2026-11-17 감사 '꼭 고칠 것 5' — 버려진 active 세션 정리(`endStaleSessions`) 에뮬레이터 스모크.
// ⛔ 측정 전용 — 에뮬레이터(firestore + functions · 프로젝트 demo-test · 호스트 127.0.0.1)에만 쓴다. 실 키 0 · 과금 0.
// 에뮬레이터는 예약 함수를 스스로 돌리지 않는다 — 빌드된 `functions/lib`의 `endStaleSessions.run({})`을 이 프로세스에서 부르고
// (같은 Firestore 에뮬레이터), `ended` 쓰기가 유발하는 `onSessionEnded`는 functions 에뮬레이터가 돌린다.
// ⚠️ Firestore 에뮬레이터는 복합 색인을 검사하지 않는다 — 색인 선언은 단위 시험 `[배선]`이 고정한다.
//
// 사전: npm --prefix functions run build → (다른 셸) firebase emulators:start --only auth,firestore,functions --project demo-test
// 사용법: node scripts/emulator-stale-session-sweep-smoke.mjs [--out <file>]
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-test";
const PROJECT = process.env.GCLOUD_PROJECT;
const here = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(here, "../functions/package.json"));
const { initializeApp, getApps } = fnRequire("firebase-admin/app");
const { getFirestore, Timestamp } = fnRequire("firebase-admin/firestore");
if (getApps().length === 0) initializeApp({ projectId: PROJECT });
const { endStaleSessions } = fnRequire("./lib/session/staleSweepSchedule.js");

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : "emulator-stale-session-sweep-result.json";

const db = getFirestore();
const MIN = 60_000;
const now = Date.now();
const tag = `sweep-${now}`;
const ts = (ms) => Timestamp.fromMillis(ms);
const base = (extra) => ({
  uid: `${tag}-uid`,
  scenarioId: "card-company-impersonation",
  cloneStatus: "ready",
  identitySelfConfirmed: true,
  turnCount: 0,
  maxUserTurns: 20,
  maxSessionMs: 60 * MIN,
  ...extra,
});

// | id | 상태 | 기대 |
const cases = [
  { id: "abandoned", doc: base({ status: "active", createdAt: ts(now - 180 * MIN), voiceId: `${tag}-voice-a` }), expect: "ended" },
  { id: "challenge", doc: base({ status: "active", createdAt: ts(now - 180 * MIN), challengeId: `${tag}-ch` }), expect: "ended" },
  { id: "call20", doc: base({ status: "active", createdAt: ts(now - 21 * MIN), answeredAt: ts(now - 20 * MIN) }), expect: "active" },
  {
    id: "multileg",
    doc: base({ status: "active", createdAt: ts(now - 300 * MIN), answeredAt: ts(now - 70 * MIN), relay: { legIndex: 1, legStartUserTurns: [0, 4] } }),
    expect: "active",
  },
  {
    id: "alreadyEnded",
    doc: base({ status: "ended", endReason: "user_ended", createdAt: ts(now - 300 * MIN), endedAt: ts(now - 290 * MIN) }),
    expect: "ended",
    expectReason: "user_ended",
  },
  { id: "clonePending", doc: { uid: `${tag}-uid`, status: "created", createdAt: ts(now - 300 * MIN), cloneStatus: "ready" }, expect: "created" },
];

const results = [];
const ref = (c) => db.collection("sessions").doc(`${tag}-${c.id}`);
for (const c of cases) await ref(c).set({ sessionId: ref(c).id, ...c.doc });

await endStaleSessions.run({ scheduleTime: new Date().toISOString(), jobName: "smoke" });

// onSessionEnded(functions 에뮬레이터)가 deletionLogs를 쓸 때까지 최대 30초 기다린다.
const deadline = Date.now() + 30_000;
let logs = [];
while (Date.now() < deadline) {
  const snap = await db.collection("deletionLogs").where("sessionId", "in", [`${tag}-abandoned`, `${tag}-challenge`]).get();
  logs = snap.docs.map((d) => d.data());
  if (logs.length >= 2) break;
  await new Promise((r) => setTimeout(r, 1000));
}

for (const c of cases) {
  const data = (await ref(c).get()).data();
  const statusOk = data.status === c.expect;
  const reasonOk =
    c.expect === "ended" ? data.endReason === (c.expectReason ?? "limit_reached") && data.endedAt instanceof Timestamp : data.endReason === undefined;
  results.push({ case: c.id, status: data.status, endReason: data.endReason ?? null, pass: statusOk && reasonOk });
}
const abandoned = (await ref(cases[0]).get()).data();
results.push({ case: "deletionLogs(onSessionEnded)", count: logs.length, pass: logs.length === 2 });
results.push({ case: "voiceId 클리어(onSessionEnded)", voiceIdPresent: "voiceId" in abandoned, pass: !("voiceId" in abandoned) });
// 두 번째 실행 — 이미 끝낸 세션을 다시 쓰지 않는다(endedAt 그대로).
const endedAtBefore = abandoned.endedAt.toMillis();
await endStaleSessions.run({ scheduleTime: new Date().toISOString(), jobName: "smoke" });
const endedAtAfter = (await ref(cases[0]).get()).data().endedAt.toMillis();
results.push({ case: "재실행 멱등(endedAt 불변)", pass: endedAtBefore === endedAtAfter });

const passed = results.filter((r) => r.pass).length;
console.table(results);
console.log(`${passed}/${results.length} PASS`);
writeFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), passed, total: results.length, results }, null, 2));
process.exit(passed === results.length ? 0 : 1);
