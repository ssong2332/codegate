// Firestore 문서 계약 — Database.md와 1:1(Architecture.md §4 "계약 원천 2곳" 중 하나, ADR-0001).
// 각 트랙은 실제 데이터가 없어도 이 타입에 맞춰 개발한다. 필드/제약 변경은 Database.md와
// 함께(트랙 간 합의 후) 갱신한다.
import type { VoiceMode } from "../scenarios/publicMeta";
import type { MockScreenKind } from "../scenarios/mockScreens";
import type { DifficultyLevel } from "./difficulty";
import type { TacticCategory } from "../report/tacticCategory";
import type { FamilyAddressTerm } from "../scenarios/familyAddress";

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
  | "limit_reached"
  // T192 C1(Architecture.md §79.5 · AC-103 (e)) — 사기범의 먼저 끊기. ⛔ 서버 승인 표식(`scammerHangup`)이
  // 있을 때만 기록된다(`session/endReason.ts`). 리포트는 이 값을 읽지 않는다(G511).
  | "scammer_ended";
// T192 C1(§79.5) — 끊기 승인 표식. `requestScammerHangup`(실시간) · `sendMessage`(폴백 — C3)만 쓴다.
// `kind`는 모델 판단의 기록일 뿐 판정에 쓰지 않는다(§79.2).
export type ScammerHangupKind = "goal" | "give_up" | "unspecified";
export type ScammerHangupPath = "realtime" | "fallback";

// --- T194-b 훈련용 가상 신상 카드(Architecture.md §84.3.2 · PRD AC-104 · UX-014 v1.38 (1)(2)) ---
// ⛔ 값은 전부 서버가 지은 가상 값이다(사용자 계정 정보 0 — AC-104 (e)). 라벨은 화면 · 프롬프트 공통.
// §88 후속(2026-10-20) — `birthDate`(생년월일 = 출생 연도 + 생일 월 · 일). 월 · 일을 넣었을 때 `birthYear` 행 **대신** 쓴다.
// §93(2026-10-21 · 사용자 승인 — 대상 확대) — 협박형 2종용 행: `job`(하는 일 — 불법업소 유포 협박) · `childName` · `childGrade` ·
// `childAcademy`(자녀 — 자녀 납치 협박). 값은 고정 선택지(하는 일 · 학년 · 학원 종류) 또는 이름 규칙을 통과한 입력뿐이다(실명 학교 · 학원 0).
export type PersonaCardKey =
  | "name"
  | "birthYear"
  | "birthDate"
  | "region"
  | "bank"
  | "card"
  | "loan"
  | "job"
  | "childName"
  | "childGrade"
  | "childAcademy";
export type PersonaCardItem = { key: PersonaCardKey; label: string; value: string };
/**
 * §88(DECISIONS #199) — 카드를 넣은 사람. `self` = 자가 훈련 참가자 본인(`createSession`) · `sender` = 챌린지를 보낸 사람
 * (`createChallenge` → 수신자 세션에 복사). 수신자 화면은 `sender` 카드를 통화가 끝날 때까지 그리지 않는다.
 */
export type PersonaCardInputBy = "self" | "sender";
/**
 * v1 = 옛 서버 임의 생성 카드(§84.3.2 — 폐지 · 읽기 하위호환만) · v2 = 사용자 입력 카드(§88).
 */
export type PersonaCard = { v: 1; items: PersonaCardItem[] } | { v: 2; inputBy: PersonaCardInputBy; items: PersonaCardItem[] };

