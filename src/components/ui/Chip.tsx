// 공용 칩 (시안 A "공공 안심형" — UX D-132 (2)). 남색 틴트 바탕 · 남색 글자(7.4:1).
// 시안 A의 고정 안심 문구("실제 돈·정보 이동 없음")와 소요 시간 · 수법 이름 표시에 쓴다.
import type { ReactNode } from "react";

export default function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-brand-tint px-3 py-1 text-[14px] font-bold text-brand ${className}`}>
      {children}
    </span>
  );
}
