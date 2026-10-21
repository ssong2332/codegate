"use client";

// §95(UX D-138) — 메신저 대화방이 키보드 위 "보이는 영역"을 따라가게 하는 훅. 판정표 · 근거는 `keyboardViewport.ts` 머리.
import { useEffect, useSyncExternalStore } from "react";
import { parseSnapshot, snapshotOf, type KeyboardViewportBox } from "./keyboardViewport";

function subscribe(onChange: () => void): () => void {
  const vv = window.visualViewport;
  vv?.addEventListener("resize", onChange);
  vv?.addEventListener("scroll", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    vv?.removeEventListener("resize", onChange);
    vv?.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

const getSnapshot = () => snapshotOf(window.visualViewport);
const getServerSnapshot = () => "";

/**
 * `enabled`인 동안 ① 문서 스크롤을 잠그고(브라우저가 문서를 끌어올리지 못하게) ② 보이는 영역의 높이 · 위치를 돌려준다.
 * 잠금은 이 화면을 떠나면 원래 값으로 되돌린다(다른 화면 · 공용 CSS 무영향).
 */
export function useKeyboardViewport(enabled: boolean): KeyboardViewportBox | null {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (!enabled) return;
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.overflow, body: body.style.overflow, overscroll: html.style.overscrollBehavior };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    window.scrollTo(0, 0);
    return () => {
      html.style.overflow = prev.html;
      body.style.overflow = prev.body;
      html.style.overscrollBehavior = prev.overscroll;
    };
  }, [enabled]);
  return enabled ? parseSnapshot(snapshot) : null;
}
