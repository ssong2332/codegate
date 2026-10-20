// 공용 정보 카드 (시안 A "공공 안심형" — UX D-132 (2)). 흰 바탕 · 옅은 경계 · 모서리 8px.
// 누를 수 있는 카드는 `SelectableCard`를 쓴다 — 이 카드는 정보 묶음 전용이다.
import type { ReactNode } from "react";

export default function Card({
  title,
  children,
  tone = "default",
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  tone?: "default" | "brand" | "danger";
  className?: string;
}) {
  const toneClass =
    tone === "brand" ? "border-brand/40 bg-brand-tint" : tone === "danger" ? "border-danger/40 bg-danger-tint" : "border-line bg-surface";
  return (
    <section className={`flex flex-col gap-2 rounded-[8px] border p-4 ${toneClass} ${className}`}>
      {title && <p className="text-[16px] font-bold text-ink">{title}</p>}
      <div className="text-[17px] leading-[1.6] text-ink">{children}</div>
    </section>
  );
}
