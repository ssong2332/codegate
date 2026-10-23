// §114(2026-10-23 실기 신고 *"검찰(고급) 시나리오에서는 기본 음량도 되게 크네. 통화를 하는 시나리오 음량을 맞춰줘. 기관 사칭 정도
// 크기이면 괜찮은 거 같아."* · DECISIONS #229) — 실시간(Gemini Live) 사기범 음성의 **라우드니스 정규화**(순수 함수 · 잎 모듈).
//
// 원인(조사): 기관 사칭 · 검찰 고급 둘 다 같은 프리셋 음성(남성 `Puck`)이고 클라 출력 게인도 시나리오와 무관하게 같다(0.6). 다른 것은
// 시나리오 말투 지시("딱딱하고 단호한" 등)뿐이라 **모델이 내는 원본 PCM 크기 자체가 시나리오 · 세션마다 다르다**고 본다(실측 근거는
// Architecture §114.1). 시나리오별 고정 보정값은 같은 시나리오 안의 세션 차이를 못 잡으므로, 받은 소리를 재서 맞춘다.
//
// 방식(판정표 — 청크 하나마다):
// | 단계 | 규칙 |
// |---|---|
// | 1. 프레임 | 청크를 20ms 프레임으로 자른다(24kHz → 480샘플) |
// | 2. 말소리 판정 | 프레임 RMS ≥ `SPEECH_GATE_DBFS`(−45dBFS)만 말소리 — 숨 · 무음은 측정에서 뺀다 |
// | 3. 누적 측정 | 이 통화의 말소리 프레임 **전부의 평균 제곱**(통합 라우드니스 — LUFS integrated와 같은 생각, K-가중 없음) |
// | 4. 목표 게인 | `TARGET_SPEECH_RMS` ÷ 누적 RMS, [`MIN_GAIN`, `MAX_GAIN`]로 자른다 · 말소리가 `WARMUP_SPEECH_MS`만큼 쌓이기 전에는 그때까지 잰 값으로 |
// | 5. 꼭대기 보호 | 이 청크 꼭대기 × 게인 ≤ `PEAK_CEILING`이 되게 이번 게인과 이동 시작 게인을 둘 다 낮춘다(스피커 경로 리미터 앞에서도 원본 1.0 초과 0) |
// | 6. 적용 | 직전 청크 게인 → 이번 게인으로 청크 안에서 선형으로 옮긴다(딸깍 0) |
// | — | 말소리 프레임이 하나도 없는 청크 · 아직 잰 것이 없음 → 직전 게인 그대로(처음엔 1) |
// 순서: 정규화(이 파일) → 통화/스피커 게인 · 컴프레서 · 리미터(`outputGain.ts` §108). 스피커 켜면 더 크게 들리는 동작은 그대로다.

/** Gemini Live 출력 샘플레이트(24kHz). */
export const NORMALIZER_SAMPLE_RATE = 24000;

/** 측정 프레임 길이(20ms). */
export const FRAME_SAMPLES = 480;

/** 이보다 작은 프레임은 말소리로 보지 않는다(dBFS). */
export const SPEECH_GATE_DBFS = -45;

/**
 * 목표 말소리 RMS(선형 · 원본 PCM 기준 · 출력 게인 0.6 적용 **전**). 기관 사칭 기준(사용자 *"기관 사칭 정도 크기이면 괜찮은"*).
 * **측정값**: 기관 사칭 고급 2세션 원본 말소리 RMS −18.99 · −17.16dBFS의 파워 평균 −17.98 → −18(`scripts/live-loudness-probe.mjs` · Architecture §114.1 표).
 * 바꾸면 그 표를 다시 잰다.
 */
export const TARGET_SPEECH_RMS_DBFS = -18;
export const TARGET_SPEECH_RMS = 10 ** (TARGET_SPEECH_RMS_DBFS / 20);

