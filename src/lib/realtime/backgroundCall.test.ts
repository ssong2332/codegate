// §99(사용자 실기 신고 2026-10-21 — 화면이 꺼지면 말이 전달되지 않는다) — 판정 순수 함수 + 배선 고정.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 이 파일 안에서만 `\r\n`→`\n`으로 정규화해 읽는다(callAudio.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_BACKGROUND_RECONNECTS,
  RECENT_RETURN_WINDOW_MS,
  RETURN_NOTICE_MIN_HIDDEN_MS,
  RESUME_MAX_TOTAL_CHARS,
  RESUME_MAX_TURNS,
  SCREEN_OFF_COPY,
  TRANSCRIPT_BACKUP_MAX_TURNS,
  buildResumeTurn,
  decideMicRecovery,
  decideReconnectBudget,
  decideSocketClose,
  isReplacementTrackUsable,
  maskBackupText,
  parseTranscriptBackup,
  serializeTranscriptBackup,
  shouldShowReturnNotice,
} from "./backgroundCall.ts";

const readLf = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const play = readLf("src/app/session/play/page.tsx");
const session = readLf("src/lib/realtime/GeminiVoiceSession.tsx");
const hook = readLf("src/lib/realtime/useRealtimeCall.ts");
const notice = readLf("src/components/CallStartNotice.tsx");

const base = {
  hiddenNow: false,
  lastVisibleAtMs: null,
  wasHiddenBefore: false,
  nowMs: 100_000,
  stopRequested: false,
  hangupLatched: false,
};

test("[§99] decideSocketClose — 가려진 동안 닫히면 다시 연결", () => {
  assert.equal(decideSocketClose({ ...base, hiddenNow: true, wasHiddenBefore: true }), "reconnect");
});

test("[§99] decideSocketClose — 돌아온 직후(창 안) 닫히면 다시 연결 · 창 밖이면 종전대로 종료", () => {
  const returned = { ...base, wasHiddenBefore: true, lastVisibleAtMs: 100_000 - RECENT_RETURN_WINDOW_MS };
  assert.equal(decideSocketClose(returned), "reconnect");
  assert.equal(decideSocketClose({ ...returned, lastVisibleAtMs: 100_000 - RECENT_RETURN_WINDOW_MS - 1 }), "end");
});

test("[§99] decideSocketClose — 한 번도 가려지지 않았으면 종전대로 종료(서버 close = 상대가 끊음)", () => {
  assert.equal(decideSocketClose(base), "end");
});

test("[§99] decideSocketClose — 사용자 종료 · 끊기 래치는 가려져 있어도 언제나 종료", () => {
  assert.equal(decideSocketClose({ ...base, hiddenNow: true, stopRequested: true }), "end");
  assert.equal(decideSocketClose({ ...base, hiddenNow: true, hangupLatched: true }), "end");
});

test("[§99] decideReconnectBudget — 한도까지 다시 연결, 넘으면 텍스트로", () => {
  for (let i = 0; i < MAX_BACKGROUND_RECONNECTS; i += 1) assert.equal(decideReconnectBudget(i), "reconnect");
  assert.equal(decideReconnectBudget(MAX_BACKGROUND_RECONNECTS), "fallback");
});

test("[§99 · §105 (a)] decideMicRecovery — ended만 다시 열고, muted · live면 그대로, 트랙 없으면 그대로", () => {
  assert.equal(decideMicRecovery({ readyState: "ended", muted: false }), "reacquire");
  assert.equal(decideMicRecovery({ readyState: "ended", muted: true }), "reacquire");
  assert.equal(decideMicRecovery({ readyState: "live", muted: true }), "keep", "§105 (a) — muted는 OS가 푸는 일시 상태");
  assert.equal(decideMicRecovery({ readyState: "live", muted: false }), "keep");
  assert.equal(decideMicRecovery(null), "keep");
});

test("[§99] buildResumeTurn — 전사 없음 = null(종전 오프닝)", () => {
  assert.equal(buildResumeTurn([]), null);
  assert.equal(buildResumeTurn([{ role: "user", text: "   " }]), null);
});

