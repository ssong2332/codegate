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
  window.sessionStorage.removeItem(SELECTED_SCENARIO_ID_KEY);
  window.sessionStorage.removeItem(ANSWERED_SESSION_KEY);
  window.sessionStorage.removeItem(SELECTED_TRAINING_TYPE_KEY);
  window.sessionStorage.removeItem(SELECTED_VOICE_MODE_CHOICE_KEY);
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
