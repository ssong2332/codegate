// 수정안 A(2026-10-18, 라이브 d13e718 무음 신고) — 받기 탭 안 동기 컨텍스트 생성 · 빌려 쓰기 · 누수 없는 해제 · 안전망.
//
// ⚠️ CRLF 체크아웃(core.autocrlf=true)에서도 맞도록 소스는 **이 파일 안에서만** `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RESUME_GESTURE_EVENTS,
  closePrimedCallAudio,
  isUsableContext,
  primeCallAudio,
  resumeSuspendedContexts,
  shouldReleasePrimedCallAudio,
} from "./callAudio.ts";

const readLf = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const play = readLf("src/app/session/play/page.tsx");
const session = readLf("src/lib/realtime/GeminiVoiceSession.tsx");

/** 가짜 AudioContext — 생성 옵션 · resume/close 호출을 기록한다. */
function installFakeAudioContext() {
  const created: FakeCtx[] = [];
  class FakeCtx {
    state = "suspended";
    sampleRate: number;
    resumeCalls = 0;
    closeCalls = 0;
    constructor(options?: { sampleRate?: number }) {
      this.sampleRate = options?.sampleRate ?? 48000;
      created.push(this);
    }
    resume() {
      this.resumeCalls += 1;
      this.state = "running";
      return Promise.resolve();
    }
    close() {
      this.closeCalls += 1;
      this.state = "closed";
      return Promise.resolve();
    }
  }
  (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeCtx };
  return {
    created,
    uninstall: () => {
      delete (globalThis as unknown as { window?: unknown }).window;
    },
  };
}

test("[A] primeCallAudio — 출력(지정 샘플레이트)·입력 컨텍스트를 만들고 **같은 동기 구간에서** resume을 요청한다", () => {
  const fake = installFakeAudioContext();
  try {
    const primed = primeCallAudio(24000, 123);
    // await 없이 바로 본다 — resume 요청이 탭 핸들러의 동기 구간 안에서 나갔어야 한다.
    assert.equal(fake.created.length, 2);
    assert.equal(fake.created[0].sampleRate, 24000);
    assert.equal(fake.created[0].resumeCalls, 1);
    assert.equal(fake.created[1].resumeCalls, 1);
    assert.equal(primed.createdAtMs, 123);
    assert.ok(primed.output && primed.input);
  } finally {
    fake.uninstall();
  }
});

test("[A] AudioContext가 없는 환경에서는 null 칸을 돌려준다(세션 컴포넌트가 종전대로 만든다)", () => {
  const primed = primeCallAudio(24000, 5);
  assert.deepEqual(primed, { output: null, input: null, createdAtMs: 5 });
});

test("[A] isUsableContext — 닫힌 것 · 없는 것은 빌리지 않는다", () => {
  assert.equal(isUsableContext(null), false);
  assert.equal(isUsableContext(undefined), false);
  assert.equal(isUsableContext({ state: "closed" }), false);
  assert.equal(isUsableContext({ state: "suspended" }), true);
  assert.equal(isUsableContext({ state: "running" }), true);
});

test("[A] 해제 판정표 — Gemini가 쓸 일이 없어지면 닫는다(마운트된 뒤 오류는 종료·언마운트까지 둔다)", () => {
  const rows: Array<[{ status: string; provider: string | null | undefined; ended: boolean; callMode: string }, boolean]> = [
    [{ status: "connecting", provider: undefined, ended: false, callMode: "realtime" }, false],
    [{ status: "connecting", provider: "gemini", ended: false, callMode: "realtime" }, false],
    [{ status: "active", provider: "gemini", ended: false, callMode: "realtime" }, false],
    [{ status: "error", provider: "gemini", ended: false, callMode: "realtime" }, false],
    [{ status: "error", provider: undefined, ended: false, callMode: "realtime" }, true],
    [{ status: "error", provider: "none", ended: false, callMode: "realtime" }, true],
    [{ status: "fallback", provider: "none", ended: false, callMode: "realtime" }, true],
    [{ status: "unsupported", provider: undefined, ended: false, callMode: "realtime" }, true],
    [{ status: "permission-denied", provider: undefined, ended: false, callMode: "realtime" }, true],
    [{ status: "connecting", provider: "elevenlabs", ended: false, callMode: "realtime" }, true],
    [{ status: "active", provider: "gemini", ended: true, callMode: "realtime" }, true],
    // reviewer m1 — Gemini 오류 뒤 텍스트 폴백으로 내려가면(세션이 더는 실시간 오디오를 쓰지 않는다) 닫는다.
    [{ status: "error", provider: "gemini", ended: false, callMode: "fallback" }, true],
    [{ status: "active", provider: "gemini", ended: false, callMode: "fallback" }, true],
  ];
  for (const [input, expected] of rows) {
    assert.equal(shouldReleasePrimedCallAudio(input), expected, JSON.stringify(input));
  }
});

