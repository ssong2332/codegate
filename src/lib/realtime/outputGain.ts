// AI 음성 재생 기본 음량(docs/Architecture.md §71.7 · G433) + 스피커 버튼의 음량 모드(§74.3 표 S · G455).
//
// 사용자 신고(2026-10-17, "기본 음량이 좀 큼") — 예전에는 받은 오디오 소스를 `outputContext.destination`에
// 바로 연결해 게인 1.0(최대)으로 재생했다. 이제 GainNode 하나를 거쳐 이 값으로 줄인다.
//
// ⚠️ **측정값이 아니라 판단값이다**(`agentSpeechGate.ts`의 `STALL_GRACE_MS`와 같은 형식). 0.5~0.7 범위의
// 가운데를 잠정값으로 골랐고, 최종값은 실기기 청취로 User가 정한다(OQ-A89). 조정은 이 상수만 바꾸면 된다.
//
// ⭐ T190-3(§74.3 표 S · UX D-98 · D-103) — 앱 안에 음량 조절 UI가 **생겼다**: 통화 그리드의 "스피커"
// 버튼이 통화 모드 ↔ 스피커 모드를 바꾼다. 웹은 Android에서 수화부↔스피커 **실제 출력 전환**을 할 수 없어
// (§74.2 ①-A — 출력 장치 API 부재) **음량 전환으로 대체**한다. iOS도 실기 프로브(P-1) 통과 전까지 같다.
// 값은 User 확정(2026-10-18 · OQ-A94): 통화 모드 0.6 · 스피커 모드 1.0.

/** 0~1 선형 게인. 0.6 ≈ -4.4dB. */
export const GEMINI_OUTPUT_GAIN = 0.6;

/** 스피커 버튼의 두 모드(§74.6 (4)). 기본 = 통화 모드. */
export type AudioRoute = "call" | "speaker";

/** 통화 모드 음량 = 기존 기본 음량(OQ-A89 계승 · User 확정 0.6). */
export const CALL_MODE_GAIN = GEMINI_OUTPUT_GAIN;

/** 스피커 모드 음량(User 확정 1.0) — 1.0은 클리핑 방지 상한이기도 하다(그 위로 올리지 않는다). */
export const SPEAKER_MODE_GAIN = 1.0;

/** 모드 → 게인. 실시간 두 경로(Gemini `GainNode` · ElevenLabs `volume`)와 폴백 `<audio>.volume`이 같은 값을 쓴다. */
export function gainFor(route: AudioRoute): number {
  return route === "speaker" ? SPEAKER_MODE_GAIN : CALL_MODE_GAIN;
}

/**
 * G455 판정 — 본 게이트와 역검증(오염 값)이 **같은 함수**를 쓴다.
 * 규칙: 통화 모드 = 기본 음량 · `0 < 통화 < 스피커 <= 1.0`.
 */
export function gainModeViolations(values: { call: number; speaker: number; base: number }): string[] {
  const out: string[] = [];
  if (values.call !== values.base) out.push(`통화 모드 ${values.call} ≠ 기본 음량 ${values.base}`);
  if (!(values.call > 0)) out.push(`통화 모드 ${values.call} ≤ 0`);
  if (!(values.speaker > values.call)) out.push(`스피커 모드 ${values.speaker} ≤ 통화 모드 ${values.call}`);
  if (!(values.speaker <= 1.0)) out.push(`스피커 모드 ${values.speaker} > 1.0(클리핑 상한)`);
  return out;
}

/**
 * D-103 · 표 S S-5 — `audio.volume`을 대입한 뒤 **다시 읽어** 반영됐는가(UA로 판별하지 않는다).
 * iOS Safari는 `volume`을 설정할 수 없고 읽으면 늘 1이다(Apple 문서 — §74.2 ②). 반영되지 않으면 그
 * 경로에서 스피커 칸은 비활성 표현이다(눌리는데 아무것도 안 바뀌는 활성 버튼 0 — AC-093 (c)).
 */
export function isVolumeApplied(requested: number, readBack: number): boolean {
  return Math.abs(requested - readBack) < 0.01;
}

/** D-103 프로브 값 — 1이 아니어야 한다(iOS는 읽으면 늘 1을 돌려주므로 1로 재면 거짓 양성이 난다 — reviewer Minor). */
export const VOLUME_PROBE = 0.5;

/**
 * `<audio>`의 음량을 앱이 바꿀 수 있는가 — **1이 아닌 프로브 값**을 대입하고 다시 읽는다(대입 값은 호출부가 곧바로
 * 실제 모드 값으로 덮는다). 판정 기준은 `isVolumeApplied` 하나다(UA로 판별하지 않는다).
 */
export function isVolumeSettable(media: { volume: number }): boolean {
  media.volume = VOLUME_PROBE;
  return isVolumeApplied(VOLUME_PROBE, media.volume);
}

