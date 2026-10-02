// T181 C-3(docs/Architecture.md §69.7 · §69.8) — C(익명 + 빈 turns 즉시 거부)의 호출부 동형 스텁.
//
// `submitRealtimeTranscript`는 Firestore·트랜잭션에 의존하는 `onCall` 핸들러라 유닛 계층에서 직접
// 실행하지 않는다(consentChallengePreGate.test.ts:4-8과 같은 판단). 핸들러 머리(인증 → 인자 → 빈
// 분기의 denyAnonymous → 턴 수 상한 → Firestore 단계)를 **실제 denyAnonymous**로 재현하고, Firestore
// 단계 자리에 호출 횟수를 세는 스텁을 꽂는다. ⭐ 실제 소스가 이 모양이라는 것은
// shared/__tests__/anonymousGate.test.ts의 C-2(G427 위치 트립와이어 + 역검증)가 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { HttpsError } from "firebase-functions/v2/https";
import { ANONYMOUS_DENIED_MESSAGE, denyAnonymous } from "../../shared/anonymousGate";

const SRC = path.resolve(__dirname, "../../../src/realtime/submitTranscript.ts");

/** 턴 수 상한은 소스의 값을 그대로 읽는다 — 스텁이 다른 상한으로 통과하는 것을 막는다. */
const MAX_TURNS = ((): number => {
  const m = /const MAX_TURNS = (\d+);/.exec(readFileSync(SRC, "utf-8"));
  assert.ok(m, "submitTranscript.ts에서 MAX_TURNS 선언을 찾지 못했다 — 스텁 전제가 깨졌다");
  return Number(m[1]);
})();

type AuthArg = Parameters<typeof denyAnonymous>[0];
type StubRequest = { auth: AuthArg; data?: { sessionId?: unknown; turns?: unknown } };

/** submitTranscript.ts 핸들러 머리와 동형 — getFirestore() 이후(세션 read 트랜잭션)를 firestoreStage로 대체한다. */
function handlerHeadLikeCallSite(request: StubRequest, firestoreStage: () => number): { written: number } {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId, turns } = request.data ?? {};
  if (!sessionId || !Array.isArray(turns)) {
    throw new HttpsError("invalid-argument", "sessionId와 turns가 필요합니다.");
  }
  if (turns.length === 0) {
    denyAnonymous(request.auth);
    return { written: 0 };
  }
  if (turns.length > MAX_TURNS) {
    throw new HttpsError("invalid-argument", "제출 가능한 턴 수를 초과했습니다.");
  }
  return { written: firestoreStage() };
}

const ANONYMOUS: AuthArg = { token: { firebase: { sign_in_provider: "anonymous" } } };
const GOOGLE: AuthArg = { token: { firebase: { sign_in_provider: "google.com" } } };
const ONE_TURN = [{ role: "user", text: "여보세요" }];

/** Firestore 단계 도달 횟수를 센다(= 세션 read가 일어났는가). */
function counter(): { stage: () => number; calls: () => number } {
  let calls = 0;
  return {
    stage: () => {
      calls += 1;
      return 1;
    },
    calls: () => calls,
  };
}

function assertHttpsError(fn: () => unknown, code: string, label: string, message?: string): void {
  assert.throws(
    fn,
    (err: unknown) => {
      assert.ok(err instanceof HttpsError, `${label}: HttpsError가 아니다`);
      assert.equal(err.code, code, `${label}: 코드가 ${code}가 아니다`);
      if (message !== undefined) assert.equal(err.message, message, `${label}: 문구가 정본과 다르다`);
      return true;
    },
    `${label}: throw해야 한다`,
  );
}

test("[T181 C-3] 익명 + turns: [] ⇒ permission-denied(정본 문구) · Firestore 단계 0회 — 대상 세션 ID와 무관", () => {
  // 존재하지 않는 ID · 남의 세션 · 자기 챌린지 세션 — 서버는 세션을 읽지 않으므로 응답이 같아야 한다.
  for (const sessionId of ["nonexistent", "someone-elses-session", "own-challenge-session"]) {
    const firestore = counter();
    assertHttpsError(
      () => handlerHeadLikeCallSite({ auth: ANONYMOUS, data: { sessionId, turns: [] } }, firestore.stage),
      "permission-denied",
      `익명 + [] (sessionId=${sessionId})`,
      ANONYMOUS_DENIED_MESSAGE,
    );
    assert.equal(firestore.calls(), 0, `익명 + [] (sessionId=${sessionId}): 세션 read가 일어났다(read 0 위반)`);
  }
});

test("[T181 C-3 역방향 · AC-085 (d)] Google + turns: [] ⇒ { written: 0 } 그대로 · Firestore 단계 0회", () => {
  const firestore = counter();
  const result = handlerHeadLikeCallSite({ auth: GOOGLE, data: { sessionId: "s1", turns: [] } }, firestore.stage);
  assert.deepEqual(result, { written: 0 });
  assert.equal(firestore.calls(), 0);
});

test("[T181 C-3 역방향 · AC-085 (c)] 익명 + 1턴 ⇒ Firestore 단계 도달 — C는 비어 있지 않은 익명 제출을 막지 않는다", () => {
  const firestore = counter();
  const result = handlerHeadLikeCallSite({ auth: ANONYMOUS, data: { sessionId: "s1", turns: ONE_TURN } }, firestore.stage);
  assert.deepEqual(result, { written: 1 });
  assert.equal(firestore.calls(), 1, "익명의 정상 전사 제출이 Firestore 단계에 닿지 못했다 — 수신자 리포트가 빈다");
});

test("[T181 C-3] 익명 + turns 배열 아님 · 201턴 ⇒ invalid-argument(무변경) · Firestore 단계 0회", () => {
  const notArray = counter();
  assertHttpsError(
    () => handlerHeadLikeCallSite({ auth: ANONYMOUS, data: { sessionId: "s1", turns: "x" } }, notArray.stage),
    "invalid-argument",
    "익명 + 배열 아님",
  );
  assert.equal(notArray.calls(), 0);

  const tooMany = counter();
  const turns = Array.from({ length: MAX_TURNS + 1 }, () => ONE_TURN[0]);
  assertHttpsError(
    () => handlerHeadLikeCallSite({ auth: ANONYMOUS, data: { sessionId: "s1", turns } }, tooMany.stage),
    "invalid-argument",
    `익명 + ${MAX_TURNS + 1}턴`,
  );
  assert.equal(tooMany.calls(), 0);
});
