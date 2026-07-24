// 온보딩 단계 "사전 세션 ID" 관리 (Track C, T3).
//
// 설계 판단(명시적 — 추정 아님, 근거는 아래): API.md `createVoiceClone`은 이미 존재하는
// `sessionId`를 요구하고, Storage 녹음 경로도 `users/{uid}/sessions/{sid}/voice_input.webm`
// (Database.md §Storage Layout)로 `sid`가 필요하다. 하지만 실제 `sessions/{sessionId}` Firestore
// 문서는 시나리오 선택 이후 `createSession`(T8, API.md)이 **서버에서 새로 생성**해서 반환하는
// 구조라, 온보딩(UX-002 녹음) 시점에는 아직 어떤 세션 id도 존재하지 않는다 — 이 시점과
// `createSession` 사이의 간극은 T3 태스크 지시문이 "네 판단으로 처리하라"고 명시한 부분이다.
//
// 채택한 처리: 녹음 화면 진입 시 `crypto.randomUUID()`로 클라이언트 전용 "사전 세션 ID"를
// 만들어 `sessionStorage`(탭 범위, Firestore에는 쓰지 않음)에 보관한다. 이 id를 Storage 업로드
// 경로와 향후 `createVoiceClone({sessionId})` 호출(T4, UX-003)에 그대로 재사용한다.
// **다만 이 id가 `createSession`이 반환하는 최종 sessionId와 같은 값이 되려면 T4/T8이
// `createSession`(또는 T4의 voiceId 발급 흐름)에서 이 사전 id를 그대로 채택하도록 맞춰야 한다**
// — 이는 API.md/T8 계약을 바꾸는 결정이라 T3(본 태스크)가 임의로 확정할 수 없어 구현 보고서에
// cross-track 이슈로 명시했다. T3 범위에서는 "온보딩 단계에서 일관된 id 하나를 만들어 넘겨준다"
// 까지만 책임진다.
//
// 본인 확인 체크 로그(AC-020, Database.md `sessions.identitySelfConfirmed`)도 같은 이유로 아직
// 존재하지 않는 세션 문서에는 쓸 수 없다 — 업로드 성공 시점에 sessionStorage에 함께 남겨
// T4/T8이 실제 `sessions/{sid}` 문서 생성 시 이 값을 채워 넣을 수 있게 한다.

const SESSION_ID_KEY = "onboarding.pendingSessionId";
const IDENTITY_CONFIRMED_KEY = "onboarding.identityConfirmed";
// 실시간 음성 통화 전환(2026-07-22 사용자 결정, Phase A) — createSession이 반환하는 오프닝 대사
// 합성 오디오는 응답 1회성이라(Firestore messages 문서엔 텍스트만 저장) 채팅 화면(/session/chat)이
// 마운트 시점에 재생하려면 이 값을 넘겨줘야 한다. pendingSessionId와 동일하게 탭 범위 sessionStorage
// 사용(Firestore에는 쓰지 않음 — 오디오 URL 자체가 세션 상태의 일부가 아니라 1회성 재생 힌트일 뿐).

function hasSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function getOrCreatePendingSessionId(): string {
  if (!hasSessionStorage()) return "";
  const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_ID_KEY, id);
  return id;
}

export function getPendingSessionId(): string | null {
  if (!hasSessionStorage()) return null;
  return window.sessionStorage.getItem(SESSION_ID_KEY);
}

// T37(UF-005 사용자2) — consentChallenge는 (온보딩 클론 흐름과 달리) 클라가 사전 id를 먼저 만들어
// 넘기는 게 아니라 **서버가 새 sessionId를 발급**해 응답으로 돌려준다. session/play(UX-014)는
// 항상 getPendingSessionId()로 대상 세션을 읽으므로(기존 관례, query param 아님), 챌린지 동의
// 랜딩(challenge/join)이 응답받은 sessionId를 이 키에 그대로 채택해 넣어야 그 화면이 무개정으로
// 동작한다. getOrCreatePendingSessionId()와 달리 "생성"이 아니라 "주어진 값으로 설정"이다.
export function setPendingSessionId(sessionId: string): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.setItem(SESSION_ID_KEY, sessionId);
}

export function setIdentityConfirmed(confirmed: boolean): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.setItem(IDENTITY_CONFIRMED_KEY, confirmed ? "true" : "false");
}

