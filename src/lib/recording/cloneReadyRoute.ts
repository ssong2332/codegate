// 클론 준비 완료 뒤 어디로 가는가(UX-003 clone/wait) — 2026-11-26 사용자 신고:
// "지인에게 보내기"에서 녹음하면 본인 체험 통화로 넘어갔다. 녹음 화면은 보내기 · 체험 · 메신저 목소리 선택
// 세 곳에서 들어오는데, 이 화면이 메신저만 구분하고 나머지는 무조건 본인 세션을 만들었기 때문이다.
//
// 판정표(위에서부터 첫 일치):
// | 메신저 목소리 선택 복귀 표식 | 체험 모드 | 선택 시나리오 | 결과 |
// | 있음 | — | — | voice-select(그 화면이 세션을 마무리 — D-25) |
// | 없음 | send | 있음 | challenge(UX-019 챌린지 만들기로 복귀 — 세션 생성 0) |
// | 없음 | send | 없음 | self-session(기존 흐름 → 시나리오 없음 안내) |
// | 없음 | self · 없음 | — | self-session(기존 흐름 무변경) |
export type CloneReadyRoute =
  | { kind: "voice-select" }
  | { kind: "challenge"; href: string }
  | { kind: "self-session" };

export function resolveCloneReadyRoute(input: {
  messengerVoiceSelectReturn: boolean;
  experienceMode: "self" | "send" | null;
  scenarioId: string | null;
}): CloneReadyRoute {
  if (input.messengerVoiceSelectReturn) return { kind: "voice-select" };
  if (input.experienceMode === "send" && input.scenarioId) {
    return { kind: "challenge", href: `/challenge/create?scenarioId=${encodeURIComponent(input.scenarioId)}` };
  }
  return { kind: "self-session" };
}

// §144 — 보내기 녹음은 clone/wait가 목소리 프로필로 저장한 뒤, 그 목소리가 골라진 만들기 화면으로 돌아간다.
export function withVoiceProfile(challengeHref: string, profileId: string): string {
  return `${challengeHref}&voiceProfileId=${encodeURIComponent(profileId)}`;
}

/**
 * 2026-11-26 실기 결함(§145.1) — 보내기 녹음 뒤 clone/wait가 "잠시만 기다려 주세요"에 멈췄다.
 * saveVoiceProfile이 서버에서 사전 세션을 폐기(purgeSession → voiceId 삭제)하고 나서야 응답한다. 그 voiceId 변화가
 * 구독 스냅샷 → effect 재실행 → cleanup 취소로 번져, 저장이 끝나도 이동 · 오류 표시를 모두 건너뛰었다.
 * 판정표 SR: SR1 저장 성공 ∧ 화면 살아 있음 → 저장 힌트 지우고 그 프로필로 이동 · SR2 실패 ∧ 살아 있음 → onError
 * · SR3 화면이 떠남(언마운트) → 아무것도 안 함(성공이면 힌트는 지운다). 세션 문서의 변화는 취소 신호가 아니다.
 */
export async function saveProfileThenReturn(deps: {
  save: () => Promise<{ profileId: string }>;
  clearPending: () => void;
  isMounted: () => boolean;
  go: (href: string) => void;
  onError: (err: unknown) => void;
  challengeHref: string;
}): Promise<void> {
  let profileId: string;
  try {
    ({ profileId } = await deps.save());
  } catch (err) {
    if (deps.isMounted()) deps.onError(err);
    return;
  }
  deps.clearPending();
  if (deps.isMounted()) deps.go(withVoiceProfile(deps.challengeHref, profileId));
}
