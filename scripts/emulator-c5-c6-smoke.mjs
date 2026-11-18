#!/usr/bin/env node
// 2026-11-17 감사 C5(삭제된 챌린지 신고) · C6(onSessionEnded 재실행) 에뮬레이터 스모크.
// ⛔ 측정 전용 — 에뮬레이터(firestore + functions · 프로젝트 demo-test · 127.0.0.1)에만 쓴다. 실 키 0 · 과금 0.
// C6: 에뮬레이터는 같은 이벤트를 두 번 보내 주지 않는다 — 대신 같은 세션을 ended → active → ended로 두 번 끝내
//     트리거를 두 번 돌린다(옛 코드 = deletionLogs 2 · 고친 코드 = 1).
//
// 사전: npm --prefix functions run build → (다른 셸) firebase emulators:start --only auth,firestore,functions --project demo-test
// 사용법: node scripts/emulator-c5-c6-smoke.mjs [--out <file>]
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-test";
const PROJECT = process.env.GCLOUD_PROJECT;
const FN = `http://127.0.0.1:${process.env.FN_PORT ?? "5001"}/${PROJECT}/us-central1`;
const here = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(here, "../functions/package.json"));
const { initializeApp, getApps } = fnRequire("firebase-admin/app");
const { getFirestore, Timestamp } = fnRequire("firebase-admin/firestore");
if (getApps().length === 0) initializeApp({ projectId: PROJECT });

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : "emulator-c5-c6-result.json";

const db = getFirestore();
const DAY = 86_400_000;
const now = Date.now();
const tag = `c5c6-${now}`;
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function report(token) {
  const res = await fetch(`${FN}/reportChallenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: { token, reason: "other" } }),
  });
  const json = await res.json().catch(() => ({}));
  return json.error ? { ok: false, status: json.error.status } : { ok: true, result: json.result };
}

// --- C5 판정표 RP ---
const rows = [
  { row: "RP1", status: "pending", expect: { ok: true, status: "reported" } },
  { row: "RP2", status: "reported", expect: { ok: true, status: "reported", keepReason: "first" } },
  { row: "RP3", status: "deleted", expect: { ok: false, err: "NOT_FOUND", status: "deleted" } },
];
for (const r of rows) {
  const token = `${tag}-${r.row}`.padEnd(43, "x").replace(/[^A-Za-z0-9_-]/g, "x").slice(0, 43);
  const id = `${tag}-${r.row}`;
  await db.collection("challenges").doc(id).set({
    challengeId: id,
    creatorUid: `${tag}-creator`,
    displayName: "스모크",
    scenarioId: "card-company-impersonation",
    status: r.status,
    linkTokenHash: createHash("sha256").update(token).digest("hex"),
    linkExpiresAt: Timestamp.fromMillis(now + 3 * DAY),
    retentionDeleteAt: Timestamp.fromMillis(now + 30 * DAY),
    ...(r.status === "reported" ? { reportReason: "first" } : {}),
  });
  const res = await report(token);
  const doc = (await db.collection("challenges").doc(id).get()).data();
  const pass =
    res.ok === r.expect.ok &&
    (r.expect.err ? res.status === r.expect.err : res.result?.status === "reported") &&
    doc.status === r.expect.status &&
    (!r.expect.keepReason || doc.reportReason === r.expect.keepReason);
  results.push({ case: `C5 ${r.row} status=${r.status}`, res, after: { status: doc.status, reportReason: doc.reportReason }, pass });
}

// --- C6 판정표 PC — 같은 세션을 두 번 끝낸다 ---
const sid = `${tag}-session`;
const sref = db.collection("sessions").doc(sid);
await sref.set({
  sessionId: sid,
  uid: `${tag}-uid`,
  scenarioId: "card-company-impersonation",
  status: "active",
  voiceId: `${tag}-voice`,
  cloneStatus: "ready",
  identitySelfConfirmed: true,
  turnCount: 0,
  createdAt: Timestamp.fromMillis(now),
});
async function logCount() {
  return (await db.collection("deletionLogs").where("sessionId", "==", sid).get()).size;
}
async function waitFor(pred, ms = 30_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await pred()) return true;
    await sleep(1000);
  }
  return false;
}
await sref.update({ status: "ended", endReason: "user_ended" });
const firstDone = await waitFor(async () => (await logCount()) === 1);
const s1 = (await sref.get()).data();
results.push({ case: "C6 PC1 첫 종료 → deletionLogs 1 · purgeClaimedAt · voiceId 클리어", firstDone, claimed: s1.purgeClaimedAt !== undefined, voiceIdPresent: "voiceId" in s1, pass: firstDone && s1.purgeClaimedAt !== undefined && !("voiceId" in s1) });

await sref.update({ status: "active", voiceId: `${tag}-voice` });
await sref.update({ status: "ended" });
await sleep(8000); // 두 번째 트리거가 돌 시간
const second = await logCount();
results.push({ case: "C6 PC2 두 번째 종료 → deletionLogs 그대로 1", count: second, pass: second === 1 });

writeFileSync(outFile, JSON.stringify({ tag, results }, null, 2));
const passed = results.filter((r) => r.pass).length;
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.case}`);
console.log(`${passed}/${results.length} PASS`);
process.exit(passed === results.length ? 0 : 1);
