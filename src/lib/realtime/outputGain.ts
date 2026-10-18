// AI 음성 재생 기본 음량(docs/Architecture.md §71.7 · G433) + 스피커 버튼의 음량 모드(§73.3 표 S · G455).
//
// 사용자 신고(2026-10-17, "기본 음량이 좀 큼") — 예전에는 받은 오디오 소스를 `outputContext.destination`에
// 바로 연결해 게인 1.0(최대)으로 재생했다. 이제 GainNode 하나를 거쳐 이 값으로 줄인다.
//
// ⚠️ **측정값이 아니라 판단값이다**(`agentSpeechGate.ts`의 `STALL_GRACE_MS`와 같은 형식). 0.5~0.7 범위의
// 가운데를 잠정값으로 골랐고, 최종값은 실기기 청취로 User가 정한다(OQ-A89). 조정은 이 상수만 바꾸면 된다.
//
// ⭐ T190-3(§73.3 표 S · UX D-98 · D-103) — 앱 안에 음량 조절 UI가 **생겼다**: 통화 그리드의 "스피커"
// 버튼이 통화 모드 ↔ 스피커 모드를 바꾼다. 웹은 Android에서 수화부↔스피커 **실제 출력 전환**을 할 수 없어
// (§73.2 ①-A — 출력 장치 API 부재) **음량 전환으로 대체**한다. iOS도 실기 프로브(P-1) 통과 전까지 같다.
// 값은 User 확정(2026-10-18 · OQ-A94): 통화 모드 0.6 · 스피커 모드 1.0.

/** 0~1 선형 게인. 0.6 ≈ -4.4dB. */
export const GEMINI_OUTPUT_GAIN = 0.6;

/** 스피커 버튼의 두 모드(§73.6 (4)). 기본 = 통화 모드. */
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
 * iOS Safari는 `volume`을 설정할 수 없고 읽으면 늘 1이다(Apple 문서 — §73.2 ②). 반영되지 않으면 그
 * 경로에서 스피커 칸은 비활성 표현이다(눌리는데 아무것도 안 바뀌는 활성 버튼 0 — AC-093 (c)).
 */
export function isVolumeApplied(requested: number, readBack: number): boolean {
  return Math.abs(requested - readBack) < 0.01;
}
