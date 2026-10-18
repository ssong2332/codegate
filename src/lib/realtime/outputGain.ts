// AI 음성 재생 기본 음량(docs/Architecture.md §71.7 · G433).
//
// 사용자 신고(2026-10-17, "기본 음량이 좀 큼") — 예전에는 받은 오디오 소스를 `outputContext.destination`에
// 바로 연결해 게인 1.0(최대)으로 재생했다. 이제 GainNode 하나를 거쳐 이 값으로 줄인다.
//
// ⚠️ **측정값이 아니라 판단값이다**(`agentSpeechGate.ts`의 `STALL_GRACE_MS`와 같은 형식). 0.5~0.7 범위의
// 가운데를 잠정값으로 골랐고, 최종값은 실기기 청취로 User가 정한다(OQ-A89). 조정은 이 상수만 바꾸면 된다.
// 앱 안에 음량 조절 UI는 없다(UX 경로가 필요해 범위 밖).

/** 0~1 선형 게인. 0.6 ≈ -4.4dB. */
export const GEMINI_OUTPUT_GAIN = 0.6;
