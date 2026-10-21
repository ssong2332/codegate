// 사이트 모션 판정(UX D-134). 훈련 화면은 "실제 폰처럼"이 우선이라 페이지 진입 모션을 주지 않는다.

/** 실제 폰을 재현하는 훈련 화면 경로(통화 · 채팅 · 메신저). 문자 · 이체는 이 화면들 안의 오버레이다. */
const TRAINING_SURFACE_PREFIXES = ["/session/play", "/session/chat", "/session/messenger"] as const;

export function isTrainingSurfacePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  return TRAINING_SURFACE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * 오래 걸리는 대기의 안내 문구 — 경과 시간에 따라 **안심 문구만** 덧붙인다.
 * ⛔ 진행률 · "n단계 완료" 같은 표현은 쓰지 않는다(서버가 진행 상태를 알려 주지 않으므로 가짜가 된다).
 * 반환값: 지금 보여 줄 문구(없으면 null). 단계는 경과 시간 오름차순이어야 한다.
 */
export type LoadingHint = { afterMs: number; text: string };

export function pickLoadingHint(hints: readonly LoadingHint[], elapsedMs: number): string | null {
  let current: string | null = null;
  for (const hint of hints) {
    if (elapsedMs >= hint.afterMs) current = hint.text;
  }
  return current;
}

/**
 * 훈련 준비(createSession) 대기 문구. 서버가 실제로 하는 일(첫 마디 생성 · 음성 합성)만 말하고, 완료를 단정하지 않는다.
 * 근거: `functions/src/session/index.ts` createSession — generateOpeningLine → (보이스) synthesize.
 */
export const SESSION_PREP_HINTS: readonly LoadingHint[] = [
  { afterMs: 0, text: "상대방 역할과 첫 마디를 준비하고 있어요." },
  { afterMs: 8000, text: "조금 더 걸리고 있어요. 이 화면에서 기다려 주세요." },
  { afterMs: 20000, text: "평소보다 오래 걸리고 있어요. 계속 준비하는 중이에요." },
];
