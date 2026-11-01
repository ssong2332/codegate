// T192 C5 — 통화 종료 배선 소스 스캔(관측 불가 지점 — 화면 · 세션 컴포넌트는 테스트에서 렌더할 수 없다).
// G510(승인 뒤 동결) · G515(폴백 마지막 대사 뒤 ended) · G528(§79.18 (2) 동결 인터페이스) · §79.9 E1~E7 · §79.11.
// ⚠️ 줄바꿈 리터럴 앵커를 쓰지 않는다(CRLF 체크아웃) — 정규식은 `\s*`로 잇는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const session = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8");
const page = readFileSync("src/app/session/play/page.tsx", "utf8");

/** 주석 줄 제거(설명 주석이 스캔을 때리지 않게 — 자기 주석 함정). JSX 블록 주석 `{/* … *\/}` 줄도 뺀다. */
function codeOnly(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("{/*");
    })
    .join("\n");
}
const sessionCode = codeOnly(session);
const pageCode = codeOnly(page);

function slice(code: string, startToken: string, endToken: string): string {
  const start = code.indexOf(startToken);
  assert.ok(start >= 0, `시작 앵커 없음: ${startToken}`);
  const end = code.indexOf(endToken, start + startToken.length);
  assert.ok(end > start, `끝 앵커 없음: ${endToken}`);
  return code.slice(start, end);
}

// ── 세션 컴포넌트(G510 · R2 ~ R5) ────────────────────────────────────────────────────────────

test("[G510 · R2 ①] 승인 · 종료 래치 뒤 마이크 프레임 0 — onaudioprocess가 래치 getter로 조기 반환한다(전송보다 앞)", () => {
  const handler = slice(sessionCode, "processor.onaudioprocess = (event) => {", "micSource.connect(processor);");
  const latchAt = handler.indexOf("if (handlersRef.current.isHangupLatched()) return;");
  const sendAt = handler.indexOf("session.sendRealtimeInput(");
  assert.ok(latchAt >= 0 && sendAt > latchAt, "마이크 전송이 래치 검사보다 앞이다");
});

test("[G510 · R2 ②] 클라 텍스트 턴 0 — 유일한 turnComplete:true 전송점(sendClientTurn)이 래치에서 막는다 · 침묵 넛지도 막는다", () => {
  const send = slice(sessionCode, "const sendClientTurn = ", "const dispatchClientTurn = ");
  const latchAt = send.indexOf("if (handlersRef.current.isHangupLatched()) return;");
  assert.ok(latchAt >= 0 && latchAt < send.indexOf("activeSession.sendClientContent("), "sendClientTurn이 래치 뒤에도 보낸다");
  const nudge = slice(sessionCode, "const runSilenceNudgeCheck = () => {", "const injectContext = ");
  assert.ok(
    nudge.indexOf("if (handlersRef.current.isHangupLatched()) return;") < nudge.indexOf("dispatchClientTurn("),
    "침묵 넛지가 래치 뒤에도 나간다(G510)",
  );
});

test("[G510 · R4 · R5] 준비 신호는 승인 응답 전송 뒤 첫 turnComplete(또는 끼어들기 · close · 상한) + 잔여 재생(hangupDrainDelayMs) 뒤 1회", () => {
  // R4 — 응답 전송(sendToolResponse) **뒤**에 건다.
  const toolBlock = slice(sessionCode, "const responses = await collectToolResponses(", 'dispatchClientTurn({ type: "toolResponseSent"');
  assert.ok(toolBlock.indexOf("session.sendToolResponse(") < toolBlock.indexOf("armHangupDrain();"), "대기가 응답 전송 앞에서 걸린다");
  // R4 해제 지점 3곳(turnComplete · interrupted · onclose)이 모두 beginHangupDrain을 부른다.
  assert.equal((sessionCode.match(/beginHangupDrain\(\);/g) ?? []).length, 3, "R4 해제 지점이 3곳(turnComplete · 끼어들기 · close)이 아니다");
  const tc = slice(sessionCode, "if (hasTurnComplete) {", "onerror:");
  assert.ok(tc.indexOf('dispatchClientTurn({ type: "turnComplete"') < tc.indexOf("beginHangupDrain();"));
  // R5 — 잔여 재생 계산은 순수 함수 하나.
  const drain = slice(sessionCode, "const beginHangupDrain = () => {", "const armHangupDrain = () => {");
  assert.match(drain, /setTimeout\(signalHangupReady, hangupDrainDelayMs\(remainingMs\)\)/);
  // 준비 신호 지점은 signalHangupReady 1곳 · 1회(done 래치) · 상한 2종.
  assert.equal((sessionCode.match(/handlersRef\.current\.onScammerHangupReady\(\)/g) ?? []).length, 1);
  assert.match(sessionCode, /if \(hangupDrain === "done"\) return;/);
  assert.match(sessionCode, /setTimeout\(beginHangupDrain, HANGUP_FINAL_TURN_CAP_MS\)/);
  assert.match(sessionCode, /setTimeout\(signalHangupReady, HANGUP_DRAIN_CAP_MS\)/);
  // cleanup이 대기 타이머를 지운다(언마운트 뒤 준비 신호 0).
  assert.ok(slice(sessionCode, "const cleanup = () => {", "cleanupRef.current = cleanup;").includes("clearHangupTimers();"));
});

