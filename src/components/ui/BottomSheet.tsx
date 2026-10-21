"use client";

// 시안 E2 개선 ③(UX D-141 · §97) — 아래에서 올라오는 설명 시트(320ms · 서랍 곡선). 난이도 판은 제목 + 한 줄만 두고,
// 긴 설명과 "이걸로 시작"은 고른 뒤 이 시트에 담는다.
// 모달이 아니다 — 위의 판을 계속 눌러 고른 것을 바꿀 수 있다(초점 가두기 없음). 바뀐 설명만 읽히게 하려면 호출부가
// 설명 문단에 aria-live를 단다(시트 전체에 걸면 버튼까지 매번 다시 읽힌다 — 리뷰 Minor).
// ⚠️ fixed는 내용 위에 뜬다 — 부모가 시트 높이만큼 아래 여백을 둔다. 목록과 함께 쓰면 sticky를 권한다(끝까지 내리면 다 보인다).
// ⛔ reduced-motion이면 움직이지 않는다(motion.css `.e2-sheet-in`이 꺼진다).
import type { ReactNode } from "react";

export default function BottomSheet({
  open,
  label,
  children,
  placement = "fixed",
  className = "",
}: {
  open: boolean;
  /** fixed = 화면 아래 고정(내용 위에 뜬다) · sticky = 문서 흐름의 끝에 붙어 스크롤 중에는 아래에 머문다 —
   *  목록 끝까지 내리면 가려졌던 판 · 안내가 모두 보인다(시트 아래 여백 계산 불필요 · 높이 650 폰에서도 안전). */
  placement?: "fixed" | "sticky";
  /** 시트 이름(스크린리더) */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <section
      aria-label={label}
      data-bottom-sheet=""
      className={`e2-sheet-in ${placement === "fixed" ? "fixed inset-x-0 bottom-0 mx-auto max-w-xl" : "sticky bottom-0"} z-40 flex w-full flex-col border-t-[3px] border-brand bg-surface text-ink shadow-[0_-14px_30px_color-mix(in_srgb,var(--deep)_22%,transparent)] ${className}`}
    >
      {children}
    </section>
  );
}
