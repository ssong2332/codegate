// Firestore 문서 계약 — Database.md와 1:1(Architecture.md §4 "계약 원천 2곳" 중 하나, ADR-0001).
// 각 트랙은 실제 데이터가 없어도 이 타입에 맞춰 개발한다. 필드/제약 변경은 Database.md와
// 함께(트랙 간 합의 후) 갱신한다.

// --- users/{uid} (UX-013, AC-027) ---
export type UserDoc = {
  uid: string;
  displayName: string;
  email: string;
  createdAt: FirebaseFirestore.Timestamp;
  lastLoginAt: FirebaseFirestore.Timestamp;
  defenseGrade?: string; // P1
  sessionCount?: number; // P1
  ageVerified?: boolean; // P1
};

// --- users/{uid}/consents/{consentId} (UX-001, AC-012/017) ---
export type ConsentDoc = {
  granted: boolean;
  grantedAt: FirebaseFirestore.Timestamp;
  consentTextVersion: string;
};

// --- sessions/{sessionId} (AC-003/006/007/021) ---
export type SessionStatus = "created" | "active" | "ended";
export type SessionEndReason =
  | "user_ended"
  | "completed"
  | "deceived"
  | "limit_reached";
export type CloneStatus = "pending" | "ready" | "failed" | "fallback";

// T19 추가(옵셔널, 하위호환 — Migration Policy): 어떤 VoiceProvider가 클론을 만들었는지 감사용
// 표식. `mock`이면 MockVoiceProvider 산출물(PRD Risks "목업 잔존 위험" 방어용). Database.md에는
// 아직 반영 안 됨 — architect 확인/문서 갱신 권장(docs 에이전트가 Update Request 발행).
export type VoiceProviderName = "mock" | "elevenlabs";

// T7 추가(옵셔널, 하위호환 — Migration Policy, VoiceProviderName과 동일 패턴): 이 세션의 역할극
// 응답을 만든 LLM 어댑터 식별. `mock`이면 MockLlmClient 산출물(LLM_API_KEY 미확보 — 실 LLM으로
// 검증되지 않은 세션이라는 뜻, PRD Risks급 고지). Database.md에는 아직 반영 안 됨 — architect
// 확인/문서 갱신 권장.
export type LlmProviderName = "mock" | "claude" | "gemini";

// 메신저피싱 확장(T29, Architecture.md §13.1/13.4/13.5와 1:1) — 전부 옵셔널 증분 필드다
// (Migration Policy 준수, 기존 세션은 필드 부재만으로 channel="voice"로 간주). 스킨은
// 프레젠테이션 전용이라 어떤 안전 판정도 게이팅하지 않는다(§13.5).
export type MessengerChannel = "voice" | "messenger";
export type MessengerSurface = "kakao" | "sms";
export type MessengerSkin = "ios" | "samsung" | "default";
export type MessengerSkinSource = "auto" | "manual" | "fallback";

export type SessionDoc = {
  sessionId: string;
  uid: string;
  scenarioId: string;
  status: SessionStatus;
  endReason?: SessionEndReason;
  voiceId?: string; // 폐기 시 클리어(AC-021)
  voiceProvider?: VoiceProviderName; // T19 추가 — voiceId를 만든 VoiceProvider 식별(옵셔널)
  cloneStatus: CloneStatus;
  identitySelfConfirmed: boolean;
  turnCount: number;
  maxUserTurns: number;
  maxSessionMs: number;
  llmProvider?: LlmProviderName; // T7 추가 — 이 세션의 sendMessage가 쓴 LLM 어댑터 식별(옵셔널)
  createdAt: FirebaseFirestore.Timestamp;
  // 통화가 실제로 시작된 시각(첫 사용자 발화) — 세션 시간 한도(maxSessionMs)의 기점(#6, 2026-07-22).
  // sendMessage가 첫 턴에 1회 기록한다. 없으면(아직 대화 전) createdAt로 근사.
  answeredAt?: FirebaseFirestore.Timestamp;
  endedAt?: FirebaseFirestore.Timestamp;
  channel?: MessengerChannel; // T29 추가 — 부재="voice"(하위호환)
  surface?: MessengerSurface; // channel==="messenger"일 때만
  messengerSkin?: MessengerSkin; // 문자 표면(surface="sms") 스킨 판정 결과(§13.5)
  skinSource?: MessengerSkinSource; // 스킨 결정 출처(auto|manual|fallback)
};

