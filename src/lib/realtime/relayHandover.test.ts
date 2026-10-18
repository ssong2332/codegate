// T191 S7 — 릴레이 "돌려 주기" 클라 판정 · 배선 게이트. UX UF-013 · P-38 (8) R-1~R-5 · 계약 C-6/C-7/C-10 ·
// Architecture T191 릴레이 설계("클라 — 교대 순서" · OQ-U70 판정) · PRD AC-101 (c)(i)(j).
// 테스트 이름에는 게이트 번호 대신 의미를 쓴다. 역방향 샘플은 테스트 코드 안에서만 만든다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  captionWithSpeaker,
  decideLiveRelayCeiling,
  decideRelayResume,
  formatRelayEvent,
  isHeldForRelay,
  relayFailureAction,
  relayGreetingDelayMs,
  shouldIgnoreLiveEnded,
  shouldStartRelayCut,
  RELAY_CONNECT_TONE_CAPTION,
  RELAY_CUT_MS,
  RELAY_HOLD_MAX_MS,
  RELAY_HOLD_MIN_MS,
  RELAY_PLAYBACK_WAIT_CAP_MS,
} from "./relayHandover.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const PAGE = read("../../app/session/play/page.tsx");
const GVS = read("./GeminiVoiceSession.tsx");

test("[T191 S7 대기 타이머] 경계 — 최소 2초 · 최대 15초(OQ-U70 판정) · 끊김음 약 0.3초", () => {
  assert.equal(RELAY_HOLD_MIN_MS, 2000);
  assert.equal(RELAY_HOLD_MAX_MS, 15000);
  assert.equal(RELAY_CUT_MS, 300);
  const at = (elapsed: number, ready: boolean) => decideRelayResume({ holdStartedAtMs: 1000, nowMs: 1000 + elapsed, newSpeakerReady: ready });
  assert.equal(at(0, true), "wait", "준비돼도 2초 전에는 재개하지 않는다");
  assert.equal(at(1999, true), "wait");
  assert.equal(at(2000, true), "resume");
  assert.equal(at(14999, false), "wait");
  assert.equal(at(15000, false), "timeout", "15초 미준비 = 실패(무한 대기 0 — P-38 (6))");
  assert.equal(at(16000, true), "resume", "늦게라도 준비되면 재개");
  assert.equal(relayGreetingDelayMs(1000, 1500), 1500, "새 연결이 빨라도 첫마디는 최소 2초 뒤");
  assert.equal(relayGreetingDelayMs(1000, 4000), 0);
});

test("[T191 S7 끊김음 시작] 넘김 대사 재생이 끝나야 끊김음 — 8초 넘게 안 끝나면 기다리지 않는다", () => {
  assert.equal(shouldStartRelayCut({ agentSpeaking: false, armedAtMs: 0, nowMs: 1 }), true);
  assert.equal(shouldStartRelayCut({ agentSpeaking: true, armedAtMs: 0, nowMs: RELAY_PLAYBACK_WAIT_CAP_MS - 1 }), false);
  assert.equal(shouldStartRelayCut({ agentSpeaking: true, armedAtMs: 0, nowMs: RELAY_PLAYBACK_WAIT_CAP_MS }), true);
});

test("[T191 S7 천장] 넛지 1회 · 천장 + 2 강제 · 천장 없음 = 교대 없음", () => {
  const ceiling = { nudgeAfterUserTurns: 8, forceAfterUserTurns: 10 };
  assert.equal(decideLiveRelayCeiling({ userTurnsInLeg: 7, ceiling, nudged: false }), "none");
  assert.equal(decideLiveRelayCeiling({ userTurnsInLeg: 8, ceiling, nudged: false }), "nudge");
  assert.equal(decideLiveRelayCeiling({ userTurnsInLeg: 9, ceiling, nudged: true }), "none", "넛지는 1회");
  assert.equal(decideLiveRelayCeiling({ userTurnsInLeg: 10, ceiling, nudged: true }), "force");
  assert.equal(decideLiveRelayCeiling({ userTurnsInLeg: 99, ceiling: undefined, nudged: false }), "none");
});

