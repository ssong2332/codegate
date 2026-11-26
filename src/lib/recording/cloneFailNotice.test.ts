// §146 — ① 클론 준비 실패 안내(판정표 CF · 화면 쪽) ② 목소리 보관 남은 일수(판정표 DL · 올림).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLONE_FAILED_MESSAGE,
  CLONE_SCRIPT_UNREADABLE_MESSAGE,
  CLONE_SCRIPT_UNREADABLE_REASON,
  cloneFailureMessage,
} from "./uploadedVoice.ts";
import { daysLeftLabel } from "../voices/voiceProfileConsent.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

test("[CF 화면] 대본 줄 인식 부족만 구체 안내 · 그 밖은 종전 문구", () => {
  const rows: [unknown, string][] = [
    [{ code: "functions/failed-precondition", details: { reason: CLONE_SCRIPT_UNREADABLE_REASON } }, CLONE_SCRIPT_UNREADABLE_MESSAGE], // CF1
    [{ code: "functions/failed-precondition", details: { reason: "other" } }, CLONE_FAILED_MESSAGE], // 녹음 파일 없음 등
    [{ code: "functions/internal", details: { reason: CLONE_SCRIPT_UNREADABLE_REASON } }, CLONE_FAILED_MESSAGE],
    [{ code: "functions/internal" }, CLONE_FAILED_MESSAGE], // CF2 GPU · 서버
    [{ code: "functions/deadline-exceeded" }, CLONE_FAILED_MESSAGE], // CF2 네트워크 · 시간 초과
    [new Error("network"), CLONE_FAILED_MESSAGE],
    [null, CLONE_FAILED_MESSAGE],
  ];
  for (const [err, want] of rows) assert.equal(cloneFailureMessage(err), want, JSON.stringify(err));
  assert.match(CLONE_SCRIPT_UNREADABLE_MESSAGE, /문장마다 잠깐 쉬며/);
  assert.match(CLONE_SCRIPT_UNREADABLE_MESSAGE, /다시 녹음하거나 다른 파일을 올려/);
});

test("[대조] 화면 사유 글자 = 서버 상수", () => {
  const server = read("functions/src/voice/provider.ts");
  assert.ok(server.includes(`export const CLONE_SCRIPT_UNREADABLE_REASON = "${CLONE_SCRIPT_UNREADABLE_REASON}";`));
});

test("[배선] 녹음 화면 — 클론 실패는 사유로 문구를 고르고(업로드 · 즉석 녹음 공통) · 업로드 안내에 쉼 조건", () => {
  const page = read("src/app/onboarding/record/page.tsx");
  assert.match(page, /setUploadError\(cloneFailureMessage\(err\)\);/);
  assert.doesNotMatch(page, /setUploadError\("목소리 클론 생성에 실패했습니다/, "고정 문구가 남아 있다");
  assert.equal(page.split("createVoiceClone(").length - 1, 1, "클론 호출은 한 곳(업로드 · 녹음 공통)");
  assert.match(page, /\{UPLOAD_SCRIPT_HINT\}/);
});

test("[DL] 남은 일수 올림 — 저장 직후 7일은 '7일 뒤 삭제'", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 1_000 * DAY;
  const rows: [number, string][] = [
    [-DAY, "오늘 삭제"], // DL1
    [0, "오늘 삭제"],
    [DAY / 2, "오늘 삭제"], // DL2
    [DAY - 1, "오늘 삭제"],
    [DAY, "1일 뒤 삭제"], // DL3 경계
    [DAY + 1, "2일 뒤 삭제"],
    [7 * DAY - 2_000, "7일 뒤 삭제"], // 라이브 재현(저장 → 화면 표시 사이 몇 초)
    [7 * DAY, "7일 뒤 삭제"],
    [30 * DAY - 60_000, "30일 뒤 삭제"],
  ];
  for (const [left, want] of rows) assert.equal(daysLeftLabel(now + left, now), want, String(left));
});
