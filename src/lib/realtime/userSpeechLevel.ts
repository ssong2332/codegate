// 사용자 발화 파형 인디케이터의 순수 로직 (2026-07-24, reviewer 지적으로 pcm.ts와 동일한 방식으로
// 분리 — Major #6).
//
// GeminiVoiceSession.tsx는 `AnalyserNode.getByteTimeDomainData()`로 매 프레임 원시 바이트 배열을
// 얻는데, 그 캡처 자체(브라우저 전용 API)는 여기서 다루지 않는다. 그 이후의 계산 — RMS 진폭 산출,
// 문턱값 통과 여부, "off-디바운스"(짧은 순간 침묵에 깜빡이지 않도록 버티는 로직) — 는 전부 순수
// 함수라 pcm.ts처럼 오디오 API 없이 단위 테스트할 수 있다. `Date.now()`/`setTimeout` 같은 실제
// 벽시계에 의존하지 않고 "지금 시각(nowMs)"을 인자로 받게 만들어, 테스트가 가짜 시계를 손으로
// 넘길 수 있게 한다(이 레포에 타이머 모킹 유틸이 없어, pcm.test.ts류의 "순수 계산 + 값 직접 검증"
// 스타일에 맞춰 실시간 대신 경과시간을 인자로 받는 쪽을 택했다).

/**
 * `getByteTimeDomainData`가 채운 바이트 배열(0~255, 무음=128 중심)에서 RMS 진폭을 구한다.
 * 값이 클수록 소리가 크다는 뜻이다.
 */
export function computeRmsFromByteTimeDomain(data: Uint8Array): number {
  if (data.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < data.length; i += 1) {
    const centered = data[i] - 128;
    sumSquares += centered * centered;
  }
  return Math.sqrt(sumSquares / data.length);
}

export type UserSpeechDebounceState = {
  /** 지금 이 순간 "말하는 중"으로 판정할지. */
  speaking: boolean;
  /** 마지막으로 문턱값을 넘겼던 시각(ms, 임의 단조 시계 기준). 한 번도 없었으면 null. */
  lastLoudAt: number | null;
};

export const INITIAL_USER_SPEECH_DEBOUNCE_STATE: UserSpeechDebounceState = {
  speaking: false,
  lastLoudAt: null,
};

export type UserSpeechDebounceInput = {
  /** 이번 프레임에 계산된 RMS 진폭. */
  rms: number;
  /** 이 값을 넘으면 "말하는 중"으로 본다. */
  threshold: number;
  /** true면 rms와 무관하게 이번 프레임은 무시한다(AI 발화 중 에코 오탐 방지, 음소거 등). */
  suppressed: boolean;
  /** 지금 시각(ms, 임의 단조 시계 — 실제 벽시계일 필요 없음, 테스트는 손으로 증가시킨 값을 넘김). */
  nowMs: number;
  /** 마지막으로 문턱값을 넘긴 뒤 이 시간(ms) 동안 조용하면 "말 안 함"으로 되돌린다. */
  offDelayMs: number;
};

/**
 * RMS 문턱값 통과 여부 + off-디바운스 상태 전이를 계산하는 순수 함수.
 *
 * 원래 구현(setTimeout 기반)은 문턱값을 넘길 때마다 "off로 되돌리는 타이머"를 새로 예약하고,
 * 그 전에 또 넘기면 타이머를 취소하고 다시 예약했다 — 즉 "마지막으로 넘긴 시점 이후 offDelayMs
 * 동안 계속 조용하면 off"와 동치다. 이 함수는 그 동치 규칙을 실제 타이머 없이 그대로 표현한다:
 * 매 프레임 `nowMs`를 받아 `lastLoudAt` 대비 경과시간만으로 판정하므로, 호출 빈도(rAF 주기)와
 * 무관하게 같은 결과를 낸다.
 */
export function nextUserSpeechDebounceState(
  prev: UserSpeechDebounceState,
  input: UserSpeechDebounceInput,
): UserSpeechDebounceState {
  const { rms, threshold, suppressed, nowMs, offDelayMs } = input;
  const isLoudEnough = !suppressed && rms > threshold;

  if (isLoudEnough) {
    return { speaking: true, lastLoudAt: nowMs };
  }
  if (!prev.speaking) {
    // 이미 꺼진 상태 — 새로 켤 만큼 크지 않았으니 그대로 유지.
    return prev;
  }
  const elapsedSinceLoud = prev.lastLoudAt === null ? Infinity : nowMs - prev.lastLoudAt;
  if (elapsedSinceLoud >= offDelayMs) {
    return { speaking: false, lastLoudAt: prev.lastLoudAt };
  }
  // 아직 off-디바운스 유예 시간 안 — 켜진 상태를 유지(짧은 순간 침묵에 깜빡이지 않게).
  return prev;
}