test("[A] closePrimedCallAudio — 두 칸을 닫고 멱등이다(두 번 불러도 close 1회)", () => {
  const fake = installFakeAudioContext();
  try {
    const primed = primeCallAudio(24000, 0);
    closePrimedCallAudio(primed);
    closePrimedCallAudio(primed);
    closePrimedCallAudio(null);
    assert.deepEqual(fake.created.map((c) => c.closeCalls), [1, 1]);
  } finally {
    fake.uninstall();
  }
});

test("[A 안전망] resumeSuspendedContexts — suspended·interrupted만 깨우고 running·closed·null은 건드리지 않는다", () => {
  const make = (state: string) => {
    const ctx = { state, calls: 0, resume: () => ((ctx.calls += 1), Promise.resolve()) };
    return ctx;
  };
  const list = [make("suspended"), make("interrupted"), make("running"), make("closed")];
  assert.equal(resumeSuspendedContexts([...list, null, undefined]), 2);
  assert.deepEqual(list.map((c) => c.calls), [1, 1, 0, 0]);
  // 터치에서는 pointerdown이 사용자 활성화가 아니다 — pointerup/touchend를 들어야 한다.
  assert.ok(RESUME_GESTURE_EVENTS.includes("pointerup") && RESUME_GESTURE_EVENTS.includes("touchend"));
});

// ── 배선(소스 단언) — 이 러너는 React·AudioContext를 실행할 수 없어 배선은 소스로 고정한다 ───────────────

function sliceBetween(code: string, start: string, end: string): string {
  const i = code.indexOf(start);
  const j = i >= 0 ? code.indexOf(end, i + start.length) : -1;
  return i >= 0 && j > i ? code.slice(i, j) : "";
}

