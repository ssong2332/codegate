// §113.2(실기 신고 9 · 사용자 결정 2026-10-23) — 사진 보내기 턴: 서버는 사실만 남기고, 리포트는 요구 뒤 사진을 속은 순간으로 잡는다(H3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import { PHOTO_DEMAND, PHOTO_TURN_TEXT } from "../../roleplay/photoTurn";

const SRC = path.resolve(__dirname, "../../../src");
const readSrc = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const TACTICS = [
  "다급함 조성 — '지금 당장' 처럼 시간 압박만 준다.",
  "신원정보 직접 요구 — '보험 접수에 엄마 신분증 사진이 필요하대, 찍어서 보내 줘' 처럼 신분증 사진을 직접 요구한다.",
];
const msg = (turnIndex: number, role: "scammer" | "user", textMasked: string, photo = false): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: 1000 * (turnIndex + 1),
  channel: "messenger",
  ...(photo ? { photo: true as const } : {}),
});

test("[§113.2 H3] 신분증 · 사진 요구 뒤의 사진 턴 = 속은 순간 · 라벨은 요구한 대사의 수법", () => {
  const result = analyzeConversation(
    [
      msg(0, "scammer", "엄마 보험 접수하려면 신분증 사진 찍어서 보내줘"),
      msg(1, "user", "잠깐만 기다려 봐"),
      msg(2, "scammer", "빨리 지금 당장 해줘"),
      msg(3, "user", PHOTO_TURN_TEXT, true),
    ],
    0,
    TACTICS,
  );
  assert.equal(result.wasDeceived, true);
  assert.equal(result.deceivedMoments.length, 1);
  assert.equal(result.deceivedMoments[0].turnIndex, 3);
  assert.equal(result.deceivedMoments[0].tactic, "신원정보 직접 요구");
});

test("[§113.2 H3] 요구 없이 보낸 사진은 판정하지 않는다 · 의심 어휘가 붙은 대사 뒤에도 사진을 보냈으면 속음", () => {
  const noDemand = analyzeConversation([msg(0, "scammer", "엄마 나 폰 고장 났어"), msg(1, "user", PHOTO_TURN_TEXT, true)], 0, TACTICS);
  assert.equal(noDemand.wasDeceived, false);
  const sent = analyzeConversation(
    [msg(0, "scammer", "신분증 사진 보내줘"), msg(1, "user", PHOTO_TURN_TEXT, true)],
    0,
    TACTICS,
  );
  assert.equal(sent.wasDeceived, true);
  // 글 "사진" 낱말만 있는 참가자 턴(photo 표식 없음)은 H3가 아니다.
  const typed = analyzeConversation([msg(0, "scammer", "신분증 사진 보내줘"), msg(1, "user", "사진은 못 보내 사기지?")], 0, TACTICS);
  assert.equal(typed.wasDeceived, false);
});

test("[§113.2] 요구 판정 · 서버 사진 턴 — 이미지 필드 0 · 고정 문장 + photo 표식 · 리포트 입력 배선", () => {
  assert.ok(PHOTO_DEMAND.test("신분증 찍어서 보내줘"));
  assert.ok(PHOTO_DEMAND.test("사진 좀 보내"));
  assert.equal(PHOTO_DEMAND.test("돈 좀 보내줘"), false);
  const index = readSrc("roleplay/index.ts");
  assert.match(index, /const isPhotoTurn = photo === true;\s*const userText = isPhotoTurn \? PHOTO_TURN_TEXT : request\.data\?\.userText;/);
  assert.match(index, /\.\.\.\(isPhotoTurn \? \{ photo: true as const \} : \{\}\),/);
  // 요청 타입에 이미지 · 파일 정보 필드가 없다(사실만).
  const types = readSrc("roleplay/types.ts");
  const request = types.slice(types.indexOf("export type SendMessageRequest"), types.indexOf("export type SendMessageResponse"));
  assert.equal(/image|file|base64|dataUrl|blob/i.test(request.replace(/\/\*\*[\s\S]*?\*\//g, "")), false);
  assert.match(readSrc("report/generateReportCore.ts"), /\.\.\.\(data\.photo === true \? \{ photo: true as const \} : \{\}\),/);
});
