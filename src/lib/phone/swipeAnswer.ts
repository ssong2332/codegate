// §89.5 ⓑ(UX D-132 (5) ⓑ) — 수신 벨 받기 버튼: **누르기와 밀기 둘 다** 받는다(어르신 접근성 — 누르기는 종전 그대로).
// 밀기 = 받기 버튼에서 누른 채 48px 이상 움직임(방향 무관 — One UI는 밀기 방향이 여러 가지라 하나로 묶지 않는다).
//
// ⭐ 독립 QA Major(2026-10-20) — `pointermove`는 사용자 활성화(user activation)를 만들지 않는다. 받기 핸들러는 그 제스처
// 안에서 **동기로** 통화 오디오 컨텍스트를 만들고 resume해야 하므로(play/page.tsx `handleAnswer` 수정안 A), 밀기는
// move에서 **기록만** 하고 실제 받기는 활성화 이벤트인 `pointerup`에서 한다. 밀기로 받은 뒤 이어 오는 `click`은 무시한다
// (이중 호출 방지). 누르기 · 키보드(Enter/Space → click)는 종전대로 click에서 받는다.
export const SWIPE_ACCEPT_MIN_PX = 48;

export function isSwipeAccept(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= SWIPE_ACCEPT_MIN_PX;
}

/** 받기 버튼 포인터 · 클릭 순서를 다루는 작은 상태 기계(화면은 이벤트를 그대로 넘긴다 · G632가 순서를 고정한다). */
export type SwipeAnswerController = {
  down(x: number, y: number): void;
  /** 밀기 거리만 판정한다 — 여기서는 절대 받지 않는다. */
  move(x: number, y: number): void;
  /** 밀기가 판정됐으면 여기서(활성화 이벤트 안에서 동기로) 받는다. */
  up(answer: () => void): void;
  cancel(): void;
  /** 누르기 · 키보드. 바로 앞에서 밀기로 받았으면 그 click 1회는 무시한다. */
  click(answer: () => void): void;
};

export function createSwipeAnswer(): SwipeAnswerController {
  let start: { x: number; y: number } | null = null;
  let armed = false;
  let swallowNextClick = false;
  return {
    down(x, y) {
      start = { x, y };
      armed = false;
    },
    move(x, y) {
      if (start && isSwipeAccept(x - start.x, y - start.y)) armed = true;
    },
    up(answer) {
      const swiped = armed;
      start = null;
      armed = false;
      if (!swiped) return; // 그냥 누른 경우 — 뒤따르는 click이 받는다.
      swallowNextClick = true;
      answer();
    },
    cancel() {
      start = null;
      armed = false;
    },
    click(answer) {
      if (swallowNextClick) {
        swallowNextClick = false;
        return;
      }
      answer();
    },
  };
}
