// §140(2026-10-28 실 키 실측 — Live 연결 601초에 서버가 닫음 · close 1011 · goAway 0건) — 조용한 재연결 판정표(`liveResume.ts`)를
// 행마다 실행으로 고정하고, `GeminiVoiceSession` 배선 · 서버 토큰 수명과의 정합은 소스 단언으로 고정한다.
//
// ⚠️ CRLF 체크아웃(core.autocrlf=true)에서도 맞도록 소스는 이 파일 안에서만 `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LIVE_RESUME_WINDOW_MS,
  MAX_LIVE_RESUMES,
  closeCodeOf,
  decideGoAway,
  decideLiveClose,
  formatResumeReason,
  nextResumeHandle,
  type LiveCloseInput,
} from "./liveResume.ts";
import { AUDIO_DIAG_KEYS, buildAudioDiagRows, noteAccept, noteLiveResume, readAudioDiag, resetAudioDiagForTest } from "./audioDiagnostics.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const BASE: LiveCloseInput = {
  stopRequested: false,
  hangupLatched: false,
  backgroundDecision: "end",
  handle: "h1",
  resumesSoFar: 0,
  firstOpenAtMs: 1000,
  nowMs: 1000 + 601_000,
};

test("[§140 판정표 1] C1~C6 — 첫 일치 순서", () => {
  assert.equal(decideLiveClose({ ...BASE, stopRequested: true }), "end", "C1 사용자 끊기");
  assert.equal(decideLiveClose({ ...BASE, hangupLatched: true }), "end", "C1 끊기 래치");
  assert.equal(decideLiveClose({ ...BASE, hangupLatched: true, backgroundDecision: "reconnect" }), "end", "C1이 C2보다 먼저");
  assert.equal(decideLiveClose({ ...BASE, backgroundDecision: "reconnect" }), "background", "C2 §99 경로 유지");
  assert.equal(decideLiveClose({ ...BASE, handle: null }), "end", "C3 핸들 없음");
  assert.equal(decideLiveClose({ ...BASE, handle: "" }), "end", "C3 빈 핸들");
  assert.equal(decideLiveClose({ ...BASE, resumesSoFar: MAX_LIVE_RESUMES }), "end", "C4 횟수 상한");
  assert.equal(decideLiveClose({ ...BASE, resumesSoFar: MAX_LIVE_RESUMES - 1 }), "resume", "C4 상한 직전");
  assert.equal(decideLiveClose({ ...BASE, firstOpenAtMs: null }), "end", "C5 아직 안 열림");
  assert.equal(decideLiveClose({ ...BASE, nowMs: 1000 + LIVE_RESUME_WINDOW_MS }), "end", "C5 60분 창 밖");
  assert.equal(decideLiveClose({ ...BASE, nowMs: 1000 + LIVE_RESUME_WINDOW_MS - 1 }), "resume", "C5 창 안");
  assert.equal(decideLiveClose(BASE), "resume", "C6 — 실측 601초 close");
});

test("[§140] 60분 통화를 버티는 횟수 — 약 10분마다 끊겨도 상한 안", () => {
  assert.ok(MAX_LIVE_RESUMES >= Math.ceil(LIVE_RESUME_WINDOW_MS / 600_000));
});

test("[§140 판정표 2] goAway G1~G3", () => {
  assert.equal(decideGoAway({ ...BASE, modelBusy: false, handle: null }), "ignore", "G1");
  assert.equal(decideGoAway({ ...BASE, modelBusy: false, stopRequested: true }), "ignore", "G1 끊기");
  assert.equal(decideGoAway({ ...BASE, modelBusy: true }), "later", "G2");
  assert.equal(decideGoAway({ ...BASE, modelBusy: false }), "now", "G3");
});

test("[§140] 핸들 갱신 — 이어받을 수 없는 순간에는 앞서 받은 핸들 유지", () => {
  assert.equal(nextResumeHandle(null, undefined), null);
  assert.equal(nextResumeHandle(null, { newHandle: "a", resumable: true }), "a");
  assert.equal(nextResumeHandle("a", { newHandle: "", resumable: false }), "a");
  assert.equal(nextResumeHandle("a", { resumable: false }), "a");
  assert.equal(nextResumeHandle("a", { newHandle: "b" }), "b");
  assert.equal(nextResumeHandle("a", {}), "a");
});

test("[§140] 사유 · close 코드 — 숫자 · 고정 낱말만", () => {
  assert.equal(formatResumeReason("close", 1011), "close:1011");
  assert.equal(formatResumeReason("close", null), "close:-");
  assert.equal(formatResumeReason("goaway"), "goaway");
  assert.equal(closeCodeOf({ code: 1011, reason: "The service is currently unavailable." }), 1011);
  assert.equal(closeCodeOf({}), null);
  assert.equal(closeCodeOf(null), null);
});

