// 받기 탭 안에서 통화 오디오 컨텍스트를 미리 깨운다(2026-10-18, 라이브 d13e718 무음 신고 — 수정안 A).
//
// 무엇이 문제였나(가설 — 실기 확인 전): Gemini 출력 AudioContext는 받기 뒤 **비동기 effect**
// (`GeminiVoiceSession` — getUserMedia·자격증명 대기 뒤)에서 만들어지고 `resume()`된다. 탭과의 간격이 길면
// (미리 받기 경합 시 7.5초 실측) 일부 Android 브라우저는 사용자 활성화가 만료된 것으로 보고 컨텍스트를
// `suspended`로 남긴다 — 통화 시간은 흐르는데 AI 음성이 0이다. 데스크톱 Chromium에서는 재현되지 않았다.
//
// 처방: 벨 primed 컨텍스트(`ringtonePlayer.ts` `primeIncomingAlertAudio`)와 같은 패턴으로, **받기 탭 핸들러 안에서
// 동기로** 출력·입력 컨텍스트를 만들고 `resume()`한다. 세션 컴포넌트는 넘겨받은 컨텍스트가 살아 있으면 그것을 쓴다.
//
// ⭐ 소유권은 **통화 화면(page) 한 곳**이다 — 세션 컴포넌트는 빌려 쓰기만 하고 닫지 않는다(개발 모드 Strict Mode의
// mount→cleanup→mount에서 첫 cleanup이 닫아 버리면 두 번째 실행이 닫힌 컨텍스트를 받는다). 화면이 닫는 시점은
// `shouldReleasePrimedCallAudio`가 정한다 + 화면 언마운트.
//
// ⚠️ 이 파일은 잎 모듈이다(상대·별칭 import 0) — 별도 node:test 프로세스에서 직접 단위 테스트한다.

