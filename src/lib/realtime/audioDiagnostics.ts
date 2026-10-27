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
  /** §137 — 이번 통화의 최종 출력 싱크(`callAudio.ts` `OutputSink` · 표 E1~E4). */
  outputSink: string | null;
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
  // ⭐ §135(2026-10-25 실기 신고 *"사기범 말이 중간중간 끊긴다"*) — 끊김이 재생 공백인지 · 서버 끼어들기인지 · 앱이 지운 것인지 가른다(숫자만).
  /** 턴 진행 중 다음 청크가 예약 재생이 다 끝난 뒤 도착해 소리가 빈 횟수(`PLAY_GAP_MIN_MS` 이상만). */
  playGaps: number;
  /** 그 공백의 최대 길이(ms). */
  playGapMaxMs: number;
  /** 서버 `interrupted` 수신 횟수 · 그중 예약 재생이 남아 있던(= 말이 잘린) 횟수. */
  interrupts: number;
  interruptsWhilePlaying: number;
  /** 영어 사고 문장 게이트(§116)가 재생을 지운 횟수. */
  thoughtCuts: number;
  /** 사기범이 말하는 중에 보낸 `turnComplete:false` 맥락 주입 · 상태 단언 횟수. */
  contextWhileSpeaking: number;
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
  outputSink: null,
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
  playGaps: 0,
  playGapMaxMs: 0,
  interrupts: 0,
  interruptsWhilePlaying: 0,
  thoughtCuts: 0,
  contextWhileSpeaking: 0,
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
/** §135 — 같은 탭에서 앞서 끝난 통화들의 한 줄 요약(최근 것이 앞 · `CALL_HISTORY_MAX`건). 새로고침하면 비워진다. */
let callHistory: string[] = [];

/** §135 — 통화마다 크기가 다르다는 신고를 가르는 요약 개수. */
export const CALL_HISTORY_MAX = 4;

/** §135 — 한 통화의 요약(경로 · 새 컨텍스트 ms · 정규화 게인 · 감쇠 · 재생 공백 · 끼어들기). */
export function summarizeCall(s: Pick<DiagState, "outputPath" | "freshResume" | "normGain" | "streamTrim" | "playGaps" | "interruptsWhilePlaying">): string {
  return `${s.outputPath ?? "-"} f${s.freshResume ?? "-"} n${formatDbfs(s.normGain)} t${formatDbfs(s.streamTrim)} g${s.playGaps} i${s.interruptsWhilePlaying}`;
}

