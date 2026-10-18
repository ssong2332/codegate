#!/usr/bin/env node
// T192 PR B — 사기범 끊기 에뮬레이터 통합(Architecture.md §79.11 · §79.16 · 오케스트레이터 지시 시나리오).
// ⛔ 측정 전용 — 앱 코드를 바꾸지 않는다. 에뮬레이터(auth + firestore + functions · 프로젝트 demo-test)에만 쓴다.
// ⛔ 라이브 프로젝트에 쓰지 않는다(PROJECT 상수 고정 · 호스트 127.0.0.1 고정). 키 값은 다루지 않는다(에뮬레이터가
//    functions/.env · .secret.local 을 직접 읽는다).
//
// 사전: npm --prefix functions run build → (다른 셸) FUNCTIONS_DISCOVERY_TIMEOUT=120 firebase emulators:start
//       --only auth,firestore,functions --project demo-test
// 사용법: node scripts/emulator-hangup-integration.mjs [--out <file>] [--max-fallback-sessions 3]
//
// (a) requestScammerHangup — 인증 없음 · 다른 사용자 세션 · 익명 범위 밖 · 하한 미달 · 동시 2회(accepted 1 + already_accepted 1)
// (b) 폴백 sendMessage(실 LLM) — 사용자 발화 3 이상에서 SIGNAL 응답 → ended:true · scammer_ended · scammerHangup.path=fallback ·
//     리포트 1개 · endSession 멱등. 모델이 신호를 낼지는 확률적이다 — 최대 N세션까지만 시도하고 그대로 보고한다.
import { writeFileSync } from "node:fs";

const PROJECT = "demo-test";
const AUTH = "http://127.0.0.1:9099";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const SCENARIO_ID = "kidnapping-threat"; // 문자 · 확인 무력화 없음 — 하한 외 차단 행이 끼지 않는다.

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const outFile = argVal("--out", "emulator-hangup-result.json");
const maxFallbackSessions = Math.min(3, Number(argVal("--max-fallback-sessions", "3")));

const GOAL_SCRIPT = [
  "여보세요?",
  "네? 우리 애요? 무사한 거죠?",
  "알겠어요 시키는 대로 할게요",
  "얼마를 어디로 보내면 돼요?",
  "지금 바로 보낼게요",
  "방금 말한 계좌로 다 이체했어요",
  "보냈어요 확인해 보세요",
  "다 보냈다니까요",
];

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

/** Firestore REST 값 변환(필요한 타입만). */
function toValue(v) {
  if (v === null) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
  throw new Error(`지원하지 않는 값: ${typeof v}`);
}
function fromValue(v) {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromValue(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fromValue);
  return v;
}
async function fsWrite(docPath, data) {
  const res = await fetch(`${FS}/${docPath}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) }),
  });
  if (!res.ok) throw new Error(`Firestore write 실패 ${docPath}: ${res.status}`);
}
async function fsRead(docPath) {
  const res = await fetch(`${FS}/${docPath}`, { headers: { Authorization: "Bearer owner" } });
  if (res.status === 404) return null;
  const json = await res.json();
  return Object.fromEntries(Object.entries(json.fields ?? {}).map(([k, v]) => [k, fromValue(v)]));
}
async function fsList(collectionPath) {
  const res = await fetch(`${FS}/${collectionPath}?pageSize=300`, { headers: { Authorization: "Bearer owner" } });
  const json = await res.json();
  return (json.documents ?? []).map((d) => d.name.split("/").pop());
}
async function call(fn, data, idToken) {
  const res = await fetch(`${FN}/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.error) return { ok: false, status: json.error.status, message: json.error.message };
  return { ok: true, result: json.result };
}

const results = { a: {}, b: { sessions: [] } };
const verdict = (name, pass, detail) => {
  results.a[name] = { pass, ...detail };
  console.log(`[a] ${name}: ${pass ? "PASS" : "FAIL"} ${JSON.stringify(detail)}`);
};

