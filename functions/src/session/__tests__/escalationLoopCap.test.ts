// 저장소 감사(2026-11-17) 꼭 고칠 것 3 — 메신저 ↔ 통화 전환 반복으로 유료 호출 · Live 토큰이 무제한이 되던 경로.
// 사용자 결정 "최대 3번"(A-3): 판정표 C4(메신저 → 통화 기록 3개면 전이 없음) + 두 전환 콜러블의 세션 한도 거절.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Timestamp } from "firebase-admin/firestore";
import { PUBLIC_SCENARIOS } from "../../scenarios/publicMeta";
import { MAX_VOICE_ESCALATIONS, resolveSessionEscalation, resolveTransitionNow } from "../../scenarios/escalation";
import { transitionSessionLimitReached } from "../channelTransition";
import { realtimeIssueLegKey } from "../../realtime/issueBudget";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const toVoice = { from: "messenger", to: "voice" } as const;
const toMessenger = { from: "voice", to: "messenger" } as const;
const historyWith = (n: number) => Array.from({ length: n }, () => [toVoice, toMessenger]).flat();

test("[C4] 통화로 3번 넘어갔으면 더 넘어가지 않는다 · 2번까지는 종전 그대로", () => {
  assert.equal(MAX_VOICE_ESCALATIONS, 3);
  const base = { scenarioId: "messenger-subsidy-smishing-sms", difficultyLevel: "beginner" };
  const config = resolveSessionEscalation(base, PUBLIC_SCENARIOS);
  assert.ok(config, "전제 — 통화로 이어지는 시나리오");
  for (const n of [0, 1, 2]) {
    assert.deepEqual(resolveTransitionNow({ ...base, channelHistory: historyWith(n) }, PUBLIC_SCENARIOS), config, `${n}번 넘어간 뒤 허용`);
  }
  assert.equal(resolveTransitionNow({ ...base, channelHistory: historyWith(3) }, PUBLIC_SCENARIOS), undefined, "3번 넘어간 뒤 거절");
  assert.equal(resolveTransitionNow({ ...base, channelHistory: historyWith(10) }, PUBLIC_SCENARIOS), undefined, "반복 공격");
  // 토큰 예산 구간 키도 voice1 ~ voice3 안에 묶인다(전이가 막히면 새 구간이 안 생긴다).
  assert.equal(realtimeIssueLegKey({ channelHistory: historyWith(3) as never }, undefined), "voice3");
});

test("[세션 한도] 전환 콜러블 판정 — 턴 · 시간 한도(기존 isSessionLimitReached · 기점 = 받은 시각, 없으면 생성 시각)", () => {
  const created = Timestamp.fromMillis(1_000_000);
  const base = { turnCount: 3, maxUserTurns: 14, createdAt: created, maxSessionMs: 60 * 60_000 };
  assert.equal(transitionSessionLimitReached(base, 1_000_000 + 10 * 60_000), false, "한도 안");
  assert.equal(transitionSessionLimitReached({ ...base, turnCount: 14 }, 1_000_000), true, "턴 한도");
  assert.equal(transitionSessionLimitReached(base, 1_000_000 + 60 * 60_000), true, "시간 한도(생성 시각 기점)");
  const answered = Timestamp.fromMillis(1_000_000 + 30 * 60_000);
  assert.equal(transitionSessionLimitReached({ ...base, answeredAt: answered }, 1_000_000 + 60 * 60_000), false, "받은 시각 기점");
});

test("[배선] 두 전환 콜러블이 전이 전에 세션 한도를 본다", () => {
  const session = read("session/index.ts");
  for (const name of ["requestEscalation", "requestReverseEscalation"]) {
    const start = session.indexOf(`export const ${name} = onCall<`);
    assert.ok(start >= 0, name);
    const body = session.slice(start, session.indexOf("await transitionChannel(", start));
    assert.ok(body.includes("transitionSessionLimitReached(session, Date.now())"), `${name}: 전이 전 세션 한도 판정`);
  }
});