test("[§140 판정표 3] 브라우저 이어받기 창 ≤ 서버 토큰 수명 − 새 세션 시작 창 − 여유", () => {
  const provider = read("../../../functions/src/realtime/geminiProvider.ts");
  const expire = Number(/export const TOKEN_EXPIRE_MINUTES = (\d+);/.exec(provider)?.[1]);
  const newSession = Number(/export const NEW_SESSION_EXPIRE_MINUTES = (\d+);/.exec(provider)?.[1]);
  assert.ok(expire > 0 && newSession > 0, "서버 상수를 읽을 수 있어야 한다");
  assert.ok(LIVE_RESUME_WINDOW_MS <= (expire - newSession) * 60_000, "토큰이 끝나기 전에만 이어받는다");
  assert.match(provider, /sessionResumption: LIVE_SESSION_RESUMPTION_CONFIG,/);
  assert.match(provider, /contextWindowCompression: LIVE_CONTEXT_WINDOW_COMPRESSION,/);
});

test("[§140 배선] GeminiVoiceSession — onclose가 판정표 1을 거치고, 이어받기는 핸들만 넘기며, 옛 세대 콜백은 무시한다", () => {
  const s = read("./GeminiVoiceSession.tsx");
  assert.match(s, /const decision = decideLiveClose\(closeInput\(\)\);/);
  assert.match(s, /if \(decision === "resume"\) \{\n\s*void resumeLive\(formatResumeReason\("close", code\), errored\);\n\s*return;\n\s*\}\n\s*fallBackAfterClose\(errored\);/);
  assert.match(s, /\{ responseModalities: \[Modality\.AUDIO\], sessionResumption: \{ handle \} \}/);
  // 콜백 4종 모두 세대 검사.
  const guards = s.match(/if \(cancelled \|\| generation !== liveGeneration\) return;/g) ?? [];
  assert.equal(guards.length, 4);
  // 종전 순서(§99 → onError → onEnded → 끊기 대기 해제)는 `fallBackAfterClose` 한 곳에 남는다.
  assert.match(
    s,
    /if \(reportConnectionLostIfBackground\(\)\) return;\n\s*if \(errored\) handlersRef\.current\.onError\(\);\n\s*handlersRef\.current\.onEnded\(\);\n(?:\s*\/\/.*\n)*\s*beginHangupDrain\(\);/,
  );
  // 다시 연결 중 나가려던 텍스트 턴은 버리지 않는다.
  assert.match(s, /if \(resumeInFlight\) turnsAwaitingResume\.push\(turn\);/);
  // 옛 연결에서 받은 도구 호출의 응답은 새 연결에 보내지 않는다.
  assert.match(s, /if \(callGeneration === liveGeneration\) \{/);
  // 진단 — 성공 · 실패 사유를 남긴다.
  assert.match(s, /noteLiveResume\(reason, true\);/);
  assert.match(s, /noteLiveResume\(`fail:\$\{lastFailure\}`, false\);/);
});

test("[§140 진단] resume.retry 뒤 live.resume · live.resumeWhy 2행 — 성공만 세고 사유는 마지막 것", () => {
  const i = AUDIO_DIAG_KEYS.indexOf("resume.retry");
  assert.deepEqual(AUDIO_DIAG_KEYS.slice(i, i + 4), ["resume.retry", "live.resume", "live.resumeWhy", "err.last"]);
  resetAudioDiagForTest();
  noteAccept(1000);
  const rowsOf = () =>
    Object.fromEntries(
      buildAudioDiagRows({
        snapshot: readAudioDiag(),
        callMode: "realtime",
        status: "active",
        provider: "gemini",
        audioRoute: "call",
        credentialsPrefetched: true,
        acceptToCredentialsMs: 1,
        userActivation: null,
        browser: "-",
        flags: { audioPrime: true, ringCloseImmediate: false },
      }),
    );
  assert.equal(rowsOf()["live.resume"], "0");
  assert.equal(rowsOf()["live.resumeWhy"], "-");
  noteLiveResume("close:1011", true);
  noteLiveResume("goaway", true);
  noteLiveResume("fail:timeout", false);
  assert.equal(rowsOf()["live.resume"], "2");
  assert.equal(rowsOf()["live.resumeWhy"], "fail:timeout");
  // 받기(새 통화)마다 비운다.
  noteAccept(2000);
  assert.equal(rowsOf()["live.resume"], "0");
  resetAudioDiagForTest();
});
