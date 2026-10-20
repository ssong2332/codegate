// §89.5 ⓑ(UX D-132 (5) ⓑ) — 수신 벨 받기 버튼: **누르기와 밀기 둘 다** 받는다(어르신 접근성 — 누르기는 종전 그대로).
// 밀기 = 받기 버튼에서 누른 채 48px 이상 움직임(방향 무관 — One UI는 밀기 방향이 여러 가지라 하나로 묶지 않는다).
export const SWIPE_ACCEPT_MIN_PX = 48;

export function isSwipeAccept(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= SWIPE_ACCEPT_MIN_PX;
}
