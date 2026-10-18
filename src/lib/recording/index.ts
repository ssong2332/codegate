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
  setPendingSessionId,
  // T192 C4(§79.9 E6) — 종료 사유 힌트(통화 화면 → 종료 화면 1회성).
  setPendingEndReason,
  consumePendingEndReason,
  setIdentityConfirmed,
  getIdentityConfirmed,
  setOpeningAudioUrl,
  consumeOpeningAudioUrl,
  setOpeningMessageText,
  consumeOpeningMessageText,
  setSelectedScenarioId,
  getSelectedScenarioId,
  clearPendingSession,
  markSessionAnswered,
  isSessionAnswered,
  // T187(§72 D2) — 메신저 시작 전 고지 확인 기록(answered와 같은 범위 · 다른 키, G450).
  markStartNoticeAcknowledged,
  isStartNoticeAcknowledged,
  // T190-8b(§74.22 (3)) — 통화 벨 직전 고지 확인 기록(같은 범위 · 다른 키).
  markPreCallNoticeSeen,
  isPreCallNoticeSeen,
  setSelectedTrainingType,
  getSelectedTrainingType,
  setSelectedVoiceModeChoice,
  getSelectedVoiceModeChoice,
  setMessengerVoiceSelectReturn,
  hasMessengerVoiceSelectReturn,
  consumeMessengerVoiceSelectReturn,
  setChallengeToken,
  getChallengeToken,
  setExperienceMode,
  getExperienceMode,
  // T72(UX-029) — 드릴다운 마지막 단계에서 고른 난이도 힌트.
  setSelectedDifficultyLevel,
  getSelectedDifficultyLevel,
} from "./pendingSession";
export type { TrainingType, ExperienceMode } from "./pendingSession";
// 실시간 음성 통화 전환(2026-07-22 사용자 결정, Phase A) — 브라우저 STT 래퍼.
export { useSpeechRecognition } from "./useSpeechRecognition";
export type { SpeechRecognitionStatus, SpeechRecognitionState, SpeechRecognitionControls } from "./useSpeechRecognition";
