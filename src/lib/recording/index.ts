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
  setOpeningAudioUrl,
  consumeOpeningAudioUrl,
  setSelectedScenarioId,
  getSelectedScenarioId,
  clearPendingSession,
  markSessionAnswered,
  isSessionAnswered,
  setSelectedTrainingType,
  getSelectedTrainingType,
  setSelectedVoiceModeChoice,
  getSelectedVoiceModeChoice,
  setMessengerVoiceSelectReturn,
  hasMessengerVoiceSelectReturn,
  consumeMessengerVoiceSelectReturn,
  setChallengeMode,
  consumeChallengeMode,
} from "./pendingSession";
export type { TrainingType } from "./pendingSession";
// 실시간 음성 통화 전환(2026-07-22 사용자 결정, Phase A) — 브라우저 STT 래퍼.
export { useSpeechRecognition } from "./useSpeechRecognition";
export type { SpeechRecognitionStatus, SpeechRecognitionState, SpeechRecognitionControls } from "./useSpeechRecognition";
