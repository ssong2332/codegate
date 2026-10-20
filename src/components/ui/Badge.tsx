// 공용 배지 (디자인 시스템.dc.html "4 · 배지" — 주의/완료/중립/경고 4variant).
// 색만으로 구분하지 않고 아이콘/점을 병행한다(색약 접근성).
import type { ReactNode } from "react";

type BadgeVariant = "caution" | "success" | "neutral" | "danger";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  caution: "bg-caution-tint text-caution",
  success: "bg-success-tint text-success",
  neutral: "bg-neutral-tint text-ink-sub",
  danger: "bg-danger text-white",
};

function BadgeIcon({ variant }: { variant: BadgeVariant }) {
  if (variant === "caution") {
    return <span className="w-1.5 h-1.5 rounded-full bg-caution" aria-hidden="true" />;
  }
  if (variant === "success") {
    return (
      <svg width="11" height="11" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <path d="M2.5 7L5.2 9.7L10.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return null;
}

export default function Badge({
  variant = "neutral",
  children,
  className = "",
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full text-[14px] font-semibold px-3 py-1.5 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      <BadgeIcon variant={variant} />
      {children}
    </span>
  );
}
