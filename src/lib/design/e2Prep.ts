// 시안 E2 준비 화면 · 경계 판(UX D-141 (5) · OQ-U106 Resolved · docs/Architecture.md §97.7) — 순수 규칙(단위 테스트 대상).
//
// ⛔ 진행률 · "n단계 완료" · "1/3" 표기 금지(D-134 — 서버가 진행 상태를 알려 주지 않는다). 큰 표시는 **경과 초**다.
//    사용자 결정 2026-10-21 *"준비 화면 큰 숫자는 '1/3→2/3' 대신 경과 초(예: 8초) + '보통 10~15초' 안내로 해."*

/** 큰 경과 표시 — 초(내림). 60초 이상은 "1분 5초". */
export function formatElapsed(ms: number): string {
  const s = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  if (s < 60) return `${s}초`;
  const rest = s % 60;
  return rest === 0 ? `${Math.floor(s / 60)}분` : `${Math.floor(s / 60)}분 ${rest}초`;
}

/** 보통 걸리는 시간 안내(실측 근거: createSession 대기 — `routeMotion.ts` SESSION_PREP_HINTS 주석 "길게는 15초쯤"). */
export const PREP_USUAL_LINE = "보통 10~15초 걸려요";

/** 대기 중 예방 요령(일반 원칙만 — 시나리오 흐름 · 수법 순서는 말하지 않는다). 시안 E2 TIPS 문면 그대로. */
export const PREP_TIPS: readonly string[] = [
  "검찰·경찰·금감원은 전화로 돈을 옮기라고 하지 않습니다.",
  "문자로 온 링크로 신분증·카드번호를 넣지 마세요.",
  "의심되면 끊고, 내가 찾은 대표번호로 다시 거세요.",
];

/** 예방 요령 바꾸는 간격(ms) — 한 문장을 천천히 두 번 읽을 시간. */
export const PREP_TIP_INTERVAL_MS = 5000;

export function prepTipIndex(elapsedMs: number): number {
  const n = PREP_TIPS.length;
  return Math.floor(Math.max(0, elapsedMs) / PREP_TIP_INTERVAL_MS) % n;
}

/** 진입 경계 판이 머무는 시간(ms). 그 뒤 훈련 화면으로 간다(판을 누르면 바로). */
export const ENTRY_BOARD_MS = 1200;

/** 진입 경계 판 문면 — 채널별. 받기 탭(통화 화면 안의 오디오 잠금 해제)과 무관한 세션 전 안내다. */
export function entryBoardCopy(channel: "voice" | "messenger"): { title: string; lines: readonly string[] } {
  return {
    title: "지금부터 훈련",
    lines: [channel === "voice" ? "진짜 전화가 아닙니다." : "진짜 문자·메신저가 아닙니다.", "실제 돈은 오가지 않아요."],
  };
}

/** 종료 경계 판 문면. */
export const EXIT_BOARD = { title: "끝.", line: "훈련이 끝났습니다. 여기부터는 실제 화면입니다." } as const;
