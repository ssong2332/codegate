// `?audiodebug=1` 진단 저장소(2026-10-18, 라이브 d13e718 무음 신고 — 실기 판정용).
//
// 제품 코드(통화 훅 · Gemini 세션 · 통화 화면)는 여기에 **관찰값만 적고**, 진단 패널(`AudioDebugPanel`)은 **읽기만** 한다.
// 적는 함수는 값 대입뿐이다. 쿼리가 없어도 적기는 계속된다(숫자 몇 개 · 비용 0에 가깝다)
// — 그래야 패널이 늦게 켜져도 같은 값을 보여 준다. 화면에 그리는 것은 쿼리가 있을 때뿐이다(`isAudioDebugEnabled`).
// ⚠️ 정정(reviewer 2차 · 2026-10-18): 이 저장소는 **순수 관찰 전용이 아니다** — 통화 화면의 resume 안전망
// (`registeredCallContexts`)과 벨 지연 close(`readAudioDiag().output?.state`)가 여기에 등록된 컨텍스트 참조를
// **상태 조회용으로 읽는다**. 기능 플래그가 아니라 조회이며, 등록이 빠지면 안전망은 아무것도 안 하고 지연 close는
// 상한(8초)에서 닫히는 쪽으로 실패한다(소리에 영향 0). 진단 패널 자신은 여전히 읽기만 한다.
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
  /** 벨 컨텍스트를 실제로 닫은 시각(`performance.now()`) — 받기 기준 상대 ms로 보인다(M3 순서 판정용). */
  ringClosedAtMs: number | null;
  /** 이 통화에서 받은 PCM 청크의 최대 절대 진폭(게인 적용 **전** · 0~1). 원본 레벨이 작은지 판정용(2026-10-20 음량 신고). */
  pcmPeakMax: number | null;
  /** §122(8) — 라우드니스 정규화(§114)가 마지막 청크에 쓴 게인(선형). 시나리오 간 음량 차이가 앱 안에서 나는지 기기에서 가른다. */
  normGain: number | null;
  /** §122.2.2 — 이번 통화의 출력 컨텍스트 경로(`callAudio.ts` `CallOutputPath`). `after-mic`이면 볼륨 키('통화')가 소리를 조절할 것으로 본다(실기 확인 전). */
  outputPath: string | null;
  /** §126 — 마이크 뒤 새 출력 컨텍스트가 running이 되기까지 걸린 ms(넘으면 `timeout` · 만들지 않았으면 null). `fallback-primed` 원인 판정용. */
  freshResume: string | null;
  /** §126 — '통화' 스트림 통화 모드 추가 감쇠(선형 · `callStreamTrimFor`). */
  streamTrim: number | null;
  // ⭐ §105(2026-10-22 실기 신고 "말해도 묵묵부답") — 사용자 말이 서버까지 갔는지 가린다(숫자만).
  /** 서버로 보낸 마이크 프레임 수. */
  micFramesSent: number;
  /** 반이중(사기범이 말하는 중)이라 보내지 않은 프레임 수. */
  micFramesDroppedEcho: number;
  /** 음소거(버튼 · 확인 화면)라 보내지 않은 프레임 수. */
  micFramesDroppedMute: number;
  /** 보낸 프레임의 최대 절대 진폭(0~1) — 마이크가 무음(0)만 주는지 판정. */
  micPeakMax: number | null;
  /** 서버가 돌려준 사용자 음성 인식 조각 수(`inputTranscription`) — 0이면 서버가 말을 듣지 못했다. */
  asrChunks: number;
  /** §105 — 화면 켜짐 유지(Wake Lock) 마지막 상태(`screenWakeLock.ts` WakeLockStatus 문자열) · 이 통화에서 풀린 횟수. */
  wakeLockStatus: string | null;
  wakeLockReleases: number;
  /** §105.2.6 — "말했는데 서버가 못 들음" 보완("잘 안 들렸다" 한 줄)이 발동한 횟수. */
  unheardReplyFired: number;
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
  ringClosedAtMs: null,
  pcmPeakMax: null,
  normGain: null,
  outputPath: null,
  freshResume: null,
  streamTrim: null,
  micFramesSent: 0,
  micFramesDroppedEcho: 0,
  micFramesDroppedMute: 0,
  micPeakMax: null,
  asrChunks: 0,
  wakeLockStatus: null,
  wakeLockReleases: 0,
  unheardReplyFired: 0,
};

let state: DiagState = { ...INITIAL };
// 살아 있는 객체 참조(패널이 state·sampleRate·volume을 실시간으로 다시 읽는다). 값 자체는 저장하지 않는다.
let outputCtx: CtxLike | null = null;
let inputCtx: CtxLike | null = null;
let ringCtx: CtxLike | null = null;
// `context` — 게인 노드가 속한 컨텍스트(재생 소스가 붙는 컨텍스트와 같은 객체인지 패널이 비교한다 · `out.gainCtx`).
type GainLike = { gain: { value: number }; context?: unknown };
let outputGain: GainLike | null = null;
let fallbackAudio: { volume: number; paused: boolean } | null = null;
type TrackLike = { readyState: string; muted: boolean; enabled: boolean };
let micTrack: TrackLike | null = null;

