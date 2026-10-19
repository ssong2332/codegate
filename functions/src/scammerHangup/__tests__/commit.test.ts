import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Timestamp } from "firebase-admin/firestore";
import {
  decideAndMarkRealtimeHangup,
  isVerifyInterceptSession,
  type HangupDocSnapshot,
  type HangupTransaction,
  type RealtimeHangupClaims,
} from "../commit";
import type { ScammerHangupMarker } from "../../shared/types";

// T192 C1 — `requestScammerHangup` 트랜잭션 본문(Architecture.md §79.5) · 가짜 트랜잭션으로 고정한다.
// onCall 핸들러는 에뮬레이터 없이 실행할 수 없으므로 판정 + 표식 write를 이 함수로 내렸다.

type FakeRef = string;
const SESSION_REF: FakeRef = "sessions/s1";
const VERIFY_REF: FakeRef = "sessions/s1/verifyIntercept/offer";
const NOW = Timestamp.fromMillis(1_700_000_000_000);

const VERIFY_SCENARIO = "institutional-impersonation";
const PLAIN_SCENARIO = "kidnapping-threat";

type Docs = Record<FakeRef, Record<string, unknown> | undefined>;

function makeTx(docs: Docs) {
  const reads: FakeRef[] = [];
  const updates: Array<{ ref: FakeRef; data: { scammerHangup: ScammerHangupMarker } }> = [];
  const tx: HangupTransaction<FakeRef> = {
    async get(ref): Promise<HangupDocSnapshot> {
      reads.push(ref);
      const doc = docs[ref];
      return { exists: doc !== undefined, data: () => doc };
    },
    update(ref, data) {
      updates.push({ ref, data });
    },
  };
  return { tx, reads, updates };
}

const REFS = { session: SESSION_REF, verifyOffer: () => VERIFY_REF };
const CLAIMS: RealtimeHangupClaims = { userTurns: 5, pendingInstruction: false, kind: "goal" };

function activeSession(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { status: "active", scenarioId: PLAIN_SCENARIO, channel: "voice", ...extra };
}

test("[§79.5] 승인 — 표식 1건 write(acceptedAt · kind · path=realtime) · 세션 종료 필드 write 0", async () => {
  const { tx, updates } = makeTx({ [SESSION_REF]: activeSession() });
  const decision = await decideAndMarkRealtimeHangup(tx, REFS, CLAIMS, [], NOW);
  assert.equal(decision.status, "accepted");
  assert.equal(updates.length, 1);
  assert.equal(updates[0]!.ref, SESSION_REF);
  assert.deepEqual(Object.keys(updates[0]!.data), ["scammerHangup"], "표식 외 필드(status · endReason 등)를 썼다");
  assert.deepEqual(updates[0]!.data.scammerHangup, { acceptedAt: NOW, kind: "goal", path: "realtime" });
});

test("[§79.5 멱등] 표식이 이미 있으면 already_accepted · write 0(첫 승인의 값 유지)", async () => {
  const first = { acceptedAt: Timestamp.fromMillis(1), kind: "give_up", path: "realtime" };
  const { tx, updates } = makeTx({ [SESSION_REF]: activeSession({ scammerHangup: first }) });
  const decision = await decideAndMarkRealtimeHangup(tx, REFS, CLAIMS, [], NOW);
  assert.equal(decision.status, "already_accepted");
  assert.equal(decision.hangup, true);
  assert.equal(updates.length, 0);
});

test("[§79.5] 거절 행 — write 0(대조군: 같은 세션에서 조건만 풀면 write 1)", async () => {
  const rejected: ReadonlyArray<readonly [string, Docs, RealtimeHangupClaims, string]> = [
    ["끝난 세션", { [SESSION_REF]: activeSession({ status: "ended" }) }, CLAIMS, "not_active"],
    ["세션 문서 없음", { [SESSION_REF]: undefined }, CLAIMS, "not_active"],
    ["메신저 단계", { [SESSION_REF]: activeSession({ channel: "messenger" }) }, CLAIMS, "wrong_channel"],
    ["턴 부족", { [SESSION_REF]: activeSession() }, { ...CLAIMS, userTurns: 2 }, "too_early"],
    ["문자 대기", { [SESSION_REF]: activeSession() }, { ...CLAIMS, pendingInstruction: true }, "blocked_pending"],
  ];
  for (const [label, docs, claims, status] of rejected) {
    const { tx, updates } = makeTx(docs);
    const decision = await decideAndMarkRealtimeHangup(tx, REFS, claims, [], NOW);
    assert.equal(decision.status, status, label);
    assert.equal(updates.length, 0, `${label}: 거절인데 표식을 썼다`);
  }
  const control = makeTx({ [SESSION_REF]: activeSession() });
  await decideAndMarkRealtimeHangup(control.tx, REFS, CLAIMS, [], NOW);
  assert.equal(control.updates.length, 1, "대조군이 write하지 않는다 — 위 write 0 단언이 공허하다");
});

