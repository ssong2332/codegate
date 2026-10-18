// `?audiodebug=1` 진단 저장소(2026-10-18, 라이브 d13e718 무음 신고 — 실기 판정용).
//
// 제품 코드(통화 훅 · Gemini 세션 · 통화 화면)는 여기에 **관찰값만 적고**, 진단 패널(`AudioDebugPanel`)은 **읽기만** 한다.
// 적는 함수는 값 대입뿐이다 — 제품 동작을 바꾸지 않는다. 쿼리가 없어도 적기는 계속된다(숫자 몇 개 · 비용 0에 가깝다)
// — 그래야 패널이 늦게 켜져도 같은 값을 보여 준다. 화면에 그리는 것은 쿼리가 있을 때뿐이다(`isAudioDebugEnabled`).
//
// ⛔ 이 저장소와 패널 행에는 **비밀값 · 토큰 · 세션 id · uid · 전사 텍스트 · URL**을 싣지 않는다
// (`audioDiagnostics.test.ts`가 행 키 집합을 고정하고 금지 키를 막는다). 브라우저 식별은 브랜드 계열 + 주 버전 + OS 계열뿐이다.
//
// ⚠️ 이 파일은 잎 모듈이다(상대·별칭 import 0) — 별도 node:test 프로세스에서 직접 단위 테스트한다.

type CtxLike = { state: string; sampleRate: number; resume: () => Promise<void> };

export type CredentialSourceTag = "settled" | "inflight" | "mint";

type DiagState = {
  acceptAtMs: number | null;
  credentialSource: CredentialSourceTag | null;
  outputOrigin: "primed" | "session" | null;
  outputCreatedAtMs: number | null;
  chunksReceived: number;
  chunksScheduled: number;
  lastChunkAtMs: number | null;
  fallbackPlay: string | null;
  lastAudioError: string | null;
  resumeRetries: number;
};

const INITIAL: DiagState = {
  acceptAtMs: null,
  credentialSource: null,
  outputOrigin: null,
  outputCreatedAtMs: null,
  chunksReceived: 0,
  chunksScheduled: 0,
  lastChunkAtMs: null,
  fallbackPlay: null,
  lastAudioError: null,
  resumeRetries: 0,
};

let state: DiagState = { ...INITIAL };
// 살아 있는 객체 참조(패널이 state·sampleRate·volume을 실시간으로 다시 읽는다). 값 자체는 저장하지 않는다.
let outputCtx: CtxLike | null = null;
let inputCtx: CtxLike | null = null;
let ringCtx: CtxLike | null = null;
let outputGain: { gain: { value: number } } | null = null;
let fallbackAudio: { volume: number; paused: boolean } | null = null;

/** 받기 1회 = 통화 1건. 통화별 값을 비운다(벨 컨텍스트는 받기 전에 정해지므로 남긴다). */
export function noteAccept(nowMs: number): void {
  state = { ...INITIAL, acceptAtMs: nowMs };
  outputCtx = null;
  inputCtx = null;
  outputGain = null;
}

export function noteCredentialSource(source: CredentialSourceTag): void {
  state = { ...state, credentialSource: source };
}

export function registerCallAudio(input: {
  output: CtxLike | null;
  input: CtxLike | null;
  origin: "primed" | "session";
  /** 출력 컨텍스트를 만든 시각(`performance.now()` — 빌린 것이면 받기 탭 시각). */
  createdAtMs: number;
}): void {
  outputCtx = input.output;
  inputCtx = input.input;
  state = { ...state, outputOrigin: input.origin, outputCreatedAtMs: input.createdAtMs };
}

export function registerOutputGain(node: { gain: { value: number } } | null): void {
  outputGain = node;
}

export function registerRingContext(ctx: CtxLike | null): void {
  ringCtx = ctx;
}

export function registerFallbackAudio(el: { volume: number; paused: boolean } | null): void {
  fallbackAudio = el;
}

export function noteChunkReceived(): void {
  state = { ...state, chunksReceived: state.chunksReceived + 1 };
}

export function noteChunkScheduled(nowMs: number): void {
  state = { ...state, chunksScheduled: state.chunksScheduled + 1, lastChunkAtMs: nowMs };
}

/** `ok` 또는 거부 이름(`NotAllowedError` 등). */
export function noteFallbackPlay(result: string): void {
  state = { ...state, fallbackPlay: result };
}

export function noteAudioError(name: string): void {
  state = { ...state, lastAudioError: name };
}

export function noteResumeRetry(count: number): void {
  if (count > 0) state = { ...state, resumeRetries: state.resumeRetries + count };
}

/** 안전망이 다시 깨울 대상(화면이 들고 있지 않은 세션 자체 컨텍스트까지 포함하려고 여기서 읽는다). */
export function registeredCallContexts(): Array<CtxLike | null> {
  return [outputCtx, inputCtx];
}

export type AudioDiagSnapshot = DiagState & {
  output: CtxLike | null;
  input: CtxLike | null;
  ring: CtxLike | null;
  gain: number | null;
  fallback: { volume: number; paused: boolean } | null;
};

export function readAudioDiag(): AudioDiagSnapshot {
  return {
    ...state,
    output: outputCtx,
    input: inputCtx,
    ring: ringCtx,
    gain: outputGain ? outputGain.gain.value : null,
    fallback: fallbackAudio ? { volume: fallbackAudio.volume, paused: fallbackAudio.paused } : null,
  };
}