export function getIdentityConfirmed(): boolean {
  if (!hasSessionStorage()) return false;
  return window.sessionStorage.getItem(IDENTITY_CONFIRMED_KEY) === "true";
}

const OPENING_AUDIO_URL_KEY = "session.openingAudioUrl";

export function setOpeningAudioUrl(url: string): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.setItem(OPENING_AUDIO_URL_KEY, url);
}

/** 1회성 힌트라 읽은 뒤 곧바로 지운다(재마운트/새로고침 시 중복 재생 방지). */
export function consumeOpeningAudioUrl(): string | null {
  if (!hasSessionStorage()) return null;
  const url = window.sessionStorage.getItem(OPENING_AUDIO_URL_KEY);
  if (url) window.sessionStorage.removeItem(OPENING_AUDIO_URL_KEY);
  return url;
}

// 사용자 신고(2026-07-24) 반영 — 실시간 음성 통화(ElevenLabs Agents)에서 사용자가 먼저 말해야
// 대화가 시작되는 문제. createSession이 이미 generateOpeningLine으로 만들어 둔 오프닝 대사
// (openingAudioUrl과 동일 시점에 생성되는 텍스트, Firestore messages 문서에도 저장됨)를 ElevenLabs
// 세션 시작 시 `overrides.agent.firstMessage`로 넘기면, 연결 직후 사용자 발화 없이 사기범 캐릭터가
// 먼저 말을 건다(openingAudioUrl과 동일한 "1회성 힌트, 읽은 뒤 삭제" 패턴).
const OPENING_MESSAGE_TEXT_KEY = "session.openingMessageText";

export function setOpeningMessageText(text: string): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.setItem(OPENING_MESSAGE_TEXT_KEY, text);
}

export function consumeOpeningMessageText(): string | null {
  if (!hasSessionStorage()) return null;
  const text = window.sessionStorage.getItem(OPENING_MESSAGE_TEXT_KEY);
  if (text) window.sessionStorage.removeItem(OPENING_MESSAGE_TEXT_KEY);
  return text;
}

// Phase B(2026-07-22 사용자 결정) — 시나리오 선택(UX-004)이 이제 녹음(UX-002)보다 먼저 온다
// (voiceMode:"generic" 시나리오는 녹음 자체를 생략하므로 먼저 골라야 분기가 가능하다). 녹음이
// 끝난 뒤(clone/wait 화면)에도 어떤 시나리오였는지 알아야 createSession을 호출할 수 있어, 선택한
// scenarioId를 pendingSessionId와 동일하게 탭 범위 sessionStorage에 넘긴다.
const SELECTED_SCENARIO_ID_KEY = "onboarding.selectedScenarioId";

export function setSelectedScenarioId(scenarioId: string): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.setItem(SELECTED_SCENARIO_ID_KEY, scenarioId);
}

export function getSelectedScenarioId(): string | null {
  if (!hasSessionStorage()) return null;
  return window.sessionStorage.getItem(SELECTED_SCENARIO_ID_KEY);
}

// 세션이 끝나면 사전 세션 id와 부수 힌트를 전부 지운다(2026-07-22 버그픽스). 이걸 안 하면 같은
// 탭에서 두 번째 훈련을 시작할 때 getOrCreatePendingSessionId가 종료된 세션 id를 그대로 반환해,
// createSession이 이미 ended된 문서를 되살려 쓰고(이전 대화·turnIndex 잔존) 리포트도 첫 훈련 것이
// 멱등 반환되던 치명 결함의 원인이었다. 종료 성공 시점(session/end)에서 호출한다.
export function clearPendingSession(): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.removeItem(SESSION_ID_KEY);
  window.sessionStorage.removeItem(IDENTITY_CONFIRMED_KEY);
  window.sessionStorage.removeItem(OPENING_AUDIO_URL_KEY);
  window.sessionStorage.removeItem(OPENING_MESSAGE_TEXT_KEY);
  window.sessionStorage.removeItem(SELECTED_SCENARIO_ID_KEY);
  window.sessionStorage.removeItem(ANSWERED_SESSION_KEY);
  window.sessionStorage.removeItem(SELECTED_TRAINING_TYPE_KEY);
  window.sessionStorage.removeItem(SELECTED_VOICE_MODE_CHOICE_KEY);
  window.sessionStorage.removeItem(MESSENGER_VOICE_SELECT_RETURN_KEY);
  window.sessionStorage.removeItem(CHALLENGE_MODE_KEY);
}