export type ScammerHangupMarker = {
  acceptedAt: FirebaseFirestore.Timestamp;
  kind: ScammerHangupKind;
  path: ScammerHangupPath;
};
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
  | "manual_button" // 사용자의 명시 "전화로 확인" 버튼(§13.3)
  | "announced_call"; // §128(1) 신호 없이 대사로 전화를 예고했고 지금 전환할 수 있다(`roleplay/callAnnouncement.ts`)
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
  /**
   * §123 — 이 메신저→통화 전환에서 **참가자가 건** 통화(대화방 보이스톡 발신)면 `"participant"`. 부재 = 사기범이 건 통화(종전 ·
   * 무백필). 판정은 `roleplay/callCaller.ts` `currentCallCaller` 하나.
   */
  caller?: "participant";
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
  /**
   * 2026-10-18(Architecture §81) — 이 세션의 가상 은행명(`shared/fictionalBank.ts` 목록 중 하나). 세션 생성 때 1회
   * 고르고 바꾸지 않는다 — 문자 본문·사기범 대사·Live 프롬프트·(예정) 가짜 랜딩 미리 채움이 **이 필드 하나**를 읽는다.
   * 부재(옛 세션)면 `resolveFictionalBankName`이 sessionId 해시로 결정적으로 고른다.
   */
  fictionalBankName?: string;
  /**
   * T191 문자 도달 조건(리뷰 Minor ③) — 문자 백스톱이 이미 넛지한 게이트 개방 시점(사용자 발화 수) 목록. 넛지 1회 보장용
   * (`inCallSms/smsGate.ts` `alreadyNudged`). 쓰는 곳은 `deliverInCallSms` 백스톱 넛지 분기 한 곳. 숫자만 — 목적 · smsId 0.
   */
  smsNudgedOpenAt?: number[];
  // T191 S5 추가(옵셔널, 하위호환 · 무백필 — PRD AC-096 (e)(f)) — 세션 생성 시 서버가 배정한 흐름 변형의
  // **불투명 ID**(`fv-xxxx`). 수법 · 단계 · 인원은 `functions/src/scenarios/flowVariants.ts`(서버 전용)에만
  // 있다(D-46 · ADR-0004). 부재 = 변형 도입 이전 세션 → 원본 시나리오 프롬프트로 해석(무소급).
  flowVariantId?: string;
  // T192 C1 추가(옵셔널, 하위호환 · 무백필 — Architecture.md §79.5) — 사기범 끊기 승인 표식. 서버만 쓴다
  // (클라 write는 firestore.rules가 전부 거부). `endReason: "scammer_ended"`의 **서버측 근거**다 —
  // 이것 없이 온 `scammer_ended`는 `user_ended`로 기록된다(`session/endReason.ts`).
  scammerHangup?: ScammerHangupMarker;
  // T194-b(Architecture.md §84.3.2 · PRD AC-104) — 훈련용 가상 신상 카드. 서버만 쓴다(`createSession`이 대상 세션에서 1회 생성 ·
  // 클라 write 0 — firestore.rules). §88 — 값은 사용자가 넣은 원값을 서버가 검증해 만든다(자가 = `createSession` · 챌린지 수신자 =
  // `consentChallenge`가 챌린지 문서의 카드를 복사). 입력이 비면 필드 부재. ⛔ 대상 밖 세션은 **필드 부재**(빈 객체 · null 0 — 부재와 빈 값을 같은 뜻으로 두지 않는다).
  // 프롬프트 조립 3곳과 통화 화면 카드 · 리포트 대조가 **이 필드 하나**를 읽는다(원자성 — T194-C2).
  personaCard?: PersonaCard;
  // 실기 신고 4(2026-10-21 · 옵셔널, 하위호환 · 무백필) — 통화로 이어지지 않는 카톡형 세션에서 참가자가 "보이스톡"을 건 횟수.
  // 서버만 쓴다(`session/voiceTalkUnanswered.ts`). 부재 = 0회. 리포트 판정에는 아직 쓰지 않는다(기록만).
  voiceTalkUnansweredCount?: number;
  // §110.5(실기 신고 14 · 2026-10-22 · 옵셔널, 하위호환 · 무백필) — 가족 사칭 시나리오에서 참가자가 고른 호칭(`scenarios/familyAddress.ts`).
  // 서버만 쓴다(`createSession`이 검증 뒤 1회). 부재 = 프롬프트 원문 호칭(종전). 프롬프트 조립 3곳이 이 필드 하나를 읽는다.
  familyAddress?: FamilyAddressTerm;
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
  // T84 추가(옵셔널, 하위호환 — §15.9.1 R2/R3/R5, DECISIONS #42 ②): 이 링크가 여는 **인앱 목업의
  // 종류**. 서버 카탈로그(`scenarios/mockScreens.ts`)가 확정해 `extractLinkMarker` 한 지점에서만
  // 붙이며, 클라는 문자열을 분류하지 않는다(AC-024 원칙 계승). **부재 → `credential-form`**
  // (판별자 오버로드가 아니라 하위호환 읽기 규칙) — 그래서 카탈로그가 없는 12개 시나리오의
  // attachment는 도입 전과 완전히 동일하다. `app-install` 방향으로 폴백하지 않는다(R5).
  landingKind?: MockScreenKind;
};

