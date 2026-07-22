// Cloud Functions 진입점 — 배포 대상 함수는 모두 여기서 export한다.
// 폴더 = 트랙 경계(Architecture.md §2/§4). 각 함수 본문은 담당 트랙 모듈에서 채우고, 이 파일은
// 재export만 한다(T2 스캐폴딩 원칙 유지).

// Callable functions
export { createVoiceClone, synthesizeDeepvoice } from "./voice";
export { createSession, endSession } from "./session";
export { sendMessage } from "./roleplay";
// 실시간 음성 통화 자격증명 발급(2026-07-22) — 브라우저가 ElevenLabs Agents와 직접 speech-to-speech
// 대화를 하되 API 키는 서버에만 두기 위한 서명 URL 발급 지점.
export { createRealtimeCall } from "./realtime";
export { generateReport } from "./report";

// Trigger functions (클라 직접 호출 아님) — API.md `onSessionEnded` (Track C, T10, AC-021).
// 실제 정의는 functions/src/guardrails/index.ts(트리거 소유 모듈, Architecture.md §2)에 있다.
export { onSessionEnded } from "./guardrails";