/** 화면이 들고 있는 받기 시점 컨텍스트 한 벌. 생성에 실패한 칸은 null(세션 컴포넌트가 종전대로 새로 만든다). */
export type PrimedCallAudio = {
  output: AudioContext | null;
  input: AudioContext | null;
  /** 만든 시각(`performance.now()` — 진단 패널의 "받기 탭 기준 ms"). */
  createdAtMs: number;
};

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function createAndResume(Ctor: AudioContextCtor, options?: AudioContextOptions): AudioContext | null {
  try {
    const ctx = options ? new Ctor(options) : new Ctor();
    // 탭 핸들러 안에서 부른다 — 기다리지 않는다(동기 구간 안에서 resume 요청이 나가는 것이 목적이다).
    void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/**
 * ⛔ **받기 탭 핸들러 안에서 동기로만** 부른다(await 뒤 · effect 안 호출 금지 — 사용자 활성화 안에 있어야 의미가 있다).
 * 출력 = Gemini 출력 샘플레이트(호출부가 넘긴다 — 이 파일은 잎 모듈이라 상수를 import하지 않는다) · 입력 = 기본값.
 */
export function primeCallAudio(outputSampleRate: number, nowMs: number): PrimedCallAudio {
  const Ctor = audioContextCtor();
  if (!Ctor) return { output: null, input: null, createdAtMs: nowMs };
  return {
    output: createAndResume(Ctor, { sampleRate: outputSampleRate }),
    input: createAndResume(Ctor),
    createdAtMs: nowMs,
  };
}

/** 빌려 쓸 수 있는가 — 닫힌 컨텍스트는 쓰지 않는다(세션 컴포넌트가 새로 만든다). */
export function isUsableContext(ctx: { state: string } | null | undefined): boolean {
  return ctx != null && ctx.state !== "closed";
}

/**
 * 화면이 받기 시점 컨텍스트를 닫아야 하는가(Gemini 세션이 그것을 쓸 일이 더는 없다).
 * - 통화가 끝났다(`ended`).
 * - ElevenLabs 경로다(그 SDK는 자기 오디오를 쓴다).
 * - 실시간이 처음부터 불가로 판정됐다(fallback · unsupported · permission-denied — Gemini 세션이 마운트되지 않는다).
 * - 오류인데 Gemini 세션이 마운트되지 않은 상태다(발급 실패 등). ⚠️ Gemini가 이미 마운트된 뒤의 오류는 닫지 않는다 —
 *   세션 컴포넌트가 아직 그 컨텍스트를 붙들고 있을 수 있다(종전에도 세션 자신의 컨텍스트가 정리 시점까지 열려 있었다).
 *   이 경우는 통화 종료나 화면 언마운트에서 닫힌다.
 */
export function shouldReleasePrimedCallAudio(input: {
  status: string;
  provider: string | null | undefined;
  ended: boolean;
  /** reviewer m1 — 화면이 텍스트 폴백으로 내려갔으면(Gemini 오류 뒤 포함) 더는 실시간 오디오를 쓰지 않는다. */
  callMode: string;
}): boolean {
  if (input.ended) return true;
  if (input.callMode === "fallback") return true;
  if (input.provider === "elevenlabs") return true;
  if (input.status === "fallback" || input.status === "unsupported" || input.status === "permission-denied") {
    return true;
  }
  if (input.status === "error" && input.provider !== "gemini") return true;
  return false;
}

/** 멱등 — 이미 닫힌 칸은 건너뛴다. */
export function closePrimedCallAudio(primed: PrimedCallAudio | null): void {
  if (!primed) return;
  for (const ctx of [primed.output, primed.input]) {
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
  }
}

/**
 * 안전망 — 컨텍스트가 `suspended`(iOS는 `interrupted`)로 남아 있으면 **다음 사용자 탭**에서 `resume()`을 한 번 더
 * 요청한다. 반환값 = 요청한 개수(진단용). 이미 running·closed인 것은 건드리지 않는다(멱등 · 부작용 0).
 */
export function resumeSuspendedContexts(
  contexts: ReadonlyArray<{ state: string; resume: () => Promise<void> } | null | undefined>,
  onError?: (name: string) => void,
): number {
  let requested = 0;
  for (const ctx of contexts) {
    if (!ctx || ctx.state === "running" || ctx.state === "closed") continue;
    requested += 1;
    void ctx.resume().catch((err: unknown) => {
      onError?.(err instanceof Error ? err.name : "unknown");
    });
  }
  return requested;
}

/** 안전망이 듣는 이벤트 — 사용자 활성화를 일으키는 입력들(터치는 pointerdown이 아니라 pointerup·touchend가 활성화다). */
export const RESUME_GESTURE_EVENTS = ["pointerup", "touchend", "mousedown", "keydown"] as const;

// ── 실기 A/B 플래그(reviewer M2 · M3) ────────────────────────────────────────────────────────
// 원인을 가르기 위한 **동작 선택 전용** 플래그다(화면 문구 0). 쿼리가 없으면 기본 = 이번 수정안.
//   - `audioprime=0`      → 수정안 A의 받기 탭 사전 생성을 끈다(종전 경로: 세션 컴포넌트가 getUserMedia 뒤에 직접 만든다).
//   - `ringclose=immediate` → 받기 때 벨 컨텍스트를 종전대로 **즉시** 닫는다(기본은 소리만 즉시 멈추고 close는 미룬다).

export type AudioFlags = { audioPrime: boolean; ringCloseImmediate: boolean };

export function readAudioFlags(search: string): AudioFlags {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return { audioPrime: true, ringCloseImmediate: false };
  }
  return {
    audioPrime: params.get("audioprime") !== "0",
    ringCloseImmediate: params.get("ringclose") === "immediate",
  };
}

/** 미룬 벨 close의 상한 — 통화 오디오가 끝내 running이 되지 않아도(ElevenLabs·폴백·무음 결함) 이 뒤엔 닫는다(판단값). */
export const RING_CLOSE_DEFER_CAP_MS = 8000;
/** 통화 출력 상태를 다시 보는 간격(판단값). */
export const RING_CLOSE_POLL_MS = 200;

/** 미룬 벨 컨텍스트를 지금 닫아도 되는가 — 통화 출력이 running이거나 · 상한이 지났거나 · 통화가 끝났다. */
export function shouldCloseDeferredRing(input: {
  callOutputState: string | null | undefined;
  elapsedMs: number;
  ended: boolean;
}): boolean {
  return input.ended || input.callOutputState === "running" || input.elapsedMs >= RING_CLOSE_DEFER_CAP_MS;
}

/**
 * 벨 컨텍스트 close를 통화 출력이 running이 될 때까지 미룬다(setTimeout 사슬 — 새 setInterval 0).
 * 반환값 = **즉시 닫기**(취소 겸용 · 멱등) — 화면 언마운트 cleanup이 부른다(누수 0).
 */
export function scheduleDeferredRingClose(
  release: () => void,
  readCallOutputState: () => string | null | undefined,
  deps: {
    now: () => number;
    setTimer: (fn: () => void, ms: number) => unknown;
    clearTimer: (handle: unknown) => void;
  },
): () => void {
  const startedAt = deps.now();
  let done = false;
  let handle: unknown = null;
  const finish = () => {
    if (done) return;
    done = true;
    if (handle !== null) deps.clearTimer(handle);
    handle = null;
    release();
  };
  const check = () => {
    handle = null;
    if (done) return;
    if (
      shouldCloseDeferredRing({
        callOutputState: readCallOutputState(),
        elapsedMs: deps.now() - startedAt,
        ended: false,
      })
    ) {
      finish();
      return;
    }
    handle = deps.setTimer(check, RING_CLOSE_POLL_MS);
  };
  check();
  return finish;
}
