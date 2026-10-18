import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Timestamp } from "firebase-admin/firestore";
import {
  END_SESSION_ALLOWED_REASONS,
  readEndSessionReason,
  resolveRecordedEndReason,
} from "../endReason";

// T192 C1 · G508 — `endSession` 사유 허용목록 · 표식 없는 `scammer_ended` → `user_ended` · 멱등 유지
// (Architecture.md §79.5 `endSession` 행 · AC-006 "종료는 항상 성공" · AC-007 1리포트).
const SESSION_SRC = path.resolve(__dirname, "../../../src/session/index.ts");
const MARKER = { scammerHangup: { acceptedAt: Timestamp.fromMillis(1), kind: "goal" as const, path: "realtime" as const } };

test("[G508] 허용목록 = user_ended · limit_reached · scammer_ended(정확 일치)", () => {
  assert.deepEqual([...END_SESSION_ALLOWED_REASONS], ["user_ended", "limit_reached", "scammer_ended"]);
  for (const reason of END_SESSION_ALLOWED_REASONS) assert.equal(readEndSessionReason(reason), reason);
  // 타입에 남아 있는 completed · deceived(사용처 0)도 목록 밖이다(§79.5 — 그 밖 invalid-argument).
  for (const raw of ["completed", "deceived", "", "USER_ENDED", " user_ended", "scammer_ended ", undefined, null, 1, {}]) {
    assert.equal(readEndSessionReason(raw), null, JSON.stringify(raw));
  }
});

test("[G508] scammer_ended — 서버 표식이 있으면 그대로 · 없으면 user_ended(거절 0)", () => {
  assert.equal(resolveRecordedEndReason("scammer_ended", MARKER), "scammer_ended");
  assert.equal(resolveRecordedEndReason("scammer_ended", {}), "user_ended");
  assert.equal(resolveRecordedEndReason("scammer_ended", { scammerHangup: undefined }), "user_ended");
});

test("[G508] user_ended · limit_reached는 표식 유무와 무관하게 그대로", () => {
  for (const reason of ["user_ended", "limit_reached"] as const) {
    assert.equal(resolveRecordedEndReason(reason, {}), reason);
    assert.equal(resolveRecordedEndReason(reason, MARKER), reason);
  }
});

/** endSession 본문(다음 최상위 export 전까지). 줄바꿈 리터럴에 기대지 않는다. */
function endSessionBody(source: string): string {
  const start = source.indexOf("export const endSession =");
  assert.ok(start >= 0, "export const endSession = 를 찾지 못했다");
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

/** 배선 위반 목록(빈 배열 = 통과) — 오염 사본에 같은 판정을 적용해 역검증한다. */
function endSessionWiringViolations(body: string): string[] {
  const v: string[] = [];
  const at = (needle: string) => body.indexOf(needle);
  const readAt = at("readEndSessionReason(");
  const firestoreAt = at("getFirestore(");
  const idempotentAt = at("session.status === \"ended\"");
  const resolveAt = at("resolveRecordedEndReason(requestedReason, session)");
  const updateAt = at("sessionRef.update(");
  if (readAt < 0) v.push("허용목록 판독(readEndSessionReason) 호출이 없다");
  else if (firestoreAt >= 0 && readAt > firestoreAt) v.push("허용목록 판독이 Firestore 접근보다 뒤다");
  if (idempotentAt < 0) v.push("멱등 반환(이미 ended) 분기가 사라졌다");
  if (resolveAt < 0) v.push("기록값 결정(resolveRecordedEndReason) 호출이 없다");
  if (updateAt < 0) v.push("sessionRef.update 호출이 없다");
  if (idempotentAt >= 0 && updateAt >= 0 && idempotentAt > updateAt) v.push("멱등 반환이 write보다 뒤다(G425 · AC-007)");
  if (resolveAt >= 0 && updateAt >= 0 && resolveAt > updateAt) v.push("기록값 결정이 write보다 뒤다");
  if (updateAt >= 0 && !body.slice(updateAt).includes("endReason: recordedReason")) {
    v.push("write가 결정된 기록값이 아닌 값을 쓴다(클라 값 직기록)");
  }
  return v;
}

test("[G508 배선] endSession — 허용목록 판독 → 소유권 → 멱등 반환 → 기록값 결정 → write(결정값)", () => {
  assert.deepEqual(endSessionWiringViolations(endSessionBody(readFileSync(SESSION_SRC, "utf8"))), []);
});

test("[G508 배선 역검증] 클라 값을 그대로 쓰는 사본 · 멱등 분기를 지운 사본은 스캔에 걸린다", () => {
  const body = endSessionBody(readFileSync(SESSION_SRC, "utf8"));
  const rawWrite = body.replace("endReason: recordedReason", "endReason");
  assert.notEqual(rawWrite, body, "오염 대상 토큰을 찾지 못했다 — 역검증이 공허하다");
  assert.ok(endSessionWiringViolations(rawWrite).some((m) => m.includes("직기록")));
  const noIdempotent = body.replace("session.status === \"ended\"", "false");
  assert.notEqual(noIdempotent, body);
  assert.ok(endSessionWiringViolations(noIdempotent).some((m) => m.includes("멱등")));
  const noAllowlist = body.replace("readEndSessionReason(", "String(");
  assert.ok(endSessionWiringViolations(noAllowlist).some((m) => m.includes("허용목록")));
});
