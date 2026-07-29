// Callable 함수 계약 — API.md와 1:1(Architecture.md §4 "계약 원천 2곳" 중 하나, ADR-0001).
// 클라이언트(src/)와 Functions(functions/)가 이 시그니처에 맞춰 병렬 개발한다.
// 계약 변경은 트랙 간 합의 후(Architecture.md §8).
import type { DifficultyLevel } from "@/lib/difficulty";

// 메신저 표면 요소(T29, Architecture.md §13.4, AC-032/045) — 실 URL 필드가 존재하지 않는다.
// 링크는 displayText(모의 표기)·fakeLandingId(인앱 가짜 랜딩 참조)로만 표현된다.
// 인앱 목업의 종류(T84, UX-023 kind 축 · §15.9.1 R2/R3). **서버 카탈로그가 정한다** — 클라는
// fakeLandingId 문자열을 분류하지 않는다(AC-024 원칙 계승).
export type MockScreenKind = "credential-form" | "app-install";

export type MessengerAttachment = {
  kind: "link";
  displayText: string;
  fakeLandingId: string;
  harmless: true;
  // **부재 → `credential-form`**(하위호환 읽기 규칙, §15.9.1 R2). `app-install` 방향으로 폴백하지
  // 않는다 — 사고로 설치 목업이 열리는 방향은 금지다(R5).
  landingKind?: MockScreenKind;
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

// difficultyLevel(T72 추가, 옵셔널·하위호환, docs/UX.md UX-029 · Architecture.md §15.3.2 · AC-064) —
// 드릴다운 마지막 단계에서 고른 훈련 강도. 서버가 enum 검증 후 세션에 기록하고, **응답의
// difficultyLevel로 실제 적용값을 되돌려준다**(요청값과 다르면 폴백이 일어난 것 — 조용히 진행하지
// 않고 사용자에게 알린다). functions/src/session/types.ts와 1:1.
export type CreateSessionRequest = {
  scenarioId: string;
  voiceId: string;
  sessionId?: string;
  channel?: "voice" | "messenger";
  surface?: "kakao" | "sms";
  messengerSkin?: "ios" | "samsung" | "default";
  skinSource?: "auto" | "manual" | "fallback";
  voiceSelectionSource?: VoiceSelectionSource;
  difficultyLevel?: DifficultyLevel;
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
  // T72 — 서버가 실제로 확정해 기록한 난이도(§15.3.2). 요청값과 다르면 폴백이 일어난 것이다.
  difficultyLevel: DifficultyLevel;
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
  /**
   * T68 추가(옵셔널, 하위호환) — 이번 턴에 통화 중 문자가 도착했다는 뜻(폴백 텍스트 경로).
   * ⚠️ **렌더 소스가 아니다** — 화면은 `sessions/{sid}/inCallSms` 구독으로 그린다(실시간 경로와
   * 동일한 단일 소스). functions/src/roleplay/types.ts와 1:1.
   */
  sms?: { smsId: string };
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
  /**
   * T72(Architecture.md §15.3.3/§15.6 G6) — 고른 난이도가 이 통화 경로에 **실제로 반영됐는가**.
   * ElevenLabs 경로는 프롬프트가 에이전트 쪽에 저장돼 있어 주입 지점이 없어 false다. 클라는 false면
   * 난이도 배지를 띄우지 않고(근거 없는 표기 금지) 미적용 사실을 알린다(조용한 미적용 금지).
   */
  difficultyApplied: boolean;
  /**
   * T68(Architecture.md §15.1.2, UX-027/UF-008) — 이 시나리오의 통화 중 문자 **트리거만**
   * (`smsId` + 몇 번째 사기범 턴 이후). **본문·인증번호·발신번호는 오지 않는다** — 도착 시점에
   * `deliverInCallSms`가 서버에서 렌더해 Firestore에 쓰고, 화면은 그 구독으로만 그린다.
   * 카탈로그가 없는 시나리오는 필드 부재.
   */
  inCallSmsTriggers?: InCallSmsTrigger[];
  /**
   * T83(Architecture.md §16.1.5, UX-031/UF-011) — 확인 시도 무력화의 **가용 게이트만**
   * (몇 번째 사기범 턴 이후부터 확인 권유가 가능한가). **창구명·번호는 오지 않는다** — 오퍼 시점에
   * `deliverVerifyOffer`가 서버 카탈로그에서 렌더해 Firestore에 쓰고, 화면은 그 구독으로만 그린다.
   * **필드가 없으면 이 세션에는 확인 컨트롤이 존재하지 않는다**(카탈로그 없음 / 고급 아님 /
   * 난이도가 반영되지 않는 경로).
   */
  verifyOffer?: VerifyOfferTrigger;
};
export type InCallSmsTrigger = { smsId: string; afterScammerTurns: number };
export type VerifyOfferTrigger = { availableAfterScammerTurns: number };

// --- deliverInCallSms / recordInCallSmsEvent (T68 · UX-027/UF-008 · AC-059/060/061) ---
// 통화 중 문자. functions/src/inCallSms/types.ts와 1:1.
//
// ⚠️ **읽기 전용 계약(AC-060)**: 답장·전달·전송 요청 타입이 존재하지 않는다. 실 URL 필드도
// 어느 타입에도 없다 — 링크는 표시 텍스트 + 인앱 가짜 랜딩 참조로만 표현된다(AC-032/045).
export type DeliverInCallSmsRequest = { sessionId: string; smsId: string };
export type DeliverInCallSmsResponse = { smsId: string; announceInstruction: string };
// T123/AC-080 — `landing_submitted` = "그 문자가 연 가짜 랜딩의 폼을 제출했다"는 **사실 하나**.
// ⛔ 참가자 입력값(계좌번호·예금주명)을 담을 필드가 아래 요청 타입에 **존재하지 않는다**(AC-045).
export type InCallSmsEvent = "opened" | "link_tapped" | "landing_submitted";
export type RecordInCallSmsEventRequest = {
  sessionId: string;
  smsId: string;
  event: InCallSmsEvent;
};
export type RecordInCallSmsEventResponse = { recorded: true };

// --- recordMockScreenEvent (T84 · UX-023 kind=`app-install`/UF-012 · AC-072/AC-073) ---
// 인앱 모의 화면 상호작용 기록. functions/src/mockScreens/types.ts와 1:1(API.md 부록 A).
//
// ⚠️ **참가자 입력을 받지 않는다**(AC-045 유지): 인자는 세션 id·랜딩 id·고정 enum 3개뿐이다.
// ⚠️ **AC-072 구조적 금지**: 실 설치 파일·스토어 URL·실존 앱명·OS 권한 목록에 해당하는 필드가
// 요청·응답 어디에도 존재하지 않는다. 호출 주체는 **페이지**이고 목업 컴포넌트가 아니다 —
// `MessengerFakeLanding`의 "네트워크 경로 부재" 불변식을 kind 추가 후에도 유지하기 위해서다.
// T123/AC-080 — `submitted`("입력 폼 제출")는 `consented`("가짜 **권한 허용**")와 **다른 축**이다.
export type MockScreenEvent = "shown" | "consented" | "submitted";
export type RecordMockScreenEventRequest = {
  sessionId: string;
  landingId: string;
  event: MockScreenEvent;
};
export type RecordMockScreenEventResponse = { ok: true };

// --- deliverVerifyOffer / deliverVerifyReconnect (T83 · UX-031/UF-011 · AC-071/AC-019) ---
// 확인 시도 무력화(모의 확인 전화). functions/src/verifyIntercept/types.ts와 1:1.
//
// ⚠️ **실 발신 표면 부재(AC-019 하드)**: 요청 타입에 전화번호·URL·발신 대상 필드가 **존재하지
// 않는다** — 이 화면에는 자유 입력 필드가 없고, 참가자가 할 수 있는 것은 "안내받은 번호로
// 걸어보기" 버튼 탭뿐이다. 응답에도 창구명·번호가 없다(화면은 Firestore 구독으로만 그린다 —
// 단일 렌더 소스). 두 콜러블은 **어떤 통신·전화 API도 호출하지 않는다**(인앱 재현).
export type VerifyCallMode = "realtime" | "fallback";
/**
 * ⭐ **§38.4 후보 E — 2단 오퍼**(실시간 경로 전용). `announce`는 지시만 받고 **문서를 만들지
 * 않는다**, `commit`은 예고 턴이 끝난 뒤 문서를 만든다 ⇒ **문서 존재 = 예고 완료**가 성립해
 * 컨트롤이 예고보다 먼저 뜨지 않는다. **부재 = 종전 동작**(폴백 경로가 그대로 쓴다).
 */
export type VerifyOfferStage = "announce" | "commit";
export type DeliverVerifyOfferRequest = {
  sessionId: string;
  callMode: VerifyCallMode;
  /** `callMode==="realtime"`일 때만 필요(폴백은 서버가 직접 센다). */
  scammerTurns?: number;
  stage?: VerifyOfferStage;
};
/**
 * ⚠️ **T118/R-1** — `announceInstruction`은 **옵셔널**이다. 호 전환이 이미 끝난(`placedAt`) 오퍼에는
 * 서버가 싣지 않는다(§25.5 (4)). 값이 없으면 클라는 **주입하지 않는다** — 전환 이후의 확인 권유는
 * 참가자가 겪은 사실과 모순이기 때문이다.
 */
export type DeliverVerifyOfferResponse = { offerId: string; announceInstruction?: string };
export type DeliverVerifyReconnectRequest = {
  sessionId: string;
  offerId: string;
  callMode: VerifyCallMode;
  scammerTurns?: number;
};
/**
 * ⚠️ **T118/A5** — `transferStateLine`은 전환 이후 사기범 턴 경계마다 클라가 **다시 넣는** 전환 상태
 * 단언 1줄이다(§25.3). 서버 카탈로그가 소유하며 클라는 값을 만들지 않는다(**G101**).
 */
export type DeliverVerifyReconnectResponse = {
  reconnectInstruction: string;
  transferStateLine: string;
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

// --- requestReverseEscalation (T40 fast-follow · UX-014 명시 "메시지로 전환" 버튼 · §13.1/AC-039) ---
// functions/src/session/types.ts와 1:1. requestEscalation과 반대 방향(보이스→메신저), 명시 버튼만
// 지원(구조화 신호·max-turn 폴백 없음 — T40 판단, docs/Tasks.md T40 행 참고).
export type RequestReverseEscalationRequest = { sessionId: string };
export type RequestReverseEscalationResponse = { escalation: { toChannel: "messenger" } };

// --- generateReport (Track A · T9 · UX-008 · AC-008/AC-009/AC-026) ---
export type GenerateReportRequest = { sessionId: string };
export type GenerateReportResponse = { reportId: string };

// --- judgeRewindAnswer (T70 · UX-028/UF-009 · AC-062/AC-063, Architecture.md §15.2.3) ---
// functions/src/rewind/types.ts와 1:1. 원 리포트는 읽기 전용으로만 참조되며 이 호출은
// reports/{rid}/rewindAttempts에만 append한다(AC-007 불변식 보호, ADR-0008).
export type RewindVerdict = "good" | "risky" | "unclear";
export type JudgeRewindAnswerRequest = {
  reportId: string;
  momentIndex: number;
  answerText: string;
};
export type JudgeRewindAnswerResponse = {
  verdict: RewindVerdict;
  reason: string;
  /** 판정 불가(unclear)여도 항상 채워져 온다(학습 최소 보장). */
  correctAction: string;
  judgedBy: "llm" | "rule";
};

// --- createChallenge / deleteChallenge (Track A/C · T36 · UX-019/020 · AC-041/044/048/049) ---
// functions/src/challenge/types.ts와 1:1. shareToken은 createChallenge 응답에서만 평문 반환되고
// 서버 어디에도 저장되지 않는다(§14.4) — 클라도 sessionStorage 등에 지속시키지 않는다.
// difficultyLevel(T72 추가, UX-019/UX-029, AC-064) — 발신자가 고른 "상대가 겪을 강도".
export type CreateChallengeRequest = {
  scenarioId: string;
  displayName: string;
  difficultyLevel?: DifficultyLevel;
};
export type CreateChallengeResponse = {
  challengeId: string;
  shareToken: string;
  linkExpiresAt: string;
};
export type DeleteChallengeRequest = { challengeId: string };
export type DeleteChallengeResponse = { status: "deleted" };

// --- listMyChallenges (Track A/C · T36 · UX-020 · reviewer 리뷰 Critical #1 수정) ---
// functions/src/challenge/types.ts와 1:1. voiceId/linkTokenHash 등 민감 필드는 응답에 절대 싣지
// 않는다 — firestore.rules의 challenges read는 전면 거부로 좁혀졌고 이 콜러블이 유일한 조회 경로다.
export type ListMyChallengesRequest = Record<string, never>;
export type ListMyChallengesItem = {
  challengeId: string;
  displayName: string;
  status: string;
  resultSharingConsented: boolean;
  suspicionTimeLabel: string | null;
  createdAt: string | null;
  // T49(#20 · MVP #20 · Architecture.md §14.8.3) — 부재 없이 항상 확정값. 메신저 챌린지는
  // suspicionTimeLabel이 항상 null임을 화면(UX-020)이 재확인할 수 있게 한다(AC-055/OQ-31).
  channel: "voice" | "messenger";
  // T56(#23 · MVP #23 · Architecture.md §14.9.3) — 부재→"clone". generic 보이스 챌린지도
  // suspicionTimeLabel이 항상 null임을 화면(UX-020)이 재확인할 수 있게 한다(AC-058/OQ-32).
  voiceMode: "clone" | "generic";
};
export type ListMyChallengesResponse = { challenges: ListMyChallengesItem[] };

// --- getChallengeLanding / consentChallenge / reportChallenge / setChallengeResultSharing ---
// (Track A/C · T37 · UX-021/018 · AC-040/042/043/048/049, §14.7/ADR-0006)
// functions/src/challenge/types.ts와 1:1.
export type ChallengeReportReason = "unwanted" | "harassment" | "impersonation_concern" | "other";

export type GetChallengeLandingRequest = { token: string };
export type GetChallengeLandingResponse = {
  displayName: string;
  status: string;
  expired: boolean;
  // T49(#20 · MVP #20 · Architecture.md §14.8.2) — 부재 없이 항상 확정값. 동의 후 UX-014(voice)
  // vs UX-022(messenger) 라우팅을 이 값으로 분기한다(D-28).
  channel: "voice" | "messenger";
  // T72(§15.3.2 · UX-021 · AC-040/064) — 발신자가 고른 강도. 동의 **전에** 표시해 사전 동의의
  // 정보량을 늘린다(고급이면 "강한 압박" 고지). 게이트 로직은 무변경(D-42/AC-065).
  difficultyLevel: DifficultyLevel;
};

// consentChallenge는 익명 사인인 후(§14.7/ADR-0006 A1) 호출한다 — 클라가 동의 탭 시점에
// signInAnonymously로 임시 uid를 먼저 확보한 뒤 이 콜러블을 호출해야 한다.
export type ConsentChallengeRequest = { token: string };
export type ConsentChallengeResponse = {
  sessionId: string;
  openingAudioUrl?: string;
  // 사용자 신고(2026-07-24) — 실시간 통화에서 사용자가 먼저 말해야 하던 문제 수정. createSession과
  // 동일하게 generateOpeningLine 결과 텍스트를 함께 반환해 ElevenLabs 세션의 firstMessage로 쓴다.
  // resume(재개, 신규 동의 아님) 시에는 새 오프닝을 만들지 않으므로 비어 있다.
  openingMessageText?: string;
};

export type ReportChallengeRequest = {
  token: string;
  reason: ChallengeReportReason;
  note?: string;
};
export type ReportChallengeResponse = { status: "reported" };

export type SetChallengeResultSharingRequest = { token: string; share: boolean };
export type SetChallengeResultSharingResponse = { shared: boolean };

// --- getBeginnerBriefing (T72 · UX-029 초급 사전 브리핑 · Architecture.md §15.3.4 · AC-066) ---
// functions/src/scenarios/briefingTypes.ts와 1:1. 반환되는 것은 **수법 라벨뿐**이며 페르소나·대사
// 예시·가드레일 원문은 서버에 남는다(ADR-0004). 세션 **시작 전** 화면에서만 소비되고, 대화 중
// 실시간 판정 표시에는 쓰지 않는다(D-6 유지).
export type GetBeginnerBriefingRequest = { scenarioId: string };
export type GetBeginnerBriefingResponse = { signals: string[] };