test("[§99] buildResumeTurn — 시간 순 · 화자 표기 · 최근 턴 상한 · 전체 글자 상한", () => {
  const out = buildResumeTurn([
    { role: "scammer", text: "서울중앙지검 수사관입니다." },
    { role: "user", text: "네 무슨 일이세요?" },
  ]);
  assert.ok(out);
  assert.ok(out.indexOf("나: 서울중앙지검") < out.indexOf("상대: 네 무슨"));
  assert.match(out, /다시 연결됐다/);
  assert.match(out, /처음부터 다시 소개하지 말고/);

  const many = Array.from({ length: 40 }, (_, i) => ({ role: (i % 2 ? "user" : "scammer") as "user" | "scammer", text: `턴${i} ` + "가".repeat(300) }));
  const long = buildResumeTurn(many);
  assert.ok(long);
  const dialogueLines = long.split("\n").filter((l) => l.startsWith("나: ") || l.startsWith("상대: "));
  assert.ok(dialogueLines.length <= RESUME_MAX_TURNS);
  assert.ok(dialogueLines.join("").length <= RESUME_MAX_TOTAL_CHARS);
  // 가장 최근 턴(39)은 반드시 들어간다.
  assert.ok(dialogueLines.at(-1)?.startsWith("상대: 턴39"));
});

test("[§99] 전사 백업 — 왕복 · 다른 세션 · 깨진 값 · 모양 검사 · 상한", () => {
  const turns = [
    { role: "scammer" as const, text: "안녕하세요", atMs: 1200 },
    { role: "user" as const, text: "네" },
  ];
  assert.deepEqual(parseTranscriptBackup(serializeTranscriptBackup("s1", turns), "s1"), turns);
  assert.deepEqual(parseTranscriptBackup(serializeTranscriptBackup("s1", turns), "s2"), []);
  assert.deepEqual(parseTranscriptBackup("{broken", "s1"), []);
  assert.deepEqual(parseTranscriptBackup(null, "s1"), []);
  assert.deepEqual(
    parseTranscriptBackup(JSON.stringify({ sessionId: "s1", turns: [{ role: "x", text: "a" }, { role: "user", text: 3 }] }), "s1"),
    [],
  );
  const big = Array.from({ length: TRANSCRIPT_BACKUP_MAX_TURNS + 30 }, (_, i) => ({ role: "user" as const, text: `t${i}` }));
  const restored = parseTranscriptBackup(serializeTranscriptBackup("s1", big), "s1");
  assert.equal(restored.length, TRANSCRIPT_BACKUP_MAX_TURNS);
  assert.equal(restored.at(-1)?.text, `t${TRANSCRIPT_BACKUP_MAX_TURNS + 29}`);
});

// ── 배선 고정(소스) ─────────────────────────────────────────────────────────────

test("[§99] GeminiVoiceSession — onclose · onerror는 다시 연결 판정을 먼저 거치고, 사용자 종료는 표시 뒤 닫는다", () => {
  // §140 — 종전 close 처리는 `fallBackAfterClose`로 옮겼다(조용한 재연결이 아니거나 실패했을 때 · 오류가 먼저 났으면 onError도 같은 자리).
  assert.match(session, /if \(reportConnectionLostIfBackground\(\)\) return;\n\s*if \(errored\) handlersRef\.current\.onError\(\);\n\s*handlersRef\.current\.onEnded\(\);/);
  // §140 — onerror의 취소 · 옛 세대 검사는 콜백 첫 줄(`if (cancelled || generation !== liveGeneration) return;`)로 옮겼다.
  assert.match(session, /if \(!reportConnectionLostIfBackground\(\)\) handlersRef\.current\.onError\(\);/);
  assert.match(session, /stopRequestedRef\.current = true;\n\s*cleanupRef\.current\?\.\(\);/);
  // onConnectionLost가 없으면(다른 호출부) 종전 동작 그대로다.
  assert.match(session, /if \(!handlersRef\.current\.onConnectionLost\) return false;/);
});

test("[§99] GeminiVoiceSession — 가시성 리스너는 cleanup에서 뗀다 · 복귀 시 컨텍스트 재개 · 마이크 재확인", () => {
  assert.match(session, /document\.addEventListener\("visibilitychange", handleVisibility\)/);
  assert.match(session, /document\.removeEventListener\("visibilitychange", handleVisibility\)/);
  assert.match(session, /resumeSuspendedContexts\(\[outputContext, inputContext\], noteAudioError\)/);
  assert.match(session, /setTimeout\(recheckMic, MIC_RECHECK_DELAY_MS\)/);
});

