// 공용 버튼 (디자인 시스템.dc.html "2 · 버튼" 그대로 — primary/secondary/disabled 3variant).
// 시안 A(UX D-132): 주버튼 56px 남색 · 보조 흰 바탕 + 진한 경계(비텍스트 3:1) · 모서리 8px. 색은 토큰 유틸리티만 쓴다.
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "min-h-[56px] bg-brand text-white hover:bg-brand-hover disabled:bg-neutral-tint disabled:text-disabled-ink disabled:cursor-not-allowed text-[18px]",
  secondary:
    "min-h-[56px] bg-surface border-[1.5px] border-line-strong text-ink hover:bg-brand-tint disabled:bg-neutral-tint disabled:text-disabled-ink disabled:border-transparent disabled:cursor-not-allowed text-[17px]",
  danger:
    "min-h-[56px] bg-danger text-white hover:bg-danger-hover disabled:bg-neutral-tint disabled:text-disabled-ink disabled:cursor-not-allowed text-[17px]",
};

export default function Button({ variant = "primary", className = "", children, ...rest }: Props) {
  return (
    <button
      className={`w-full rounded-[8px] font-semibold transition-colors focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
