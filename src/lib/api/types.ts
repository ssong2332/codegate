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
// isMock(채팅 화면 구현 시 반영, 서버는 이미 반환 중 — functions/src/session/index.ts:96): 서버가
// LLM 어댑터로 MockLlmClient를 썼다는 뜻(계약 드리프트 해소, API.md 갱신 권장).
export type CreateSessionResponse = {
  sessionId: string;
  openingMessage: ScammerMessage;
  maxUserTurns: number; // 기본값 10 (DECISIONS #10)
  maxSessionMs: number; // 기본값 360000 (6분, DECISIONS #10)
  isMock: boolean;
  // 실시간 음성 통화 전환(2026-07-22 사용자 결정) — 오프닝 대사 합성 오디오(서버가 이미 반환 중,
  // functions/src/session/types.ts와 1:1).
  openingAudioUrl?: string;
};

// --- sendMessage (Track A · T7 · UX-006 · AC-003~005/AC-013/AC-024/AC-007) ---
export type SendMessageRequest = { sessionId: string; userText: string };
// isMock: 서버가 이미 반환 중이었으나(functions/src/roleplay/index.ts:137) 클라 타입에 누락돼
// 있던 계약 드리프트를 채팅 화면 구현 시 해소.
export type SendMessageResponse = {
  reply: ScammerMessage;
  turnCount: number;
  ended: boolean;
  endReason?: "limit_reached";
  isMock: boolean;
  // 실시간 음성 통화 전환(2026-07-22 사용자 결정) — 사기범 응답 합성 오디오(서버가 이미 반환 중,
  // functions/src/roleplay/types.ts와 1:1).
  audioUrl?: string;
};

// --- createRealtimeCall (UX-014 live phase · 2026-07-22 실시간 음성 대화 전환) ---
// 서버가 ElevenLabs 서명 URL을 발급해 브라우저가 speech-to-speech로 직접 대화한다. API 키는
// 서버에만 남는다(functions/src/realtime/index.ts와 1:1).
export type CreateRealtimeCallRequest = { sessionId: string };
export type CreateRealtimeCallResponse = {
  /** ElevenLabs 서명 WebSocket URL. isMock:true면 빈 문자열. */
  signedUrl: string;
  /** 이 통화에 쓸 목소리(clone 시나리오는 본인 클론 id, generic은 공용 기본 음성). */
  voiceId: string;
  language: "ko";
  /** true = 실시간 대화 불가(키/에이전트 미설정 또는 발급 실패) → 텍스트 폴백으로 진행. */
  isMock: boolean;
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