/** 테스트 전용 초기화. */
export function resetAudioDiagForTest(): void {
  state = { ...INITIAL };
  outputCtx = null;
  inputCtx = null;
  ringCtx = null;
  outputGain = null;
  fallbackAudio = null;
}

// ── 순수 함수 ────────────────────────────────────────────────────────────────────────────────

/** 주소 쿼리에 `audiodebug=1`이 정확히 있을 때만 켠다. */
export function isAudioDebugEnabled(search: string): boolean {
  try {
    return new URLSearchParams(search).get("audiodebug") === "1";
  } catch {
    return false;
  }
}

/**
 * 브라우저 계열 + 주 버전 + OS 계열만. 모델명 · 빌드 번호 · 기기 이름은 싣지 않는다.
 * `userAgentData.brands`가 있으면 그것을 먼저 쓴다(의미 없는 GREASE 브랜드 "Not…A;Brand"는 걸러 낸다).
 */
export function summarizeBrowser(input: {
  brands?: ReadonlyArray<{ brand: string; version: string }> | null;
  platform?: string | null;
  userAgent: string;
}): string {
  const ua = input.userAgent;
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Mac OS X/i.test(ua)
        ? "macOS"
        : /Windows/i.test(ua)
          ? "Windows"
          : /Linux/i.test(ua)
            ? "Linux"
            : "other";
  const brands = (input.brands ?? [])
    .filter((b) => !/not.?a.?brand/i.test(b.brand))
    .map((b) => `${b.brand.replace(/[^A-Za-z ]/g, "").trim()} ${String(b.version).split(".")[0]}`)
    .filter((s) => /^[A-Za-z ]+ \d+$/.test(s));
  if (brands.length > 0) return `${brands.join(" / ")} · ${os}`;
  const families: Array<[RegExp, string]> = [
    [/Whale\/(\d+)/, "Whale"],
    [/SamsungBrowser\/(\d+)/, "SamsungBrowser"],
    [/EdgA?\/(\d+)/, "Edge"],
    [/CriOS\/(\d+)/, "Chrome"],
    [/FxiOS\/(\d+)/, "Firefox"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+).*Safari/, "Safari"],
  ];
  for (const [re, name] of families) {
    const m = re.exec(ua);
    if (m) return `${name} ${m[1]} · ${os}`;
  }
  return `other · ${os}`;
}

/** 패널 행 키 — 이 목록 밖의 키는 그리지 않는다(테스트가 금지 키를 막는다). */
export const AUDIO_DIAG_KEYS = [
  "callMode",
  "rt.status",
  "provider",
  "cred.prefetched",
  "cred.source",
  "acceptToCredMs",
  "out.state",
  "out.rate",
  "out.origin",
  "out.createdMs",
  "out.gain",
  "route",
  "chunks.rx",
  "chunks.sched",
  "chunk.lastMs",
  "in.state",
  "in.rate",
  "ring.state",
  "fb.volume",
  "fb.paused",
  "fb.play",
  "act.hasBeenActive",
  "act.isActive",
  "resume.retry",
  "err.last",
  "browser",
] as const;

export type AudioDiagKey = (typeof AUDIO_DIAG_KEYS)[number];

const show = (v: unknown): string => (v === null || v === undefined ? "-" : String(v));
const rel = (at: number | null, base: number | null): string =>
  at === null || base === null ? "-" : String(Math.round(at - base));

export function buildAudioDiagRows(input: {
  snapshot: AudioDiagSnapshot;
  callMode: string;
  status: string;
  provider: string;
  audioRoute: string;
  credentialsPrefetched: boolean | null | undefined;
  acceptToCredentialsMs: number | null;
  userActivation: { hasBeenActive: boolean; isActive: boolean } | null;
  browser: string;
}): Array<[AudioDiagKey, string]> {
  const s = input.snapshot;
  const values: Record<AudioDiagKey, string> = {
    callMode: input.callMode,
    "rt.status": input.status,
    provider: input.provider,
    "cred.prefetched": show(input.credentialsPrefetched),
    "cred.source": show(s.credentialSource),
    acceptToCredMs: show(input.acceptToCredentialsMs),
    "out.state": show(s.output?.state),
    "out.rate": show(s.output?.sampleRate),
    "out.origin": show(s.outputOrigin),
    "out.createdMs": rel(s.outputCreatedAtMs, s.acceptAtMs),
    "out.gain": s.gain === null ? "-" : s.gain.toFixed(2),
    route: input.audioRoute,
    "chunks.rx": String(s.chunksReceived),
    "chunks.sched": String(s.chunksScheduled),
    "chunk.lastMs": rel(s.lastChunkAtMs, s.acceptAtMs),
    "in.state": show(s.input?.state),
    "in.rate": show(s.input?.sampleRate),
    "ring.state": show(s.ring?.state),
    "fb.volume": s.fallback ? s.fallback.volume.toFixed(2) : "-",
    "fb.paused": s.fallback ? String(s.fallback.paused) : "-",
    "fb.play": show(s.fallbackPlay),
    "act.hasBeenActive": input.userActivation ? String(input.userActivation.hasBeenActive) : "-",
    "act.isActive": input.userActivation ? String(input.userActivation.isActive) : "-",
    "resume.retry": String(s.resumeRetries),
    "err.last": show(s.lastAudioError),
    browser: input.browser,
  };
  return AUDIO_DIAG_KEYS.map((key) => [key, values[key]]);
}
