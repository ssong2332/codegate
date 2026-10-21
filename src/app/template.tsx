"use client";

// 페이지 진입 모션(UX D-134). 라이브러리 · 실험 플래그 0(번들 증가 ≈ 0). 퇴장 모션은 없다(즉시 교체).
// ⚠️ 루트 template은 **최상위 구간이 바뀔 때만** 다시 마운트된다(/scenarios → /scenarios/difficulty는 재마운트 없음 —
//    리뷰 Major). 그래서 바깥 페이드는 CSS가 아니라 경로가 바뀔 때마다 Web Animations로 건다(그리기 전 — useLayoutEffect).
//    안쪽 main의 6px 상승은 페이지가 바뀌면 main이 새로 마운트되므로 CSS(motion.css)로 충분하다.
// ⛔ 훈련 화면(통화 · 채팅 · 메신저)은 감싸기만 하고 모션을 주지 않는다 — 실제 폰에 없는 연출 금지이며,
//    받기 탭의 동기 오디오 잠금 해제(primeCallAudio) 앞에 어떤 지연도 끼우지 않는다.
// ⚠️ 래퍼는 body의 flex 열을 그대로 잇는다(`flex flex-1 flex-col`) — 안쪽 main의 `min-h-dvh` · `flex-1`이 그대로 동작한다.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isTrainingSurfacePath } from "@/lib/motion/routeMotion";
import { releasePanelOverlay } from "@/lib/motion/panelExpand";

export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const animate = !isTrainingSurfacePath(pathname);
  const ref = useRef<HTMLDivElement>(null);

  // UX D-141 — 판 확장 전환(panelExpand.ts)의 덮개는 다음 화면이 그려진 뒤(경로가 바뀐 뒤) 걷는다.
  useLayoutEffect(() => {
    releasePanelOverlay();
  }, [pathname]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!animate || !el || typeof el.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // opacity만 — transform을 쓰면 애니메이션 동안 `position: fixed` 자손의 기준이 바뀐다.
    const animation = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });
    return () => animation.cancel();
  }, [pathname, animate]);

  return (
    <div ref={ref} className={`flex flex-1 flex-col${animate ? " page-enter" : ""}`}>
      {children}
    </div>
  );
}