// 드릴다운(UX-015 유형 → UX-016 방식 → UX-017 시나리오, T28/AC-028/AC-029) 단계 간 "뒤로가기 시
// 이전 선택 유지"(docs/UX.md P-12)용 힌트. 각 단계는 탭 즉시 다음 화면으로 이동하는 방식(별도
// "다음" 확인 버튼 없음)이라 선택 자체가 곧 네비게이션이지만, 뒤로가기(버튼·브라우저 둘 다)로
// 그 단계에 복귀했을 때 방금 전 선택했던 카드가 강조 표시된 채로 보여야 재입력을 강요하지 않는다
// (뒤로 온 사용자가 "내가 뭘 골랐었는지" 다시 읽지 않아도 되게). Firestore에는 쓰지 않는 순수
// 화면 힌트라 pendingSessionId와 동일하게 탭 범위 sessionStorage를 쓴다.
const SELECTED_TRAINING_TYPE_KEY = "onboarding.selectedTrainingType";

export type TrainingType = "voice" | "messenger";

export function setSelectedTrainingType(type: TrainingType): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.setItem(SELECTED_TRAINING_TYPE_KEY, type);
}

export function getSelectedTrainingType(): TrainingType | null {
  if (!hasSessionStorage()) return null;
  const value = window.sessionStorage.getItem(SELECTED_TRAINING_TYPE_KEY);
  return value === "voice" || value === "messenger" ? value : null;
}

const SELECTED_VOICE_MODE_CHOICE_KEY = "onboarding.selectedVoiceModeChoice";

export function setSelectedVoiceModeChoice(mode: "clone" | "generic"): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.setItem(SELECTED_VOICE_MODE_CHOICE_KEY, mode);
}

export function getSelectedVoiceModeChoice(): "clone" | "generic" | null {
  if (!hasSessionStorage()) return null;
  const value = window.sessionStorage.getItem(SELECTED_VOICE_MODE_CHOICE_KEY);
  return value === "clone" || value === "generic" ? value : null;
}

// 통화를 "받은" 세션 id를 기록한다(finding #4, 2026-07-23). 실시간 경로는 sendMessage를 안 타
// turnCount가 0에 머물러, 통화 중 새로고침하면 "이미 대화가 시작됐는지"를 turnCount로 판별할 수
// 없다. 이 플래그로 "받기를 누른 세션"을 구분해, 새로고침 시 벨 울리는 수신 화면이 아니라 통화
// 진행 상태로 복원한다. (실시간 소켓은 새로고침으로 끊기므로 복원은 텍스트 폴백으로 이어진다.)
const ANSWERED_SESSION_KEY = "session.answeredSessionId";

export function markSessionAnswered(sessionId: string): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.setItem(ANSWERED_SESSION_KEY, sessionId);
}

export function isSessionAnswered(sessionId: string): boolean {
  if (!hasSessionStorage()) return false;
  return window.sessionStorage.getItem(ANSWERED_SESSION_KEY) === sessionId;
}

// UX-025 조건부 목소리 선택(T30, Architecture.md §13.6) — "즉시 녹음" 경로는 기존 UX-002/003
// 온보딩(record→clone/wait)을 그대로 재사용한 뒤 voice-select 화면으로 복귀해야 한다. clone/wait는
// 원래 클론이 끝나면 곧장 createSession→/session/play로 진행하는 화면(일반 보이스 온보딩)이라,
// 이 플래그가 설 때만 그 진행을 건너뛰고 voice-select로 돌려보낸다(비파괴적 분기 — 일반 흐름은
// 무변경). clone/wait는 이 플래그를 "peek"만 하고(재시도 시에도 계속 유효해야 하므로) 소비하지
// 않는다 — voice-select 쪽에서 실제로 다 쓴 뒤 clearPendingSession()을 통해 정리된다.
const MESSENGER_VOICE_SELECT_RETURN_KEY = "onboarding.messengerVoiceSelectReturn";

export function setMessengerVoiceSelectReturn(): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.setItem(MESSENGER_VOICE_SELECT_RETURN_KEY, "true");
}

export function hasMessengerVoiceSelectReturn(): boolean {
  if (!hasSessionStorage()) return false;
  return window.sessionStorage.getItem(MESSENGER_VOICE_SELECT_RETURN_KEY) === "true";
}

