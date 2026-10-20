// 공용 선택 카드 (디자인 시스템.dc.html "3 · 선택 가능한 카드").
// 미선택 = 흰 배경 + 테두리 + 빈 원. 선택 = 틴트 배경 + 강조 테두리 + 체크 아이콘(색약 접근성 — 색만으로 구분 안 함).
// 시안 A 토큰(UX D-132): 선택 = 남색 경계 2px + 남색 틴트, 미선택 원 = 진한 경계(비텍스트 3:1).
import type { ReactNode } from "react";

export default function SelectableCard({
  selected,
  onClick,
  title,
  description,
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
}: {
  selected: boolean;
  onClick?: () => void;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={`w-full text-left rounded-[8px] border-[1.5px] p-4 flex items-start gap-3 transition-colors ${
        selected
          ? "border-brand bg-brand-tint shadow-[inset_0_0_0_1px_var(--brand)]"
          : "border-line bg-surface hover:border-line-strong"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      <div
        className={`w-6 h-6 rounded-full shrink-0 mt-[2px] flex items-center justify-center ${
          selected ? "bg-brand" : "border-[1.5px] border-line-strong"
        }`}
        aria-hidden="true"
      >
        {selected && (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2.5 7L5.2 9.7L10.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[18px] font-semibold text-ink">{title}</p>
        {description && <p className="text-[16px] text-ink-sub mt-1 leading-[1.55]">{description}</p>}
      </div>
    </button>
  );
}
