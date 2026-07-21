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
