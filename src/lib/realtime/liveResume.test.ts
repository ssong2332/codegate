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
  MAX_REALTIME_CALL_MS,
  RESUME_CONTEXT_MAX_TOTAL_CHARS,
  RESUME_CONTEXT_MAX_TURNS,
  RESUME_CONTEXT_MAX_TURN_CHARS,
  RESUME_CONTEXT_OVERLAP_TURNS,
  RESUME_CONTINUE_TRIGGER,
  buildSilentResumeContext,
  callAutoEndLimitMs,
  handleCoveredRange,
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
  assert.equal(decideLiveClose({ ...BASE, nowMs: 1000 + LIVE_RESUME_WINDOW_MS }), "end", "C5 22분 창 밖");
  assert.equal(decideLiveClose({ ...BASE, nowMs: 1000 + LIVE_RESUME_WINDOW_MS - 1 }), "resume", "C5 창 안");
  assert.equal(decideLiveClose(BASE), "resume", "C6 — 실측 601초 close");
});

test("[§140] 불변식 — 통화 20분 < 이어받기 창 · 약 10분 수명 기준 재연결 횟수 + 여유", () => {
  assert.equal(MAX_REALTIME_CALL_MS, 20 * 60 * 1000, "사용자 결정 2026-10-28");
  assert.ok(LIVE_RESUME_WINDOW_MS > MAX_REALTIME_CALL_MS, "통화 끝까지 이어받을 수 있다");
  // 실측 연결 수명 601~602초 → 창 안에서 끊기는 횟수 + 여유 1회 이상.
  assert.ok(MAX_LIVE_RESUMES >= Math.ceil(LIVE_RESUME_WINDOW_MS / 600_000) + 1);
  // 통화 상한 20분은 실제로 끊기는 횟수(2회)를 먼저 넘지 않는다 — C5보다 C4가 먼저 걸리지 않게.
  assert.ok(MAX_LIVE_RESUMES > Math.floor(MAX_REALTIME_CALL_MS / 600_000));
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

test("[§140 판정표 3] 이어받기 창 ≤ 서버 새 세션 창 − 발급→받기 최대(프리페치 90초) · 통화 상한은 서버와 같다", () => {
  const provider = read("../../../functions/src/realtime/geminiProvider.ts");
  const hook = read("./useRealtimeCall.ts");
  const expire = Number(/export const TOKEN_EXPIRE_MINUTES = (\d+);/.exec(provider)?.[1]);
  const newSession = Number(/export const NEW_SESSION_EXPIRE_MINUTES = (\d+);/.exec(provider)?.[1]);
  const callMax = Number(/export const REALTIME_CALL_MAX_MINUTES = (\d+);/.exec(provider)?.[1]);
  const prefetchStale = Number(/const PREFETCH_STALE_MS = ([\d_]+);/.exec(hook)?.[1].replace(/_/g, ""));
  assert.ok(expire > 0 && newSession > 0 && callMax > 0 && prefetchStale > 0, "상수를 읽을 수 있어야 한다");
  // 2026-10-28 재실측 — 이어받기에도 새 세션 창이 걸린다. 첫 연결은 발급 뒤 프리페치 신선도 안이다.
  assert.ok(LIVE_RESUME_WINDOW_MS <= newSession * 60_000 - prefetchStale, "새 세션 창이 끝나기 전에만 이어받는다");
  assert.ok(expire >= newSession, "메시지 수명 ≥ 새 세션 창");
  assert.equal(callMax * 60_000, MAX_REALTIME_CALL_MS, "서버 · 브라우저 통화 상한이 같다");
  assert.match(provider, /sessionResumption: LIVE_SESSION_RESUMPTION_CONFIG,/);
  assert.match(provider, /contextWindowCompression: LIVE_CONTEXT_WINDOW_COMPRESSION,/);
});

test("[§140 배선] GeminiVoiceSession — onclose가 판정표 1을 거치고, 이어받기는 핸들만 넘기며, 옛 세대 콜백은 무시한다", () => {
  const s = read("./GeminiVoiceSession.tsx");
  assert.match(s, /const decision = decideLiveClose\(closeInput\(\)\);/);
  assert.match(s, /if \(decision === "resume"\) \{\n\s*void resumeLive\(formatResumeReason\("close", code\), errored, droppedMidTurn\);\n\s*return;\n\s*\}\n\s*fallBackAfterClose\(errored\);/);
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
  // 통화 화면 — 통화 자동 종료는 20분 상한과 세션 문서 한도 중 짧은 쪽(`callAutoEndLimitMs` — 아래 폴백 테스트가 행을 고정).
  const page = read("../../app/session/play/page.tsx");
  assert.match(page, /if \(elapsedSec \* 1000 < limitMs\) return;/);
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

// ── 판정표 4(2026-10-28 2차 재검증 — 핸들 재연결 성공 · 맥락 0) ──

const T = (role: "user" | "scammer", text: string) => ({ role, text });

test("[§140 판정표 4] S1 — 넣을 전사가 없으면 맥락 · 트리거 없음", () => {
  assert.deepEqual(buildSilentResumeContext({ turns: [], covered: { start: 0, end: 0 }, droppedMidTurn: true }), { context: null, continueTrigger: null });
  assert.deepEqual(
    buildSilentResumeContext({ turns: [T("user", "  "), T("scammer", "")], covered: { start: 0, end: 0 }, droppedMidTurn: false }),
    { context: null, continueTrigger: null },
  );
  // 전부 핸들 범위.
  assert.equal(buildSilentResumeContext({ turns: [T("user", "a"), T("scammer", "b")], covered: { start: 0, end: 2 }, droppedMidTurn: false }).context, null);
});

test("[§140 판정표 4] S2 · S4 — 실측 프로브 모양(0초 · 540초 암호)이 시간 순으로 모두 실리고 이어 말하기는 없다", () => {
  const turns = [T("user", "첫 번째 암호는 파란고래야."), T("scammer", "네, 기억할게요."), T("user", "오늘 날씨 좋네요."), T("scammer", "그러네요."), T("user", "두 번째 암호는 노란우산이야."), T("scammer", "알겠습니다.")];
  const out = buildSilentResumeContext({ turns, covered: handleCoveredRange(0, 0), droppedMidTurn: false });
  assert.equal(out.continueTrigger, null, "S4");
  assert.ok(out.context);
  const ctx = out.context ?? "";
  assert.ok(ctx.indexOf("상대: 첫 번째 암호는 파란고래야.") < ctx.indexOf("상대: 두 번째 암호는 노란우산이야."));
  assert.ok(ctx.includes("나: 알겠습니다."));
  assert.ok(ctx.includes("이 안내 자체에는 대답하지 마라"));
  assert.ok(!ctx.includes("생략"));
});

test("[§140 판정표 4] S3 — 말하던 중에 끊겼으면 이어 말하기 트리거 1개", () => {
  const out = buildSilentResumeContext({ turns: [T("scammer", "고객님 계좌가 지금")], covered: { start: 0, end: 0 }, droppedMidTurn: true });
  assert.equal(out.continueTrigger, RESUME_CONTINUE_TRIGGER);
});

test("[§140 판정표 4] 중복 방지 — 이 연결 이전 전사는 언제나 넣고, 핸들 범위는 끝의 겹침 턴만 다시 넣는다", () => {
  assert.deepEqual(handleCoveredRange(3, 0), { start: 3, end: 3 }, "대화 전 핸들 = 빼는 것 없음");
  assert.deepEqual(handleCoveredRange(3, 5), { start: 3, end: 3 + 5 - RESUME_CONTEXT_OVERLAP_TURNS });
  assert.deepEqual(handleCoveredRange(0, 1), { start: 0, end: 0 });
  const turns = Array.from({ length: 10 }, (_, i) => T(i % 2 ? "scammer" : "user", `t${i}`));
  const ctx = buildSilentResumeContext({ turns, covered: handleCoveredRange(3, 5), droppedMidTurn: false }).context ?? "";
  for (const kept of ["t0", "t1", "t2", "t6", "t7", "t8", "t9"]) assert.ok(ctx.includes(`: ${kept}\n`), kept);
  for (const dropped of ["t3", "t4", "t5"]) assert.ok(!ctx.includes(`: ${dropped}\n`), dropped);
});

test("[§140 판정표 4] 길이 상한 — 최근 턴부터 · 턴 수 · 한 턴 · 전체 글자", () => {
  const many = Array.from({ length: 100 }, (_, i) => T("user", `발화${i}`));
  const ctx = buildSilentResumeContext({ turns: many, covered: { start: 0, end: 0 }, droppedMidTurn: false }).context ?? "";
  const lines = ctx.split("\n").filter((l) => l.startsWith("상대: "));
  assert.equal(lines.length, RESUME_CONTEXT_MAX_TURNS);
  assert.equal(lines.at(-1), "상대: 발화99");
  assert.ok(ctx.includes("생략"));
  const long = buildSilentResumeContext({ turns: [T("scammer", "가".repeat(500))], covered: { start: 0, end: 0 }, droppedMidTurn: false }).context ?? "";
  assert.ok(long.includes(`나: ${"가".repeat(RESUME_CONTEXT_MAX_TURN_CHARS)}…`));
  const big = Array.from({ length: 40 }, (_, i) => T("user", `${i}`.padEnd(RESUME_CONTEXT_MAX_TURN_CHARS, "나")));
  const bigCtx = buildSilentResumeContext({ turns: big, covered: { start: 0, end: 0 }, droppedMidTurn: false }).context ?? "";
  const body = bigCtx.split("\n").filter((l) => l.startsWith("상대: ")).join("");
  assert.ok(body.length <= RESUME_CONTEXT_MAX_TOTAL_CHARS);
});

test("[§140 판정표 4 배선] 재연결 뒤 전사를 turnComplete:false로 넣고, 트리거는 보류 큐 silence 턴 · 화면은 전체 전사를 넘긴다", () => {
  const s = read("./GeminiVoiceSession.tsx");
  assert.match(s, /session\.sendClientContent\(\{ turns: silentResume\.context, turnComplete: false \}\);/);
  assert.match(s, /turn: \{ kind: "silence", text: silentResume\.continueTrigger \}/);
  assert.match(s, /const droppedMidTurn = turnInProgress;\n\s*flushTranscript\(\);/);
  // 맥락 주입은 보낸 텍스트 턴 · 이어 말하기보다 먼저.
  assert.ok(s.indexOf("turns: silentResume.context") < s.indexOf("const heldTurns = turnsAwaitingResume.splice(0);"));
  const page = read("../../app/session/play/page.tsx");
  assert.match(page, /readTranscript=\{readTranscriptForResume\}/);
  assert.match(page, /const readTranscriptForResume = useCallback\(\(\) => transcriptRef\.current, \[\]\);/);
});

test("[폴백 20분] 통화 자동 종료 한도 — 실시간 · 음성 폴백 모두 20분과 세션 한도 중 짧은 쪽 · 판정 전은 보류", () => {
  const SESSION_DOC_MAX = 60 * 60 * 1000; // 서버 MAX_SESSION_MS(메신저와 공용 — 그대로)
  assert.equal(callAutoEndLimitMs("realtime", SESSION_DOC_MAX), MAX_REALTIME_CALL_MS);
  assert.equal(callAutoEndLimitMs("fallback", SESSION_DOC_MAX), MAX_REALTIME_CALL_MS);
  assert.equal(callAutoEndLimitMs("fallback", 6 * 60 * 1000), 6 * 60 * 1000, "세션 한도가 더 짧으면 그쪽");
  assert.equal(callAutoEndLimitMs("realtime", 6 * 60 * 1000), 6 * 60 * 1000);
  assert.equal(callAutoEndLimitMs("undecided", SESSION_DOC_MAX), null);
  assert.equal(callAutoEndLimitMs("fallback", null), null);
  assert.equal(MAX_REALTIME_CALL_MS, 20 * 60 * 1000);
});

test("[폴백 20분 배선] 통화 화면 한도 effect가 실시간만 거르지 않고 endCall(\"limit\")로 끝낸다 · 메신저 화면은 이 한도를 쓰지 않는다", () => {
  const page = read("../../app/session/play/page.tsx");
  const start = page.indexOf("const autoEndedRef");
  const block = page.slice(start, page.indexOf("}, [callMode, phase, elapsedSec, maxSessionMs]);", start));
  assert.ok(start >= 0 && block.length > 0);
  assert.match(block, /const limitMs = callAutoEndLimitMs\(callMode, maxSessionMs\);/);
  assert.match(block, /if \(phase !== "live" \|\| limitMs === null\) return;/);
  assert.ok(!/callMode !== "realtime"/.test(block), "한도 effect가 실시간 통화만 보면 폴백 통화가 60분까지 간다");
  assert.match(block, /await endCall\("limit"\);/);
  // 메신저 대화방은 통화 화면 밖 — 서버 MAX_SESSION_MS(60분)만 따른다.
  const messenger = read("../../app/session/messenger/page.tsx");
  assert.ok(!messenger.includes("callAutoEndLimitMs") && !messenger.includes("MAX_REALTIME_CALL_MS"));
});