// --- 메신저 표면 요소(T29, Architecture.md §13.4, AC-032/045) ---
// 실 URL 필드가 존재하지 않는다 — 링크는 displayText(모의 표기)·fakeLandingId(인앱 가짜 랜딩
// 참조)로만 표현되고 외부 네비게이션 경로가 스키마에 없다(AC-023 송금 금지와 동형의 구조적 금지).
export type MessengerAttachment = {
  kind: "link";
  displayText: string;
  fakeLandingId: string;
  harmless: true;
};

// --- sessions/{sessionId}/messages/{messageId} (AC-024) ---
export type MessageRole = "scammer" | "user";
export type MessageDoc = {
  role: MessageRole;
  textMasked: string; // PII 마스킹된 텍스트만 저장(원문 미저장, ADR-0004)
  turnIndex: number;
  createdAt: FirebaseFirestore.Timestamp;
  attachments?: MessengerAttachment[]; // T29 추가 — 스미싱 링크(§13.4/AC-045)
};

// --- sessions/{sessionId}/artifacts/{artifactId} (AC-022, ADR-0003) ---
export type ArtifactType = "audio" | "image";
export type ArtifactDoc = {
  type: ArtifactType;
  storagePath: string;
  voiceId?: string;
  synthetic: true;
  syntheticLabel: "AI 훈련용 합성";
  prerollLabel?: string;
  voiceProvider?: VoiceProviderName; // T19 추가 — 합성물을 만든 VoiceProvider 식별(옵셔널)
  createdAt: FirebaseFirestore.Timestamp;
};

// --- scenarios/{scenarioId} (AC-001/002, 공개 메타) ---
export type DeepvoiceLine = { lineId: string; text: string };
export type ScenarioDoc = {
  title: string;
  fraudType: string;
  estimatedDuration: string;
  difficulty: string;
  deepvoiceLines: DeepvoiceLine[];
};

// --- scenarioPrompts/{scenarioId} (ADR-0004, 클라 read 거부) ---
// suspicionKeywords(T27, 메신저피싱 확장, Architecture.md §13.2 AC-034 정합) — 앱이 사용자
// 입력을 직접 분류하는 화이트리스트가 아니다("앱은 자유텍스트를 분류하지 않는다" 원칙 불변).
// 역할극 LLM이 "이 캐릭터라면 상대가 이런 의심 반응을 보였을 때 통화로 넘어가려 한다"고 판단할
// 때 참고하도록 personaPrompt에 함께 주입하는 고정 예시 목록일 뿐이며, 최종 전이 여부·시점은
// 여전히 LLM이 구조화 신호([[SIGNAL:ESCALATE_VOICE]])를 실제로 내보내는지로만 결정된다.
// 에스컬레이션이 불가능한(escalation 필드가 없는) 시나리오는 이 필드를 두지 않는다.
export type ScenarioPromptDoc = {
  personaPrompt: string;
  weakenedTactics: string[];
  guardrailPreamble: string;
  suspicionKeywords?: string[];
};

// --- reports/{reportId} (AC-008/009/026) ---
export type DeceivedMoment = {
  turnIndex: number;
  timeLabel: string;
  tactic: string;
  correctAction: string;
};
export type ReportDoc = {
  reportId: string;
  sessionId: string;
  uid: string;
  wasDeceived: boolean;
  deceivedMoments: DeceivedMoment[];
  tacticsUsed: string[];
  preventionAdvice: string[]; // min 1
  createdAt: FirebaseFirestore.Timestamp;
};

// --- deletionLogs/{logId} (AC-021, ADR-0003) ---
export type DeletionTargetKind = "storage" | "elevenlabs_voice";
export type DeletionResult = "success" | "partial" | "failed";
export type DeletionTarget = {
  kind: DeletionTargetKind;
  ref: string;
  result: DeletionResult;
};
export type DeletionLogDoc = {
  sessionId: string;
  uid: string;
  deletedAt: FirebaseFirestore.Timestamp;
  targets: DeletionTarget[];
  overallResult: DeletionResult;
};