test("[G552 ⓒ · §79.18 (3) ↳ ②] send_prepared_sms · end_call이 같은 사용자 발화 함수(claimedUserTurns) · 원천 = 부모 getter", () => {
  assert.match(sessionCode, /const claimedUserTurns = \(\) => handlersRef\.current\.getSessionUserTurns\(\) \+ \(userBuffer\.trim\(\) \? 1 : 0\);/);
  assert.equal((sessionCode.match(/userTurns: claimedUserTurns\(\),/g) ?? []).length, 2, "두 분기가 같은 함수를 쓰지 않는다");
});

// ── 부모 화면(§79.9 · §79.11 · G515 · G528) ──────────────────────────────────────────────────

test("[§79.18 (2) · G528] 부모 — 동결 인터페이스 5종을 세션 컴포넌트에 넘긴다 · isRelaySwitchPending = () => false", () => {
  for (const prop of [
    "getSessionUserTurns={getSessionUserTurns}",
    "getPendingInstruction={getPendingInstruction}",
    "isHangupLatched={isHangupLatched}",
    "onScammerHangupAccepted={handleScammerHangupAccepted}",
    "onScammerHangupReady={handleScammerHangupReady}",
  ]) {
    assert.ok(pageCode.includes(prop), `세션 컴포넌트에 ${prop}가 없다`);
  }
  assert.match(pageCode, /const isRelaySwitchPending = useCallback\(\(\) => false, \[\]\);/);
  // §121.7 ⓒ — 통화 중 대화방 카톡을 더한다(메인 결정 '두 채널 발화 합산').
  assert.match(pageCode, /const getSessionUserTurns = useCallback\(\(\) => turnCountersRef\.current\.userTurns \+ chatTurnsDuringCallRef\.current, \[\]\);/);
  const pending = slice(pageCode, "const getPendingInstruction = useCallback(", "const isHangupLatched = ");
  // 2026-10-31 — 판정은 순수 함수(마무리 지시 처리 중은 대기 아님 — `wrapUpHangup.test.ts`).
  assert.match(
    pending,
    /isHangupInstructionPending\(\{\s*queued: instructionQueueRef\.current\.length,\s*busy: instructionBusyRef\.current,\s*busyIsWrapUp: instructionBusyWrapUpRef\.current,\s*relaySwitchPending: isRelaySwitchPending\(\),\s*\}\)/,
  );
  assert.equal(pending.includes("toolPending"), false, "부모 클라 항에 toolPending이 들어갔다(G555)");
  assert.match(pageCode, /const isHangupLatched = useCallback\(\(\) => isEndLatched\(callEndingRef\.current\), \[\]\);/);
  assert.match(
    // §142 — 다통화 변형의 통화 끝(`legEnd`)은 앞 갈래가 래치 없이 통화 사이로 보낸다(부재 = 종전 래치).
    slice(pageCode, "const handleScammerHangupAccepted = (legEnd?: CallLegEnd) => {", "const handleScammerHangupReady = () => {"),
    /callEndingRef\.current = latchHangupAccepted\(callEndingRef\.current\);/,
  );
  assert.match(
    pageCode,
    /const handleScammerHangupReady = \(\) => \{\s*const legEnd = legEndRef\.current;\s*if \(legEnd\) \{\s*legEndRef\.current = null;\s*void beginLegTransition\(legEnd\);\s*return;\s*\}\s*void endCall\("scammer"\);/,
  );
});

const endCallBody = () => slice(pageCode, "const endCall = async (", "const handleEndTraining = async (");

test("[§79.9 E1~E7] 공통 종료 함수 순서 — 래치 → 오버레이 → (폴백) 마지막 대사 → 정지 → 끊김 표시 → flush → 사유 → 이동", () => {
  const body = endCallBody();
  const order = [
    "const step = beginCallEnding(callEndingRef.current, by);",
    "setSmsOverlayOpen(false);",
    "setVerifyOverlayOpen(false);",
    "await waitForEndStep(",
    "audioRef.current?.pause();",
    "realtime.stop();",
    'setCallEndedBy("scammer");',
    "const flushDone = flushTranscript();",
    "if (sessionId) setPendingEndReason(sessionId, ending.reason);",
    "if (noticeWait) await Promise.all([flushDone, noticeWait]);",
    'router.push("/session/end");',
  ];
  let last = -1;
  for (const token of order) {
    const at = body.indexOf(token, last + 1);
    assert.ok(at > last, `순서 위반 또는 누락: ${token}`);
    last = at;
  }
  // 재진입 — 시작하지 않은 트리거는 이동하지 않는다(대기만 끊는다).
  const notStarted = slice(body, "if (!step.started) {", "const ending = step.next;");
  assert.equal(notStarted.includes("router.push"), false, "두 번째 트리거가 이동한다(이중 이동 — D-114)");
  assert.ok(notStarted.includes("skipEndWaitRef.current?.();"));
  // 끊김 표시 시간 = UX 정본 상수.
  assert.match(body, /endTimeout\(finish, HANGUP_NOTICE_MS\)/);
});

test("[§79.9 · §79.11] 모든 종료 트리거가 공통 함수 하나 — 상시 · 한도 · 실시간 끊기 · 서버 close · 폴백 끊기", () => {
  assert.match(slice(pageCode, "const handleEndTraining = async () => {", "const handleEndedShellProceed"), /await endCall\("user"\);/);
  assert.match(slice(pageCode, "autoEndedRef.current = true;", "}, [callMode, phase, elapsedSec, maxSessionMs]);"), /await endCall\("limit"\);/);
  assert.match(slice(pageCode, '} else if (realtime.status === "ended") {', "}, [callMode, realtime.status]);"), /await endCall\("remote"\);/);
  assert.equal(/setPhase\("ended"\)/.test(slice(pageCode, '} else if (realtime.status === "ended") {', "}, [callMode, realtime.status]);")), false);
  // 상시 종료 경로가 router.push를 따로 갖지 않는다(이동은 공통 함수 · 기존 셸 진행 · 거절뿐).
  assert.equal(slice(pageCode, "const handleEndTraining = async () => {", "const handleEndedShellProceed").includes("router.push"), false);
});

test("[G515] 폴백 끊기 응답 — 마지막 대사 재생 완료(onEnded) 뒤에만 ended · 사유 힌트 scammer_ended", () => {
  const send = slice(pageCode, 'if (result.ended && result.endReason === "scammer_ended") {', "return;");
  assert.ok(send.indexOf("setPlaybackUrl(result.audioUrl)") < send.indexOf('void endCall("scammer", { fallbackLastLine: { hasAudio: Boolean(result.audioUrl) } });'));
  assert.equal(send.includes('setPhase("ended")'), false, "폴백 끊기 응답이 오디오 전에 ended로 간다(G515)");
  // 공통 함수 안에서 ended는 E3 대기 뒤에만 온다.
  const body = endCallBody();
  const waitAt = body.indexOf("await waitForEndStep(");
  assert.ok(waitAt >= 0);
  for (const m of body.matchAll(/setPhase\("ended"\)/g)) assert.ok((m.index ?? -1) > waitAt, "E3 대기 앞에 ended가 있다(G515)");
  // onEnded가 E3 대기를 푼다 · 재생 거부는 읽을 틈(1500ms)으로 푼다.
  assert.ok(slice(pageCode, "const handlePlaybackEnded = () => {", "};").includes("fallbackLastLineDoneRef.current?.();"));
  assert.ok(pageCode.includes("fallbackLastLineRejectedRef.current?.();"));
  assert.match(body, /fallbackLastLineRejectedRef\.current = \(\) => endTimeout\(finish, HANGUP_NO_AUDIO_READ_MS\);/);
  // 사유 = 래치 사유(폴백 끊기 = scammer → scammer_ended — reasonForEndedBy).
  assert.ok(body.includes("setPendingEndReason(sessionId, ending.reason)"));
});

test("[G515 역검증] 폴백 끊기 분기에서 곧바로 ended로 가는 사본은 같은 검사식에 걸린다", () => {
  const poisoned = pageCode.replace(
    'void endCall("scammer", { fallbackLastLine: { hasAudio: Boolean(result.audioUrl) } });',
    'setPhase("ended");',
  );
  assert.notEqual(poisoned, pageCode, "주입 앵커가 없다");
  const send = slice(poisoned, 'if (result.ended && result.endReason === "scammer_ended") {', "return;");
  assert.equal(send.includes('setPhase("ended")'), true);
});

test("[§79.9 E2 · G510] 래치 뒤 동결 — 지시 큐 · 문자 백스톱 · 자동 호 전환 · 폴백 자동 청취 · 입력 전송 · 채널 전환", () => {
  const drain = slice(pageCode, "const drainInstructionQueue = useCallback(() => {", "const { item, rest } = takeNextInstruction(");
  assert.ok(drain.indexOf("if (isEndLatched(callEndingRef.current)) return;") >= 0);
  assert.equal((pageCode.match(/if \(isEndLatched\(callEndingRef\.current\)\) return;/g) ?? []).length >= 5, true);
  assert.match(pageCode, /if \(endLatched\) return;/);
  const handleSend = slice(pageCode, "const handleSend = async (", "if (callMode === \"realtime\") {");
  assert.ok(handleSend.includes("if (isEndLatched(callEndingRef.current)) return;"), "래치 뒤 입력이 전송된다");
});

test("[UX-014 v1.35 (1)(3)(6) · D-110] remote-hangup — 정본 문구는 상수 · 기존 셸 대체 0(공존) · 흐린 그리드(inert · aria-disabled) · 통화 종료 활성", () => {
  assert.match(pageCode, /const remoteHangup = phase === "ended" && callEndedBy === "scammer";/);
  assert.ok(pageCode.includes("REMOTE_HANGUP_STATUS_LINE"), "정본 문구를 상수가 아닌 리터럴로 그렸다");
  assert.equal(page.includes("상대방이 통화를 종료했습니다"), false, "화면 파일에 정본 문구 리터럴이 있다(상수 1곳)");
  // 기존 셸은 remote-hangup이 아닐 때만(연결 종료 · 폴백 한도 — 무변경 공존) · 그 버튼은 셸 진행 함수.
  assert.ok(pageCode.includes(') : phase === "ended" && !remoteHangup ? ('));
  assert.ok(pageCode.includes("onClick={() => void handleEndedShellProceed()}"));
  assert.match(pageCode, /aria-disabled=\{remoteHangup \? true : undefined\}/);
  assert.match(pageCode, /inert=\{remoteHangup \? true : undefined\}/);
  // 통화 종료 버튼은 흐린 영역 밖(형제)이고 상시 종료를 그대로 부른다.
  const dim = slice(pageCode, "ref={hangupDimRef}", "ref={endCallButtonRef}");
  assert.equal(dim.includes('aria-label="통화 종료 — 훈련 종료"'), false, "통화 종료가 흐린 영역 안에 있다(AC-006)");
});

// ── T192 C5 리뷰 반영(M1 · M2 · M3 · m1 · m2 · m3) ─────────────────────────────────────────────────────────

/** 문자함 · 확인 시트 여는 핸들러 각각의 첫 실행 줄이 래치 가드인가. 역검증과 같은 판정식. */
function openHandlersGuarded(code: string): string[] {
  const missing: string[] = [];
  for (const [label, head] of [
    ["문자함", "const handleOpenSmsOverlay = (trigger: HTMLButtonElement | null) => {"],
    ["확인 시트", "const handleOpenVerifyOverlay = () => {"],
  ] as const) {
    const start = code.indexOf(head);
    if (start < 0) {
      missing.push(`${label}: 핸들러 없음`);
      continue;
    }
    const firstStatement = code.slice(start + head.length).trim().split("\n")[0]!.trim();
    if (firstStatement !== "if (isEndLatched(callEndingRef.current)) return;") missing.push(`${label}: 첫 줄이 래치 가드가 아니다`);
  }
  return missing;
}

test("[C5 리뷰 M1] 문자함 · 확인 시트를 여는 핸들러의 첫 줄 = 래치 가드(E2가 닫은 뒤 다시 열리지 않는다 — D-113)", () => {
  assert.deepEqual(openHandlersGuarded(pageCode), []);
  // remote-hangup(phase ended)에서 문자 배너는 그려지지 않는다(`visibleBannerSmsId`의 ended 조건) — 배너 탭 경로도 위 가드를 탄다.
  assert.match(pageCode, /ended: phase === "ended",/);
});

test("[C5 리뷰 M1 역검증] 두 가드 중 하나를 지운 사본은 같은 판정식에 걸린다", () => {
  for (const head of [
    "const handleOpenSmsOverlay = (trigger: HTMLButtonElement | null) => {",
    "const handleOpenVerifyOverlay = () => {",
  ]) {
    const start = pageCode.indexOf(head);
    const guardAt = pageCode.indexOf("if (isEndLatched(callEndingRef.current)) return;", start);
    const poisoned = pageCode.slice(0, guardAt) + pageCode.slice(guardAt + "if (isEndLatched(callEndingRef.current)) return;".length);
    assert.equal(openHandlersGuarded(poisoned).length, 1, head);
  }
});

test("[C5 리뷰 M2 · UX D-112] 폴백 <audio> 재생 오류 = 거부와 같은 처리(1500ms 뒤 대기 종료)", () => {
  const audio = slice(pageCode, "<audio", "/>");
  assert.match(audio, /onEnded=\{handlePlaybackEnded\}/);
  assert.match(audio, /onError=\{\(\) => fallbackLastLineRejectedRef\.current\?\.\(\)\}/);
  // 거부 처리 자체가 1500ms 타이머다(같은 함수 — 자동재생 거부 · 재생 오류 두 입구).
  assert.match(endCallBody(), /fallbackLastLineRejectedRef\.current = \(\) => endTimeout\(finish, HANGUP_NO_AUDIO_READ_MS\);/);
});

test("[C5 리뷰 M3] 정지된 통화 시간 — <p aria-label> 0 · 시각 숫자는 aria-hidden · 읽을 문장은 sr-only", () => {
  const block = slice(pageCode, 'remoteHangup && deviceSkin.skin !== "ios" && (', "</p>");
  assert.equal(/<p[^>]*aria-label=/.test(block), false, "일반 <p>에 aria-label이 있다");
  assert.match(block, /<span aria-hidden="true">\{formatCallElapsed\(elapsedSec\)\}<\/span>/);
  assert.match(block, /<span className="sr-only">\{`통화 시간 \$\{Math\.floor\(elapsedSec \/ 60\)\}분 \$\{elapsedSec % 60\}초`\}<\/span>/);
});

test("[C5 리뷰 m1] remote-hangup 포커스 이동은 레이아웃 effect", () => {
  assert.match(pageCode, /useLayoutEffect\(\(\) => \{\s*if \(!remoteHangup\) return;/);
});

test("[C5 리뷰 m2 · m3] endCall — 타이머는 endTimeout 하나(언마운트 일괄 정리) · 언마운트 뒤 이동 0 · flush~이동 try/finally", () => {
  const body = endCallBody();
  assert.equal(body.includes("window.setTimeout("), false, "공통 종료 함수가 정리되지 않는 타이머를 직접 건다");
  const unmount = slice(pageCode, "const endCallMountedRef = useRef(true);", "const endTimeout = ");
  assert.match(unmount, /endCallMountedRef\.current = false;/);
  assert.match(unmount, /timers\.forEach\(\(id\) => window\.clearTimeout\(id\)\);/);
  assert.match(unmount, /skipEndWaitRef\.current\?\.\(\);/);
  // 이동은 finally 안 · 마운트 가드 뒤 1곳.
  assert.equal((body.match(/router\.push\(/g) ?? []).length, 1);
  assert.match(body, /\} finally \{\s*if \(endCallMountedRef\.current\) router\.push\("\/session\/end"\);\s*\}/);
  const tryAt = body.indexOf("try {");
  assert.ok(tryAt >= 0 && tryAt < body.indexOf("const flushDone = flushTranscript();"), "flush가 try 밖이다");
  // E3 대기 뒤 · E4 앞의 마운트 가드(대기 중 화면이 사라지면 아무것도 안 한다).
  const guardAt = body.indexOf("if (!endCallMountedRef.current) return;");
  assert.ok(guardAt > body.indexOf("await waitForEndStep(") && guardAt < body.indexOf("realtime.stop();"));
});

test("[C5 리뷰 m2 역검증] 마운트 가드를 지운 사본은 같은 검사식에 걸린다", () => {
  const poisoned = endCallBody().replace("if (endCallMountedRef.current) router.push", "router.push");
  assert.equal(/\} finally \{\s*if \(endCallMountedRef\.current\) router\.push\("\/session\/end"\);\s*\}/.test(poisoned), false);
});