test("[§79.2 #4] 확인 무력화 고급 세션 — 전환 전 blocked_transfer · placedAt 뒤 accepted", async () => {
  const session = activeSession({ scenarioId: VERIFY_SCENARIO, difficultyLevel: "advanced" });
  const before = makeTx({ [SESSION_REF]: session, [VERIFY_REF]: { announcedAt: NOW } });
  assert.equal((await decideAndMarkRealtimeHangup(before.tx, REFS, CLAIMS, [], NOW)).status, "blocked_transfer");
  assert.equal(before.updates.length, 0);
  assert.deepEqual(before.reads, [SESSION_REF, VERIFY_REF]);

  const noDoc = makeTx({ [SESSION_REF]: session });
  assert.equal((await decideAndMarkRealtimeHangup(noDoc.tx, REFS, CLAIMS, [], NOW)).status, "blocked_transfer");

  const after = makeTx({ [SESSION_REF]: session, [VERIFY_REF]: { placedAt: NOW } });
  assert.equal((await decideAndMarkRealtimeHangup(after.tx, REFS, CLAIMS, [], NOW)).status, "accepted");
  assert.equal(after.updates.length, 1);
});

test("[§79.2 #4] 확인 무력화 시나리오라도 고급이 아니면 막지 않고 verifyIntercept를 읽지도 않는다", async () => {
  for (const difficultyLevel of [undefined, "beginner", "intermediate"]) {
    const session = activeSession({ scenarioId: VERIFY_SCENARIO, difficultyLevel });
    const { tx, reads } = makeTx({ [SESSION_REF]: session });
    assert.equal((await decideAndMarkRealtimeHangup(tx, REFS, CLAIMS, [], NOW)).status, "accepted", String(difficultyLevel));
    assert.deepEqual(reads, [SESSION_REF], `${String(difficultyLevel)}: 불필요한 verifyIntercept read`);
  }
  assert.equal(isVerifyInterceptSession({ scenarioId: PLAIN_SCENARIO, difficultyLevel: "advanced" }), false);
  assert.equal(isVerifyInterceptSession({ scenarioId: VERIFY_SCENARIO, difficultyLevel: "advanced" }), true);
});