// --- sessions/{sessionId}/messages/{messageId} (AC-024) ---
export type MessageRole = "scammer" | "user";
export type MessageDoc = {
  role: MessageRole;
  // `role==="user"`: PII 마스킹된 텍스트만 저장(원문 미저장, ADR-0004).
  // `role==="scammer"`: 경로에 따라 다르다(§60 — 인계 "복붙 수정" 기각, 실시간은 신뢰 경계상 무변경).
  //   - 텍스트/역할극 경로(roleplay/index.ts·openingLine.ts): 2026-09-06부터 LLM 완성 텍스트를
  //     그대로 저장한다(마스킹 미적용, `roleplay/scammerReplyMasking.ts` 헤더 주석 — 모델은 참가자
  //     원문 PII를 입력으로 받은 적이 없어 지킬 PII가 없고, 프롬프트가 의도적으로 만들게 하는 가짜
  //     계좌·접수번호 숫자열이 마스킹에 걸려 리터럴 "[계좌]" 토큰으로 노출되는 라이브 버그가 있었다).
  //   - 실시간 음성 전사 경로(realtime/submitTranscript.ts): role 무관 여전히 maskPII를 거친다 —
  //     모델이 참가자 실제 음성을 직접 듣고, role이 클라 공급값이라 면제가 새 유출 경로가 되기
  //     때문에 이 경로는 그대로 두는 것이 옳은 상태다(§60.4·§60.11 OQ-A74).
  // 필드명은 하위호환을 위해 그대로 유지한다(스키마 변경 아님, docs/Database.md 정본은 architect 소관).
  textMasked: string;
  turnIndex: number;
  createdAt: FirebaseFirestore.Timestamp;
  attachments?: MessengerAttachment[]; // T29 추가 — 스미싱 링크(§13.4/AC-045)
  // T30 추가(옵셔널, 하위호환, §13.1) — 이 턴이 발생한 채널(교차채널 타임라인, AC-037). 기존
  // 보이스 전용 세션은 항상 부재.
  channel?: MessengerChannel;
  // §55 D3(OQ-A53 확정) — 참가자에게 도달하지 않은 문서(오늘은 Gemini Live 세션의 오프닝 1건뿐).
  // **부재 = 도달함**(무백필). ⛔ `false`를 쓰지 말 것 — 부재와 `false`가 같은 뜻이면 판별자가
  // 둘이 된다(§14.9.1 오버로드 금지). ⛔ 이 필드를 앵커·문서 수 계산에 반영하지 말 것(G350).
  notSpoken?: true;
  // §113.2(옵셔널 · 하위호환 · 무백필) — 참가자가 기기 사진을 보낸 턴(사실만 — 이미지 · 파일 정보 0). 부재 = 글 턴.
  photo?: true;
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
  otpCode?: string; // kind==="otp"일 때만. 카탈로그 리터럴의 세션 해시 값(§114 `withSessionOtp` — 런타임 난수 금지)
  linkDisplayText?: string; // kind==="link"일 때만
  fakeLandingId?: string; // kind==="link"일 때만. **url/실 URL 필드는 이 스키마에 존재하지 않는다**
  // T190-2(docs/Architecture.md §74.9 · D-101) — 말풍선 링크 줄의 **가짜 주소**(`.invalid` 호스트 + 경로 · 스킴 0).
  // 실 URL이 아니다 — 탭은 인앱 랜딩만 연다. `linkDisplayText`·`fakeLandingId`와 함께만 존재(G111).
  linkAddress?: string;
  /** 2026-10-18(Architecture §81) — 본문에 가상 은행 자리표시자가 있었던 문자에만, 그 세션의 가상 은행명. 가짜 랜딩 미리 채움(D-115)의 원천. */
  bankName?: string;
  /** 2026-10-19(Architecture §81.6) — 같은 문자 본문의 계좌번호(`bankName`과 한 쌍). D-115 랜딩 미리 채움의 원천. */
  accountNumber?: string;
  // T104(§19.4) — 그 랜딩의 목업 종류. **kind의 진실 원천은 서버**이고(§15.9.1 R3) 클라는
  // `fakeLandingId` 문자열을 분류하지 않는다. 값이 기본값(`credential-form`)이면 **키를 만들지
  // 않는다** — `MessengerAttachment.landingKind`의 생략 규칙(`linkMarker.ts`)과 글자 그대로
  // 같은 규칙이라, 오늘 실제로 쓰이는 문서는 한 바이트도 바뀌지 않는다(3종 전부 credential-form).
  // 읽기 규칙도 동일: `landingKind ?? "credential-form"`.
  landingKind?: MockScreenKind;
  arrivedAt: FirebaseFirestore.Timestamp;
  openedAt?: FirebaseFirestore.Timestamp; // recordInCallSmsEvent("opened")
  linkTappedAt?: FirebaseFirestore.Timestamp; // recordInCallSmsEvent("link_tapped")
  // T123/AC-080 — 이 문자가 연 가짜 랜딩의 입력 폼을 **제출한 시각**. **최초 1회만** 세팅.
  // **부재 = 제출 없음**(링크 탭·화면 노출·입력 중은 승격 대상이 아니다 — AC-080 (b)).
  // ⛔ 저장되는 것은 **시각 하나뿐**이다: 참가자가 입력한 계좌번호·예금주명에 해당하는 필드는
  // 이 스키마에 **존재하지 않는다**(AC-045 구조적 금지 — `MockScreenDoc`과 같은 형태).
  landingSubmittedAt?: FirebaseFirestore.Timestamp; // recordInCallSmsEvent("landing_submitted")
  // §101 — 여러 화면 사이트(`MockScreenItem.stepScreens`)의 이체 전 단계 버튼(최초 1회). 값은 시각뿐 — 입력값 0(AC-045).
  landingIdentityAt?: FirebaseFirestore.Timestamp; // recordInCallSmsEvent("landing_identity")
  landingConvertedAt?: FirebaseFirestore.Timestamp; // recordInCallSmsEvent("landing_converted")
  landingAmountAt?: FirebaseFirestore.Timestamp; // recordInCallSmsEvent("landing_amount")
  // §15.1.5 증분 — "이 문자가 도착한 시점까지 messages에 존재하는 role==='scammer' 문서 수".
  // 클라 입력이 아니라 **서버가 카탈로그 값에서 계산**해 buildInCallSmsDoc 한 곳에서만 기록한다
  // (실시간·폴백 두 write 경로가 이 헬퍼를 공유하므로 값 산출이 갈라지지 않는다, §15.1.5 (6)).
  // 타입상 옵셔널인 이유는 **T68 시점에 이미 쓰인 기존 문서에는 없기 때문**이다(무백필, Migration
  // Policy) — 신규 문서에는 항상 채워진다(buildDoc 단위 테스트가 고정). 부재 문서는 리포트
  // 스냅샷에서 앵커 미해결(anchorResolved:false)로 정직하게 표기된다.
  anchorScammerTurn?: number;
  // T191 문자 도달 조건(PRD AC-099 (h)) — 도착 기록 3필드. 옵셔널인 이유는 위 앵커와 같다(이전 문서 무백필).
  // 쓰는 곳은 `inCallSms/smsDelivery.ts` 한 곳뿐이다. `purpose`는 도착 뒤에만 생기는 값이며 `kind`와 같은 수준의
  // 정보다(도착 전 응답 · 자격증명에는 목적이 실리지 않는다).
  purpose?: "identity" | "transfer" | "link";
  trigger?: InCallSmsTriggerKind;
  userTurnsAtArrival?: number;
};

