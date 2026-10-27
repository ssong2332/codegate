// ⭐ §135(2026-10-25 실기 신고 3건 · 갤럭시 Chrome 155) — 말 끊김의 갈래(재생 공백 · 서버 끼어들기 · 사고 문장 게이트 · 말하는 중 주입)와
// 통화별 요약(경로 · 정규화 · 감쇠)을 진단 패널에 싣는다. 제품 동작은 바꾸지 않는다(진단만).
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 이 파일 안에서만 `\r\n`→`\n`으로 정규화해 읽는다(`callAudio.test.ts` 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AUDIO_DIAG_KEYS,
  CALL_HISTORY_MAX,
  PLAY_GAP_MIN_MS,
  buildAudioDiagRows,
  noteAccept,
  noteContextWhileSpeaking,
  noteInterrupt,
  noteOutputPath,
  notePlayGap,
  noteThoughtCut,
  playGapMs,
  readAudioDiag,
  resetAudioDiagForTest,
} from "./audioDiagnostics.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const rowsOf = () =>
  Object.fromEntries(
    buildAudioDiagRows({
      snapshot: readAudioDiag(),
      callMode: "live",
      status: "active",
      provider: "gemini",
      audioRoute: "speaker",
      credentialsPrefetched: true,
      acceptToCredentialsMs: 0,
      userActivation: null,
      browser: "Chrome 155 · Android",
      flags: { audioPrime: true, ringCloseImmediate: false },
    }),
  );

test("[§135 공백] 턴 진행 중 · 앞 예약이 끝난 뒤 도착한 청크만 공백이다", () => {
  assert.equal(playGapMs({ turnInProgress: true, nextPlayTime: 10, currentTime: 10.25 }), 250);
  assert.equal(playGapMs({ turnInProgress: true, nextPlayTime: 10, currentTime: 9.5 }), 0, "아직 재생할 것이 남음");
  assert.equal(playGapMs({ turnInProgress: false, nextPlayTime: 10, currentTime: 30 }), 0, "새 턴의 첫 청크");
  assert.equal(playGapMs({ turnInProgress: true, nextPlayTime: 0, currentTime: 30 }), 0, "끊긴 뒤 0으로 되돌린 시각");
});

test("[§135 공백] 하한 미만은 세지 않고 · 최대 길이를 남긴다", () => {
  resetAudioDiagForTest();
  notePlayGap(PLAY_GAP_MIN_MS - 1);
  notePlayGap(0);
  notePlayGap(120.4);
  notePlayGap(40);
  const v = rowsOf();
  assert.equal(v["play.gaps"], "2");
  assert.equal(v["play.gapMaxMs"], "120");
});

test("[§135 끊김] 끼어들기 전체/재생 중 · 사고 문장 · 말하는 중 주입을 따로 센다", () => {
  resetAudioDiagForTest();
  noteInterrupt(true);
  noteInterrupt(false);
  noteThoughtCut();
  noteContextWhileSpeaking();
  noteContextWhileSpeaking();
  const v = rowsOf();
  assert.equal(v["cut.int"], "2/1");
  assert.equal(v["cut.thought"], "1");
  assert.equal(v["cut.ctx"], "2");
});

test("[§135 통화별] 받기마다 앞 통화를 요약에 남긴다 · 최근 것이 앞 · 상한 개수", () => {
  resetAudioDiagForTest();
  noteAccept(0); // 첫 받기 — 앞 통화 없음
  assert.equal(rowsOf().hist, "-");
  noteOutputPath("after-mic");
  notePlayGap(50);
  noteInterrupt(true);
  noteAccept(1000);
  assert.equal(rowsOf().hist, "after-mic f- n- t- g1 i1");
  noteOutputPath("fallback-primed");
  noteAccept(2000);
  assert.equal(rowsOf().hist, "fallback-primed f- n- t- g0 i0 | after-mic f- n- t- g1 i1");
  for (let i = 0; i < CALL_HISTORY_MAX + 2; i += 1) noteAccept(3000 + i);
  assert.equal(readAudioDiag().history.length, CALL_HISTORY_MAX);
  // 받기는 통화별 값을 비운다(요약은 남는다).
  assert.equal(rowsOf()["play.gaps"], "0");
});

test("[§135 행 순서] chunk.lastMs 뒤 끊김 5행 · err.last 뒤 hist", () => {
  const i = AUDIO_DIAG_KEYS.indexOf("chunk.lastMs");
  assert.deepEqual(AUDIO_DIAG_KEYS.slice(i, i + 6), [
    "chunk.lastMs",
    "play.gaps",
    "play.gapMaxMs",
    "cut.int",
    "cut.thought",
    "cut.ctx",
  ]);
  const j = AUDIO_DIAG_KEYS.indexOf("err.last");
  assert.deepEqual(AUDIO_DIAG_KEYS.slice(j, j + 3), ["err.last", "hist", "browser"]);
});

test("[§135 배선] 세션 — 공백은 예약 직전 · 끼어들기는 재생 정지 전 · 사고 게이트 · 주입 두 곳", () => {
  const src = read("./GeminiVoiceSession.tsx");
  const gap = src.indexOf("notePlayGap(playGapMs({ turnInProgress, nextPlayTime, currentTime: outputContext.currentTime }));");
  assert.ok(gap > 0);
  assert.ok(gap < src.indexOf("const startAt = Math.max(outputContext.currentTime, nextPlayTime);"));
  const intr = src.indexOf("noteInterrupt(outputContext ? nextPlayTime - outputContext.currentTime > 0 : false);");
  assert.ok(intr > 0);
  assert.ok(intr < src.indexOf("stopAllPlayback();", intr), "nextPlayTime을 0으로 되돌리기 전에 잰다");
  assert.ok(src.includes("noteThoughtCut(); // §135 진단 — 앱이 지운 끊김\n            stopAllPlayback();"));
  assert.equal((src.match(/noteContextWhileSpeaking\(\); \/\/ §135 진단/g) ?? []).length, 2);
  // 사본 ref는 게이트 값과 함께 움직인다(켜기 1 · 끄기 1 · 세션 시작 초기화 1).
  assert.equal((src.match(/agentSpeakingRef\.current = (true|false);/g) ?? []).length, 3);
});
