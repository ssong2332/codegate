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
}): boolean {
  if (input.ended) return true;
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