/** 도착 경로 — 실시간 모델 도구 · 텍스트 폴백 마커 · 백스톱(두 경로 공통). */
export type InCallSmsTriggerKind = "model_tool" | "model_marker" | "backstop";

// --- sessions/{sessionId}/verifyIntercept/{offerId} (T83, UX-031/UF-011, §16.3.1, AC-071/019) ---
//
// ⚠️ **세션당 최대 1건**(이 흐름은 세션에서 한 번만 일어난다). `inCallSms`와 마찬가지로 `messages`에
// 넣지 않는 이유는 같다 — `analyzeConversation`의 scammer(i)↔user(i+1) 짝짓기가 어긋나 리포트
// 판정이 손상된다(§15.6 G3/G25).
//
// ⚠️ **실 발신 표면 부재(AC-019 하드)**: 이 스키마에는 `url`·`tel`·전화번호 **입력** 필드·발신 대상
// 식별자가 **존재하지 않는다.** 호 전환 모델(T110/§22)에서는 화면에 번호 자체가 없고, 탭 대상은
// 버튼뿐이다(UX-031 P-24).
// ⚠️ `announceInstruction`·`reconnectInstruction`(모델 지시)은 이 문서에 **없다**(AC-024/ADR-0004).
export type VerifyInterceptDoc = {
  offerId: string; // = 문서 id. 서버가 VERIFY_INTERCEPT[session.scenarioId] 소속을 재검증한 값만 기록
  deskLabel: string; // 모의 창구명(실존 기관·창구 아님 — AC-033/AC-005)
  // ⭐ T110(§22.3) — **옵셔널. 신규 문서에는 기록하지 않는다**(호 전환 모델에는 안내 번호가 없다).
  // 남겨 둔 이유는 오직 하나: 이미 생성된 과거 문서를 **백필 없이** 그대로 읽기 위해서다.
  displayNumber?: string;
  offeredAt: FirebaseFirestore.Timestamp;
  // "이 시점까지 messages에 존재하는 role==='scammer' 문서 수"(서버 계산, verifyIntercept/buildDoc.ts
  // 단일 지점). 리포트 생성 시 실제 turnIndex로 해결돼 verifyTimeline[].anchorTurnIndex가 된다.
  offerAnchorScammerTurn: number;
  // 폴백 경로 전용 — sendMessage가 권유 대사를 turnInstruction으로 주입한 턴(중복 주입 방지 마크).
  // 실시간 경로는 클라가 즉시 주입하므로 세팅되지 않는다.
  announcedAt?: FirebaseFirestore.Timestamp;
  // 참가자가 UX-031에서 "확인 전화 걸기"를 누른 시각 = **확인 시도**. 부재 = D-51 ①(속은 순간 아님).
  placedAt?: FirebaseFirestore.Timestamp;
  // **판정 앵커**(재연결 대사 = scammers[이 값])의 근거. 표시 앵커와 구분된다(§16.3.2 — 혼동 시
  // 재연결 **전** 순응까지 "확인했는데도 속은 순간"으로 오분류된다).
  reconnectAnchorScammerTurn?: number;
  reconnectedCallerLabel?: string; // 재연결 후 통화 셸 발신자 라벨(모의값)
};

