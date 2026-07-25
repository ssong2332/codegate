import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRetrainTarget } from "./retrainTarget.ts";

// T74 / AC-068 — 아카이브 항목의 "이 시나리오 다시 훈련" 목적지(UX-030 Exit).

test("메신저 시나리오는 메신저 시나리오 목록으로, 시나리오가 미리 선택된 채 간다", () => {
  assert.deepEqual(resolveRetrainTarget("messenger-friend-loan-kakao", { channel: "messenger" }), {
    trainingType: "messenger",
    path: "/scenarios/messenger?scenarioId=messenger-friend-loan-kakao",
  });
});

test("보이스 generic 시나리오는 자기훈련 목록(generic)으로 간다", () => {
  assert.deepEqual(resolveRetrainTarget("loan-refinance-scam", { channel: "voice", voiceMode: "generic" }), {
    trainingType: "voice",
    path: "/scenarios/voice/generic?scenarioId=loan-refinance-scam",
  });
});

test("channel 필드가 없는 기존 보이스 시나리오도 generic 목록으로 간다(부재=voice)", () => {
  const target = resolveRetrainTarget("tax-refund-scam", { voiceMode: "generic" });
  assert.equal(target.trainingType, "voice");
  assert.equal(target.path, "/scenarios/voice/generic?scenarioId=tax-refund-scam");
});

test("보이스 clone 시나리오는 자기훈련 목록에 없으므로(AC-057) 유형 선택부터 다시 고르게 한다", () => {
  assert.deepEqual(resolveRetrainTarget("family-accident-deepvoice", { channel: "voice", voiceMode: "clone" }), {
    trainingType: null,
    path: "/scenarios",
  });
});

test("시나리오를 못 찾으면 없는 시나리오를 지목하지 않고 유형 선택으로 보낸다", () => {
  assert.deepEqual(resolveRetrainTarget(null, null), { trainingType: null, path: "/scenarios" });
  assert.deepEqual(resolveRetrainTarget("removed-scenario", undefined), {
    trainingType: null,
    path: "/scenarios",
  });
});

test("시나리오 id는 URL 인코딩된다", () => {
  const target = resolveRetrainTarget("a b&c", { channel: "messenger" });
  assert.equal(target.path, "/scenarios/messenger?scenarioId=a%20b%26c");
});
