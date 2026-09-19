// 자체 감사 결함 5 — createChallenge(displayName)·reportChallenge(note) 자유 텍스트 길이 상한.
// rewind/judge.ts의 REWIND_ANSWER_MAX_LENGTH=500 선례를 따라 조용히 자르지 않고 거절한다.
//
// createChallenge/reportChallenge는 Firestore·시크릿에 의존하는 `onCall` 핸들러라 유닛 계층에서
// 직접 실행할 수 없다(이 디렉터리의 기존 판단 — sendMessageLengthGate.test.ts와 동일 이유).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  CHALLENGE_DISPLAY_NAME_MAX_LENGTH,
  CHALLENGE_REPORT_NOTE_MAX_LENGTH,
} from "../../shared/constants";

const INDEX_SRC = path.resolve(__dirname, "../../../src/challenge/index.ts");
const USER_ACCESS_SRC = path.resolve(__dirname, "../../../src/challenge/userAccess.ts");

test("[상수] CHALLENGE_DISPLAY_NAME_MAX_LENGTH === 50, CHALLENGE_REPORT_NOTE_MAX_LENGTH === 500", () => {
  assert.equal(CHALLENGE_DISPLAY_NAME_MAX_LENGTH, 50);
  assert.equal(CHALLENGE_REPORT_NOTE_MAX_LENGTH, 500);
});

test("[displayName] 51자(초과) ⇒ 핸들러와 동일한 부등식이 거절 조건을 참으로 판정한다", () => {
  const displayName = "가".repeat(CHALLENGE_DISPLAY_NAME_MAX_LENGTH + 1);
  assert.equal(displayName.length > CHALLENGE_DISPLAY_NAME_MAX_LENGTH, true);
});

test("[displayName] 50자(경계) ⇒ 통과", () => {
  const displayName = "가".repeat(CHALLENGE_DISPLAY_NAME_MAX_LENGTH);
  assert.equal(displayName.length > CHALLENGE_DISPLAY_NAME_MAX_LENGTH, false);
});

test("[note] 501자(초과) ⇒ 거절 조건 참", () => {
  const note = "가".repeat(CHALLENGE_REPORT_NOTE_MAX_LENGTH + 1);
  assert.equal(note.length > CHALLENGE_REPORT_NOTE_MAX_LENGTH, true);
});

test("[note] 500자(경계) ⇒ 통과", () => {
  const note = "가".repeat(CHALLENGE_REPORT_NOTE_MAX_LENGTH);
  assert.equal(note.length > CHALLENGE_REPORT_NOTE_MAX_LENGTH, false);
});

test("[소스 스캔] createChallenge — displayName 길이 검사가 존재하고 invalid-argument로 거절한다", () => {
  const src = readFileSync(INDEX_SRC, "utf8");
  const idx = src.indexOf("if (displayName.length > CHALLENGE_DISPLAY_NAME_MAX_LENGTH)");
  assert.ok(idx > -1, "displayName 길이 검사가 사라졌다");
  const block = src.slice(idx, idx + 200);
  assert.match(block, /HttpsError\(\s*\n?\s*"invalid-argument"/, "거절 코드가 invalid-argument가 아니다");
  assert.doesNotMatch(block, /\.slice\(/, "길이 초과 시 조용히 잘라서는 안 된다(AC-039)");
});

test("[소스 스캔] createChallenge — 길이 검사가 활성 챌린지 개수 조회(Firestore)보다 앞이다", () => {
  const src = readFileSync(INDEX_SRC, "utf8");
  const lengthCheckIdx = src.indexOf("if (displayName.length > CHALLENGE_DISPLAY_NAME_MAX_LENGTH)");
  const activeSnapIdx = src.indexOf("const activeSnap = await db");
  assert.ok(lengthCheckIdx > -1 && activeSnapIdx > -1);
  assert.ok(
    lengthCheckIdx < activeSnapIdx,
    "길이 검사가 Firestore 조회보다 뒤에 있다 — 거절되는 요청도 read를 태운다",
  );
});

test("[소스 스캔] reportChallenge — note 길이 검사가 존재하고 invalid-argument로 거절한다", () => {
  const src = readFileSync(USER_ACCESS_SRC, "utf8");
  const idx = src.indexOf("if (note && note.length > CHALLENGE_REPORT_NOTE_MAX_LENGTH)");
  assert.ok(idx > -1, "note 길이 검사가 사라졌다");
  const block = src.slice(idx, idx + 200);
  assert.match(block, /HttpsError\(\s*\n?\s*"invalid-argument"/, "거절 코드가 invalid-argument가 아니다");
  assert.doesNotMatch(block, /\.slice\(/, "길이 초과 시 조용히 잘라서는 안 된다(AC-039)");
});

test("[소스 스캔] reportChallenge — 길이 검사가 resolveChallengeByTokenHash(Firestore 조회)보다 앞이다", () => {
  const src = readFileSync(USER_ACCESS_SRC, "utf8");
  const start = src.indexOf("export const reportChallenge = onCall<");
  const nextExport = src.indexOf("/** T9 리포트에서 챌린지 결과 요약을 파생한다");
  assert.ok(start > -1 && nextExport > start, "reportChallenge 정의를 찾을 수 없다");
  const body = src.slice(start, nextExport);
  const lengthCheckIdx = body.indexOf("if (note && note.length > CHALLENGE_REPORT_NOTE_MAX_LENGTH)");
  const resolveIdx = body.indexOf("const resolved = await resolveChallengeByTokenHash(hashToken(token));");
  assert.ok(lengthCheckIdx > -1 && resolveIdx > -1);
  assert.ok(lengthCheckIdx < resolveIdx, "길이 검사가 Firestore 조회보다 뒤에 있다");
});