/** 게인 하한 · 상한(−12dB ~ +6dB). 아주 작게 말한 세션을 과하게 키워 잡음이 커지지 않게 상한을 낮게 둔다. */
export const MIN_GAIN = 10 ** (-12 / 20);
export const MAX_GAIN = 10 ** (6 / 20);

/** 정규화 뒤 꼭대기 상한(선형). */
export const PEAK_CEILING = 0.98;

/** 이만큼 말소리가 쌓이면 측정이 안정됐다고 본다(ms) — 그 전에도 잰 값으로 게인을 정한다(첫 문장부터 맞춘다). */
export const WARMUP_SPEECH_MS = 400;

export type LoudnessState = {
  /** 말소리 프레임 제곱합(누적). */
  speechSumSquares: number;
  /** 말소리 샘플 수(누적). */
  speechSamples: number;
  /** 직전 청크 끝에서 쓴 게인. */
  gain: number;
};

export const INITIAL_LOUDNESS_STATE: LoudnessState = { speechSumSquares: 0, speechSamples: 0, gain: 1 };

export function dbfs(rms: number): number {
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/** 말소리 프레임만 모은 RMS(없으면 0). 측정 · 테스트 · 프로브가 같은 함수를 쓴다. */
export function speechRms(samples: Float32Array): number {
  let sum = 0;
  let count = 0;
  const gate = 10 ** (SPEECH_GATE_DBFS / 20);
  for (let start = 0; start < samples.length; start += FRAME_SAMPLES) {
    const end = Math.min(samples.length, start + FRAME_SAMPLES);
    let frameSum = 0;
    for (let i = start; i < end; i += 1) frameSum += samples[i]! * samples[i]!;
    if (Math.sqrt(frameSum / (end - start)) >= gate) {
      sum += frameSum;
      count += end - start;
    }
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

/**
 * 청크 하나를 정규화한다(위 판정표). 입력 배열은 바꾸지 않고 새 배열과 다음 상태를 돌려준다.
 */
export function normalizeChunk(samples: Float32Array, state: LoudnessState): { out: Float32Array<ArrayBuffer>; state: LoudnessState } {
  const gate = 10 ** (SPEECH_GATE_DBFS / 20);
  let sumSquares = state.speechSumSquares;
  let speechSamples = state.speechSamples;
  let peak = 0;
  for (let start = 0; start < samples.length; start += FRAME_SAMPLES) {
    const end = Math.min(samples.length, start + FRAME_SAMPLES);
    let frameSum = 0;
    for (let i = start; i < end; i += 1) {
      const v = samples[i]!;
      frameSum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    if (Math.sqrt(frameSum / (end - start)) >= gate) {
      sumSquares += frameSum;
      speechSamples += end - start;
    }
  }
  let target = state.gain;
  if (speechSamples > 0 && speechSamples > state.speechSamples) {
    const integrated = Math.sqrt(sumSquares / speechSamples);
    target = Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET_SPEECH_RMS / integrated));
  }
  if (peak > 0 && peak * target > PEAK_CEILING) target = PEAK_CEILING / peak;
  const out = new Float32Array(samples.length);
  // 이동 시작 게인도 꼭대기 상한에 묶는다 — 직전 게인이 이번 청크 꼭대기에는 너무 크면 이동 구간에서 1.0을 넘는다(§114.1 실측 +0.08dBFS).
  const from = peak > 0 ? Math.min(state.gain, PEAK_CEILING / peak) : state.gain;
  const n = samples.length;
  for (let i = 0; i < n; i += 1) {
    const g = n > 1 ? from + ((target - from) * i) / (n - 1) : target;
    out[i] = samples[i]! * g;
  }
  return { out, state: { speechSumSquares: sumSquares, speechSamples, gain: target } };
}

/** 측정이 안정됐는가(진단용). */
export function isWarmedUp(state: LoudnessState): boolean {
  return (state.speechSamples / NORMALIZER_SAMPLE_RATE) * 1000 >= WARMUP_SPEECH_MS;
}