test("[T191 S7 실패] 실시간 1회 재시도 → 텍스트 강등 → 종료 · 같은 목소리 계속 · 침묵 종료 행동 없음(AC-101 (i)) · 역방향 샘플", (t) => {
  assert.equal(relayFailureAction({ liveFailures: 0, textFailed: false }), "retry-live");
  assert.equal(relayFailureAction({ liveFailures: 1, textFailed: false }), "degrade-text");
  assert.equal(relayFailureAction({ liveFailures: 1, textFailed: true }), "end");
  const actions = new Set<string>();
  for (const liveFailures of [0, 1, 2, 5]) for (const textFailed of [false, true]) actions.add(relayFailureAction({ liveFailures, textFailed }));
  const allowed = new Set(["retry-live", "degrade-text", "end"]);
  const illegal = (set: Set<string>) => [...set].filter((a) => !allowed.has(a));
  const polluted = new Set([...actions, "continue-same-voice"]);
  t.diagnostic(`정상 행동 집합=${JSON.stringify([...actions])} 금지 행동=${JSON.stringify(illegal(actions))} | 오염(같은 목소리 계속 추가) 금지 행동=${JSON.stringify(illegal(polluted))}`);
  assert.deepEqual(illegal(actions), []);
  assert.deepEqual(illegal(polluted), ["continue-same-voice"]);
});

test("[T191 S7 종료 무시] 이전 소켓 닫힘은 연출 중에만 무시한다 — 평상시 종료는 그대로(AC-006) · 역방향(항상 무시 샘플은 걸린다)", (t) => {
  const contract = (fn: (active: boolean) => boolean) => fn(true) === true && fn(false) === false;
  t.diagnostic(`정상=${contract(shouldIgnoreLiveEnded)} | 오염(항상 무시)=${contract(() => true)}`);
  assert.equal(contract(shouldIgnoreLiveEnded), true);
  assert.equal(contract(() => true), false);
});

test("[T191 S7 자막 · 보류] [연결음] 1줄 · 교대 뒤 줄만 화자 접두 · 폴백 연결음 동안 새 leg 줄 보류", () => {
  assert.equal(RELAY_CONNECT_TONE_CAPTION, "[연결음]");
  assert.equal(captionWithSpeaker(undefined, "여보세요"), "여보세요");
  assert.equal(captionWithSpeaker("금융감독원 직원", "넘겨받았습니다"), "금융감독원 직원: 넘겨받았습니다");
  assert.equal(isHeldForRelay(5, null), false);
  assert.equal(isHeldForRelay(4, 5), false);
  assert.equal(isHeldForRelay(5, 5), true);
});

test("[T191 S7 이벤트] C-10 — 시작 · 완료(지연 ms) · 실패(사유) — 숫자 · 종류만", () => {
  const started = JSON.parse(formatRelayEvent("relay_handover_started", { legIndex: 1, path: "live" }));
  assert.deepEqual(started, { event: "relay_handover_started", legIndex: 1, path: "live" });
  const done = JSON.parse(formatRelayEvent("relay_handover_completed", { legIndex: 1, path: "live", latencyMs: 4321.6 }));
  assert.equal(done.latencyMs, 4322);
  const failed = JSON.parse(formatRelayEvent("relay_handover_failed", { legIndex: 2, path: "text", reason: "hold-timeout" }));
  assert.equal(failed.reason, "hold-timeout");
  for (const ev of ["relay_handover_started", "relay_handover_completed", "relay_handover_failed"]) {
    assert.ok(PAGE.includes(`"${ev}"`) || PAGE.includes(`logRelay("${ev}"`), `${ev} 배선`);
  }
});