/** 받기 핸들러 위반 — 동기 생성(primeCallAudio)이 핸들러 안 · realtime.start 앞 · await 0 · 상태로 보관. */
function answerPrimeViolations(code: string): string[] {
  const out: string[] = [];
  // 주석은 걷어 낸다(근거 주석이 "await"라는 낱말을 쓴다).
  const body = sliceBetween(code, "const handleAnswer = () => {", "const handleDecline")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  if (!body) return ["handleAnswer를 찾지 못했다"];
  const prime = body.indexOf("primeCallAudio(GEMINI_OUTPUT_SAMPLE_RATE");
  const start = body.indexOf("realtime.start(sessionId)");
  if (prime < 0) out.push("handleAnswer 안에서 primeCallAudio를 부르지 않는다");
  else if (start >= 0 && prime > start) out.push("primeCallAudio가 realtime.start 뒤에 있다");
  if (/\bawait\b|async/.test(body)) out.push("handleAnswer에 await/async가 있다(동기 구간이 깨진다)");
  if (!body.includes("setPrimedCallAudio(primedAudio)")) out.push("만든 컨텍스트를 화면 상태로 보관하지 않는다");
  // reviewer m2 — 재진입 가드(ref) · reviewer M2 — `audioprime=0`이면 만들지 않는다.
  const guard = body.indexOf("if (!primedAudio && audioFlags.audioPrime) {");
  if (guard < 0 || (prime >= 0 && guard > prime)) out.push("재진입 가드·audioprime 플래그 분기가 생성 앞에 없다");
  if (!body.includes("let primedAudio = primedCallAudioRef.current;")) out.push("재진입 가드가 ref를 보지 않는다");
  if (!body.includes("primedCallAudioRef.current = primedAudio;")) out.push("만든 컨텍스트를 ref에 기록하지 않는다");
  // 다른 곳(effect 등)에서 만들면 안 된다 — 정확히 1회.
  if ((code.match(/primeCallAudio\(/g) ?? []).length !== 1) out.push("primeCallAudio 호출이 정확히 1회가 아니다");
  return out;
}

/** 화면 쪽 소유·해제 위반. */
function pageOwnershipViolations(code: string): string[] {
  const out: string[] = [];
  if (!code.includes("primedAudio={primedCallAudio}")) out.push("GeminiVoiceSession에 primedAudio를 넘기지 않는다");
  if (!code.includes("return () => closePrimedCallAudio(primedCallAudio);")) out.push("언마운트 cleanup이 닫지 않는다");
  if (!/shouldReleasePrimedCallAudio\(\{[\s\S]*?\}\)\s*\)\s*\{\s*closePrimedCallAudio\(primedCallAudio\);/.test(code)) {
    out.push("해제 판정이 closePrimedCallAudio로 이어지지 않는다");
  }
  return out;
}

/** 세션 쪽 빌려 쓰기 위반 — 살아 있으면 쓴다 · 빌린 것은 닫지 않는다 · 자기 것은 닫는다. */
function sessionBorrowViolations(code: string): string[] {
  const out: string[] = [];
  // §122.2.2 — 마이크 뒤 새 출력 컨텍스트(`freshOutput`)를 쓰면 빌리지 않는다. 그 밖은 종전 판정 그대로.
  if (!code.includes("outputBorrowed = freshOutput === null && isUsableContext(primedOutput);")) out.push("출력 컨텍스트 빌림 판정이 없다");
  if (!code.includes("outputBorrowed && primedOutput ? primedOutput : new AudioContext({ sampleRate: GEMINI_OUTPUT_SAMPLE_RATE })")) {
    out.push("넘겨받은 출력 컨텍스트를 쓰지 않는다");
  }
  const cleanup = sliceBetween(code, "const cleanup = () => {", "cleanupRef.current = cleanup;");
  if (!cleanup) return [...out, "cleanup을 찾지 못했다"];
  const borrowedBranch = sliceBetween(cleanup, "if (outputBorrowed) {", "} else {");
  if (!borrowedBranch) out.push("cleanup이 빌린 출력 컨텍스트를 구분하지 않는다");
  else if (borrowedBranch.includes(".close(")) out.push("cleanup이 빌린 출력 컨텍스트를 닫는다(소유권 = 화면)");
  if (!/if \(outputBorrowed\) \{[\s\S]*?\} else \{\s*void outputContext\?\.close\(\)/.test(cleanup)) {
    out.push("자기가 만든 출력 컨텍스트를 닫지 않는다(누수)");
  }
  if (!/if \(inputBorrowed\) \{[\s\S]*?\} else \{\s*void inputContext\?\.close\(\)/.test(cleanup)) {
    out.push("자기가 만든 입력 컨텍스트를 닫지 않는다(누수)");
  }
  return out;
}

test("[A] 받기 핸들러 안에서 출력 컨텍스트를 동기로 만들고 보관한다", () => {
  assert.deepEqual(answerPrimeViolations(play), []);
});

test("[A] 화면이 넘겨주고 · 해제 판정으로 닫고 · 언마운트에서 닫는다(누수 0)", () => {
  assert.deepEqual(pageOwnershipViolations(play), []);
});

test("[A] GeminiVoiceSession은 넘겨받은 컨텍스트를 쓰고, 빌린 것은 닫지 않으며, 자기 것은 닫는다", () => {
  assert.deepEqual(sessionBorrowViolations(session), []);
});

test("[A 역검증] 생성을 effect로 옮긴 사본 · 보관을 지운 사본 · 언마운트 닫기를 지운 사본 · 빌린 것을 닫는 사본은 각각 실패한다", (t) => {
  const primeLine = "      primedAudio = primeCallAudio(GEMINI_OUTPUT_SAMPLE_RATE, performance.now());\n";
  assert.ok(play.includes(primeLine), "오염 지점(받기 핸들러의 primeCallAudio)을 찾지 못했다 — 역검증이 공회전한다");
  const moved = play.replace(primeLine, "      primedAudio = { output: null, input: null, createdAtMs: 0 };\n");
  const a = answerPrimeViolations(moved);

  const unmount = "    return () => closePrimedCallAudio(primedCallAudio);";
  assert.ok(play.includes(unmount));
  const b = pageOwnershipViolations(play.replace(unmount, "    return () => {};"));

  const keep = "      if (outputBorrowed) {\n        stopAllPlayback();\n        outputGain?.disconnect();\n      } else {";
  assert.ok(session.includes(keep), "오염 지점(cleanup의 빌림 분기)을 찾지 못했다");
  const c = sessionBorrowViolations(
    session.replace(keep, "      if (outputBorrowed) {\n        void outputContext?.close();\n      } else {"),
  );
  const notUsed = sessionBorrowViolations(
    session.replace(
      "outputBorrowed && primedOutput ? primedOutput : new AudioContext({ sampleRate: GEMINI_OUTPUT_SAMPLE_RATE })",
      "new AudioContext({ sampleRate: GEMINI_OUTPUT_SAMPLE_RATE })",
    ),
  );
  t.diagnostic(`[A] 정상 0 / 생성 이동 ${JSON.stringify(a)} / 언마운트 닫기 삭제 ${JSON.stringify(b)} / 빌린 것 닫기 ${JSON.stringify(c)} / 안 씀 ${JSON.stringify(notUsed)}`);
  assert.ok(a.includes("handleAnswer 안에서 primeCallAudio를 부르지 않는다"));
  assert.deepEqual(b, ["언마운트 cleanup이 닫지 않는다"]);
  assert.ok(c.includes("cleanup이 빌린 출력 컨텍스트를 닫는다(소유권 = 화면)"));
  assert.deepEqual(notUsed, ["넘겨받은 출력 컨텍스트를 쓰지 않는다"]);
});

/** 안전망 위반 — 통화 phase에서만 · capture+passive · 기본 동작/전파를 막지 않는다 · cleanup에서 뗀다. */
function safetyNetViolations(code: string): string[] {
  const out: string[] = [];
  const effect = sliceBetween(code, "const handleGesture = () => {", "}, [phase, primedCallAudio]);");
  if (!effect) return ["안전망 effect를 찾지 못했다"];
  if (!effect.includes("resumeSuspendedContexts(")) out.push("안전망이 resume을 요청하지 않는다");
  if (/preventDefault|stopPropagation|stopImmediatePropagation/.test(effect)) out.push("안전망이 기본 동작·전파를 막는다");
  if (!effect.includes("{ capture: true, passive: true }")) out.push("리스너가 capture+passive가 아니다");
  if (!effect.includes("window.removeEventListener(")) out.push("cleanup에서 리스너를 떼지 않는다");
  const before = code.slice(0, code.indexOf("const handleGesture = () => {"));
  const guard = before.slice(before.lastIndexOf("useEffect(() => {"));
  if (!guard.includes('if (phase !== "connecting" && phase !== "opening" && phase !== "live") return;')) {
    out.push("안전망이 통화 phase로 한정되지 않는다");
  }
  return out;
}

test("[A 안전망] 다음 사용자 탭에서 resume 재시도 — 통화 phase 한정 · passive · 전파 무변경 · 떼기", () => {
  assert.deepEqual(safetyNetViolations(play), []);
});

test("[A 안전망 역검증] 전파를 막는 사본 · phase 한정을 지운 사본은 실패한다", () => {
  const anchor = "      noteResumeRetry(resumeSuspendedContexts([...targets], noteAudioError));";
  assert.ok(play.includes(anchor), "오염 지점을 찾지 못했다");
  const blocked = safetyNetViolations(play.replace(anchor, `${anchor}\n      event.stopPropagation();`));
  const guard = '    if (phase !== "connecting" && phase !== "opening" && phase !== "live") return;\n    const handleGesture';
  assert.ok(play.includes(guard));
  const unguarded = safetyNetViolations(play.replace(guard, "    const handleGesture"));
  assert.deepEqual(blocked, ["안전망이 기본 동작·전파를 막는다"]);
  assert.deepEqual(unguarded, ["안전망이 통화 phase로 한정되지 않는다"]);
});

// ── reviewer M2 · M3 · m2 — 실기 A/B 플래그 · 벨 close 미루기 · 재진입 가드 ────────────────────────────
import {
  RING_CLOSE_DEFER_CAP_MS,
  RING_CLOSE_POLL_MS,
  readAudioFlags,
  scheduleDeferredRingClose,
  shouldCloseDeferredRing,
} from "./callAudio.ts";

const ringPlayer = readLf("src/lib/phone/ringtonePlayer.ts");

test("[M2] readAudioFlags — 쿼리가 없으면 수정안 기본값, audioprime=0 · ringclose=immediate만 되돌린다", () => {
  assert.deepEqual(readAudioFlags(""), { audioPrime: true, ringCloseImmediate: false });
  assert.deepEqual(readAudioFlags("?audioprime=1&ringclose=deferred"), { audioPrime: true, ringCloseImmediate: false });
  assert.deepEqual(readAudioFlags("?audioprime=0"), { audioPrime: false, ringCloseImmediate: false });
  assert.deepEqual(readAudioFlags("?ringclose=immediate"), { audioPrime: true, ringCloseImmediate: true });
  assert.deepEqual(readAudioFlags("?audiodebug=1&audioprime=0&ringclose=immediate"), {
    audioPrime: false,
    ringCloseImmediate: true,
  });
});

test("[M3] shouldCloseDeferredRing — 통화 출력 running · 상한 경과 · 통화 종료 중 하나면 닫는다", () => {
  assert.equal(shouldCloseDeferredRing({ callOutputState: "suspended", elapsedMs: 0, ended: false }), false);
  assert.equal(shouldCloseDeferredRing({ callOutputState: null, elapsedMs: RING_CLOSE_DEFER_CAP_MS - 1, ended: false }), false);
  assert.equal(shouldCloseDeferredRing({ callOutputState: "running", elapsedMs: 0, ended: false }), true);
  assert.equal(shouldCloseDeferredRing({ callOutputState: "suspended", elapsedMs: RING_CLOSE_DEFER_CAP_MS, ended: false }), true);
  assert.equal(shouldCloseDeferredRing({ callOutputState: undefined, elapsedMs: 0, ended: true }), true);
});

/** 수동 시계 · 수동 타이머. */
function manualTimers() {
  let now = 0;
  const queue = new Map<number, { at: number; fn: () => void }>();
  let id = 0;
  return {
    deps: {
      now: () => now,
      setTimer: (fn: () => void, ms: number) => {
        id += 1;
        queue.set(id, { at: now + ms, fn });
        return id;
      },
      clearTimer: (handle: unknown) => {
        queue.delete(handle as number);
      },
    },
    advance(ms: number) {
      now += ms;
      for (const [key, t] of [...queue]) {
        if (t.at <= now) {
          queue.delete(key);
          t.fn();
        }
      }
    },
    pending: () => queue.size,
  };
}

test("[M3] scheduleDeferredRingClose — 출력이 running이 된 뒤에 1회만 닫고, 타이머를 남기지 않는다", () => {
  const timers = manualTimers();
  let state = "suspended";
  let closes = 0;
  const closeNow = scheduleDeferredRingClose(() => (closes += 1), () => state, timers.deps);
  assert.equal(closes, 0, "출력이 아직 suspended면 닫지 않는다");
  timers.advance(RING_CLOSE_POLL_MS);
  assert.equal(closes, 0);
  state = "running";
  timers.advance(RING_CLOSE_POLL_MS);
  assert.equal(closes, 1, "running을 본 다음 확인에서 닫는다");
  assert.equal(timers.pending(), 0, "닫은 뒤 타이머 0");
  closeNow();
  assert.equal(closes, 1, "멱등");
});

test("[M3] scheduleDeferredRingClose — 끝내 running이 안 돼도 상한에서 닫고, 언마운트(즉시 닫기)는 그 전에도 닫는다", () => {
  const timers = manualTimers();
  let closes = 0;
  scheduleDeferredRingClose(() => (closes += 1), () => "suspended", timers.deps);
  for (let t = 0; t < RING_CLOSE_DEFER_CAP_MS; t += RING_CLOSE_POLL_MS) timers.advance(RING_CLOSE_POLL_MS);
  assert.equal(closes, 1, "상한에서 닫는다");
  assert.equal(timers.pending(), 0);

  const t2 = manualTimers();
  let closes2 = 0;
  const closeNow = scheduleDeferredRingClose(() => (closes2 += 1), () => null, t2.deps);
  closeNow(); // 화면 언마운트
  assert.equal(closes2, 1);
  assert.equal(t2.pending(), 0, "즉시 닫기는 남은 타이머를 지운다");
  t2.advance(RING_CLOSE_DEFER_CAP_MS);
  assert.equal(closes2, 1, "멱등");
});

/** 벨 holdOpen 위반 — 소리·진동은 즉시 0 · 컨텍스트는 닫지 않고 닫기 함수를 돌려준다. */
function holdOpenViolations(code: string): string[] {
  const out: string[] = [];
  const body = sliceBetween(code, "holdOpen: () => {", "return closeAudio;");
  if (!body) return ["holdOpen을 찾지 못했다"];
  if (!body.includes("haltTimers();")) out.push("holdOpen이 벨 타이머를 멈추지 않는다");
  if (!body.includes("voice.osc.stop();")) out.push("holdOpen이 예약 음을 멈추지 않는다");
  if (!body.includes("voice.envelope.disconnect();")) out.push("holdOpen이 엔벨로프를 떼지 않는다");
  if (!body.includes("vibrateOnce(0);")) out.push("holdOpen이 진동을 멈추지 않는다");
  if (/closeAudio\(\)|silenceAll\(\)|\.close\(/.test(body)) out.push("holdOpen이 컨텍스트를 바로 닫는다");
  if (!code.includes("scheduleTone(ctx, tone, cycleStartAt, voices)")) out.push("예약 음을 추적하지 않는다");
  return out;
}

/** 받기 핸들러의 벨 처리 위반 — holdOpen이 stop 앞 · ringclose 플래그 분기 · 미룬 close 예약 · 언마운트 닫기. */
function ringHandoffViolations(code: string): string[] {
  const out: string[] = [];
  const body = sliceBetween(code, "const handleAnswer = () => {", "const handleDecline");
  const hold = body.indexOf("const releaseRing = audioFlags.ringCloseImmediate ? null : (ringAlert?.holdOpen() ?? null);");
  const stop = body.indexOf("incomingAlertRef.current?.stop();");
  if (hold < 0) out.push("받기가 ringclose 플래그로 holdOpen을 고르지 않는다");
  else if (stop >= 0 && hold > stop) out.push("holdOpen이 stop 뒤에 있다(이미 닫힌다)");
  if (!body.includes("deferredRingCloseRef.current = scheduleDeferredRingClose(")) out.push("미룬 close를 예약하지 않는다");
  if (!body.includes("() => readAudioDiag().output?.state")) out.push("미룬 close가 통화 출력 상태를 보지 않는다");
  if (!/useEffect\(\(\) => \{\s*return \(\) => \{\s*deferredRingCloseRef\.current\?\.\(\);/.test(code)) {
    out.push("언마운트 cleanup이 미룬 벨 close를 부르지 않는다");
  }
  return out;
}

test("[M3] 벨 holdOpen — 소리·진동 즉시 0 · 컨텍스트는 열어 두고 닫기 함수를 돌려준다", () => {
  assert.deepEqual(holdOpenViolations(ringPlayer), []);
});

test("[M3] 받기 — holdOpen(기본)/즉시 close(ringclose=immediate) 분기 · 통화 출력 running 뒤 close · 언마운트 닫기", () => {
  assert.deepEqual(ringHandoffViolations(play), []);
});

test("[M3 역검증] holdOpen이 바로 닫는 사본 · holdOpen을 stop 뒤로 옮긴 사본 · 언마운트 닫기를 지운 사본은 각각 실패한다", (t) => {
  const voiceStop = "        vibrateOnce(0);\n      }\n      return closeAudio;";
  assert.ok(ringPlayer.includes(voiceStop), "오염 지점(holdOpen 끝)을 찾지 못했다 — 역검증이 공회전한다");
  const a = holdOpenViolations(ringPlayer.replace(voiceStop, "        vibrateOnce(0);\n        closeAudio();\n      }\n      return closeAudio;"));

  const holdLine =
    "    const releaseRing = audioFlags.ringCloseImmediate ? null : (ringAlert?.holdOpen() ?? null);\n";
  const stopLine = "    incomingAlertRef.current?.stop();\n";
  assert.ok(play.includes(holdLine) && play.includes(stopLine));
  const b = ringHandoffViolations(play.replace(holdLine, "").replace(stopLine, `${stopLine}${holdLine}`));

  const unmount = "      deferredRingCloseRef.current?.();\n      deferredRingCloseRef.current = null;\n";
  assert.ok(play.includes(unmount));
  const c = ringHandoffViolations(play.replace(unmount, "      deferredRingCloseRef.current = null;\n"));
  t.diagnostic(`[M3] 정상 0 / 바로 닫음 ${JSON.stringify(a)} / stop 뒤 ${JSON.stringify(b)} / 언마운트 삭제 ${JSON.stringify(c)}`);
  assert.deepEqual(a, ["holdOpen이 컨텍스트를 바로 닫는다"]);
  assert.deepEqual(b, ["holdOpen이 stop 뒤에 있다(이미 닫힌다)"]);
  assert.deepEqual(c, ["언마운트 cleanup이 미룬 벨 close를 부르지 않는다"]);
});

test("[M2/m2 역검증] audioprime 분기를 지운 사본 · 재진입 가드를 지운 사본은 실패한다", (t) => {
  const guard = "    if (!primedAudio && audioFlags.audioPrime) {\n";
  assert.ok(play.includes(guard), "오염 지점(생성 가드)을 찾지 못했다 — 역검증이 공회전한다");
  const noFlag = answerPrimeViolations(play.replace(guard, "    if (!primedAudio) {\n"));
  const noGuard = answerPrimeViolations(play.replace(guard, "    if (audioFlags.audioPrime) {\n"));
  t.diagnostic(`[M2/m2] 정상 0 / 플래그 삭제 ${JSON.stringify(noFlag)} / 가드 삭제 ${JSON.stringify(noGuard)}`);
  assert.deepEqual(noFlag, ["재진입 가드·audioprime 플래그 분기가 생성 앞에 없다"]);
  assert.deepEqual(noGuard, ["재진입 가드·audioprime 플래그 분기가 생성 앞에 없다"]);
});

// ── §122.2.2 — 볼륨 키가 먹게: 마이크가 열린 뒤 출력 컨텍스트를 새로 만든다(Chromium은 출력 스트림 용도를 만들 때 정한다) ─────────────
import { FRESH_OUTPUT_RESUME_TIMEOUT_MS, pickCallOutputPath, readOutputAfterMicFlag } from "./callAudio.ts";

test("[§122.2.2] pickCallOutputPath — 표 O1~O4", () => {
  const base = { flagOn: true, micOpened: true, freshRunning: true, primedUsable: true };
  assert.equal(pickCallOutputPath(base), "after-mic", "O2");
  assert.equal(pickCallOutputPath({ ...base, flagOn: false }), "before-mic", "O1 플래그");
  assert.equal(pickCallOutputPath({ ...base, micOpened: false }), "before-mic", "O1 마이크 실패");
  assert.equal(pickCallOutputPath({ ...base, freshRunning: false }), "fallback-primed", "O3 소리 우선");
  assert.equal(pickCallOutputPath({ ...base, freshRunning: false, primedUsable: false }), "after-mic", "O4");
  assert.equal(FRESH_OUTPUT_RESUME_TIMEOUT_MS, 500);
});

test("[§122.2.2] readOutputAfterMicFlag — 기본 켬 · outaftermic=0만 끈다", () => {
  assert.equal(readOutputAfterMicFlag(""), true);
  assert.equal(readOutputAfterMicFlag("?audiodebug=1"), true);
  assert.equal(readOutputAfterMicFlag("?outaftermic=0&audiodebug=1"), false);
});

test("[§122.2.2 배선] 세션이 마이크를 기다린 뒤 새 출력 컨텍스트를 만들고 경로를 진단에 남긴다", () => {
  const src = readLf("src/lib/realtime/GeminiVoiceSession.tsx");
  const micWait = src.indexOf("(await micRequest.catch(() => null)) !== null");
  const fresh = src.indexOf("freshOutput = new AudioContext({ sampleRate: GEMINI_OUTPUT_SAMPLE_RATE });");
  const pick = src.indexOf("const outputPath = pickCallOutputPath({");
  const use = src.indexOf("freshOutput ??");
  assert.ok(micWait > 0 && fresh > micWait && pick > fresh && use > pick, `${micWait} < ${fresh} < ${pick} < ${use}`);
  assert.ok(src.includes("noteOutputPath(outputPath);"), "진단 out.path");
  assert.ok(src.includes('if (outputPath === "fallback-primed" || cancelled) {'), "쓰지 않는 새 컨텍스트는 닫는다");
});