/** 받기 1회 = 통화 1건. 통화별 값을 비운다(벨 컨텍스트는 받기 전에 정해지므로 남긴다). */
export function noteAccept(nowMs: number): void {
  // §105 — 화면 켜짐 유지는 받기 전(연결 중)부터 걸려 있을 수 있어 상태만 이어받는다(풀린 횟수는 통화별로 비운다).
  state = { ...INITIAL, acceptAtMs: nowMs, wakeLockStatus: state.wakeLockStatus };
  outputCtx = null;
  inputCtx = null;
  outputGain = null;
  micTrack = null;
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

export function registerOutputGain(node: GainLike | null): void {
  outputGain = node;
}

export function registerRingContext(ctx: CtxLike | null): void {
  ringCtx = ctx;
}

/** §105 — 지금 서버로 보내는 마이크 트랙(다시 열면 새 트랙으로 바꾼다). 패널이 readyState · muted를 실시간으로 읽는다. */
export function registerMicTrack(track: TrackLike | null): void {
  micTrack = track;
}

export type MicFrameOutcome = "sent" | "echo" | "mute";

/** §105 — 마이크 프레임 1개의 처리 결과. `peak`는 보낸 프레임에서만 준다(0~1). */
export function noteMicFrame(outcome: MicFrameOutcome, peak?: number): void {
  if (outcome === "sent") {
    const micPeakMax = peak === undefined ? state.micPeakMax : Math.max(state.micPeakMax ?? 0, peak);
    state = { ...state, micFramesSent: state.micFramesSent + 1, micPeakMax };
  } else if (outcome === "echo") {
    state = { ...state, micFramesDroppedEcho: state.micFramesDroppedEcho + 1 };
  } else {
    state = { ...state, micFramesDroppedMute: state.micFramesDroppedMute + 1 };
  }
}

/** §105 — 화면 켜짐 유지 상태 변화(받기 전 상태도 남는다 — 받기 때 비우지 않게 `noteAccept`가 이어받는다). */
export function noteWakeLock(status: string): void {
  state = {
    ...state,
    wakeLockStatus: status,
    wakeLockReleases: state.wakeLockReleases + (status === "released" ? 1 : 0),
  };
}

/** §105.2.6 — 화면 쪽 보완 1회 발동. */
export function noteUnheardReplyFired(): void {
  state = { ...state, unheardReplyFired: state.unheardReplyFired + 1 };
}

/** §105 — 서버의 사용자 음성 인식 조각 1개(내용은 적지 않는다). */
export function noteAsrChunk(): void {
  state = { ...state, asrChunks: state.asrChunks + 1 };
}

/** §105 — production 로그 한 줄(숫자 · 상태값만). 응답이 0턴이면 `[gemini-latency]` 요약이 찍히지 않아 따로 둔다. */
export function formatMicLine(): string {
  const s = state;
  const track = micTrack ? `${micTrack.readyState}${micTrack.muted ? "/muted" : ""}${micTrack.enabled ? "" : "/disabled"}` : "-";
  return `[live-mic] sent=${s.micFramesSent} echo=${s.micFramesDroppedEcho} mute=${s.micFramesDroppedMute} peakDb=${formatDbfs(s.micPeakMax)} asr=${s.asrChunks} track=${track} in=${inputCtx?.state ?? "-"} wake=${s.wakeLockStatus ?? "-"}/${s.wakeLockReleases} unheard=${s.unheardReplyFired}`;
}

export function registerFallbackAudio(el: { volume: number; paused: boolean } | null): void {
  fallbackAudio = el;
}

/** 받은 청크 1개. `samples`(디코드한 PCM, -1~1)를 주면 최대 진폭도 갱신한다(게인 적용 전 원본 레벨). */
export function noteChunkReceived(samples?: ArrayLike<number> | null): void {
  const peak = samples ? peakOf(samples) : null;
  const pcmPeakMax = peak === null ? state.pcmPeakMax : Math.max(state.pcmPeakMax ?? 0, peak);
  state = { ...state, chunksReceived: state.chunksReceived + 1, pcmPeakMax };
}

/** 최대 절대 진폭(0~1 · 빈 배열 = 0). 청크당 수백~수천 샘플 1회 순회. */
export function peakOf(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  return peak;
}

/** 선형 진폭 → dBFS 한 자리(0 이하 = `-inf`). 패널 표시용. */
export function formatDbfs(amplitude: number | null): string {
  if (amplitude === null) return "-";
  if (!(amplitude > 0)) return "-inf";
  return (20 * Math.log10(amplitude)).toFixed(1);
}

/** §122.2.2 — 출력 컨텍스트 경로(`after-mic` · `before-mic` · `fallback-primed`). */
export function noteOutputPath(path: string): void {
  state = { ...state, outputPath: path };
}

/** §126 — 새 출력 컨텍스트의 running 도달 ms(문자열) 또는 `timeout`. */
export function noteFreshResume(value: string): void {
  state = { ...state, freshResume: value };
}

/** §126 — '통화' 스트림 감쇠(선형). */
export function noteStreamTrim(trim: number): void {
  state = { ...state, streamTrim: trim };
}

/** §122(8) — 정규화가 이번 청크에 쓴 게인(선형 · `LoudnessState.gain`). */
export function noteNormalizerGain(gain: number): void {
  state = { ...state, normGain: gain };
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

export function noteRingClosed(nowMs: number): void {
  state = { ...state, ringClosedAtMs: nowMs };
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
  /** 게인 노드의 컨텍스트 === 등록된 출력 컨텍스트(재생 소스가 붙는 것)인가. 노드·컨텍스트가 없으면 null. */
  gainCtxSame: boolean | null;
  fallback: { volume: number; paused: boolean } | null;
  mic: { readyState: string; muted: boolean; enabled: boolean } | null;
};

export function readAudioDiag(): AudioDiagSnapshot {
  return {
    ...state,
    output: outputCtx,
    input: inputCtx,
    ring: ringCtx,
    gain: outputGain ? outputGain.gain.value : null,
    gainCtxSame: outputGain && outputCtx && outputGain.context !== undefined ? outputGain.context === outputCtx : null,
    fallback: fallbackAudio ? { volume: fallbackAudio.volume, paused: fallbackAudio.paused } : null,
    mic: micTrack ? { readyState: micTrack.readyState, muted: micTrack.muted, enabled: micTrack.enabled } : null,
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
  micTrack = null;
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
  "flag.audioprime",
  "flag.ringclose",
  "callMode",
  "rt.status",
  "provider",
  "cred.prefetched",
  "cred.source",
  "acceptToCredMs",
  "out.state",
  "out.rate",
  "out.origin",
  "out.path",
  "out.freshMs",
  "out.trimDb",
  "out.createdMs",
  "out.gain",
  "out.gainCtx",
  "route",
  "pcm.peakDb",
  "norm.gainDb",
  "chunks.rx",
  "chunks.sched",
  "chunk.lastMs",
  "in.state",
  "in.rate",
  "mic.track",
  "mic.sent",
  "mic.dropEcho",
  "mic.dropMute",
  "mic.peakDb",
  "asr.rx",
  "wake.state",
  "wake.releases",
  "unheard.fired",
  "ring.state",
  "ring.closedMs",
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
  /** 실기 A/B 플래그(`callAudio.ts` `readAudioFlags`) — 주소 쿼리에서 읽은 현재 값. */
  flags: { audioPrime: boolean; ringCloseImmediate: boolean };
}): Array<[AudioDiagKey, string]> {
  const s = input.snapshot;
  const values: Record<AudioDiagKey, string> = {
    "flag.audioprime": input.flags.audioPrime ? "on" : "off",
    "flag.ringclose": input.flags.ringCloseImmediate ? "immediate" : "deferred",
    callMode: input.callMode,
    "rt.status": input.status,
    provider: input.provider,
    "cred.prefetched": show(input.credentialsPrefetched),
    "cred.source": show(s.credentialSource),
    acceptToCredMs: show(input.acceptToCredentialsMs),
    "out.state": show(s.output?.state),
    "out.rate": show(s.output?.sampleRate),
    "out.origin": show(s.outputOrigin),
    "out.path": show(s.outputPath),
    "out.freshMs": show(s.freshResume),
    "out.trimDb": formatDbfs(s.streamTrim),
    "out.createdMs": rel(s.outputCreatedAtMs, s.acceptAtMs),
    "out.gain": s.gain === null ? "-" : s.gain.toFixed(2),
    "out.gainCtx": s.gainCtxSame === null ? "-" : s.gainCtxSame ? "same" : "diff",
    route: input.audioRoute,
    "pcm.peakDb": formatDbfs(s.pcmPeakMax),
    "norm.gainDb": formatDbfs(s.normGain),
    "chunks.rx": String(s.chunksReceived),
    "chunks.sched": String(s.chunksScheduled),
    "chunk.lastMs": rel(s.lastChunkAtMs, s.acceptAtMs),
    "in.state": show(s.input?.state),
    "in.rate": show(s.input?.sampleRate),
    "mic.track": s.mic ? `${s.mic.readyState}${s.mic.muted ? "/muted" : ""}${s.mic.enabled ? "" : "/disabled"}` : "-",
    "mic.sent": String(s.micFramesSent),
    "mic.dropEcho": String(s.micFramesDroppedEcho),
    "mic.dropMute": String(s.micFramesDroppedMute),
    "mic.peakDb": formatDbfs(s.micPeakMax),
    "asr.rx": String(s.asrChunks),
    "wake.state": show(s.wakeLockStatus),
    "wake.releases": String(s.wakeLockReleases),
    "unheard.fired": String(s.unheardReplyFired),
    "ring.state": show(s.ring?.state),
    "ring.closedMs": rel(s.ringClosedAtMs, s.acceptAtMs),
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
