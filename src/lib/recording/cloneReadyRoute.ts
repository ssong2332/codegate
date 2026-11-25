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