/** 주석을 걷어낸다 — 머리 주석의 "하지 않는 것" 목록이 스캔을 때리지 않게(자기 주석 함정). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"))
    .join(" ");
}

test("[§79.5 배선 역검증] 주석 제거 스캔은 코드 속 금지 토큰을 잡고 주석 속 토큰은 무시한다", () => {
  assert.ok(stripComments("const a = 1; // endReason").includes("endReason") === false);
  assert.ok(stripComments("update({ endReason: x })").includes("endReason"));
});

test("[§79.5 배선] 콜러블은 트랜잭션 안에서 판정한다 · 세션 종료 write 0 · LLM 경로 import 0", () => {
  const src = stripComments(readFileSync(path.resolve(__dirname, "../../../src/scammerHangup/index.ts"), "utf8"));
  const txAt = src.indexOf("db.runTransaction(");
  const decideAt = src.indexOf("decideAndMarkRealtimeHangup<");
  const scopeAt = src.indexOf("assertAnonymousChallengeScope(request.auth, session)");
  assert.ok(txAt >= 0 && decideAt > txAt, "판정이 runTransaction 안에 있지 않다");
  assert.ok(scopeAt >= 0 && scopeAt < txAt, "익명 범위 검사가 트랜잭션보다 앞에 있지 않다");
  for (const forbidden of ["endReason", "endedAt", "triggerReportGeneration", "../roleplay", "../llm", "secrets:"]) {
    assert.ok(!src.includes(forbidden), `index.ts에 \`${forbidden}\`가 있다 — 이 콜러블은 세션을 끝내지 않고 시크릿을 쓰지 않는다`);
  }
  const commit = stripComments(readFileSync(path.resolve(__dirname, "../../../src/scammerHangup/commit.ts"), "utf8"));
  assert.equal(commit.split("tx.update(").length - 1, 1, "commit.ts의 write 지점은 표식 1곳뿐이어야 한다");
});

// ── T192 C3 — 6행 서버 항(문자 대기 · §79.19 (4) · G554) · 판독 순서(G558) ────────────────────────────
test("[G554] 콜러블 판정 — 서버 도착 기록으로 문자 대기를 본다(클라가 pendingInstruction:false라도 막는다) · 발화 뒤에는 승인", async () => {
  const delivered = [{ smsId: "sms-1", userTurnsAtArrival: 5 }];
  const waiting = makeTx({ [SESSION_REF]: activeSession() });
  const blocked = await decideAndMarkRealtimeHangup(waiting.tx, REFS, CLAIMS, delivered, NOW);
  assert.deepEqual([blocked.status, blocked.row], ["blocked_pending", "6"]);
  assert.equal(waiting.updates.length, 0, "문자 대기인데 표식을 썼다");
  // 대조군 — 같은 도착 기록 · 참가자가 한 번 더 말한 뒤(userTurns 6)는 승인.
  const spoke = makeTx({ [SESSION_REF]: activeSession() });
  assert.equal((await decideAndMarkRealtimeHangup(spoke.tx, REFS, { ...CLAIMS, userTurns: 6 }, delivered, NOW)).status, "accepted");
  assert.equal(spoke.updates.length, 1);
});

test("[G558 · §79.19 (4) 배선] 핸들러 — 판독은 세션 read 앞 · 도착 기록은 문자 선언 세션에서만 · 트랜잭션 밖에서 읽는다", () => {
  const src = stripComments(readFileSync(path.resolve(__dirname, "../../../src/scammerHangup/index.ts"), "utf8"));
  const readAt = src.indexOf("readScammerHangupRequest(request.data)");
  const loadAt = src.indexOf("await loadOwnedSession(");
  const deliveredAt = src.indexOf("readDeliveredSms(");
  const txAt = src.indexOf("db.runTransaction(");
  assert.ok(readAt >= 0 && loadAt > readAt, "요청 판독이 세션 read보다 앞에 있지 않다(G558)");
  assert.ok(deliveredAt > loadAt && deliveredAt < txAt, "도착 기록 read가 소유권 확인 뒤 · 트랜잭션 앞이 아니다");
  assert.match(
    src,
    /sessionDeclaresInCallSms\(session\.scenarioId, session\.flowVariantId\)\s*\?\s*await readDeliveredSms\(/,
    "도착 기록 read가 문자 선언 술어에 묶여 있지 않다",
  );
  assert.ok(src.includes("{ userTurns, pendingInstruction, kind }"), "claims 모양이 §79.19 (6) ③과 다르다");
  assert.ok(/logger\.info\("사기범 끊기 판정", \{[^}]*userTurns,?[^}]*\}/.test(src), "판정 로그에 userTurns가 없다");
  // 판독 함수가 하나뿐이다(핸들러 안에 옛 개별 판독기를 다시 두지 않는다).
  assert.equal(/function read[A-Z]\w*\(/.test(src), false, "핸들러에 개별 판독 함수가 다시 생겼다 — readRequest.ts 하나로");
});

// ── T192 C6-R · G590(Architecture.md §79.20 (3) ① · (11)) — 실시간 경로는 문서 상태와 무관하게 4행 그대로 ───────────
test("[G590] 실시간 콜러블 — 계열 B 고급 6종 · 오퍼 문서 없음이어도 blocked_transfer(C6-R 전과 같음) · write 0", async () => {
  const seriesB = ["institutional-impersonation", "card-company-impersonation", "loan-refinance-scam", "tax-refund-scam", "courier-customs-scam", "card-delivery-call"];
  for (const scenarioId of seriesB) {
    const session = activeSession({ scenarioId, difficultyLevel: "advanced" });
    for (const [label, docs] of [
      ["문서 없음", { [SESSION_REF]: session }],
      ["문서 있음 · 전환 전", { [SESSION_REF]: session, [VERIFY_REF]: { announcedAt: NOW } }],
    ] as const) {
      const { tx, updates } = makeTx(docs as Docs);
      assert.equal((await decideAndMarkRealtimeHangup(tx, REFS, CLAIMS, [], NOW)).status, "blocked_transfer", `${scenarioId} ${label}`);
      assert.equal(updates.length, 0);
    }
  }
});
