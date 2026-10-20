// 공용 상단 바 (시안 A "공공 안심형" — UX D-132 (2) · docs/Architecture.md §89).
// 왼쪽 뒤로가기(선택) + 화면 제목 한 줄. 오른쪽 자리(`trailing`)는 화면이 채운다(예: 훈련 종료).
// 뒤로가기는 48px 터치 영역 · 글자 라벨 없이 아이콘만 쓰므로 aria-label을 반드시 단다.
import type { ReactNode } from "react";

export default function AppBar({
  title,
  onBack,
  backLabel = "뒤로 가기",
  trailing,
  className = "",
}: {
  title: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex min-h-[56px] items-center gap-1 border-b border-line bg-surface px-2 ${className}`}>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] text-ink hover:bg-brand-tint focus-visible:outline-[3px] focus-visible:outline-brand"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <span className="w-2" aria-hidden="true" />
      )}
      <p className="min-w-0 flex-1 truncate text-[18px] font-bold text-ink">{title}</p>
      {trailing}
    </header>
  );
}