// ── §105(2026-10-22 실기 신고 — *"스피커 버튼 눌렀을 때도 변화가 없는데"* · 갤럭시 S25) ──────────────────────────────────
// 0.6 → 1.0은 +4.4dB라 휴대폰 스피커에서 거의 구분되지 않았다. 웹은 Android에서 수화부(위) ↔ 스피커폰(아래) 출력 경로를 고를 수
// 없다(§74.2 ①-A · §105 조사표 — `setSinkId`는 Android에서 제공되지 않고, `selectAudioOutput` · 오디오 세션 API도 Android 크롬 · 웨일에
// 없다). 그래서 실시간(Gemini · Web Audio) 경로에서만 스피커 모드를 **1.0보다 크게 키우고**, 1.0을 넘는 소리는 아래 리미터 곡선으로
// 부드럽게 눌러 클리핑을 막는다. `<audio>.volume` · ElevenLabs `volume`은 1.0을 넘길 수 없어 종전 `gainFor` 값 그대로다.

/**
 * 실시간(Web Audio) 스피커 모드의 **컴프레서 뒤 보정 게인**.
 * ⭐ §108(2026-10-22 실기 신고 *"스피커가 커지긴 한데 더 키울 수 있나?"*) — §105의 "게인 1.8 → 리미터"는 큰 소리만 눌러 평균 음량(RMS)이
 * 통화 대비 +9.3dB에 그쳤다. 이제 컴프레서(`SPEAKER_COMPRESSOR`)로 말소리의 큰 부분을 먼저 고르게 누른 뒤 이 값으로 키우고, 마지막
 * 리미터가 남은 꼭대기만 접는다. **측정값**(§108.1 — 한국어 TTS 음성 · 크롬 OfflineAudioContext · 원본 그대로 / 꼭대기 −1dBFS 정규화 두 입력):
 * | 보정 | 통화 대비 RMS | 꼭대기 | 0.999 이상 샘플 | 리미터 SNR |
 * | 현행 1.8(컴프레서 없음) | +9.3dB | −0.1 / −0.0dBFS | 0 | 34.7 / 28.8dB |
 * | **2.5** | **+14.6 / +13.2dB** | −0.1 / −0.1dBFS | **0** | 31.0 / 29.1dB |
 * | 3.0 | +15.9 / +14.5dB | +0.3 / +0.4dBFS | 1 / 11 | 22.9 / 21.8dB |
 * ⇒ 천장(1.0)에 닿는 샘플이 0인 가장 큰 값 = 2.5(현행보다 +4~5dB). 3.0부터 천장에 닿고 왜곡 지표가 나빠진다.
 */
export const SPEAKER_BOOST_GAIN = 2.5;

/** 스피커 모드 컴프레서 설정(위 측정의 조건 그대로 — 바꾸면 다시 잰다). 통화 모드는 `ratio` 1(= 압축 0)로 둔다. */
export const SPEAKER_COMPRESSOR = { threshold: -24, knee: 6, ratio: 12, attack: 0.003, release: 0.15 } as const;

/** 리미터 곡선이 다루는 입력 진폭 상한(이 값까지 부드럽게 접고, 넘으면 1.0에 붙는다). */
export const LIMITER_INPUT_RANGE = 2;

/** 이 진폭까지는 곡선이 그대로 통과시킨다(통화 모드 0.6 · 원본 최대 1.0이면 리미터 영향 0). */
export const LIMITER_KNEE = 0.7;

/** 실시간 출력단의 세 값 — 앞 게인 · 컴프레서 비율 · 컴프레서 뒤 보정 게인. */
export type LiveOutputStage = { gain: number; compressorRatio: number; makeup: number };

/**
 * Gemini 세션이 받은 `outputVolume`(= `gainFor(route)`)을 실시간 출력단 값으로 바꾼다. 스피커 모드 값이면 압축 + 보정, 그 밖은
 * 앞 게인만(비율 1 · 보정 1 = 통화 모드 소리 무변경 — §108.1 실측 에너지 차 0.00dB).
 * (화면은 두 세션 컴포넌트에 같은 `gainFor` 값을 넘긴다 — G455 배선 고정. 증폭은 리미터가 있는 이 경로에서만 한다.)
 */
export function liveStageFor(outputVolume: number): LiveOutputStage {
  if (outputVolume >= SPEAKER_MODE_GAIN) {
    return { gain: SPEAKER_MODE_GAIN, compressorRatio: SPEAKER_COMPRESSOR.ratio, makeup: SPEAKER_BOOST_GAIN };
  }
  return { gain: outputVolume, compressorRatio: 1, makeup: 1 };
}

/**
 * 출력단 값을 컴프레서 · 보정 게인 노드에 반영한다. `immediate`(연결 직후)면 바로 대입하고, 모드 전환이면 30ms 시정수로 옮겨
 * 딸깍 소리를 막는다(앞 게인과 같은 시정수).
 */