// --- reports/{reportId}.verifyTimeline (T83, §16.3.1, AC-071) — 표시 전용 스냅샷 ---
// ⚠️ `smsTimeline`과 같은 패턴이지만 **요구가 하나 다르다**: 이 사건은 `deceivedMoments`를 만들지도
// 지우지도 않되(ADR-0009), 이미 존재하는 순간에 `afterVerifyReconnect` **주석**을 남긴다. 순간의
// 개수·turnIndex·timeLabel·wasDeceived는 한 건도 바뀌지 않는다.
export type VerifyTimelineOutcome =
  | "offered_not_placed" // D-51 ① 권했으나 걸지 않음 — 속은 순간 아님
  | "placed_not_complied" // D-51 ⑤ 걸었으나 응하지 않음 — **잘 대응한 지점**(속은 순간 아님)
  | "placed_and_complied"; // D-51 ② 걸고 응함 — 기존 순간에 주석
export type VerifyTimelineEventKind = "verify_offer_shown" | "verify_reconnected";
export type VerifyTimelineEvent = {
  event: VerifyTimelineEventKind;
  what: string;
  correctAction?: string;
};
export type VerifyTimelineEntry = {
  offerId: string;
  deskLabel: string;
  // ⭐ T110(§22.3) — **옵셔널. 신규 리포트에는 실리지 않는다.** 과거 리포트는 그때 실제로 본 번호를
  // 그대로 보여준다(정직·무백필). 존재할 때만 텍스트로 렌더한다 — 링크·복사 버튼·재발신 컨트롤을
  // 만들지 않는다(§16.3.1/AC-019).
  displayNumber?: string;
  // ⭐ §38.6 S3 — **항목 자신의** 표시 위치다. 한 문서(offerId)가 **최대 2건**의 항목으로 나온다:
  // 오퍼 항목(= 오퍼 앵커) + 전환 항목(= 재연결 앵커). 종전에는 두 이벤트가 오퍼 앵커 하나에 함께
  // 놓여 전환 서술이 사기범 예고 대사보다 **항상 앞**에 렌더됐다. **저장 필드 델타 0건.**
  anchorTurnIndex: number; // -1 = 대화 맨 앞
  anchorResolved: boolean; // false = 위치 확정 실패 → 화면이 정직하게 고지(조용한 누락 금지)
  timeLabel?: string; // 오퍼 항목의 앵커 경과 초 — deceivedMoments와 **같은 시간축**
  reconnectTimeLabel?: string; // 전환 항목의 앵커 경과 초(렌더러가 verify_reconnected에서 읽는다)
  outcome: VerifyTimelineOutcome; // ⚠️ **두 항목이 공유한다**(문서 1건당 한 번 판정)
  // 항목당 1건이 정상이다(§38.6 S3 이후). ⚠️ **과거 리포트는 한 항목에 2건**이 실려 있다(무백필) —
  // 읽는 쪽은 항목당 1건을 가정하지 말 것.
  events: VerifyTimelineEvent[];
};
// ⚠️ 스냅샷에 **절대 넣지 않는 필드**(§16.3.1 금지 표): announceInstruction/reconnectInstruction
// (모델 지시 — 프롬프트가 클라로 내려간다), offeredAt/placedAt 원시 타임스탬프(표시 축이 아니다),
// url/tel/발신 관련 필드(어느 스키마에도 없다), 가로채기의 수단·작동 원리 서술(AC-005 불변).

