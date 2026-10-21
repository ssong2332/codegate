"use client";

// 시안 E2 선택 화면 머리(UX D-141 (1)(2) · §97) — 유형 · 체험/보내기 · 방식 · 시나리오 · 난이도 공용.
// 뒤로(48px) · 단계 표시(글자 — P-12 #2, aria-current="step") · 함렛 30px 화면 제목(keep-all) · 짧은 안내.
// 아래에 오는 판 목록(PanelList)은 화면 가장자리까지 닿으므로 이 머리만 좌우 22px 여백을 가진다.
// 뒤로는 기본 `router.back()`(브라우저 뒤로가기와 같은 단계 — P-12). 목적지가 정해진 화면만 `onBack`을 넘긴다.
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DisplayTitle } from "@/components/ui";

export default function SelectScreenHeader({
  step,
  title,
  children,
  onBack,
}: {
  /** 지금까지의 선택 경로 + 현재 단계(글자) */
  step: ReactNode;
  title: ReactNode;
  /** 제목 아래 안내(선택) */
  children?: ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <header className="flex flex-col gap-2 px-[22px] pb-4 pt-3">
      <button
        type="button"
        onClick={onBack ?? (() => router.back())}
        className="-ml-2 flex min-h-[48px] w-fit items-center gap-1 rounded-lg px-2 text-lg font-medium text-ink-sub hover:bg-neutral-tint"
      >
        <span aria-hidden="true">←</span> 뒤로
      </button>
      <p className="e2-rise text-[17px] font-semibold leading-[1.5] text-brand [word-break:keep-all]" aria-current="step">
        {step}
      </p>
      <DisplayTitle size="lg" className="e2-rise text-ink">
        {title}
      </DisplayTitle>
      {children && (
        <div className="e2-rise flex flex-col gap-2 text-[17px] leading-[1.6] text-ink-sub [word-break:keep-all]">{children}</div>
      )}
    </header>
  );
}
