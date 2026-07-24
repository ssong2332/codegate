// 공용 버튼 (디자인 시스템.dc.html "2 · 버튼" 그대로 — primary/secondary/disabled 3variant).
// 주버튼 min-h-56px bg-[#0E6B62] hover:bg-[#0B564F], 보조 투명+테두리, 비활성 bg-[#F2EFE9].
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "min-h-[56px] bg-[#0E6B62] text-white hover:bg-[#0B564F] disabled:bg-[#F2EFE9] disabled:text-[#C9C2B6] disabled:cursor-not-allowed text-[17px]",
  secondary:
    "min-h-[52px] bg-transparent border-[1.5px] border-[#E2DDD3] text-[#22303A] hover:border-[#C9C2B6] disabled:bg-[#F2EFE9] disabled:text-[#C9C2B6] disabled:border-transparent disabled:cursor-not-allowed text-[16px]",
  danger:
    "min-h-[52px] bg-[#C6392F] text-white hover:bg-[#A82F27] disabled:bg-[#F2EFE9] disabled:text-[#C9C2B6] disabled:cursor-not-allowed text-[16px]",
};

export default function Button({ variant = "primary", className = "", children, ...rest }: Props) {
  return (
    <button
      className={`w-full rounded-[14px] font-semibold transition-colors ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