// --- sessions/{sessionId}/mockScreens/{landingId} (T84, UX-023 kind/UF-012, §15.9.6, AC-072/073) ---
//
// ⚠️ **문서 id = `landingId`라 멱등**하다(같은 랜딩에 대한 반복 기록이 문서를 늘리지 않는다).
// `inCallSms`·`verifyIntercept`와 같은 이유로 `messages`에 넣지 않는다 — `analyzeConversation`의
// scammer(i)↔user(i+1) 짝짓기가 어긋나 리포트 판정이 손상된다(§15.6 G3).
//
// ⚠️ **저장하지 않는 것(구조적 금지, AC-072/AC-045)**: 참가자가 입력한 어떤 값도(애초에 목업의
// 입력은 컴포넌트 로컬 state를 벗어나지 않는다), 실 URL·스토어 URL·**실존 앱명**·OS 권한 목록.
// `url`·`packageName` 계열 필드는 이 스키마에 **존재하지 않는다**.
export type MockScreenDoc = {
  landingId: string; // = 문서 id. 서버가 MOCK_SCREENS[session.scenarioId] 소속을 재검증한 값만 기록
  kind: MockScreenKind; // 서버가 카탈로그에서 확정(클라 입력이 아니다)
  shownAt: FirebaseFirestore.Timestamp; // 목업이 열린 시각. **최초 1회만** 세팅
  // 가짜 "권한 허용"에 응한 시각. **최초 1회만** 세팅. **부재 = 응낙 없음**(D-51 ③ — 화면이
  // 뜬 것·닫은 것은 표시 전용이고 속은 순간이 아니다, AC-062 불변식 보호).
  consentedAt?: FirebaseFirestore.Timestamp;
  // 사기범이 응낙 사실을 언급하도록 `turnInstruction` 1줄을 주입한 시각(§15.9.3 — 1회 주입 보장).
  consentAnnouncedAt?: FirebaseFirestore.Timestamp;
  // T194-c-1(docs/Architecture.md §84.5.3 · §84.15.3 · ADR-0022 Addendum 2 · G584 · G606) — **통화 중 문자로 연 설치 화면(Q2)만**: 그 화면을 연
  // 문자 문서(`inCallSms/{smsId}`)의 `anchorScammerTurn`을 서버가 그대로 복사한 값. 리포트는 이 값이 있으면 `resolveAnchor`(문자와 같은
  // 리졸버)로 풀고 시각 해결을 타지 않는다. **부재 = 메신저 경로**(첨부 기반 리졸버 — 종전 문서와 같은 모양 · 무백필).
  anchorScammerTurn?: number;
  // T123/AC-080 — 이 랜딩의 입력 폼을 **제출한 시각**. **최초 1회만** 세팅. **부재 = 제출 없음**
  // (링크 탭·화면 노출·입력 중은 승격 대상이 아니다 — AC-080 (b)).
  // ⛔ `consentedAt`(가짜 "권한 허용")과 **다른 필드다** — 같은 값을 재사용하면 과거 리포트의
  // 의미가 소급해 갈라진다. 저장되는 것은 **시각 하나뿐**이고 입력값 필드는 존재하지 않는다.
  submittedAt?: FirebaseFirestore.Timestamp;
  // §128(7) — 화면 행동(응낙 · 제출) 뒤 사기범이 먼저 보낸 메시지를 남긴 시각(`roleplay/screenActionFollowUp.ts` — 1회 보장). 부재 = 아직 없음(무백필).
  screenFollowUpAt?: FirebaseFirestore.Timestamp;
};

// --- reports/{reportId}.stages / .mockScreenTimeline (T84, §15.9.5, AC-073) ---
//
// ⚠️ **OQ-U24 판정(§15.9.5 e-3)**: `stages`에는 **의도된 단계 전부**를 싣는다 — 미도달 단계도
// `reached:false`로 존재한다. 데이터에서 빼면 "미도달"과 "그런 단계가 애초에 없었다"를 영영
// 구분할 수 없다. **화면은 도달 단계만 그리고** 전체 구조는 상단 1줄로 사후 고지한다(D-50 예외 안).
export type ReportStageName = "messenger" | "mock_install" | "voice";
export type ReportStage = { stage: ReportStageName; reached: boolean };

export type MockScreenTimelineEntry = {
  landingId: string;
  kind: MockScreenKind;
  anchorTurnIndex: number; // 표시 위치(= 설치 링크를 실은 사기범 메시지). -1 = 대화 맨 앞
  anchorResolved: boolean; // false = 위치 확정 실패 → 화면이 정직하게 고지(조용한 누락 금지)
  timeLabel?: string; // 앵커 메시지의 경과 초에서 파생 — deceivedMoments와 **같은 시간축**
  // true면 **같은 순간이 `deceivedMoments`에도 있다** — 중복 카드 금지 규칙(§15.9.5 e-4)에 따라
  // 교육 문구(correctAction)는 그쪽이 전담하고 이 항목은 사실 1줄만 낸다.
  consented: boolean;
};
// ⚠️ 스냅샷에 **절대 넣지 않는 필드**(§15.9.5 e-4 금지 표): headline/bodyLines/consentLabel 등
// 화면 콘텐츠 원문(사후 화면이 목업을 재구성·재진입할 수 있게 된다 — §15.6 G19 동형 취지),
// shownAt/consentedAt 원시 타임스탬프(표시 축이 아니다), url·앱명(어느 스키마에도 없다).

// --- reports/{reportId}.smsTimeline (T89, §15.1.5, AC-059) — 표시 전용 스냅샷 ---
// ⚠️ 이 배열은 analyzeConversation의 **입력이 아니라 산출 뒤에 나란히 얹히는 값**이다.
// wasDeceived·deceivedMoments·tacticsUsed·preventionAdvice는 문자 유무와 무관하게 동일하며,
// 문자 상호작용으로 판정을 뒤집지 않는다(§15.6 G22 — AC-062/068/010/011 연쇄 보호).
export type SmsTimelineEventKind =
  | "sms_received"
  | "sms_opened"
  | "sms_otp_shown"
  | "sms_link_tapped";
