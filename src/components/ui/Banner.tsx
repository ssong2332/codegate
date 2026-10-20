// 공용 상시 노출 배너 (디자인 시스템.dc.html "6 · 상시 노출 배너" — 닫기 버튼 없음, 법적/안전 고지 목적).
// 주의형 = 옅은 주황 배경 + ⓘ 아이콘. 완료형 = 옅은 초록 배경 + 체크 아이콘(시안 A 토큰 · UX D-132).
// 절대 dismiss 가능한 컴포넌트로 만들지 말 것(handoff README "Interactions & Behavior" 명시).
import type { ReactNode } from "react";

type BannerVariant = "caution" | "success";

export default function Banner({
  variant,
  children,
  className = "",
  sticky = false,
}: {
  variant: BannerVariant;
  children: ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  const isCaution = variant === "caution";
  return (
    <div
      className={`rounded-[8px] px-4 py-3 flex items-start gap-2.5 ${
        isCaution ? "bg-caution-tint border border-caution/30" : "bg-success-tint"
      } ${sticky ? "sticky top-0 z-20" : ""} ${className}`}
      role={isCaution ? "status" : undefined}
    >
      {isCaution ? (
        <span className="text-[15px] leading-none mt-[3px] text-caution font-bold" aria-hidden="true">
          ⓘ
        </span>
      ) : (
        <svg className="mt-[3px] shrink-0 text-success" width="14" height="14" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M2.5 7L5.2 9.7L10.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <p className="text-[15px] text-ink leading-[1.6]">{children}</p>
    </div>
  );
}
