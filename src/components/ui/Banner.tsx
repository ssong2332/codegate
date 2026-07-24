// 공용 상시 노출 배너 (디자인 시스템.dc.html "6 · 상시 노출 배너" — 닫기 버튼 없음, 법적/안전 고지 목적).
// 주의형 = 옅은 주황 배경 + ⓘ 아이콘. 완료형 = 옅은 청록 배경 + 체크 아이콘.
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
      className={`rounded-[12px] px-4 py-3 flex items-start gap-2.5 ${
        isCaution ? "bg-[#FBF3E8] border border-[#B96A1B]/30" : "bg-[#E4F0EC]"
      } ${sticky ? "sticky top-0 z-20" : ""} ${className}`}
      role={isCaution ? "status" : undefined}
    >
      {isCaution ? (
        <span className="text-[15px] leading-none mt-[3px] text-[#B96A1B] font-bold" aria-hidden="true">
          ⓘ
        </span>
      ) : (
        <svg className="mt-[3px] shrink-0" width="14" height="14" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M2.5 7L5.2 9.7L10.5 3.5" stroke="#0E6B62" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <p className="text-[13px] text-[#22303A] leading-[1.55]">{children}</p>
    </div>
  );
}
