// 실시간 음성 통화(speech-to-speech) — UX-014 live phase, 2026-07-22.
//
// RealtimeVoiceSession(SDK 본체)은 여기서 re-export하지 않는다 — @elevenlabs/react가 끌어오는
// livekit-client(WebRTC)를 통화 화면 로드 시점에 함께 불러오면 렌더러가 죽기 때문에(실측), 반드시
// 사용처에서 next/dynamic(ssr:false)으로 지연 로딩해야 한다. 배럴로 노출하면 그 규칙이 쉽게 깨진다.
export { useRealtimeCall } from "./useRealtimeCall";
export type { RealtimeCallStatus, RealtimeCallState, RealtimeCallControls } from "./useRealtimeCall";
export type { RealtimeVoiceSessionProps } from "./RealtimeVoiceSession";
