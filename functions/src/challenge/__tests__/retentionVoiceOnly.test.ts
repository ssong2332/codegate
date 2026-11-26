// DECISIONS #258 — 챌린지 복제 음성 보존 = 링크 만료와 같은 3일, 만료 때 **음성만** 폐기(판정표 RT · purge.ts).
// 끝나는 시점별로 목록 · 결과 · 신고 · 재개가 어떻게 되는지 순수 판정 + 배선 스캔으로 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { CHALLENGE_DEFAULT_RETENTION_MS, CHALLENGE_FREE_LINK_EXPIRY_MS } from "../../shared/constants";
import { selectChallengesToPurge } from "../purge";
import { decideReport } from "../reportGate";
import { decideConsentGate, listedChallengeStatus } from "../consentGate";
import type { ChallengeStatus } from "../../shared/types";

const DAY = 24 * 60 * 60 * 1000;
const SRC = readFileSync(path.resolve(__dirname, "../../../src/challenge/index.ts"), "utf-8");

test("[보존] 복제 음성 보존 = 링크 만료 = 3일", () => {
  assert.equal(CHALLENGE_FREE_LINK_EXPIRY_MS, 3 * DAY);
  assert.equal(CHALLENGE_DEFAULT_RETENTION_MS, CHALLENGE_FREE_LINK_EXPIRY_MS);
});

test("[RT1~RT4] 만료 스캔이 고르는 챌린지", () => {
  const now = 100 * DAY;
  const ids = selectChallengesToPurge(
    [
      { id: "rt1-deleted", status: "deleted", retentionDeleteAtMs: now - 1 },
      { id: "rt2-not-due", status: "completed", retentionDeleteAtMs: now + 1 },
      { id: "rt3-due", status: "completed", retentionDeleteAtMs: now },
      { id: "rt4-done", status: "completed", retentionDeleteAtMs: now - DAY, retentionPurged: true },
    ],
    now,
  );
  assert.deepEqual(ids, ["rt3-due"]);
});

// RT3 뒤 상태는 그대로다(배선 시험이 고정). 그 상태로 각 기능이 어떻게 판정되는가.
const AFTER: { status: ChallengeStatus; listed: string; report: string; resume: string }[] = [
  { status: "pending", listed: "expired", report: "write", resume: "reject" }, // 링크도 만료 — 첫 동의 불가(종전)
  { status: "consented", listed: "expired", report: "write", resume: "reject" }, // 목록 표기는 종전 D6 규칙(만료)
  { status: "in_progress", listed: "expired", report: "write", resume: "reject" },
  { status: "completed", listed: "completed", report: "write", resume: "reject" },
  { status: "reported", listed: "reported", report: "already_reported", resume: "reject" },
];

test("[RT3 뒤] 목록에 남고(deleted 아님) · 신고 가능 · 재개만 막힌다", () => {
  const now = 10 * DAY;
  const linkExpiresAtMs = now - 1; // 보존 = 링크 만료와 같은 시각
  for (const row of AFTER) {
    const listed = listedChallengeStatus(row.status, linkExpiresAtMs, now);
    assert.equal(listed, row.listed, `${row.status} 목록`);
    assert.notEqual(listed, "deleted", `${row.status} — 목록에서 숨겨지면 안 된다(화면은 deleted만 숨김)`);
    assert.equal(decideReport(row.status), row.report, `${row.status} 신고`);
    const gate = decideConsentGate({
      linkExpired: true,
      retentionExpired: true,
      status: row.status,
      existingSessionUid: "u2",
      callerUid: "u2",
    });
    assert.equal(gate.action, row.resume, `${row.status} 재개`);
  }
});

test("[배선] 만료 스캔은 음성만 폐기(상태 · 결과 무변경) · deleted는 사용자 · 프로필 삭제만", () => {
  const scan = SRC.slice(SRC.indexOf("export const purgeExpiredChallenges"));
  assert.match(scan, /await purgeChallengeVoice\(id, data\.creatorUid, data\.voiceId\)/);
  assert.doesNotMatch(scan.split("// --- T37")[0]!, /await purgeChallenge\(/, "만료 스캔이 상태를 deleted로 바꾸면 결과가 사라진다");
  assert.match(scan, /retentionPurged: data\.retentionPurgedAt !== undefined/);
  const fnStart = SRC.indexOf("async function purgeChallengeVoice(");
  const body = SRC.slice(fnStart, SRC.indexOf("\n}\n", fnStart));
  assert.ok(fnStart > 0);
  assert.doesNotMatch(body, /status:/, "상태를 바꾸지 않는다");
  assert.doesNotMatch(body, /resultSummary/, "결과를 지우지 않는다");
  assert.match(body, /voiceId: FieldValue\.delete\(\)/);
  assert.match(body, /personaCard: FieldValue\.delete\(\)/);
  assert.match(body, /retentionPurgedAt: Timestamp\.now\(\)/);
  // 재개를 막는 두 검사는 그대로(retentionDeleteAt).
  const rt = readFileSync(path.resolve(__dirname, "../../../src/realtime/index.ts"), "utf-8");
  assert.match(rt, /withinRetention = challenge \? challenge\.retentionDeleteAt\.toMillis\(\) > Date\.now\(\)/);
});