/** voice-select 화면이 복귀 트립을 실제로 처리할 때 호출한다(읽은 뒤 곧바로 지워 중복 처리 방지). */
export function consumeMessengerVoiceSelectReturn(): boolean {
  if (!hasSessionStorage()) return false;
  const had = window.sessionStorage.getItem(MESSENGER_VOICE_SELECT_RETURN_KEY) === "true";
  if (had) window.sessionStorage.removeItem(MESSENGER_VOICE_SELECT_RETURN_KEY);
  return had;
}

// UX-019 진입점(T36, "지인에게 딥보이스 체험 보내기") — 이 플래그를 세운 뒤 기존 clone 드릴다운
// (/scenarios/voice/clone)에 그대로 진입시킨다. 드릴다운의 최종 시나리오 카드 액션
// (ScenarioListView.handleStart)이 이 플래그를 소비해 분기한다: 평소엔 record/clone/wait를 거쳐
// createSession을 호출하지만, 챌린지 모드면 그 파이프라인을 건너뛰고 곧장
// `/challenge/create?scenarioId=...`로 이동한다(createChallenge가 서버에서 "완료된 클론 보유"
// 여부를 직접 재확인하므로 재녹음을 강요하지 않는다 — UF-004 Step1 "이미 클론 보유 시 재사용").
//
// messengerVoiceSelectReturn과 달리 peek 전용 API를 따로 두지 않고 consume 하나만 둔다 — 소비 지점이
// 정확히 한 곳(ScenarioListView.handleStart)뿐이고, 재시도 도중에도 값을 유지해야 할 이유가 없다.
// **알려진 한계(구현 보고서 참고)**: handleStart는 clone 방식 시나리오에서만 이 플래그를 유효하게
// 취급하고, 소비(clear) 자체는 방식과 무관하게 항상 실행한다 — 그래서 챌린지 흐름을 중간에 이탈한
// 뒤 무관한 훈련을 다시 시작해도 플래그가 최대 1회의 다음 클릭에서 자동으로 정리된다(자가 치유).
// 다만 그 "다음 클릭"이 하필 clone 시나리오라면 의도치 않게 챌린지 생성 화면으로 넘어갈 수 있는
// 좁은 엣지 케이스가 남는다.
const CHALLENGE_MODE_KEY = "onboarding.challengeMode";

export function setChallengeMode(): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.setItem(CHALLENGE_MODE_KEY, "true");
}

export function consumeChallengeMode(): boolean {
  if (!hasSessionStorage()) return false;
  const had = window.sessionStorage.getItem(CHALLENGE_MODE_KEY) === "true";
  if (had) window.sessionStorage.removeItem(CHALLENGE_MODE_KEY);
  return had;
}

// T37(UF-005 사용자2 · UX-018 결과 공유 동의) — setChallengeResultSharing({token, share})는 API.md
// 계약상 평문 토큰이 필요하다(§14.4 "평문 미저장"은 *서버* 저장 금지 원칙이라 클라가 탭 범위로
// 잠깐 들고 다니는 것과는 무관). 동의 시점(challenge/join)에만 아는 이 토큰을, 통화(UX-014)→
// 종료(UX-007)→리플레이(UX-018)까지 이어지는 같은 탭 흐름 내내 들고 다녀야 리플레이 화면에서
// "결과 공유 동의" 콜러블을 호출할 수 있다. session/end의 clearPendingSession()이 다른 온보딩
// 힌트를 전부 지우는 시점에도 **이 키는 의도적으로 그 목록에서 제외**한다 — 안 그러면 리플레이
// 화면에 도달하기 전에 값이 사라져 그 화면의 결과 공유 UI 자체가 성립하지 않는다.
// getSelectedScenarioId()와 동일하게 peek 전용(자동 소비 없음) — 사용자가 리플레이 화면에서
// 공유 여부를 여러 번 바꿔 누를 수 있어야 하므로 "읽으면 지운다" 패턴(consumeOpeningAudioUrl 등)은
// 부적합하다.
const CHALLENGE_TOKEN_KEY = "challenge.token";

export function setChallengeToken(token: string): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.setItem(CHALLENGE_TOKEN_KEY, token);
}

export function getChallengeToken(): string | null {
  if (!hasSessionStorage()) return null;
  return window.sessionStorage.getItem(CHALLENGE_TOKEN_KEY);
}