export type SmsTimelineEvent = {
  event: SmsTimelineEventKind;
  what: string;
  correctAction?: string; // 없는 이벤트는 화면이 카드 하단 블록만 생략한다(카드 형식은 동일)
};
export type SmsTimelineEntry = {
  smsId: string;
  kind: InCallSmsKind;
  senderLabel: string;
  body: string;
  linkDisplayText?: string; // kind==="link"일 때만. **표시용 텍스트** — 컨트롤로 렌더 금지
  anchorTurnIndex: number; // 이 turnIndex의 메시지 '뒤'에 놓인다. -1 = 대화 맨 앞
  anchorResolved: boolean; // false = 위치 확정 실패 → 화면이 정직하게 고지(조용한 누락 금지)
  timeLabel?: string; // 앵커 메시지의 경과 초에서 파생 — deceivedMoments와 **같은 시간축**
  events: SmsTimelineEvent[]; // 최소 1건(sms_received)
};
// ⚠️ 스냅샷에 **절대 넣지 않는 필드**(§15.1.5 (3) 금지 표 / §15.6 G19): fakeLandingId(사후 화면이
// 가짜 랜딩 재진입 컨트롤을 만들 수 있다), otpCode(body에 이미 있고 따로 두면 "복사 가능한 필드"가
// 된다), arrivedAt/openedAt/linkTappedAt 원시 타임스탬프(표시 축이 아니다 — 실시간 경로에서
// createdAt이 합성값이라 시각으로 정렬하면 순서가 뒤집힌다), url(어느 스키마에도 없다).

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
  // T83 추가(옵셔널, 하위호환 — §16.3.3/ADR-0009): 이 순간이 **모의 재연결 이후**의 응낙임을
  // 표시하는 **주석**이다. 순간을 만들지도 지우지도 않는다. 이 플래그가 붙은 순간은
  // `tactic="확인 시도 무력화"`·`tacticCategory="verification_block"`·
  // `correctAction=VERIFY_INTERCEPT_CORRECT_ACTION`으로 덮어쓰여 저장된다(덮어쓰기가 **안전
  // 요건**인 이유는 §16.4/G27 — `pickCorrectAction`의 첫 규칙이 방금 확인 전화가 소용없던
  // 참가자에게 "확인 전화를 걸라"고 답한다).
  afterVerifyReconnect?: true;
  // T129 (b) 발동(Architecture §35.6 1행 · §98 — 검찰 고급 변형 fv-c8wq가 한 세션에 모의 화면 2건을 갖게 됐다): 이 순간이
  // **모의 화면 제출 · 응낙의 승격**이면 그 화면의 landingId. `buildLandingSubmitMoment`만 채운다(대화 추정 순간 · 과거 리포트 = 부재).
  // 화면 항목(`MockScreenTimelineEntry.landingId`)과 짝지어 D-61 분기 판정 키로만 쓴다 — 화면 콘텐츠 원문이 아니다(§15.9.5 e-4 무관).
  landingId?: string;
};
/**
 * T194-b(§84.3.6 · §84.3.7) — 리포트의 카드 블록. `state`는 `report/personaBlock.ts` `resolvePersonaBlockState`가 정한다.
 * `items`: R-1 = 사기범이 참가자보다 먼저 말한 항목만(`scammerTurnIndex` = 그 항목을 처음 말한 사기범 줄의 turnIndex —
 * 리플레이 주석 앵커) · R-2 = 카드 항목 전부(`scammerTurnIndex` 없음) · R-3 = R-1/R-2 중 해당하는 쪽과 같은 모양.
 */
export type PersonaBlockState = "R-1" | "R-2" | "R-3";
export type PersonaBlockItem = { key: PersonaCardKey; label: string; value: string; scammerTurnIndex?: number };
/** §88 — `inputBy`: v2 카드에서 복사(리포트 문면 분기 — UX D-131 (6)(7)). 부재 = 옛 v1 카드(종전 문면). */
/**
 * §93 — `context`: 협박형 시나리오의 카드면 교훈 문면 분기용(`child-threat` = 자녀 납치 협박 · `self-threat` = 불법업소 유포 협박).
 * 부재 = 기관 사칭형(종전 문면 — 옛 리포트 포함).
 */
export type PersonaBlockContext = "child-threat" | "self-threat";
export type PersonaBlock = {
  state: PersonaBlockState;
  items: PersonaBlockItem[];
  inputBy?: PersonaCardInputBy;
  context?: PersonaBlockContext;
};

/**
 * 사용자 결정 2026-10-21 ② — 속음은 아니지만 위험했던 참가자 줄(`report/analyzeConversation.ts` `resolveRiskSignalKind` 판정표).
 * `turnIndex` = 그 참가자 줄 · `timeLabel` = 속은 순간과 같은 시간축. 문면은 클라가 `kind`로 고른다(서버 문면 0).
 */
