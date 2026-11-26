#!/usr/bin/env node
// U03(2026-11-26) — "받은 사람이 [공유합니다]를 눌러도 만든 사람에게 보이는 게 없다" 에뮬레이터 재현.
// ⛔ 측정 전용 — 에뮬레이터(auth · firestore · functions · storage · 프로젝트 demo-test · 127.0.0.1)에만 쓴다. 실 키 0 · 과금 0.
//
// 흐름: 만든 사람(비익명) 목소리 프로필 + 녹음 파일 심기 → createChallenge(clone) → 받은 사람(익명) consentChallenge →
//       sendMessage 1턴 → endSession → 리포트 → onSessionEnded 완료 전이 대기 → setChallengeResultSharing(share:true) →
//       만든 사람 listMyChallenges → 화면 라벨(src/lib/challenge/mapChallengeItems.ts와 같은 규칙 · --label-module로 실제 모듈 사용).
//
// 사전: npm --prefix functions run build → (다른 셸) firebase emulators:start --only auth,firestore,functions,storage --project demo-test
// 사용법: node scripts/emulator-challenge-share-smoke.mjs [--out <file>]
//   포트가 기본과 다르면 AUTH_PORT · FIRESTORE_PORT · FN_PORT · STORAGE_PORT 환경 변수.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = "demo-test";
const AUTH = `http://127.0.0.1:${process.env.AUTH_PORT ?? "9099"}`;
const FN = `http://127.0.0.1:${process.env.FN_PORT ?? "5001"}/${PROJECT}/us-central1`;
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${process.env.FIRESTORE_PORT ?? "8080"}`;
process.env.FIREBASE_STORAGE_EMULATOR_HOST = `127.0.0.1:${process.env.STORAGE_PORT ?? "9199"}`;
process.env.GCLOUD_PROJECT = PROJECT;

const here = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(here, "../functions/package.json"));
const { initializeApp, getApps } = fnRequire("firebase-admin/app");
const { getFirestore, Timestamp } = fnRequire("firebase-admin/firestore");
const { getStorage } = fnRequire("firebase-admin/storage");
if (getApps().length === 0) initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` });
const db = getFirestore();

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : "emulator-challenge-share-result.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signUp(body) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!json.idToken) throw new Error(`signUp 실패: ${JSON.stringify(json).slice(0, 200)}`);
  return { idToken: json.idToken, uid: json.localId };
}
async function call(fn, data, idToken) {
  const res = await fetch(`${FN}/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.error) return { ok: false, status: json.error.status, message: json.error.message, details: json.error.details };
  return { ok: true, result: json.result };
}

const checks = [];
let failCount = 0;
function check(name, pass, detail = {}) {
  checks.push({ name, pass, ...detail });
  if (!pass) failCount += 1;
  console.log(`${name}: ${pass ? "PASS" : "FAIL"} ${JSON.stringify(detail)}`);
}

const sender = await signUp({ email: `sender-${crypto.randomUUID()}@example.com`, password: crypto.randomUUID() });
const profileId = `p${Date.now()}`;
const now = Date.now();
await db.doc(`users/${sender.uid}/voices/${profileId}`).set({
  profileId,
  label: "내 목소리",
  retentionDays: 7,
  retentionDeleteAt: Timestamp.fromMillis(now + 7 * 86_400_000),
  consentTextVersion: "v1",
  consentedAt: Timestamp.fromMillis(now),
  createdAt: Timestamp.fromMillis(now),
});
await getStorage().bucket().file(`users/${sender.uid}/voiceProfiles/${profileId}/voice_input.webm`).save(Buffer.from("fake-webm"));

const created = await call(
  "createChallenge",
  { scenarioId: process.env.SCENARIO ?? "family-accident-deepvoice", displayName: "민후", difficultyLevel: "beginner", voiceProfileId: profileId },
  sender.idToken,
);
check("1 createChallenge(clone)", created.ok, { err: created.ok ? undefined : created });
if (!created.ok) finish();
const { challengeId, shareToken } = created.result;

const receiver = await signUp({});
const consent = await call("consentChallenge", { token: shareToken }, receiver.idToken);
check("2 consentChallenge(익명 받은 사람)", consent.ok, { err: consent.ok ? undefined : consent });
const sessionId = consent.result?.sessionId;

const turn = await call("sendMessage", { sessionId, userText: "네 여보세요? 누구시죠?" }, receiver.idToken);
check("3 sendMessage 1턴", turn.ok, { err: turn.ok ? undefined : turn });
const ended = await call("endSession", { sessionId, endReason: "user_ended" }, receiver.idToken);
check("4 endSession", ended.ok, { err: ended.ok ? undefined : ended });
let reportSnap = await db.doc(`reports/${sessionId}`).get();
if (!reportSnap.exists) {
  await call("generateReport", { sessionId }, receiver.idToken);
  reportSnap = await db.doc(`reports/${sessionId}`).get();
}
check("5 리포트 문서 존재", reportSnap.exists);

let status;
for (let i = 0; i < 30; i += 1) {
  status = (await db.doc(`challenges/${challengeId}`).get()).data()?.status;
  if (status === "completed") break;
  await sleep(1000);
}
check("6 onSessionEnded → challenges.status = completed", status === "completed", { status });

const shared = await call("setChallengeResultSharing", { token: shareToken, share: true }, receiver.idToken);
check("7 setChallengeResultSharing(share:true)", shared.ok && shared.result?.shared === true, { result: shared.result ?? shared });
const chDoc = (await db.doc(`challenges/${challengeId}`).get()).data();
check("8 challenges 문서 resultSharingConsented = true · resultSummary.outcome(판정표 RS)", chDoc?.resultSharingConsented === true && ["held", "deceived"].includes(chDoc?.resultSummary?.outcome), {
  resultSharingConsented: chDoc?.resultSharingConsented,
  resultSummary: chDoc?.resultSummary,
});

const listed = await call("listMyChallenges", {}, sender.idToken);
const item = listed.result?.challenges?.find((c) => c.challengeId === challengeId);
check("9 만든 사람 listMyChallenges에 그 챌린지 · resultSharingConsented = true", listed.ok && item?.resultSharingConsented === true, { item });

// 10 — 만든 사람 화면이 실제로 보여 주는 글자. 매핑 모듈(TS)을 node --experimental-strip-types로 직접 읽는다.
try {
  const mod = await import(pathToFileURL(path.join(here, "../src/lib/challenge/mapChallengeItems.ts")).href);
  const src = { ...item, status: item.status, createdAt: item.createdAt ? new Date(item.createdAt) : null };
  const [row] = mod.mapChallengesToListItems([src]);
  const notShared = mod.mapChallengesToListItems([{ ...src, resultSharingConsented: false }])[0];
  check("10 공유 라벨이 미공유 라벨 · 배지 '완료'와 구별된다", row.statusLabel !== "완료" && row.statusLabel !== notShared.statusLabel, {
    sharedLabel: row.statusLabel,
    notSharedLabel: notShared.statusLabel,
  });
} catch (e) {
  check("10 매핑 모듈 읽기", false, { err: String(e) });
}
// 11 — [공유하지 않습니다]로 바꾸면 요약이 지워지고 만든 사람 목록에도 안 실린다.
const declined = await call("setChallengeResultSharing", { token: shareToken, share: false }, receiver.idToken);
const chAfter = (await db.doc(`challenges/${challengeId}`).get()).data();
const item2 = (await call("listMyChallenges", {}, sender.idToken)).result?.challenges?.find((c) => c.challengeId === challengeId);
check("11 거부 → 문서 resultSummary 삭제 · 목록 resultSummary null", declined.ok && !("resultSummary" in (chAfter ?? {})) && item2?.resultSummary === null, {
  resultSharingConsented: chAfter?.resultSharingConsented,
  listed: item2?.resultSummary,
});
finish();

function finish() {
  writeFileSync(outFile, JSON.stringify({ checks, failCount }, null, 2));
  console.log(`\n${checks.length - failCount}/${checks.length} PASS → ${outFile}`);
  process.exit(failCount === 0 ? 0 : 1);
}
