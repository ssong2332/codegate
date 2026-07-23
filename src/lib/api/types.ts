// Callable 함수 계약 — API.md와 1:1(Architecture.md §4 "계약 원천 2곳" 중 하나, ADR-0001).
// 클라이언트(src/)와 Functions(functions/)가 이 시그니처에 맞춰 병렬 개발한다.
// 계약 변경은 트랙 간 합의 후(Architecture.md §8).

// 메신저 표면 요소(T29, Architecture.md §13.4, AC-032/045) — 실 URL 필드가 존재하지 않는다.
// 링크는 displayText(모의 표기)·fakeLandingId(인앱 가짜 랜딩 참조)로만 표현된다.
export type MessengerAttachment = {
  kind: "link";
  displayText: string;
  fakeLandingId: string;
  harmless: true;
};

// attachments(T29 추가, 옵셔널·하위호환) — 메신저 채팅(UX-022)의 스미싱 링크. 보이스 세션은
// 항상 부재(functions/src/roleplay/types.ts와 1:1).
export type ScammerMessage = { role: "scammer"; text: string; attachments?: MessengerAttachment[] };
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

// synthesizeDeepvoice 계약은 2026-07-22에 제거됐다 — UX-014 통합 이후 오프닝 음성은
// createSession.openingAudioUrl로, 통화 중 음성은 실시간 speech-to-speech(createRealtimeCall)로
// 처리하면서 호출부가 사라졌다(functions/src/voice/index.ts 상단 제거 이력 참고).

// --- createSession (Track B · T8 · UX-006 진입 · AC-003/AC-007) ---
// sessionId(T4 추가, 옵셔널·하위호환): 온보딩 단계의 "사전 세션 id"(src/lib/recording/
// pendingSession.ts)를 넘기면 createVoiceClone이 만들어 둔 pending sessions/{sid} 문서를
// createSession이 채택한다(sessionId 불일치 갭 해소, functions/src/session/index.ts 참고).
// API.md에는 아직 반영 안 됨 — architect 확인/문서 갱신 권장.
// channel/surface/messengerSkin/skinSource(T29 추가, 옵셔널·하위호환) — 메신저 훈련(UX-024)에서만
// 채워진다. 부재 시 기존과 동일하게 voice 세션으로 생성된다(functions/src/session/types.ts와 1:1).
// voiceSelectionSource(T30 추가, 옵셔널·하위호환, Architecture.md §13.6/UX-025) — 에스컬레이션
// 가능한 메신저 시나리오의 조건부 목소리 선택 결과(functions/src/session/types.ts와 1:1).
export type VoiceSelectionSource = "recorded" | "reused" | "fallback_male" | "fallback_female";

export type CreateSessionRequest = {
  scenarioId: string;
  voiceId: string;
  sessionId?: string;
  channel?: "voice" | "messenger";
  surface?: "kakao" | "sms";
  messengerSkin?: "ios" | "samsung" | "default";
  skinSource?: "auto" | "manual" | "fallback";
  voiceSelectionSource?: VoiceSelectionSource;
};
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
  /**
   * T30 추가(옵셔널, 하위호환) — 서버가 구조화 신호 또는 max-turn 폴백으로 이미 채널을 voice로
   * 전이시켰다는 뜻(functions/src/roleplay/types.ts와 1:1). 클라는 이 플래그만 보고 통화 전환
   * 연출(P-18)로 넘어간다 — 자유텍스트를 직접 분류하지 않는다(AC-024).
   */
  escalation?: { toChannel: "voice" };
};

// --- createRealtimeCall (UX-014 live phase · 2026-07-22 실시간 음성 대화 전환) ---
// 서버가 ElevenLabs 서명 URL을 발급해 브라우저가 speech-to-speech로 직접 대화한다. API 키는
// 서버에만 남는다(functions/src/realtime/index.ts와 1:1).
export type CreateRealtimeCallRequest = { sessionId: string };
export type CreateRealtimeCallResponse = {
  /**
   * 접속할 실시간 프로바이더.
   * - `elevenlabs`: 서명 URL 접속. 본인 목소리 클론 사용 가능(유료).
   * - `gemini`: 단기 토큰 접속. 무료 티어 가능하지만 고정 프리셋 음성만(generic 시나리오 전용).
   * - `none`: 실시간 불가 → 텍스트 폴백.
   */
  provider: "elevenlabs" | "gemini" | "none";
  /** ElevenLabs 서명 WebSocket URL. 그 외 프로바이더면 빈 문자열. */
  signedUrl: string;
  /** Gemini 단기 토큰 — 모델·시스템 프롬프트가 서버에서 고정돼 있다(클라가 바꿀 수 없음). */
  geminiToken: string;
  /** Gemini 접속 모델명. 그 외면 빈 문자열. */
  geminiModel: string;
  /** ElevenLabs에서 쓸 목소리(clone 시나리오는 본인 클론 id). Gemini는 고정 음성이라 빈 문자열. */
  voiceId: string;
  language: "ko";
  /** true = 실시간 대화 불가(키/설정 미비 또는 발급 실패) → 텍스트 폴백으로 진행. */
  isMock: boolean;
};

// --- submitRealtimeTranscript (finding #1 · 2026-07-23) ---
// 실시간 음성 통화 대화를 리포트가 분석할 수 있도록 종료 직전에 전사를 제출한다.
export type TranscriptTurn = { role: "user" | "scammer"; text: string };
export type SubmitRealtimeTranscriptRequest = { sessionId: string; turns: TranscriptTurn[] };
export type SubmitRealtimeTranscriptResponse = { written: number };

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

// --- updateMessengerSkin (T29 · UX-022 · AC-031/P-16) ---
// 메신저 채팅(UX-022)의 UA 자동 감지·수동 전환 결과를 세션 문서에 지속한다(리포트·새로고침·
// 수동 전환 유지 목적). sessions/{sessionId}는 firestore.rules가 클라 write를 전부 거부하므로
// 콜러블이 필요하다(functions/src/session/types.ts와 1:1).
export type UpdateMessengerSkinRequest = {
  sessionId: string;
  messengerSkin: "ios" | "samsung" | "default";
  skinSource: "auto" | "manual" | "fallback";
};
export type UpdateMessengerSkinResponse = {
  messengerSkin: "ios" | "samsung" | "default";
  skinSource: "auto" | "manual" | "fallback";
};

// --- requestEscalation (T30 · UX-022 명시 "전화로 확인" 버튼 · §13.3/AC-034) ---
// functions/src/session/types.ts와 1:1.
export type RequestEscalationRequest = { sessionId: string };
export type RequestEscalationResponse = { escalation: { toChannel: "voice" } };

// --- generateReport (Track A · T9 · UX-008 · AC-008/AC-009/AC-026) ---
export type GenerateReportRequest = { sessionId: string };
export type GenerateReportResponse = { reportId: string };
