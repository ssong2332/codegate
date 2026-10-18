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
  const rows: Array<[{ status: string; provider: string | null | undefined; ended: boolean }, boolean]> = [
    [{ status: "connecting", provider: undefined, ended: false }, false],
    [{ status: "connecting", provider: "gemini", ended: false }, false],
    [{ status: "active", provider: "gemini", ended: false }, false],
    [{ status: "error", provider: "gemini", ended: false }, false],
    [{ status: "error", provider: undefined, ended: false }, true],
    [{ status: "error", provider: "none", ended: false }, true],
    [{ status: "fallback", provider: "none", ended: false }, true],
    [{ status: "unsupported", provider: undefined, ended: false }, true],
    [{ status: "permission-denied", provider: undefined, ended: false }, true],
    [{ status: "connecting", provider: "elevenlabs", ended: false }, true],
    [{ status: "active", provider: "gemini", ended: true }, true],
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
  if (!code.includes("outputBorrowed = isUsableContext(primedOutput);")) out.push("출력 컨텍스트 빌림 판정이 없다");
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
  const primeLine = "    const primedAudio = primeCallAudio(GEMINI_OUTPUT_SAMPLE_RATE, performance.now());\n";
  assert.ok(play.includes(primeLine), "오염 지점(받기 핸들러의 primeCallAudio)을 찾지 못했다 — 역검증이 공회전한다");
  const moved = play.replace(primeLine, "    const primedAudio = { output: null, input: null, createdAtMs: 0 };\n");
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
