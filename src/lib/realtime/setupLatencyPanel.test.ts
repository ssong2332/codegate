// 2026-10-27(실기 신고 — 첫 발화까지 17초) — 휴대폰에서 콘솔 없이 첫 발화 준비 구간을 읽게 진단 패널에 `setup.*` 행을 싣는다.
// 값은 받기 기준 누적 ms다(받기가 없으면 마운트 기준). 제품 동작은 바꾸지 않는다(진단만).
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 이 파일 안에서만 `\r\n`→`\n`으로 정규화해 읽는다(`callAudio.test.ts` 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AUDIO_DIAG_KEYS,
  buildAudioDiagRows,
  formatSetupFirstMs,
  formatSetupLive,
  formatSetupPrep,
  readAudioDiag,
  resetAudioDiagForTest,
  type SetupMarksLike,
} from "./audioDiagnostics.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const rowsOf = (setupMarks?: SetupMarksLike) => {
  resetAudioDiagForTest();
  return Object.fromEntries(
    buildAudioDiagRows({
      snapshot: readAudioDiag(),
      callMode: "live",
      status: "active",
      provider: "gemini",
      audioRoute: "speaker",
      credentialsPrefetched: true,
      acceptToCredentialsMs: 0,
      setupMarks,
      userActivation: null,
      browser: "Chrome 155 · Android",
      flags: { audioPrime: true, ringCloseImmediate: false },
    }),
  );
};

test("준비 구간 행은 acceptToCredMs 바로 뒤에 세 줄로 놓인다", () => {
  const i = AUDIO_DIAG_KEYS.indexOf("acceptToCredMs");
  assert.deepEqual(AUDIO_DIAG_KEYS.slice(i, i + 4), ["acceptToCredMs", "setup.firstMs", "setup.prep", "setup.live"]);
});

test("받기 기준 누적 ms로 보여 준다 — 첫 발화 17초 통화", () => {
  const marks: SetupMarksLike = {
    accept: 1000,
    credentialsReady: 1800,
    micGranted: 2200,
    mount: 2300,
    micReady: 2900,
    connectResolved: 3400,
    openingSent: 3500,
    firstAudio: 18000,
  };
  const rows = rowsOf(marks);
  assert.equal(rows["setup.firstMs"], "17000");
  assert.equal(rows["setup.prep"], "cred:800 mic:1200 out:1900");
  assert.equal(rows["setup.live"], "conn:2400 open:2500 1st:17000");
});

test("받기가 없으면(새로고침 재개) 마운트 기준이고, 아직 안 찍힌 단계는 빠진다", () => {
  const marks: SetupMarksLike = { mount: 500, micReady: 900, connectResolved: 700 };
  assert.equal(formatSetupFirstMs(marks), "-");
  assert.equal(formatSetupPrep(marks), "out:400");
  assert.equal(formatSetupLive(marks), "conn:200");
});

test("표시가 하나도 없으면 세 행 모두 '-'", () => {
  const rows = rowsOf(undefined);
  assert.equal(rows["setup.firstMs"], "-");
  assert.equal(rows["setup.prep"], "-");
  assert.equal(rows["setup.live"], "-");
  assert.equal(formatSetupPrep({ accept: 10 }), "-");
});

test("패널이 통화 준비 표시를 그대로 넘긴다", () => {
  const src = read("../../components/AudioDebugPanel.tsx");
  assert.match(src, /const setupMarks = readCallSetupMarks\(\);/);
  assert.match(src, /buildCallSetupRecord\(setupMarks, \{\}\)/);
  assert.match(src, /\n\s+setupMarks,\n/);
});