/** 받기 1회 = 통화 1건. 통화별 값을 비운다(벨 컨텍스트는 받기 전에 정해지므로 남긴다). */
export function noteAccept(nowMs: number): void {
  // §135 — 앞 통화(받기를 거친 것)를 요약에 남긴다.
  if (state.acceptAtMs !== null) callHistory = [summarizeCall(state), ...callHistory].slice(0, CALL_HISTORY_MAX);
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

/** §137 — 출력 싱크(`element` · `context` · `element-failed`). */
export function noteOutputSink(sink: string): void {
  state = { ...state, outputSink: sink };
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

/** §135 — 사람이 끊김으로 느끼기 시작하는 공백 하한(판단값 · ms). 이보다 짧은 공백은 세지 않는다. */
export const PLAY_GAP_MIN_MS = 20;

/** §135 — 턴 진행 중 재생 공백 1건(ms). 하한 미만은 버린다. */
export function notePlayGap(gapMs: number): void {
  if (!(gapMs >= PLAY_GAP_MIN_MS)) return;
  state = { ...state, playGaps: state.playGaps + 1, playGapMaxMs: Math.max(state.playGapMaxMs, Math.round(gapMs)) };
}

/** §135 — 서버 `interrupted` 1건. `whilePlaying` = 예약 재생이 남아 있었다(말이 잘렸다). */
export function noteInterrupt(whilePlaying: boolean): void {
  state = {
    ...state,
    interrupts: state.interrupts + 1,
    interruptsWhilePlaying: state.interruptsWhilePlaying + (whilePlaying ? 1 : 0),
  };
}

/** §135 — 사고 문장 게이트가 재생을 지운 1건. */
export function noteThoughtCut(): void {
  state = { ...state, thoughtCuts: state.thoughtCuts + 1 };
}

/** §135 — 사기범이 말하는 중의 `turnComplete:false` 전송 1건. */
export function noteContextWhileSpeaking(): void {
  state = { ...state, contextWhileSpeaking: state.contextWhileSpeaking + 1 };
}

/**
 * §135 — 청크를 예약하기 직전에 부른다. 턴이 이미 진행 중(`turnInProgress`)이고 직전 예약의 끝(`nextPlayTime` > 0)이
 * 지금보다 앞이면 그 차이만큼 소리가 비었다(초 → ms). 그 밖(턴 첫 청크 · 끊긴 뒤 0으로 되돌린 시각)은 공백이 아니다(0).
 */
export function playGapMs(input: { turnInProgress: boolean; nextPlayTime: number; currentTime: number }): number {
  if (!input.turnInProgress || !(input.nextPlayTime > 0)) return 0;
  return Math.max(0, (input.currentTime - input.nextPlayTime) * 1000);
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
  /** §135 — 앞서 끝난 통화 요약(최근 것이 앞). */
  history: string[];
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
    history: callHistory,
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
  callHistory = [];
  outputCtx = null;
  inputCtx = null;
  ringCtx = null;
  outputGain = null;
  fallbackAudio = null;
  micTrack = null;
}

// ── 순수 함수 ────────────────────────────────────────────────────────────────────────────────

/** 쿼리에 `audiodebug=1`이 정확히 있을 때만 켠다. §134 — 호출부는 탭 저장 값을 얹은 쿼리(`readDebugFlagSearch`)를 넘긴다. */
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
  "flag.outaftermic",
  "flag.voicetrim",
  "flag.outelement",
  "flag.saved",
  "callMode",
  "rt.status",
  "provider",
  "cred.prefetched",
  "cred.source",
  "acceptToCredMs",
  "setup.firstMs",
  "setup.prep",
  "setup.live",
  "out.state",
  "out.rate",
  "out.origin",
  "out.path",
  "out.freshMs",
  "out.trimDb",
  "out.sink",
  "out.createdMs",
  "out.gain",
  "out.gainCtx",
  "route",
  "pcm.peakDb",
  "norm.gainDb",
  "chunks.rx",
  "chunks.sched",
  "chunk.lastMs",
  "play.gaps",
  "play.gapMaxMs",
  "cut.int",
  "cut.thought",
  "cut.ctx",
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
  "hist",
  "browser",
] as const;

export type AudioDiagKey = (typeof AUDIO_DIAG_KEYS)[number];

const show = (v: unknown): string => (v === null || v === undefined ? "-" : String(v));

// 2026-10-27(실기 신고 — 첫 발화까지 17초) — 휴대폰에서 콘솔 없이 준비 구간을 읽게 패널에 싣는다.
// `liveLatency.ts`의 통화 준비 표시(`readCallSetupMarks`)를 그대로 받는다 — 잎 모듈이라 같은 모양의 타입만 둔다.
// 값은 모두 **받기 기준 누적 ms**다(새로고침 재개처럼 받기가 없으면 마운트 기준).
//
// | 행 | 표시 | 뜻 |
// |---|---|---|
// | `setup.firstMs` | 받기 → 첫 오디오 | 사용자가 느끼는 "첫 발화까지" |
// | `setup.prep` | `cred` 자격증명 준비 · `mic` 마이크 허용 · `out` 출력 준비 끝 | 앞 준비 |
// | `setup.live` | `conn` Live 연결 · `open` 오프닝 전송 · `1st` 첫 오디오 | 연결 · 모델 |
export type SetupMarksLike = Partial<
  Record<
    "accept" | "micGranted" | "credentialsReady" | "mount" | "micReady" | "connectResolved" | "openingSent" | "firstAudio",
    number
  >
>;

function setupSteps(marks: SetupMarksLike | undefined, steps: ReadonlyArray<readonly [string, keyof SetupMarksLike]>): string {
  const base = marks?.accept ?? marks?.mount;
  if (!marks || base === undefined) return "-";
  const parts = steps.flatMap(([label, key]) => {
    const at = marks[key];
    return at === undefined ? [] : [`${label}:${Math.round(at - base)}`];
  });
  return parts.length > 0 ? parts.join(" ") : "-";
}

export function formatSetupFirstMs(marks: SetupMarksLike | undefined): string {
  const base = marks?.accept ?? marks?.mount;
  return base === undefined || marks?.firstAudio === undefined ? "-" : String(Math.round(marks.firstAudio - base));
}

export function formatSetupPrep(marks: SetupMarksLike | undefined): string {
  return setupSteps(marks, [
    ["cred", "credentialsReady"],
    ["mic", "micGranted"],
    ["out", "micReady"],
  ]);
}

export function formatSetupLive(marks: SetupMarksLike | undefined): string {
  return setupSteps(marks, [
    ["conn", "connectResolved"],
    ["open", "openingSent"],
    ["1st", "firstAudio"],
  ]);
}
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
  /** 통화 준비 표시(`liveLatency.ts` `readCallSetupMarks`) — 부재면 `setup.*` 행이 "-". */
  setupMarks?: SetupMarksLike;
  userActivation: { hasBeenActive: boolean; isActive: boolean } | null;
  browser: string;
  /**
   * 실기 A/B 플래그(`callAudio.ts` `readAudioFlags`) — 주소 쿼리 + 탭 저장 값(§134 `debugFlags.ts`)에서 읽은 현재 값.
   * §134 — `outputAfterMic` · `voiceTrim` · `saved`(저장된 키=값 목록) 부재면 "-". §137 `outputElement`도 같다.
   */
  flags: {
    audioPrime: boolean;
    ringCloseImmediate: boolean;
    outputAfterMic?: boolean;
    voiceTrim?: boolean;
    outputElement?: boolean;
    saved?: string;
  };
}): Array<[AudioDiagKey, string]> {
  const s = input.snapshot;
  const values: Record<AudioDiagKey, string> = {
    "flag.audioprime": input.flags.audioPrime ? "on" : "off",
    "flag.ringclose": input.flags.ringCloseImmediate ? "immediate" : "deferred",
    "flag.outaftermic": input.flags.outputAfterMic === undefined ? "-" : input.flags.outputAfterMic ? "on" : "off",
    "flag.voicetrim": input.flags.voiceTrim === undefined ? "-" : input.flags.voiceTrim ? "on" : "off",
    "flag.outelement": input.flags.outputElement === undefined ? "-" : input.flags.outputElement ? "on" : "off",
    "flag.saved": show(input.flags.saved),
    callMode: input.callMode,
    "rt.status": input.status,
    provider: input.provider,
    "cred.prefetched": show(input.credentialsPrefetched),
    "cred.source": show(s.credentialSource),
    acceptToCredMs: show(input.acceptToCredentialsMs),
    "setup.firstMs": formatSetupFirstMs(input.setupMarks),
    "setup.prep": formatSetupPrep(input.setupMarks),
    "setup.live": formatSetupLive(input.setupMarks),
    "out.state": show(s.output?.state),
    "out.rate": show(s.output?.sampleRate),
    "out.origin": show(s.outputOrigin),
    "out.path": show(s.outputPath),
    "out.freshMs": show(s.freshResume),
    "out.trimDb": formatDbfs(s.streamTrim),
    "out.sink": show(s.outputSink),
    "out.createdMs": rel(s.outputCreatedAtMs, s.acceptAtMs),
    "out.gain": s.gain === null ? "-" : s.gain.toFixed(2),
    "out.gainCtx": s.gainCtxSame === null ? "-" : s.gainCtxSame ? "same" : "diff",
    route: input.audioRoute,
    "pcm.peakDb": formatDbfs(s.pcmPeakMax),
    "norm.gainDb": formatDbfs(s.normGain),
    "chunks.rx": String(s.chunksReceived),
    "chunks.sched": String(s.chunksScheduled),
    "chunk.lastMs": rel(s.lastChunkAtMs, s.acceptAtMs),
    "play.gaps": String(s.playGaps),
    "play.gapMaxMs": String(s.playGapMaxMs),
    "cut.int": `${s.interrupts}/${s.interruptsWhilePlaying}`,
    "cut.thought": String(s.thoughtCuts),
    "cut.ctx": String(s.contextWhileSpeaking),
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
    hist: s.history.length > 0 ? s.history.join(" | ") : "-",
    browser: input.browser,
  };
  return AUDIO_DIAG_KEYS.map((key) => [key, values[key]]);
}