test("[T191 S7 배선 · 화면] 재마운트 key · 연출 중 음소거 · 종료 무시 래퍼 · 3모드 호출 · 타이핑 보류 · 래치 자리", () => {
  assert.ok(PAGE.includes("key={`leg-${relayMountSeq}`}"), "새 토큰마다 새 세션 컴포넌트");
  assert.ok(PAGE.includes('micHeld={relayPhase !== "idle"'), "대기 중 음성 미전달(음소거 표시와 별개 입력)");
  assert.ok(GVS.includes("mutedRef.current = muted || Boolean(micHeld);"), "마이크 게이트가 micHeld를 본다");
  assert.ok(PAGE.includes("onEnded={handleLiveEnded}") && PAGE.includes("onError={handleLiveError}"));
  for (const mode of ['mode: "check"', 'mode: "live"', 'mode: "text"']) assert.ok(PAGE.includes(mode), mode);
  assert.ok(PAGE.includes("relayPendingTextsRef.current.push(text);"), "연결음 동안 타이핑 보류");
  assert.ok(PAGE.includes("initialScammerTurns={scammerTurns}"), "부모 소유 누적 카운터");
  assert.ok(PAGE.includes("const hangupLatchedRef = useRef(false);"), "T192 래치 자리(부모 소유)");
  // 재개 시 연결음 정지 · 종료 시 정지
  const finish = PAGE.slice(PAGE.indexOf("const finishRelay = "), PAGE.indexOf("const adoptRelayLeg = "));
  assert.ok(finish.includes("stopRelayTones();"));
  assert.ok(PAGE.includes('if (phase !== "ended") return;\n    relayToneRef.current?.stop();'));
  // 넘김 대사 직후(턴 끝) 무장 → 재생 종료 뒤 끊김음
  assert.ok(PAGE.includes('setRelayPhaseBoth("armed");'));
  // 화면 문구 0(R-3) — 연출 중 새로 그리는 것은 자막 [연결음]뿐(통화 필 자막 슬롯)
  assert.ok(PAGE.includes('relayPhase === "cut" || relayPhase === "hold" ? RELAY_CONNECT_TONE_CAPTION'));
});

test("[T191 S7 배선 · 세션] 새 leg 첫마디는 relayGreeting 큐 턴 · 최소 2초 뒤 · 카운터 시작값 · transfer_call 라우팅 · 첫 오디오 신호", () => {
  assert.ok(GVS.includes('turn: { kind: "relayGreeting", text: relayGreetingTrigger },'));
  assert.ok(GVS.includes("(relayGreetingNotBeforeMs ?? 0) - performance.now()"));
  assert.ok(GVS.includes("let modelToolScammerTurns = initialScammerTurns ?? 0;"));
  assert.ok(GVS.includes('if (kind === "transfer_call") {'));
  assert.ok(GVS.includes("handlersRef.current.onFirstAudio?.();"));
  // 오프닝 트리거는 릴레이가 아닐 때만(종전 경로 유지)
  assert.ok(GVS.includes('turn: { kind: "opening", text: OPENING_TRIGGER_TURN },'));
});

test("[T191 S7 도구 라우팅] transfer_call 이름은 서버가 내려준 값과 일치할 때만 · 부재면 unsupported(하드코딩 0)", async () => {
  const { resolveToolCallKind } = await import("./liveToolResponse.ts");
  const tools = { transferCall: "transfer_call", failureInstruction: "x" };
  assert.equal(resolveToolCallKind("transfer_call", tools), "transfer_call");
  assert.equal(resolveToolCallKind("transfer_call", { failureInstruction: "x" }), "unsupported");
});

test("[T191 S7 확인 창구 #140 · 전사 순서] 릴레이 흐름만 창구 새 연결 · 릴레이 없는 6종은 같은 소켓 · 종료 제출은 진행 중 교대를 기다린다", () => {
  assert.ok(PAGE.includes("if (relayFlowRef.current) {\n          void runVerifyDeskHandover();\n        } else {\n          enqueueTurnInstruction(result.reconnectInstruction, \"verify\", { speakerSwitch: true });"));
  assert.ok(PAGE.includes('purpose: "verifyDesk"'));
  assert.ok(PAGE.includes("micHeld={relayPhase !== \"idle\" || deskConnecting}"));
  const flush = PAGE.slice(PAGE.indexOf("const flushTranscript = useCallback("), PAGE.indexOf("const flushTranscript = useCallback(") + 400);
  assert.ok(flush.indexOf("await relayInFlightRef.current") > 0 && flush.indexOf("await relayInFlightRef.current") < flush.indexOf("const turns = transcriptRef.current"));
  assert.equal((PAGE.match(/await startRelayLeg\(/g) ?? []).length, 0, "모든 호출이 진행 추적을 거친다");
});