test("[§99] GeminiVoiceSession — 재연결 첫 턴은 오프닝과 같은 보류 큐(turnComplete:true 전송 지점 1곳 유지)", () => {
  // 전송 지점 1곳 고정 자체는 `clientTurnQueueWiring.test.ts`가 맡는다 — 여기서는 같은 `dispatchClientTurn` 경로만 확인한다.
  assert.match(
    session,
    /const resumeText = resumeTurnRef\.current;\n\s*dispatchClientTurn\(\n\s*resumeText\n\s*\? \{ type: "request", turn: \{ kind: "opening", text: resumeText \}/,
  );
});

test("[§99] GeminiVoiceSession — 가려진 동안 침묵 넛지 · 대기 넛지를 미룬다", () => {
  assert.equal(session.match(/document\.visibilityState === "hidden"\) \{/g)?.length, 2);
});

test("[§99] useRealtimeCall — reconnecting은 연결 타임아웃 · 닫힘 실패 처리에 같이 들어간다", () => {
  assert.match(hook, /status !== "connecting" && status !== "reconnecting"/);
  assert.match(hook, /statusRef\.current === "connecting" \|\| statusRef\.current === "reconnecting"/);
  assert.match(hook, /prev === "active" \|\| prev === "reconnecting" \? "ended" : prev/);
});

test("[§99] 통화 화면 — 세션 key = connectionSeq · 재연결 콜백 · Wake Lock · 전사 백업 · 안내", () => {
  assert.match(play, /key=\{realtime\.connectionSeq\}/);
  assert.match(play, /onConnectionLost=\{handleConnectionLost\}/);
  // §110.3 — 첫 연결의 신호 선택은 `openingTurnFor`(재연결 = 종전 `resumeTurn` 그대로 · 메신저발 첫 연결만 이어받기 신호).
  // §142 — 다통화 변형의 새 통화 첫 연결은 오프닝(이어받기 아님)이라 앞에 `legOpening ? null :` 갈래가 붙는다.
  assert.match(play, /resumeTurn=\{(?:legOpening \? null : )?openingTurnFor\(\{\s*connectionSeq: realtime\.connectionSeq,\s*resumeTurn,/);
  assert.match(play, /createScreenWakeLock\(/);
  assert.match(play, /lock\.stop\(\)/);
  assert.match(play, /serializeTranscriptBackup\(sessionId, transcriptRef\.current\)/);
  assert.match(play, /window\.sessionStorage\.removeItem\(TRANSCRIPT_BACKUP_KEY\)/);
  assert.match(play, /parseTranscriptBackup\(window\.sessionStorage\.getItem\(TRANSCRIPT_BACKUP_KEY\), sessionId\)/);
  assert.match(play, /<ScreenOffNotice/);
});

test("[§99] 벨 직전 고지 — 화면 · 스피커 안내 1줄(경고 표현 0)", () => {
  assert.match(notice, /\{SCREEN_OFF_COPY\.preCallHint\}/);
  for (const text of Object.values(SCREEN_OFF_COPY)) {
    assert.doesNotMatch(text, /경고|위험|⚠/);
  }
});

// ── 리뷰 · QA 반영 ─────────────────────────────────────────────────────────────

test("[§99 리뷰 Major] 백업 마스킹 — 서버 maskPII와 정규식이 같다(드리프트 가드) · 직렬화가 가린다", () => {
  const server = readLf("functions/src/guardrails/index.ts");
  const own = readLf("src/lib/realtime/backgroundCall.ts");
  const pick = (code: string, re: RegExp) => [...code.matchAll(re)].map((m) => m[1]);
  assert.deepEqual(
    pick(own, /^const BACKUP_\w+ = (.+);$/gm),
    pick(server, /^const (?:EMAIL|RRN|PHONE|ACCOUNT)_PATTERN = (.+);$/gm),
  );
  assert.equal(
    maskBackupText("제 번호 010-1234-5678, 계좌 110-123-456789, 주민 901231-1234567"),
    "제 번호 [전화], 계좌 [계좌], 주민 [주민번호]",
  );
  const raw = serializeTranscriptBackup("s1", [{ role: "user", text: "계좌는 1234567890이요" }]);
  assert.doesNotMatch(raw, /1234567890/);
  assert.deepEqual(parseTranscriptBackup(raw, "s1"), [{ role: "user", text: "계좌는 [계좌]이요" }]);
});

test("[§99 QA D8] 돌아옴 안내 — 짧게 가린 경우 0 · 오래 가렸거나 재연결 대기면 1", () => {
  assert.equal(shouldShowReturnNotice({ hiddenMs: RETURN_NOTICE_MIN_HIDDEN_MS - 1, reconnectPending: false }), false);
  assert.equal(shouldShowReturnNotice({ hiddenMs: RETURN_NOTICE_MIN_HIDDEN_MS, reconnectPending: false }), true);
  assert.equal(shouldShowReturnNotice({ hiddenMs: 0, reconnectPending: true }), true);
});

test("[§99 QA D1 · 리뷰] 연결 전 · 재연결 중 닫힘은 종전 닫힘 처리 · 글 대화로 내려가면 Live 세션을 내린다", () => {
  assert.match(play, /if \(realtimeStatusRef\.current !== "active"\) \{\n\s*realtime\.handleEnded\(\);\n\s*return;\n\s*\}/);
  assert.match(play, /\{callMode === "realtime" && realtime\.credentials\?\.provider === "gemini" && \(/);
  // 백업은 제출 **성공 뒤에만** 지운다(QA D5).
  const flush = play.slice(play.indexOf("const flushTranscript = useCallback"), play.indexOf("}, [sessionId]);", play.indexOf("const flushTranscript = useCallback")));
  assert.ok(flush.indexOf("await submitRealtimeTranscript(") < flush.indexOf("removeItem(TRANSCRIPT_BACKUP_KEY)"));
  // 사용자 종료는 다시 잇는 발급보다 먼저 미러를 내린다(리뷰 Minor).
  assert.match(hook, /if \(statusRef\.current === "active" \|\| statusRef\.current === "reconnecting"\) statusRef\.current = "ended";/);
});

test("[§99 QA D4 · 리뷰 Minor] 다시 가려지면 마이크 재확인 취소 · 끊긴 소켓이면 재확인 생략 · 갈아 끼우기 실패 시 새 트랙 닫기", () => {
  const hiddenBranch = session.slice(session.indexOf("if (isHiddenNow()) {"), session.indexOf("lastVisibleAtMs = nowMs;"));
  assert.match(hiddenBranch, /clearTimeout\(micRecheckTimer\)/);
  assert.match(session, /if \(cancelled \|\| !replaceMicStream \|\| connectionLostReported\) return;/);
  assert.match(session, /\} catch \(e\) \{\n(\s*\/\/.*\n)*\s*stopStream\(next\);/);
});

test("[§105 (b)] isReplacementTrackUsable — live · unmuted만 갈아 끼운다", () => {
  assert.equal(isReplacementTrackUsable({ readyState: "live", muted: false }), true);
  assert.equal(isReplacementTrackUsable({ readyState: "live", muted: true }), false);
  assert.equal(isReplacementTrackUsable({ readyState: "ended", muted: false }), false);
  assert.equal(isReplacementTrackUsable(null), false);
});

test("[§105 (b) 배선] 새 트랙 확인이 갈아 끼우기(옛 트랙 stop)보다 앞이고, 실패하면 새 트랙만 닫는다", () => {
  const recheck = session.slice(session.indexOf("const recheckMic = () => {"), session.indexOf("const handleVisibility = () => {"));
  const checkAt = recheck.indexOf("if (!isReplacementTrackUsable(nextView)) {");
  const replaceAt = recheck.indexOf("replaceMicStream(next);");
  assert.ok(checkAt >= 0 && replaceAt > checkAt, "확인 전에 갈아 끼운다");
  const failBranch = recheck.slice(checkAt, replaceAt);
  assert.ok(failBranch.includes("stopStream(next);"), "쓸 수 없는 새 트랙을 닫지 않는다");
  assert.ok(!failBranch.includes("stopStream(previous)") && !failBranch.includes("stopStream(stream)"), "실패 분기에서 옛 트랙을 닫는다");
  // 옛 트랙 stop은 replaceMicStream 안 한 곳뿐이다.
  assert.equal((session.match(/if \(previous && previous !== next\) stopStream\(previous\);/g) ?? []).length, 1);
});
