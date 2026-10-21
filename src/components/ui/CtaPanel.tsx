"use client";

// 시안 E2(UX D-141 · §97) — 화면 아래 가로 전체 CTA 판(모래 바탕 · 진한 글자 · 76px · 오른쪽 화살표).
// 링크(`href`)나 버튼(`onClick`) 둘 중 하나. 비활성은 중립 바탕 + 비활성 글자(대비 예외 — WCAG 1.4.3).
// 아래 안내 줄(`note`)은 같은 판 안에 둔다 — 판과 안내가 한 덩어리로 읽힌다. 하단 안전 영역(홈 막대)만큼 띄운다.
// ⚠️ ui 배럴 — `@/` 별칭 금지. Next Link는 패키지 경로라 괜찮다.
import Link from "next/link";
import type { ReactNode } from "react";

function Arrow() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h13 M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Common = {
  children: ReactNode;
  note?: ReactNode;
  /** 안내 줄 바탕 — sand(판과 같은 색, 기본) · deep(짙은 남색 화면 위) */
  noteTone?: "sand" | "deep";
  className?: string;
};

type Props = Common &
  ({ href: string; onClick?: never; disabled?: never; type?: never } | { href?: never; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" });

const BODY =
  "flex min-h-[76px] w-full items-center justify-between gap-3 px-6 text-left font-display text-[22px] font-bold [word-break:keep-all] transition-colors focus-visible:outline-[3px] focus-visible:-outline-offset-[6px] focus-visible:outline-ink";

export default function CtaPanel(props: Props) {
  const { children, note, noteTone = "sand", className = "" } = props;
  const enabled = props.href !== undefined || !props.disabled;
  const tone = enabled ? "bg-sand text-ink hover:brightness-[0.97]" : "bg-neutral-tint text-disabled-ink cursor-not-allowed";
  const inner = (
    <>
      <span>{children}</span>
      <Arrow />
    </>
  );
  return (
    <div className={`flex flex-col ${className}`}>
      {props.href !== undefined ? (
        <Link href={props.href} className={`${BODY} ${tone}`}>
          {inner}
        </Link>
      ) : (
        <button type={props.type ?? "button"} onClick={props.onClick} disabled={props.disabled} className={`${BODY} ${tone}`}>
          {inner}
        </button>
      )}
      <div
        className={`px-[22px] pb-[calc(env(safe-area-inset-bottom)+16px)] ${note ? "pt-3" : "pt-0"} text-[16px] leading-[1.6] [word-break:keep-all] ${
          noteTone === "deep" ? "bg-deep text-brand-tint" : "bg-sand text-ink"
        }`}
      >
        {note}
      </div>
    </div>
  );
}
