"use client";

// 시안 E2 개선 ③(UX D-141 · §97) — 아래에서 올라오는 설명 시트(320ms · 서랍 곡선). 난이도 판은 제목 + 한 줄만 두고,
// 긴 설명과 "이걸로 시작"은 고른 뒤 이 시트에 담는다.
// 모달이 아니다 — 위의 판을 계속 눌러 고른 것을 바꿀 수 있다(초점 가두기 없음). 바뀐 설명만 읽히게 하려면 호출부가
// 설명 문단에 aria-live를 단다(시트 전체에 걸면 버튼까지 매번 다시 읽힌다 — 리뷰 Minor).
// ⚠️ 시트가 판을 가리지 않게 부모는 시트 높이만큼 아래 여백을 둔다(`useSheetPad` 대신 단순히 `pb-[sheet]` — 화면별로 정한다).
// ⛔ reduced-motion이면 움직이지 않는다(motion.css `.e2-sheet-in`이 꺼진다).
import type { ReactNode } from "react";

export default function BottomSheet({
  open,
  label,
  children,
  className = "",
}: {
  open: boolean;
  /** 시트 이름(스크린리더) */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <section
      aria-label={label}
      className={`e2-sheet-in fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-xl flex-col border-t-[3px] border-brand bg-surface text-ink shadow-[0_-14px_30px_color-mix(in_srgb,var(--deep)_22%,transparent)] ${className}`}
    >
      {children}
    </section>
  );
}
