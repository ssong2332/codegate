// 받기 시점 마이크 1회 획득 · 세션으로 넘기기 (2026-10-21, 받기→첫소리 10.2초 지연 수정).
//
// 무엇이 문제였나: 받기 뒤 `useRealtimeCall.start()`가 권한 확인용으로 getUserMedia를 **기다려 열고 곧바로 닫은
// 뒤**에야 자격증명을 꺼냈고, `GeminiVoiceSession`이 마운트되면 같은 마이크를 **한 번 더** 열고 나서야 Live 연결을
// 시작했다. 장치 열기 2회 + 연결이 전부 직렬이었다(로컬 실측: 권한 확인 0.6~1.3초 + 재획득 0.3~0.7초).
// 이제 받기 때 한 번만 열고(에코 제거 제약 포함), 그 요청을 기다리지 않고 자격증명 · Live 연결을 함께 진행한다.
// 세션은 이 핸드오프에서 스트림을 넘겨받고, 오프닝 지시만 마이크가 준비된 뒤에 보낸다(권한 창이 떠 있는 동안
// 사기범이 먼저 말하지 않게 — 거부되면 폴백이 오프닝을 다시 재생하므로 중복 발화도 막는다).
//
// pcm.ts · prefetchFreshness.ts와 같은 이유로 브라우저 전역 · 경로 별칭 의존이 없다(별도 node:test로 단위 테스트한다).

/** Live 세션이 쓰는 마이크 제약 — 받기 때 이 값으로 한 번만 연다(세션이 따로 열 때도 같은 값). */
export const LIVE_MIC_CONSTRAINTS = {
  // 에코 제거/잡음 억제/자동 게인을 명시적으로 켠다(2026-07-23). 스피커로 나온 AI 목소리가 마이크로 되돌아가면
  // Gemini가 자기 말을 사용자 발화로 오인한다(근본 해결은 헤드셋).
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
} as const;

/** 스트림의 최소 모양(테스트에서 가짜를 넣는다). */
export type StoppableStream = { getTracks: () => ReadonlyArray<{ stop: () => void }> };

export function stopStream(stream: StoppableStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * 받기 때 연 마이크 요청 1건을 세션에 넘기는 자리. 소유권 규칙:
 * - `offer`: 받기 경로가 요청(거부 = `null`로 끝나는 Promise)을 맡긴다. 앞서 맡긴 것이 남아 있으면 정리한다.
 * - `claim`: 세션이 **한 번만** 가져간다(이후 소유자 = 세션 — 세션 cleanup이 트랙을 닫는다). 없으면 `null`.
 * - `release`: 아무도 안 가져간 요청을 버린다(도착하면 트랙을 닫는다). 화면 언마운트 · 거부 처리에서 부른다.
 */
export type MicHandoff<S extends StoppableStream> = {
  offer: (request: Promise<S | null>) => void;
  claim: () => Promise<S | null> | null;
  release: () => void;
};

export function createMicHandoff<S extends StoppableStream>(): MicHandoff<S> {
  let pending: Promise<S | null> | null = null;
  const release = () => {
    const unclaimed = pending;
    pending = null;
    if (unclaimed) void unclaimed.then(stopStream, () => {});
  };
  return {
    offer: (request) => {
      release();
      pending = request;
    },
    claim: () => {
      const request = pending;
      pending = null;
      return request;
    },
    release,
  };
}

/** 마이크 요청을 거부 시 `null`로 끝나게 감싼다(받기 경로 · 세션 둘 다 throw 없이 분기한다). */
export function requestMicrophone<S>(open: () => Promise<S>): Promise<S | null> {
  try {
    return open().catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

/** 받기 경로 · 세션이 함께 쓰는 핸드오프(통화 1건 = 받기 1회). */
export const liveMicHandoff: MicHandoff<MediaStream> = createMicHandoff<MediaStream>();
