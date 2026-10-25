// §134 — 통화 중 새로고침 복원(§99 · `initialPhase === "live"` → 글 대화 `callMode:"fallback"`)의 "이어서 통화하기" 판정.
//
// 실기 신고(2026-10-25 · Chrome 155 Android): 통화 중 주소창으로 다시 열면 화면은 "듣고 있어요"인데 아무것도 뜨지 않고
// 알림음만 주기적으로 났다. 원인(코드): 복원된 글 대화 경로의 연속 자동 청취(`page.tsx` #7 effect)가 브라우저 음성 인식을
// 400ms 간격으로 다시 연다 — Android는 인식을 열고 닫을 때마다 시스템 알림음을 낸다(추정 — 확인: 아래 버튼을 누르기 전
// 알림음이 멎는지). 새 문서라 사용자 활성화가 없어 상대 음성 자동재생도 막힌다(`act.hasBeenActive=false`).
//
// | # | If | Then |
// |---|---|---|
// | R1 | 새로고침 복원 아님(받기를 이 화면에서 눌렀다) | 버튼 없음(종전) |
// | R2 | 복원 · 사용자 활성화 있음(`hasBeenActive`) | 버튼 없음(종전 — 같은 문서에서 이미 탭했다) |
// | R3 | 복원 · 활성화 없음 또는 판별 API 없음 | "이어서 통화하기" 버튼 · 누르기 전에는 자동 청취를 열지 않는다 |

export type UserActivationLike = { hasBeenActive: boolean } | null | undefined;

/** 위 표 R1 ~ R3. */
export function needsResumeTap(input: { restored: boolean; userActivation: UserActivationLike }): boolean {
  if (!input.restored) return false;
  return !input.userActivation?.hasBeenActive;
}

export const RESUME_TAP_COPY = {
  title: "통화가 잠시 끊겼어요",
  body: "화면이 새로 열려 소리와 마이크가 멈췄습니다. 아래 버튼을 누르면 이어서 통화합니다.",
  action: "이어서 통화하기",
} as const;