export type RiskSignalKind = "secrecy_promise" | "bank_disclosed" | "fake_info";
export type RiskSignal = { turnIndex: number; timeLabel: string; kind: RiskSignalKind };

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
  // T191 S5 추가(옵셔널, 하위호환 · 무백필 — PRD AC-096 (f) · 설계 "reports flowVariantId 스냅샷") — 리포트를
  // 만든 세션의 흐름 변형 **불투명 ID**. 리플레이 · 되감기 · 실패 아카이브가 같은 변형으로 해석한다.
  // 부재 = 변형 도입 이전 리포트(기존 방식 그대로 표시 — AC-077).
  flowVariantId?: string;
  // §119(DECISIONS #234 · D-3 b) — 이번 결말 이름 · 그 칸(시나리오 × 난이도 × 세션 종류)의 결말 수. 루트가 2가지 이상인 칸만
  // 만든다(부재 = 줄 0 · 무백필). 변형 ID · 단계 문면은 싣지 않는다.
  routeSummary?: { label: string; routeCount: number };
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
  // T89 추가(옵셔널, 하위호환 — §15.1.5, AC-059) — 통화 중 문자 이벤트의 **표시 전용 스냅샷**.
  // 리포트 생성 시점에 sessions/{sid}/inCallSms를 1회 read해 최종 표시 순서로 정렬해 기록하며,
  // 멱등 early-return 덕에 **최초 생성 시 1회만** 쓰인다(AC-007 무변경 — 두 번째 리포트 문서도
  // 서브컬렉션도 만들지 않는다). 문자가 0건이면 필드 자체를 만들지 않는다(부재→빈 배열 취급).
  smsTimeline?: SmsTimelineEntry[];
  // T83 추가(옵셔널, 하위호환 — §16.3.1, AC-071) — 확인 무력화의 **표시 전용 스냅샷**. smsTimeline과
  // 같은 수집 지점·같은 1회 기록 규칙. ⚠️ D-51 ①/⑤(속은 순간 0건 + 확인 시도 있음)에서도 이
  // 배열은 존재할 수 있다 — 리포트 타임라인 노출 조건이 deceivedMoments에만 걸려 있으면 항목이
  // 통째로 사라진다(§16.6 G30).
  verifyTimeline?: VerifyTimelineEntry[];
  // T84 추가(옵셔널, 하위호환 — §15.9.5 e-3/e-4, AC-073) — 3단계 결합의 **판정 근거**와 모의 화면
  // **표시 전용 스냅샷**. smsTimeline·verifyTimeline과 같은 수집 지점·같은 1회 기록 규칙이다.
  // ⚠️ `stages`는 **의도된 단계가 2개 이상일 때만** 만든다 — 기존 12개 시나리오 리포트는 한 글자도
  // 바뀌지 않는다(무백필).
  stages?: ReportStage[];
  mockScreenTimeline?: MockScreenTimelineEntry[];
  // T158 추가(옵셔널, 하위호환 — §48.2.1, AC-084) — 리포트 생성 시점에 세션 문서의
  // `llmProvider`(대사 축, `:91`)를 그대로 복사한 값. 목소리 축(`voiceProvider`)은 포함하지
  // 않는다(§48.3, 두 축은 섞이지 않는다). "mock"이면 대화 일부가 미리 준비된 대사로 진행됐음을
  // 참가자 문면(P-31 ⓖ)이 근거로 삼는다. 무백필 — 이 필드 신설 이전 리포트에는 값이 없고, 부재는
  // "정상이었다"는 긍정 표기로 렌더하지 않는다(§48.2.2 G274).
  llmProvider?: LlmProviderName;
  // T194-b 추가(옵셔널, 하위호환 · 무백필 — Architecture.md §84.3.6 · UX-008 v1.38 (1) · D-120) — "상대가 먼저 꺼낸 '내 정보'"
  // 블록의 상태와 항목. 카드 없는 세션 · 카드 도입 전 리포트 = 필드 부재(= R-4 · 블록 0). 최초 생성 시 1회만 기록된다.
  personaBlock?: PersonaBlock;
  // 사용자 결정 2026-10-21 ②(옵셔널 · 무백필) — 속음은 아니지만 위험했던 행동(비밀 유지 약속 · 거래 은행명 · 가짜 정보). 0건 = 필드 부재.
  // ⛔ 판정 입력이 아니다 — `wasDeceived` · `deceivedMoments` · 방어 등급 · 되감기 진입점과 무관하다.
  riskSignals?: RiskSignal[];
  // §104(옵셔널 · 무백필 · UX D-145) — 참가자 발화 수(messages 중 role "user" 문서 수 — 위 ① 스냅샷에서 센다 · 추가 read 0).
  // 표시 전용: "속지 않음" 상태 줄이 대화 0턴(바로 끊음)과 그 밖을 가른다. ⛔ 판정 입력이 아니다. 부재 = 이 필드 이전 리포트(종전 문면 규칙).
  userTurnCount?: number;
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
  // §88(DECISIONS #199 · UX D-131) — 발신자가 넣은 받는 분 정보로 서버가 만든 카드(v2 · `inputBy: "sender"`). 부재 = 입력 없음.
  // `consentChallenge`가 수신자 세션에 복사하는 **같은 트랜잭션**에서 지운다 · 폐기(`purgeChallenge`)도 지운다.
  personaCard?: PersonaCard;
  createdAt: FirebaseFirestore.Timestamp;
};
