// 2026-11-06 메인 내장 브라우저 시험 — 결함 ①(수신 화면 번호) · ②(마이크 거부 뒤 "말씀하세요"만 남음) · 요청 2(통화 진단 요약).
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MIC_DENIED_COPY, isMicDenied, showsMicDeniedNotice } from "./micDenied.ts";
import {
  CALL_DIAG_CTX_STATES,
  CALL_DIAG_MODES,
  CALL_DIAG_RT_STATES,
  CALL_DIAG_TRACK_STATES,
  buildCallDiagSummary,
} from "../realtime/callDiagSummary.ts";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const base = { callMode: "fallback" as const, realtimeStatus: "permission-denied", phase: "live", textInputOpen: false, dismissed: false };

test("[결함 ② 판정표] 마이크 거부 폴백 · 통화 중 · 입력 닫힘 · 안 닫음 = 안내 카드 · 그 밖 0", () => {
  assert.equal(showsMicDeniedNotice(base), true);
  assert.equal(showsMicDeniedNotice({ ...base, phase: "opening" }), true);
  assert.equal(showsMicDeniedNotice({ ...base, realtimeStatus: "error" }), false, "연결 실패 폴백은 종전(마이크 문제 아님)");
  assert.equal(showsMicDeniedNotice({ ...base, callMode: "realtime" }), false);
  assert.equal(showsMicDeniedNotice({ ...base, phase: "incoming" }), false);
  assert.equal(showsMicDeniedNotice({ ...base, textInputOpen: true }), false);
  assert.equal(showsMicDeniedNotice({ ...base, dismissed: true }), false);
  assert.equal(isMicDenied(base), true);
  for (const text of Object.values(MIC_DENIED_COPY)) assert.ok(!/모의|훈련용|시뮬레이션/.test(text), text);
  assert.notEqual(MIC_DENIED_COPY.waveLabel, "말씀하세요");
});

test("[결함 ② 배선] 통화 화면 — 안내 카드(다시 시도 · 글자로 대화하기) · 파형 문구 · 다시 시도 = 탭 안 실시간 재시작", () => {
  const page = read("src/app/session/play/page.tsx");
  assert.ok(page.includes("showsMicDeniedNotice({ callMode, realtimeStatus: realtime.status, phase, textInputOpen: showTextInput, dismissed: micDeniedDismissed })"));
  assert.ok(page.includes("onClick={handleMicRetry}"));
  assert.ok(page.includes("setShowTextInput(true);") && page.includes("{MIC_DENIED_COPY.text}"));
  assert.ok(page.includes("? MIC_DENIED_COPY.waveLabel"));
  const retry = page.slice(page.indexOf("const handleMicRetry = () => {"), page.indexOf("const handleMicRetry = () => {") + 600);
  assert.ok(retry.includes('setCallMode("realtime");') && retry.includes("void realtime.start(sessionId);"));
});

test("[결함 ①] 받기 전 라벨 = 세션 문서 startCallerLabel(서버 값) · 받은 뒤 = 통화 토큰 레그 라벨", () => {
  const page = read("src/app/session/play/page.tsx");
  assert.ok(page.includes('setStartCallerLabel(typeof data.startCallerLabel === "string" ? data.startCallerLabel : null);'));
  assert.ok(page.includes("legCallerLabelOr(legCallerLabel ?? realtime.credentials?.callLeg?.callerLabel ?? startCallerLabel, baseCallerLabel)"));
});

const snap = {
  micFramesSent: 0,
  micFramesDroppedEcho: 2400,
  micFramesDroppedMute: 0,
  micPeakMax: null,
  asrChunks: 0,
  chunksReceived: 35,
  unheardReplyFired: 0,
  interrupts: 0,
  liveResumes: 0,
  output: { state: "suspended", sampleRate: 24000, resume: async () => {} },
  input: { state: "running", sampleRate: 48000, resume: async () => {} },
  mic: { readyState: "live", muted: false, enabled: true },
};

test("[요청 2 요약] 숫자 · 상태값만 · 허용 밖 상태 = 기본값 · dB 정수", () => {
  const s = buildCallDiagSummary(snap, { realtimeStatus: "active", callMode: "realtime" });
  assert.deepEqual(s, {
    micSent: 0,
    micDropEcho: 2400,
    micDropMute: 0,
    micPeakDb: null,
    asr: 0,
    rx: 35,
    unheard: 0,
    interrupts: 0,
    liveResumes: 0,
    outState: "suspended",
    inState: "running",
    track: "live",
    trackMuted: false,
    trackEnabled: true,
    rt: "active",
    mode: "realtime",
  });
  const odd = buildCallDiagSummary(
    { ...snap, micPeakMax: 0.063, output: null, mic: null, micFramesSent: Number.NaN },
    { realtimeStatus: "zzz", callMode: "zzz" },
  );
  assert.deepEqual([odd.micPeakDb, odd.outState, odd.track, odd.micSent, odd.rt, odd.mode], [-24, "none", "none", 0, "unknown", "undecided"]);
});

test("[요청 2 짝] 클라 허용값 = 서버 판독 허용값(드리프트 0) · 레그 끝 · 세션 끝 두 곳에서 보낸다", () => {
  const server = read("functions/src/realtime/callDiag.ts");
  const list = (name: string) => {
    const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(server);
    assert.ok(m, name);
    return m![1].split(",").map((x) => x.trim().replace(/"/g, "")).filter(Boolean);
  };
  assert.deepEqual(list("CTX_STATES"), [...CALL_DIAG_CTX_STATES]);
  assert.deepEqual(list("TRACK_STATES"), [...CALL_DIAG_TRACK_STATES]);
  assert.deepEqual(list("RT_STATES"), [...CALL_DIAG_RT_STATES]);
  assert.deepEqual(list("MODES"), [...CALL_DIAG_MODES]);
  const page = read("src/app/session/play/page.tsx");
  assert.ok(page.indexOf("const legDiag = currentCallDiag();") < page.indexOf("if (callMode === \"realtime\") realtime.suspendForLeg();"), "정리 전에 뜬다");
  assert.ok(page.includes("await flushTranscript(legDiag);"));
  assert.ok(page.includes("if (sessionId) setPendingCallDiag(sessionId, currentCallDiag());"));
  const end = read("src/app/session/end/page.tsx");
  assert.ok(end.includes("return endSession({ sessionId: sid, endReason, ...(diag ? { diag } : {}) });"));
});
