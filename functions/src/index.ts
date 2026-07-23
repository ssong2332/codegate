// Cloud Functions 진입점 — 배포 대상 함수는 모두 여기서 export한다.
// 폴더 = 트랙 경계(Architecture.md §2/§4). 각 함수 본문은 담당 트랙 모듈에서 채우고, 이 파일은
// 재export만 한다(T2 스캐폴딩 원칙 유지).

// Callable functions
// synthesizeDeepvoice는 2026-07-22에 제거됐다 — UX-014 통합 이후 호출하는 화면이 없고 본문이
// placeholder를 반환하는 상태였다(functions/src/voice/index.ts 상단 제거 이력 참고).
export { createVoiceClone } from "./voice";
export { createSession, endSession, updateMessengerSkin, requestEscalation } from "./session";
export { sendMessage } from "./roleplay";
// 실시간 음성 통화 자격증명 발급(2026-07-22) — 브라우저가 ElevenLabs Agents와 직접 speech-to-speech
// 대화를 하되 API 키는 서버에만 두기 위한 서명 URL 발급 지점.
export { createRealtimeCall } from "./realtime";
// 실시간 통화 전사 제출(finding #1) — 음성 대화도 리포트가 분석하도록 종료 직전 클라가 제출한다.
export { submitRealtimeTranscript } from "./realtime/submitTranscript";
export { generateReport } from "./report";

// Trigger functions (클라 직접 호출 아님) — API.md `onSessionEnded` (Track C, T10, AC-021).
// 실제 정의는 functions/src/guardrails/index.ts(트리거 소유 모듈, Architecture.md §2)에 있다.
export { onSessionEnded } from "./guardrails";
