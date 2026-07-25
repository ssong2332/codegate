// Firestore 문서 계약 — Database.md와 1:1(Architecture.md §4 "계약 원천 2곳" 중 하나, ADR-0001).
// 각 트랙은 실제 데이터가 없어도 이 타입에 맞춰 개발한다. 필드/제약 변경은 Database.md와
// 함께(트랙 간 합의 후) 갱신한다.
import type { VoiceMode } from "../scenarios/publicMeta";
import type { DifficultyLevel } from "./difficulty";
import type { TacticCategory } from "../report/tacticCategory";

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

// 채널 전이(T30, Architecture.md §13.1/13.2/13.3, AC-034/035/037/039) — 전부 옵셔널 증분 필드다
// (Migration Policy, 기존 세션은 필드 부재만으로 무영향). MVP는 messenger→voice 한 방향만 배선하지만
// (functions/src/session/channelTransition.ts), 스키마 자체는 방향 무관하게 둔다.
export type ChannelTransitionTrigger =
  | "structured_signal" // [[SIGNAL:ESCALATE_VOICE]] 감지(§13.2)
  | "maxturn_fallback" // 메신저 단계 max-turn 자동 전이(§13.3, PoC 전 가정치)
  | "manual_button"; // 사용자의 명시 "전화로 확인" 버튼(§13.3)
export type ChannelTransitionEntry = {
  from: MessengerChannel;
  to: MessengerChannel;
  at: FirebaseFirestore.Timestamp;
  trigger: ChannelTransitionTrigger;
  // reviewer 리뷰 Major #2 수정(2026-07-24, T40 이후 발견) — `to==="messenger"`인 전이에만 기록.
  // sendMessage의 max-turn 폴백(MESSENGER_ESCALATION_FALLBACK_TURNS)이 세션 누적 turnCount 대신
  // "이번 메신저 재진입 이후 턴 수"를 비교하기 위한 기준점이다(functions/src/roleplay/index.ts
  // 참고) — 없으면 T40으로 보이스→메신저 복귀 직후 다음 메시지에서 누적 turnCount가 이미 6 이상인
  // 채로 즉시 재-에스컬레이션되는 "핑퐁" 버그가 생긴다(한 번이라도 6턴을 넘긴 세션은 이후 영원히).
  turnCountAtTransition?: number;
};
// UX-025(§13.6) 목소리 결정 경로 — createSession 요청의 voiceSelectionSource와 1:1.
export type VoiceSelectionSource = "recorded" | "reused" | "fallback_male" | "fallback_female";

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
  channel?: MessengerChannel; // T29 추가 — 부재="voice"(하위호환), T30부터 이 값이 실제로 바뀐다
  surface?: MessengerSurface; // channel==="messenger"일 때만
  messengerSkin?: MessengerSkin; // 문자 표면(surface="sms") 스킨 판정 결과(§13.5)
  skinSource?: MessengerSkinSource; // 스킨 결정 출처(auto|manual|fallback)
  // T30 추가(옵셔널, 하위호환, Architecture.md §13.1) — 세션이 처음 시작된 채널. 리포트가 교차채널
  // 여부를 판정(AC-037). createSession이 생성 시 1회만 기록하고 이후 전이와 무관하게 불변이다.
  entryChannel?: MessengerChannel;
  // 전이 이력(§13.1) — transitionChannel(functions/src/session/channelTransition.ts)이 append.
  channelHistory?: ChannelTransitionEntry[];
  // UX-025(§13.6) 확정된 목소리 결정 경로. 에스컬레이션 가능 메신저 시나리오에서만 채워진다.
  voiceSelectionSource?: VoiceSelectionSource;
  // T37 추가(옵셔널, 하위호환 — Migration Policy) — 2인 소셜 사용자2 체험 세션이면 소속 챌린지
  // (§14.1, Database.md `sessions.challengeId`). 이 세션의 uid는 동의 시 발급된 임시 익명 uid다
  // (§14.7/ADR-0006). ⚠️ 챌린지 clone voiceId는 이 세션에 절대 저장하지 않는다(A1 — 유출·폐기
  // 격리, ADR-0006 "정제" 절 참고). createRealtimeCall이 발급 시점에 challenges/{challengeId}에서
  // 서버측(admin)으로만 voiceId를 해석한다.
  challengeId?: string;
  // T37 추가(옵셔널) — challengeId가 있을 때만 채워지는, 챌린지 생성자(사용자1)의 표시이름.
  // voiceId와 달리 민감 필드가 아니라(ADR-0006은 voiceId만 명시적으로 금지) 소유자 직접 read로
  // 노출돼도 무방하다 — session/end(UX-007 2인 변형 문구)·report/replay(UX-018 결과 공유 동의
  // 문구)가 별도 챌린지 문서 round-trip 없이 이 필드만으로 "○○님" 문구를 렌더링한다.
  challengeCreatorDisplayName?: string;
  // T72 추가(옵셔널, 하위호환·무백필 — Architecture.md §15.3.2, UX-029/AC-064) — 사용자가 UX-029에서
  // 고른 훈련 강도. **부재→"intermediate"**(난이도 도입 이전 세션은 전부 부재이며, 중급은 모디파이어
  // 블록을 내보내지 않아 프롬프트가 도입 전과 완전히 동일하다). 시나리오 메타의 산문 `difficulty`
  // (ScenarioDoc)와는 이름·의미가 다른 별개 필드다(오버로드 금지, §15.3.2).
  difficultyLevel?: DifficultyLevel;
};

