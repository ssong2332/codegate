// MediaRecorder 래퍼(마이크 전용, 파일 업로드 UI 없음 — AC-020) (Track C, T3).
export {
  useVoiceRecorder,
  MAX_RECORDING_SECONDS,
  MIN_RECORDING_SECONDS,
} from "./useVoiceRecorder";
export type {
  RecorderStatus,
  VoiceRecorderState,
  VoiceRecorderControls,
} from "./useVoiceRecorder";
export {
  getOrCreatePendingSessionId,
  getPendingSessionId,
  setIdentityConfirmed,
  getIdentityConfirmed,
} from "./pendingSession";
