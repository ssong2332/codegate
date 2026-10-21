// 시안 E2(UX D-141 · §97) — 화면 제목. 함렛은 **화면 제목에만** 쓴다(판 제목은 Plex 700 — PanelList).
// 어절 단위 줄바꿈(keep-all) — "받아 보세요"가 "받아 보/세요"로 갈라지지 않게. 크기: xl 38px(랜딩 · 로그인) · lg 30px(선택 화면) ·
// board 48px(진입 · 종료 경계 판).
import type { ReactNode } from "react";

const SIZE = {
  xl: "text-[38px] leading-[1.25] tracking-[-0.02em]",
  lg: "text-[30px] leading-[1.3] tracking-[-0.02em]",
  board: "text-[48px] leading-[1.15] tracking-[-0.02em]",
} as const;

export default function DisplayTitle({
  as: Tag = "h1",
  size = "lg",
  className = "",
  children,
}: {
  as?: "h1" | "h2";
  size?: keyof typeof SIZE;
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={`font-display font-bold [word-break:keep-all] ${SIZE[size]} ${className}`}>{children}</Tag>;
}