async function partA() {
  const owner = await signUp({ email: `owner-${Date.now()}@example.com`, password: "pw-123456" });
  const other = await signUp({ email: `other-${Date.now()}@example.com`, password: "pw-123456" });
  const anon = await signUp({});
  const baseSession = (uid) => ({
    uid,
    status: "active",
    scenarioId: SCENARIO_ID,
    channel: "voice",
    difficultyLevel: "intermediate",
    turnCount: 5,
    createdAt: new Date(),
  });
  const sid = `hangup-int-${Date.now()}`;
  const anonSid = `${sid}-anon`;
  const earlySid = `${sid}-early`;
  await fsWrite(`sessions/${sid}`, baseSession(owner.uid));
  await fsWrite(`sessions/${anonSid}`, baseSession(anon.uid));
  await fsWrite(`sessions/${earlySid}`, baseSession(owner.uid));
  const req = (sessionId, userTurns = 5) => ({ sessionId, userTurns, pendingInstruction: false, kind: "goal" });

  const noAuth = await call("requestScammerHangup", req(sid));
  verdict("인증 없음", !noAuth.ok && noAuth.status === "UNAUTHENTICATED", { status: noAuth.status });

  const otherUser = await call("requestScammerHangup", req(sid), other.idToken);
  verdict("다른 사용자 세션", !otherUser.ok && otherUser.status === "PERMISSION_DENIED", { status: otherUser.status });

  const anonScope = await call("requestScammerHangup", req(anonSid), anon.idToken);
  verdict("익명 범위 밖", !anonScope.ok && anonScope.status === "PERMISSION_DENIED", { status: anonScope.status });

  const early = await call("requestScammerHangup", req(earlySid, 1), owner.idToken);
  const earlyDoc = await fsRead(`sessions/${earlySid}`);
  verdict("하한 미달(사용자 발화 1)", early.ok && early.result.status === "too_early" && !earlyDoc.scammerHangup, {
    status: early.result?.status,
    marker: Boolean(earlyDoc?.scammerHangup),
  });

  const [r1, r2] = await Promise.all([
    call("requestScammerHangup", req(sid), owner.idToken),
    call("requestScammerHangup", req(sid), owner.idToken),
  ]);
  const statuses = [r1.result?.status, r2.result?.status].sort();
  const doc = await fsRead(`sessions/${sid}`);
  verdict(
    "동시 2회",
    statuses[0] === "accepted" && statuses[1] === "already_accepted" && doc.scammerHangup?.path === "realtime" && doc.status === "active",
    { statuses, markerPath: doc.scammerHangup?.path, sessionStatus: doc.status, guidanceSame: r1.result?.guidance === r2.result?.guidance },
  );
}

async function partB() {
  const user = await signUp({ email: `fallback-${Date.now()}@example.com`, password: "pw-123456" });
  await fsWrite(`users/${user.uid}/consents/c1`, { granted: true, createdAt: new Date() });
  for (let s = 1; s <= maxFallbackSessions; s++) {
    const created = await call(
      "createSession",
      { scenarioId: SCENARIO_ID, voiceId: "generic-voice", difficultyLevel: "intermediate" },
      user.idToken,
    );
    if (!created.ok) {
      results.b.sessions.push({ attempt: s, error: `createSession ${created.status} ${created.message}` });
      console.log(`[b] #${s} createSession 실패 ${created.status}`);
      continue;
    }
    const sessionId = created.result.sessionId;
    const turns = [];
    let endedResponse = null;
    for (const [i, userText] of GOAL_SCRIPT.entries()) {
      const r = await call("sendMessage", { sessionId, userText }, user.idToken);
      if (!r.ok) {
        turns.push({ i: i + 1, error: `${r.status} ${r.message}` });
        break;
      }
      turns.push({
        i: i + 1,
        ended: r.result.ended,
        endReason: r.result.endReason ?? null,
        isMock: r.result.isMock ?? null,
        replyChars: r.result.reply?.text?.length ?? 0,
        reply: r.result.reply?.text ?? "",
      });
      if (r.result.ended) {
        endedResponse = r.result;
        break;
      }
    }
    const record = { attempt: s, sessionId, openingIsMock: created.result.isMock ?? null, turns };
    if (endedResponse && endedResponse.endReason === "scammer_ended") {
      const doc = await fsRead(`sessions/${sessionId}`);
      const reportsBefore = (await fsList("reports")).filter((id) => id === sessionId).length;
      const e1 = await call("endSession", { sessionId, endReason: "scammer_ended" }, user.idToken);
      const e2 = await call("endSession", { sessionId, endReason: "user_ended" }, user.idToken);
      const docAfter = await fsRead(`sessions/${sessionId}`);
      const reportsAfter = (await fsList("reports")).filter((id) => id === sessionId).length;
      record.check = {
        userTurnsAtEnd: turns.length,
        sessionStatus: doc.status,
        endReason: doc.endReason,
        markerPath: doc.scammerHangup?.path ?? null,
        markerKind: doc.scammerHangup?.kind ?? null,
        reportsAfterHangup: reportsBefore,
        endSession1: e1.ok ? "ok" : e1.status,
        endSession2: e2.ok ? "ok" : e2.status,
        endReasonAfterEndSessions: docAfter.endReason,
        reportsAfterEndSessions: reportsAfter,
      };
      record.pass =
        turns.length >= 3 &&
        doc.status === "ended" &&
        doc.endReason === "scammer_ended" &&
        doc.scammerHangup?.path === "fallback" &&
        reportsBefore === 1 &&
        e1.ok &&
        e2.ok &&
        docAfter.endReason === "scammer_ended" &&
        reportsAfter === 1;
      results.b.sessions.push(record);
      console.log(`[b] #${s} 끊기 발생 · ${record.pass ? "PASS" : "FAIL"} ${JSON.stringify(record.check)}`);
      break;
    }
    record.note = endedResponse ? `종료 사유 ${endedResponse.endReason}` : "대본 안에서 끊기 신호 없음";
    results.b.sessions.push(record);
    console.log(`[b] #${s} ${record.note} · 턴 ${turns.length} · mock ${turns.filter((t) => t.isMock).length}`);
  }
}

async function main() {
  await partA();
  await partB();
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`[done] ${outFile}`);
}
main().catch((e) => {
  console.error("[emulator-hangup] 실패:", String(e?.message ?? e).slice(0, 300));
  process.exit(1);
});
