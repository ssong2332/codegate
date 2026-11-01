// §122(6) 실기 신고 2026-10-23 — 신분증 사진을 보낸 직후 사기범이 다음 요구 없이 채팅방을 나갔다(자녀 사칭 카톡 고급 fv-tdgg).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasStageAfterPhoto, isGoalBeforePhotoFollowUp, sessionVariantStageSummaries } from "../photoFollowUp";
import { PHOTO_TURN_TEXT } from "../photoTurn";

const KAKAO = "messenger-child-impersonation-kakao";
const STAGES = sessionVariantStageSummaries(KAKAO, "fv-tdgg");
const REPORTED_REPLY = "아빠 고마워, 잘 받았어. 확인해볼게. 지금 접수 처리 들어갔어.";
const DEMAND_PHOTO = { role: "scammer", textMasked: "근데 보험 접수하려면 아빠 신분증 사진도 같이 찍어서 보내줘야 된대." };
const PHOTO = { role: "user", textMasked: PHOTO_TURN_TEXT, photo: true as const };
const base = { channel: "messenger", endCall: "goal" as const, stageSummaries: STAGES, history: [DEMAND_PHOTO], isPhotoTurn: true };

test("§122(6) fv-tdgg는 사진 단계 뒤에 송금 단계가 남아 있다(P2)", () => {
  assert.equal(STAGES.length, 4);
  assert.equal(hasStageAfterPhoto(STAGES), true);
  assert.equal(hasStageAfterPhoto(["급한 돈 송금을 부탁한다.", "신분증 사진을 요구한다."]), false, "사진이 마지막 단계면 종전");
  assert.equal(hasStageAfterPhoto([]), false, "변형 없음 = 종전");
  assert.deepEqual(sessionVariantStageSummaries("other-scenario", "fv-tdgg"), [], "시나리오가 다른 변형은 쓰지 않는다");
});

test("§122(6) 신고 재현: 사진 턴 직후 목표 끊기는 받지 않는다(P5)", () => {
  assert.equal(isGoalBeforePhotoFollowUp(base), true);
});

test("§122(6) 사진 뒤 다음 턴에도 요구 없이 끝내면 받지 않는다 · 송금 요구를 꺼낸 뒤면 종전(P4)", () => {
  const afterPhoto = [DEMAND_PHOTO, PHOTO, { role: "scammer", textMasked: REPORTED_REPLY }, { role: "user", textMasked: "응" }];
  assert.equal(isGoalBeforePhotoFollowUp({ ...base, history: afterPhoto, isPhotoTurn: false }), true);
  const demanded = [...afterPhoto, { role: "scammer", textMasked: "그리고 수리비 50만 원만 이 계좌로 보내줘." }, { role: "user", textMasked: "싫어" }];
  assert.equal(isGoalBeforePhotoFollowUp({ ...base, history: demanded, isPhotoTurn: false }), false);
});

test("§122(6) 대상 밖은 종전 판정: 통화 단계 · 포기 끊기 · 사진 턴 없음", () => {
  assert.equal(isGoalBeforePhotoFollowUp({ ...base, channel: "voice" }), false, "P1 통화");
  assert.equal(isGoalBeforePhotoFollowUp({ ...base, endCall: "give_up" }), false, "P1 포기");
  assert.equal(isGoalBeforePhotoFollowUp({ ...base, endCall: undefined }), false, "P1 신호 없음");
  assert.equal(isGoalBeforePhotoFollowUp({ ...base, isPhotoTurn: false }), false, "P3 사진 없음");
  assert.equal(isGoalBeforePhotoFollowUp({ ...base, stageSummaries: [] }), false, "P2 변형 없음");
});

test("§122(6) sendMessage가 판정표 B 결과에 판정표 P를 덧대어 끊기 신호를 정한다", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/roleplay/index.ts"), "utf8");
  // R3(#465) — 판정 입력이 "이체 미완료 송금 확인 단정이면 목표 신호 제외"를 거친다(여러 줄).
  const b = src.indexOf("const endCallConsistency = judgeEndCallSignal(");
  const p = src.indexOf("isGoalBeforePhotoFollowUp({");
  const effect = src.indexOf("endCall: endCallSignal,");
  assert.ok(b > 0 && p > b && effect > p);
});
