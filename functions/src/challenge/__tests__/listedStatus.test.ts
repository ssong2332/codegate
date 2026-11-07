// D6(2026-11-07 Edge 실사용 시험 판 33) — 링크 만료(3일)가 지난 미사용 챌린지가 목록에서 "대기"로 보였다. 서버는 `status`를
// "expired"로 쓰지 않고(만료는 `linkExpiresAt`을 읽는 쪽이 판정), 목록 콜러블은 저장된 `status`를 그대로 내보냈다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decideConsentGate, listedChallengeStatus } from "../consentGate";
import type { ChallengeStatus } from "../../shared/types";

const NOW = Date.parse("2026-11-07T12:00:00+09:00");
const DAY = 24 * 60 * 60 * 1000;

test("[D6] pending ∧ 만료 경과 → expired · 만료 전 · 경계 시각", () => {
  // 판 33의 10-17 · 10-30 생성분(만료 = 생성 + 3일) — 둘 다 지났다.
  assert.equal(listedChallengeStatus("pending", Date.parse("2026-10-20T10:00:00+09:00"), NOW), "expired");
  assert.equal(listedChallengeStatus("pending", Date.parse("2026-11-02T10:00:00+09:00"), NOW), "expired");
  assert.equal(listedChallengeStatus("pending", NOW + DAY, NOW), "pending");
  // 경계 = 동의 게이트와 같은 `<=`(userAccess.ts `linkExpiresAt.toMillis() <= Date.now()`).
  assert.equal(listedChallengeStatus("pending", NOW, NOW), "expired");
});

test("[D6] pending 밖 상태는 만료와 무관하게 그대로다(동의 뒤 재개는 보존기간을 따른다)", () => {
  const others: ChallengeStatus[] = ["consented", "in_progress", "completed", "expired", "reported", "deleted"];
  for (const status of others) {
    assert.equal(listedChallengeStatus(status, NOW - 10 * DAY, NOW), status, status);
  }
});

test("[D6] 목록 표기 = 동의 게이트 판정 — 목록이 '만료'면 그 링크는 실제로 거부된다", () => {
  for (const expiresAt of [NOW - DAY, NOW, NOW + DAY]) {
    const listed = listedChallengeStatus("pending", expiresAt, NOW);
    const gate = decideConsentGate({
      linkExpired: expiresAt <= NOW,
      retentionExpired: false,
      status: "pending",
      existingSessionUid: null,
      callerUid: "u2",
    });
    assert.equal(listed === "expired", gate.action === "reject", `expiresAt=${expiresAt - NOW}`);
  }
});

test("[D6] listMyChallenges가 저장된 status를 그대로 내보내지 않고 listedChallengeStatus를 거친다(배선)", () => {
  const src = readFileSync(join(__dirname, "../../../src/challenge/index.ts"), "utf8");
  const start = src.indexOf("export const listMyChallenges");
  assert.ok(start >= 0);
  const body = src.slice(start, src.indexOf("return { challenges };", start));
  assert.match(body, /status: listedChallengeStatus\(data\.status, data\.linkExpiresAt\.toMillis\(\), nowMs\)/);
  assert.doesNotMatch(body, /status: data\.status,/);
});
