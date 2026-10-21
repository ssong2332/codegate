// 시안 E2(UX D-141 · §97) — 훈련 진입 · 종료 경계 판(공통 개선 ③ "여기부터 훈련 / 여기부터 실제 화면" 안전 기능).
// 진입 = 남색 "지금부터 훈련" · 종료 = 모래 "끝.". 화면 전체를 덮는 판 한 장 — 훈련 화면 자체는 바꾸지 않는다.
// ⛔ 이 판은 **훈련 화면 바깥**(진입 직전 · 종료 직후)에만 둔다. 받기 탭의 동기 오디오 잠금 해제(primeCallAudio)
//    경로에는 끼우지 않는다(§97.4).
"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import DisplayTitle from "./DisplayTitle";

export default function BoundaryPanel({
  tone,
  title,
  children,
  footer,
  focusOnMount = false,
  className = "",
}: {
  tone: "enter" | "exit";
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** 마운트 때 판으로 포커스를 옮긴다(스크린리더가 제목 · 본문을 바로 읽는다 — 저절로 넘어가는 판에 쓴다). */
  focusOnMount?: boolean;
  className?: string;
}) {
  const color = tone === "enter" ? "bg-brand text-white" : "bg-sand text-ink";
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
  return (
    <div ref={ref} tabIndex={-1} aria-labelledby={titleId} role="region" className={`flex min-h-dvh w-full flex-col outline-none ${color} ${className}`}>
      <div className="flex flex-1 flex-col justify-center gap-3 px-[26px]">
        <DisplayTitle as="h1" size="board" className="e2-rise">
          <span id={titleId}>{title}</span>
        </DisplayTitle>
        {children && (
          <div className="e2-rise text-[20px] font-bold leading-[1.6] [word-break:keep-all]" style={{ ["--e2-i" as string]: 1 }}>
            {children}
          </div>
        )}
      </div>
      {footer}
    </div>
  );
}
