// Callable 함수 계약 — API.md와 1:1(Architecture.md §4 "계약 원천 2곳" 중 하나, ADR-0001).
// 클라이언트(src/)와 Functions(functions/)가 이 시그니처에 맞춰 병렬 개발한다.
// 계약 변경은 트랙 간 합의 후(Architecture.md §8).

export type ScammerMessage = { role: "scammer"; text: string };
export type UserMessage = { role: "user"; text: string };

// --- createVoiceClone (Track A · T4 · UX-003 · AC-018) ---
// isMock(T19 추가): true면 서버가 VoiceProvider로 MockVoiceProvider를 썼다는 뜻 — 화면에
// "임시 목업 음성" 라벨을 노출해야 한다(ElevenLabs 실클론과 혼동 방지, PRD Risks).
export type CreateVoiceCloneRequest = { sessionId: string };
export type CreateVoiceCloneResponse = {
  voiceId: string;
  cloneStatus: "ready";
  isMock: boolean;
};

// --- synthesizeDeepvoice (Track A · T5 · UX-005 · AC-019/AC-022) ---
export type SynthesizeDeepvoiceRequest = { sessionId: string; lineId: string };
export type SynthesizeDeepvoiceResponse = {
  audioUrl: string;
  artifactId: string;
  synthetic: true;
  syntheticLabel: "AI 훈련용 합성";
  isMock: boolean;
};

// --- createSession (Track B · T8 · UX-006 진입 · AC-003/AC-007) ---
// sessionId(T4 추가, 옵셔널·하위호환): 온보딩 단계의 "사전 세션 id"(src/lib/recording/
// pendingSession.ts)를 넘기면 createVoiceClone이 만들어 둔 pending sessions/{sid} 문서를
// createSession이 채택한다(sessionId 불일치 갭 해소, functions/src/session/index.ts 참고).
// API.md에는 아직 반영 안 됨 — architect 확인/문서 갱신 권장.
export type CreateSessionRequest = { scenarioId: string; voiceId: string; sessionId?: string };
export type CreateSessionResponse = {
  sessionId: string;
  openingMessage: ScammerMessage;
  maxUserTurns: number; // 기본값 10 (DECISIONS #10)
  maxSessionMs: number; // 기본값 360000 (6분, DECISIONS #10)
};

// --- sendMessage (Track A · T7 · UX-006 · AC-003~005/AC-013/AC-024/AC-007) ---
export type SendMessageRequest = { sessionId: string; userText: string };
export type SendMessageResponse = {
  reply: ScammerMessage;
  turnCount: number;
  ended: boolean;
  endReason?: "limit_reached";
};

// --- endSession (Track B · T8 · UX-007 · AC-006/AC-007/AC-021) ---
export type EndSessionReason =
  | "user_ended"
  | "completed"
  | "deceived"
  | "limit_reached";
export type EndSessionRequest = {
  sessionId: string;
  endReason: EndSessionReason;
};
export type EndSessionResponse = { status: "ended"; reportPending: true };

// --- generateReport (Track A · T9 · UX-008 · AC-008/AC-009/AC-026) ---
export type GenerateReportRequest = { sessionId: string };
export type GenerateReportResponse = { reportId: string };