export function applySpeakerDynamics(
  nodes: { compressor: DynamicsCompressorNode; makeup: GainNode },
  stage: LiveOutputStage,
  immediate = false,
): void {
  if (immediate) {
    nodes.compressor.ratio.value = stage.compressorRatio;
    nodes.makeup.gain.value = stage.makeup;
    return;
  }
  const t = nodes.makeup.context.currentTime;
  nodes.compressor.ratio.setTargetAtTime(stage.compressorRatio, t, 0.03);
  nodes.makeup.gain.setTargetAtTime(stage.makeup, t, 0.03);
}

// ── §126(2026-10-24 실기 신고 *"기본 음량이 커진 거 같고"* · 갤럭시 S25 크롬) — '통화' 스트림의 기준 레벨 ──────────────────────
// §122.2.2(`after-mic`)로 출력이 Android '통화'(VOICE_COMMUNICATION) 스트림이 되면 시스템 음량 곡선이 바뀐다. AOSP 기본값(2026-10-24 열람 —
// `frameworks/av/.../audio_policy_volumes.xml` · `default_volume_tables.xml` · `AudioSystem.DEFAULT_STREAM_VOLUME`):
// | 스트림(스피커) | 기본 단계 | 곡선 위치 | 시스템 감쇠 |
// |---|---|---|---|
// | 통화 VOICE_CALL | 4 / 1~5 | 75% | 약 −5.9dB(곡선 0% −24 · 33% −16 · 66% −8 · 100% 0) |
// | 미디어 MUSIC | 5 / 0~15 | 33% | 약 −32.5dB(곡선 1% −58 · 20% −40 · 60% −17 · 100% 0) |
// | 미디어 MUSIC(사용자가 60%로 올린 경우) | 9 / 15 | 60% | 약 −17dB |
// ⇒ 같은 앱 게인이면 '통화' 스트림이 미디어보다 기본 상태에서 약 11~27dB 크다(제조사 곡선은 다를 수 있다 — ⚠️ 갤럭시 실측 아님).
// 기준 레벨(판단값): '통화' 스트림의 통화 모드 앱 게인을 −6dB 낮춘다(0.6 → 0.3). 통화 곡선의 최댓값이 기본보다 약 +6dB뿐이라
// 그보다 크게 깎으면 볼륨 키를 끝까지 올려도 종전보다 작아질 수 있다 — 그래서 차이 전체가 아니라 키 여유만큼만 깎는다.
// 스피커 모드(컴프레서 · 보정 · 리미터)는 그대로다. 되돌리기 · 실기 A/B = `?voicetrim=0`(`readVoiceTrimFlag`).
// §138(2026-10-27 실기 신고 *"기본 음량이 좀 커"* · 갤럭시 Chrome 155 · `out.sink=context`·`element` 모두 '통화' 음량으로 조절됨) — 위 −6dB에서 −3dB 더 깎아
// 0.5 → 0.35(약 −9.1dB · 통화 모드 최종 0.6 × 0.35 = 0.21)로 한다. 볼륨 키 여유(통화 곡선 최댓값 ≈ 기본 +6dB)는 아직 +3dB 남아 키를 끝까지 올리면
// 종전 기본보다 크다. 판단값 — 실기 청취로 확정한다.

/** '통화' 스트림(`after-mic`) 통화 모드의 추가 감쇠(선형 · 0.35 ≈ −9.1dB · §138). 판단값 — 실기 청취로 확정한다. */
export const VOICE_STREAM_CALL_TRIM = 0.35;

/** 위 표 — 출력 경로 · 플래그 → 통화 모드 추가 감쇠. `after-mic`(통화 스트림으로 본다)일 때만 깎는다. */
export function callStreamTrimFor(outputPath: string | null | undefined, flagOn: boolean): number {
  return flagOn && outputPath === "after-mic" ? VOICE_STREAM_CALL_TRIM : 1;
}

/** 감쇠 노드에 실을 값 — 통화 모드(`compressorRatio` 1)에서만 깎고 스피커 모드는 1(소리 무변경). */
export function trimGainFor(stage: LiveOutputStage, trim: number): number {
  return stage.compressorRatio === 1 ? trim : 1;
}

/** 한 진폭(0 이상)에 대한 리미터 출력 — `knee`까지 선형, 그 위는 1.0에 점근(tanh). 출력은 언제나 1.0 미만. */
export function softLimit(amplitude: number, knee = LIMITER_KNEE): number {
  const a = Math.abs(amplitude);
  const sign = amplitude < 0 ? -1 : 1;
  if (a <= knee) return amplitude;
  const room = 1 - knee;
  return sign * (knee + room * Math.tanh((a - knee) / room));
}

/**
 * `WaveShaperNode.curve` — 곡선의 입력 축 [-1, 1]은 실제 진폭 [-range, range]에 대응한다(앞단 게인 `1/range`와 짝).
 * 짝수 길이 대신 홀수 길이를 써 0이 정확히 가운데 점에 오게 한다.
 */
export function buildLimiterCurve(points = 2049, range = LIMITER_INPUT_RANGE, knee = LIMITER_KNEE): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(points * 4));
  for (let i = 0; i < points; i += 1) {
    const u = (i / (points - 1)) * 2 - 1;
    curve[i] = softLimit(u * range, knee);
  }
  return curve;
}
