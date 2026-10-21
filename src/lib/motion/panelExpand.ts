// 시안 E2 판 확장 전환(UX D-141 · §97) — 누른 판이 clip-path로 화면 전체가 된 뒤 다음 화면이 드러난다.
//
// 동작: ① 누른 판과 같은 색의 덮개(position: fixed)를 body에 붙이고 판 자리에서 화면 전체로 넓힌다(380ms)
//       ② 이동(navigate)은 **누르는 즉시** 부른다 — 전환이 이동을 늦추지 않는다(덮개 아래에서 다음 화면이 그려진다)
//       ③ 경로가 바뀌면 template.tsx가 `releasePanelOverlay()`를 불러, 넓히기가 끝난 뒤 덮개를 걷는다(220ms).
// ⛔ reduced-motion이면 위치 · 크기 변화 없이 불투명도만 쓴다(덮개 페이드 160ms).
// ⛔ 덮개는 transform을 쓰지 않는다(clip-path · opacity만) — `position: fixed` 자손 기준을 바꾸지 않는다.
// ⛔ 훈련 화면 안에서는 쓰지 않는다(실제 폰에 없는 연출 금지 · 받기 탭의 동기 오디오 잠금 해제 앞에 지연을 끼우지 않는다).
// ⚠️ 런타임 import 0 — 앱(번들러)과 단위 테스트(node 타입 제거) 양쪽에서 같은 파일을 읽기 위해서다. 아래 수치는
//    `e2Layout.ts` E2_MOTION과 같아야 한다(G646이 본다).
const E2_MOTION = {
  panelExpandMs: 380,
  panelFadeMs: 220,
  drawerEasing: "cubic-bezier(0.32, 0.72, 0, 1)",
  reducedFadeMs: 160,
} as const;

export const PANEL_EXPAND_MOTION = E2_MOTION;

export type Rect = { top: number; left: number; right: number; bottom: number };

/** 판 사각형 → 화면 기준 clip-path inset(위 오른쪽 아래 왼쪽, px · 음수는 0). */
export function clipInsetFromRect(rect: Rect, viewportWidth: number, viewportHeight: number): string {
  const px = (n: number) => `${Math.max(0, Math.round(n))}px`;
  return `inset(${px(rect.top)} ${px(viewportWidth - rect.right)} ${px(viewportHeight - rect.bottom)} ${px(rect.left)})`;
}

/** 덮개가 이동 없이 남는 최대 시간 — 같은 경로로 이동하거나 이동이 실패해도 화면이 덮인 채 남지 않게. */
export const OVERLAY_SAFETY_MS = 2500;

type OverlayState = { el: HTMLElement; grown: Promise<unknown>; safety: number };
let current: OverlayState | null = null;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * 판(`source`)을 화면 전체로 넓히며 `navigate`를 부른다. Web Animations가 없으면 바로 이동만 한다.
 * `navigate`가 **`false`를 돌려주면 이동하지 않은 것**으로 보고 덮개를 만들지 않는다(리뷰 Major — 조건부 이동 ·
 * 같은 경로에서 화면이 2.5초 막히지 않게). ⚠️ 경로(pathname)가 바뀌지 않는 이동(쿼리만 바뀜)은 `false`를 돌려줄 것.
 * 덮개는 탭을 막는다(넓히는 동안 두 번 눌러 두 번 이동하지 않게).
 */
export function expandPanelThen(source: HTMLElement, navigate: () => boolean | void): void {
  if (typeof document === "undefined" || typeof source.animate !== "function") {
    navigate();
    return;
  }
  if (current) {
    // 이미 전환 중 — 두 번째 탭은 무시한다.
    return;
  }
  // 판 위치 · 색은 이동 전에 읽는다(이동하면 판이 사라진다).
  const rect = source.getBoundingClientRect();
  const color = getComputedStyle(source).backgroundColor;
  if (navigate() === false) return;
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.dataset.panelOverlay = "";
  el.style.cssText = `position:fixed;inset:0;z-index:60;background:${color};pointer-events:auto;`;
  document.body.appendChild(el);

  const reduced = prefersReducedMotion();
  const animation = reduced
    ? el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: E2_MOTION.reducedFadeMs, easing: "ease-out", fill: "forwards" })
    : el.animate(
        // 덮개(fixed · inset 0) 크기 = 스크롤바를 뺀 화면 — innerWidth가 아니라 clientWidth(리뷰 Minor).
        [
          { clipPath: clipInsetFromRect(rect, document.documentElement.clientWidth, document.documentElement.clientHeight) },
          { clipPath: "inset(0px 0px 0px 0px)" },
        ],
        { duration: E2_MOTION.panelExpandMs, easing: E2_MOTION.drawerEasing, fill: "forwards" },
      );
  const grown = animation.finished.catch(() => undefined);
  const safety = window.setTimeout(() => releasePanelOverlay(), OVERLAY_SAFETY_MS);
  current = { el, grown, safety };
}

/** 다음 화면이 그려진 뒤 덮개를 걷는다(넓히기가 끝나기 전이면 끝난 뒤에). 덮개가 없으면 아무것도 안 한다. */
export function releasePanelOverlay(): void {
  const state = current;
  if (!state) return;
  current = null;
  window.clearTimeout(state.safety);
  void state.grown.then(() => {
    const fade = state.el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: prefersReducedMotion() ? E2_MOTION.reducedFadeMs : E2_MOTION.panelFadeMs,
      easing: "ease-out",
      fill: "forwards",
    });
    // 걷히는 동안은 아래 화면을 바로 누를 수 있게 한다.
    state.el.style.pointerEvents = "none";
    void fade.finished.catch(() => undefined).then(() => state.el.remove());
  });
}
