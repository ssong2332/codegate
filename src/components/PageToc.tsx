"use client";

// 긴 페이지 상단 "목록" 토글(UX D-138 · docs/Architecture.md §95). 누르면 구역 목록이 펼쳐지고, 고르면 그 구역으로 이동한다.
// 막대는 위에 붙어 있어(sticky) 스크롤 도중에도 1탭으로 다시 열 수 있다. 구역이 2개 미만이면 아무것도 그리지 않는다.
// 접근성 — 펼침 버튼(aria-expanded · aria-controls) · Esc로 닫고 버튼으로 포커스 복귀 · 이동한 구역으로 포커스(preventScroll)
// · reduced-motion이면 즉시 이동. ⛔ 훈련 화면(통화 · 문자 · 메신저 · 이체)에는 쓰지 않는다.
import { useEffect, useId, useRef, useState } from "react";
import { LineIcon } from "@/components/ui";
import { shouldShowPageToc, tocScrollBehavior, type TocSection } from "@/lib/pagetoc/pageToc";

export type PageTocEntry = TocSection & {
  /** 이동 직전에 부른다 — 접힌 구역(리포트 아코디언)을 펼치는 데 쓴다. */
  onBeforeJump?: () => void;
};

export default function PageToc({ sections, className = "" }: { sections: readonly PageTocEntry[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!shouldShowPageToc(sections)) return null;

  const jump = (entry: PageTocEntry) => {
    setOpen(false);
    entry.onBeforeJump?.();
    // 펼침(onBeforeJump)이 그려진 다음 프레임에 찾는다.
    requestAnimationFrame(() => {
      const target = document.getElementById(entry.id);
      if (!target) {
        toggleRef.current?.focus();
        return;
      }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: tocScrollBehavior(reduced), block: "start" });
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });
  };

  return (
    <nav aria-label="이 화면 목록" className={`sticky top-0 z-20 bg-page/95 backdrop-blur ${className}`}>
      <div className="flex min-h-[56px] items-center justify-end">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[48px] items-center gap-2 rounded-[8px] border border-line bg-white px-4 text-[17px] font-semibold text-ink hover:border-line-strong"
        >
          <LineIcon name="list" size={20} />
          목록
          <span
            aria-hidden="true"
            className={`inline-block text-ink-sub transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </button>
      </div>
      {open && (
        // 칸이 많거나(약관 9조항) 화면이 짧으면(가로 모드) 목록 안에서 스크롤된다 — 막대가 위에 붙어 있어 페이지 스크롤로는 닿지 않는다.
        <ul
          id={panelId}
          className="motion-reveal mb-3 flex max-h-[calc(100dvh-72px)] flex-col overflow-y-auto overscroll-contain rounded-[8px] border border-line bg-white"
        >
          {sections.map((entry) => (
            <li key={entry.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => jump(entry)}
                className="flex min-h-[52px] w-full items-center px-4 text-left text-[17px] font-medium text-ink hover:bg-neutral-tint"
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