// --- users/{uid}/voices/{voiceId} (P-8·AC-046, ADR-0005·Database.md 1:1) ---
// 유지형 복제 음성 보관함 — ADR-0003(세션 즉시 폐기)의 예외가 아니라 사용자가 명시적으로 "보관"을
// 택했을 때만 생기는 별도 opt-in 저장소다. T30은 이 스키마를 UX-025 "기존 목소리 재사용" 조회
// 대상으로만 소비한다 — 채우는 UI(저장 기능)는 범위 밖(architect: "MVP 최소는 ①+③만으로 성립").
export type StoredVoiceDoc = {
  voiceId: string; // ElevenLabs 클론 voice id (문서 id와 동일)
  label: string; // 사용자 지정 라벨("내 목소리 1")
  retentionDeleteAt: FirebaseFirestore.Timestamp; // 기간제 보존(기본 30일, 조정 7~90일)
  source?: "onboarding" | "escalation"; // 생성 경위
  createdAt: FirebaseFirestore.Timestamp;
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
  // T30 추가(옵셔널, 하위호환, §13.1) — 이 턴이 발생한 채널(교차채널 타임라인, AC-037). 기존
  // 보이스 전용 세션은 항상 부재.
  channel?: MessengerChannel;
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

// --- sessions/{sessionId}/inCallSms/{smsId} (T68, UX-027/UF-008, §15.1.2, AC-059/060/061) ---
//
// ⚠️ **왜 `messages`가 아니라 별도 서브컬렉션인가(치명적 — §15.6 G3)**: `analyzeConversation`은
// `messages`를 turnIndex 순으로 훑으며 **scammer(i) ↔ user(i+1)를 짝지어** 속은 순간을 판정한다
// (`report/analyzeConversation.ts`). 문자 도착을 메시지 행으로 끼워 넣으면 이 짝짓기가 통째로
// 어긋나 **리포트 판정이 손상된다**(AC-008/009/026 회귀). 문자는 대화 턴이 아니라 통화 중 도착한
// 별개 객체이므로 컬렉션을 분리한다.
//
// ⚠️ `MessengerAttachment`는 **무변경**이다 — OTP형은 링크가 아니라 표시용 코드라
// `{kind:"link",displayText,fakeLandingId,harmless}`에 담기지 않는다. 억지 확장은 "link인데
// fakeLandingId가 없는" 부재-오버로드를 만든다(§14.9.1이 반복 기각한 안티패턴).
export type InCallSmsKind = "account" | "link" | "otp";
export type InCallSmsDoc = {
  smsId: string; // = 문서 id. 서버가 IN_CALL_SMS[session.scenarioId] 소속을 재검증한 값만 기록
  kind: InCallSmsKind;
  senderLabel: string; // 실존하지 않는 모의값(AC-005/013)
  body: string; // 서버 카탈로그가 원천 — 사용자·LLM 텍스트가 아니므로 PII 마스킹 대상이 아니다
  otpCode?: string; // kind==="otp"일 때만. 콘텐츠 고정 리터럴(런타임 난수 금지)
  linkDisplayText?: string; // kind==="link"일 때만
  fakeLandingId?: string; // kind==="link"일 때만. **url/실 URL 필드는 이 스키마에 존재하지 않는다**
  arrivedAt: FirebaseFirestore.Timestamp;
  openedAt?: FirebaseFirestore.Timestamp; // recordInCallSmsEvent("opened")
  linkTappedAt?: FirebaseFirestore.Timestamp; // recordInCallSmsEvent("link_tapped")
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
  // T74 추가(옵셔널, 하위호환 — Migration Policy, §15.4.2/AC-068): 실패 아카이브(UX-030)의
  // "수법별 묶기" 그룹 키. 표시 문구는 여전히 `tactic` 원문이고 이 값은 묶기에만 쓴다. 기존
  // 리포트에는 없으므로 아카이브가 `tacticCategory ?? tactic`으로 폴백한다(무백필).
  tacticCategory?: TacticCategory;
};
export type ReportDoc = {
  reportId: string;
  sessionId: string;
  uid: string;
  wasDeceived: boolean;
  deceivedMoments: DeceivedMoment[];
  tacticsUsed: string[];
  preventionAdvice: string[]; // min 1
  // T72 추가(옵셔널, 하위호환 — §15.3.2/§15.4.1) — 리포트 생성 시 세션에서 역정규화한 표기용 값.
  // **난이도는 리포트 판정에 어떤 영향도 주지 않는다**(§15.3.5 — analyzeConversation/
  // buildPreventionAdvice/computeDefenseGrade 시그니처 무변경). 표기 전용이다(P-22).
  difficultyLevel?: DifficultyLevel;
  createdAt: FirebaseFirestore.Timestamp;
  // T74 추가(전부 옵셔널, 하위호환 — §15.4.1 "아카이브 카드가 필요로 하는 세션 메타를 리포트에
  // 역정규화"). 없으면 아카이브가 카드 1장마다 세션 문서를 추가 read해야 한다(N+1, §15.6 G8).
  // 생성 시점에 session을 이미 읽고 있으므로 비용은 0에 가깝다. 시나리오 **제목**은 역정규화하지
  // 않는다 — scenarioId로 클라의 공개 카탈로그에서 얻는다(콘텐츠 수정이 과거 카드에도 반영됨).
  scenarioId?: string;
  channel?: MessengerChannel;
  // ⚠️ AC-069 2차 방어(§15.4.3) — 2인 챌린지 체험 세션에서 나온 리포트임을 표시한다. 아카이브는
  // 이 값이 있는 리포트를 제외한다(1차 방어는 uid 격리 그 자체). 값이 있는 셀을 만들어 두는
  // 이유는 장래 "익명 세션 승격" 같은 기능이 생겨도 챌린지 실패 이력이 누적 화면에 섞이지 않게
  // 하기 위한 벨트+멜빵이다.
  challengeId?: string;
};

// --- reports/{reportId}/rewindAttempts/{attemptId} (T70, UX-028/UF-009, §15.2.2, AC-062/063) ---
// ⚠️ 이 서브컬렉션의 존재 이유가 AC-007 보호다 — 되감기 시도는 리포트 문서를 바꾸지 않고 하위에만
// 쌓인다(Database.md §rewindAttempts). answerMasked는 maskPII 적용 후 값만 저장한다(ADR-0004).
export type RewindAttemptDoc = {
  momentTurnIndex: number;
  answerMasked: string;
  verdict: "good" | "risky" | "unclear";
  reason: string;
  judgedBy: "llm" | "rule";
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
  // T36 추가(옵셔널, 하위호환) — 챌린지 폐기 로그(challengeId 있음)는 세션에서 나온 게 아니라
  // sessionId가 없다. sessionId/challengeId는 상호 배타적이다(둘 중 정확히 하나만 채워진다).
  // ADR-0005 follow-up("deletionLogs에 옵셔널 challengeId")이 sessionId를 명시적으로 옵셔널화하라고
  // 적진 않았지만, 폐기 출처가 둘로 늘어난 이상 "항상 sessionId가 있다"는 기존 타입 불변식은 더
  // 이상 참이 아니므로 함께 옵셔널로 바꿨다(architect 확인/문서 갱신 권장 — 구현 보고서 참고).
  sessionId?: string;
  challengeId?: string; // T36 추가(옵셔널) — ADR-0005 follow-up, Database.md §deletionLogs 주석.
  uid: string;
  deletedAt: FirebaseFirestore.Timestamp;
  targets: DeletionTarget[];
  overallResult: DeletionResult;
};

// --- challenges/{challengeId} (T36, ADR-0005, Architecture.md §14.1, Database.md §challenges) ---
// 2인 소셜 챌린지 — 사용자1(creatorUid)이 자기 클론 목소리로 만들어 지인(사용자2)에게 보내는 비동기
// 딥보이스 체험. 사용자2는 무계정·토큰 진입이라 이 스키마에 사용자2 uid가 없다(§14.0). T36은 이
// 타입과 creatorUid 쪽(생성·스코프·토큰·폐기)만 채운다 — resultSharingConsented/resultSummary/
// reportedAt/reportReason/reportNote는 전부 T37(사용자2 동의·체험·신고)이 채우는 필드라 T36은 쓰지
// 않는다(옵셔널이라 T36 생성 시점엔 키 자체가 없다).
export type ChallengeStatus =
  | "pending"
  | "consented"
  | "in_progress"
  | "completed"
  | "expired"
  | "reported"
  | "deleted";
export type ChallengeReportReason =
  | "unwanted"
  | "harassment"
  | "impersonation_concern"
  | "other";
export type ChallengeResultSummary = {
  completed: boolean;
  suspicionTimeLabel?: string;
  suspicionTurnIndex?: number;
};
export type ChallengeTier = "free" | "paid"; // 부재=free(§14.6, AC-050 — tier는 용량 축에만 영향)
export type ChallengeDoc = {
  challengeId: string;
  creatorUid: string; // 사용자1(발신)·활성개수 판정 키
  scenarioId: string; // 딥보이스(clone) 또는 메신저(비에스컬레이션) 시나리오(T47, §14.8.1)
  // T47 증분(#20, §14.8.1) — required→optional. 메신저 챌린지(AC-051)는 클론·통화 자격증명
  // 경로를 아예 타지 않아 값이 없다. 기존 보이스 챌린지 문서는 전부 세팅돼 있어 하위호환.
  voiceId?: string; // 이 챌린지에 스코프 고정된 클론 voice(ADR-0005) — 챌린지 밖 재사용 불가
  // T47 증분(#20, §14.8.1) — 채널 판별자. 부재→"voice"(계산 기본값, 무백필). 생성 시
  // `PUBLIC_SCENARIOS[scenarioId].channel ?? "voice"`로 역정규화. voiceId 부재를 채널 신호로
  // 오버로드하지 않는다(#21에서 messenger+voiceId가 병존할 수 있어 명시 판별자가 필요, §14.8.1).
  channel?: MessengerChannel;
  // T55/56 증분(#23, §14.9.1) — channel=voice(또는 부재) 챌린지의 clone/generic 판별자.
  // 부재→"clone"(계산 기본값·무백필, 기존 보이스 챌린지 문서는 전부 clone). 생성 시
  // `PUBLIC_SCENARIOS[scenarioId].voiceMode`로 역정규화. voiceId 부재를 이 판별자로 오버로드하지
  // 않는다(#21 messenger+voiceId 병존 대비 + 결과 요약 게이트가 양[positive] 판별자를 요구,
  // §14.9.1). channel==="messenger" 챌린지에는 두지 않는다(음성모드 개념 없음).
  voiceMode?: VoiceMode;
  displayName: string; // 사용자2에게 보일 "○○님이 준비" 표시이름
  status: ChallengeStatus;
  linkTokenHash: string; // 공유 토큰의 SHA-256 해시만(평문 미저장, §14.4)
  linkExpiresAt: FirebaseFirestore.Timestamp; // 무료 생성+3일(AC-048)
  linkConsumedAt?: FirebaseFirestore.Timestamp; // 1회성 소모 시각(동의 통과 시, T37이 세팅)
  retentionDeleteAt: FirebaseFirestore.Timestamp; // 복제 음성·챌린지 자동 삭제 예정(기본 생성+30일)
  resultSharingConsented?: boolean; // T37 소관 — 부재=미동의
  resultSummary?: ChallengeResultSummary; // T37 소관 — 동의 시에만 채워짐, 대화 전문 없음(AC-043)
  reportedAt?: FirebaseFirestore.Timestamp; // T37 소관
  reportReason?: ChallengeReportReason; // T37 소관
  reportNote?: string; // T37 소관, PII 마스킹
  tier?: ChallengeTier;
  // T72 추가(옵셔널, 하위호환·무백필 — §15.3.2, UX-019/UX-021/AC-064) — 발신자(사용자1)가 UX-029에서
  // 고른, **수신자(사용자2)가 겪을** 강도. 부재→"intermediate". 수신자 동의 랜딩(UX-021)에 표시돼
  // AC-040 사전 동의의 정보량을 늘리고(안전장치 강화 방향), consentChallenge가 사용자2 체험 세션에
  // **복사**한다 — 프롬프트는 세션 단위로 조립되므로 복사하지 않으면 발신자 선택이 소실된다(§15.6 G9).
  // 난이도는 활성 챌린지 상한(AC-049)·링크 토큰(AC-048)·결과 열람 범위(AC-043/055) 등 **어떤 안전·
  // 정책 판정도 바꾸지 않는다**(D-42/AC-065).
  difficultyLevel?: DifficultyLevel;
  createdAt: FirebaseFirestore.Timestamp;
};
