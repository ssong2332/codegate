"use client";

// 시안 E2 준비 화면(UX D-141 (5) · OQ-U106 Resolved · §97.7) — 난이도 화면에서 "이걸로 시작"을 누른 뒤 세션이 만들어지는 동안
// (createSession 대기 — 길게는 15초쯤) 화면 전체에 그린다. 세션 전 화면이다(훈련 화면 아님 — 통화 · 메신저는 무변경).
// 짙은 남색 바탕 · 모래색 큰 **경과 초** · "보통 10~15초" · 끝없이 흐르는 대기 막대(진행률 아님) · 고른 난이도 설명 ·
// 예방 요령(5초마다 교체) · 경과 시간 안심 문구(D-134 SESSION_PREP_HINTS).
// ⛔ "1/3" · 단계 완료 · 퍼센트 표기 금지(D-134). 큰 숫자는 스크린리더에 읽히지 않는다(1초마다 바뀌어 소음이 된다).
import { useEffect, useRef, useState } from "react";
import { useLoadingHint } from "@/components/ui/LoadingStatus";
import { SESSION_PREP_HINTS } from "@/lib/motion/routeMotion";
import { PREP_TIPS, PREP_USUAL_LINE, formatElapsed, prepTipIndex } from "@/lib/design/e2Prep";

export default function TrainingPrepScreen({
  meta,
  difficultyLabel,
  difficultyNote,
}: {
  /** 유형 · 시나리오 · 난이도 한 줄 */
  meta: string;
  difficultyLabel: string;
  difficultyNote: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  const hint = useLoadingHint(SESSION_PREP_HINTS);
  // 리뷰 Major — 누른 "이걸로 시작"이 사라져 포커스가 길을 잃지 않게 제목으로 옮긴다(낭독: "훈련을 준비하고 있어요").
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const tip = PREP_TIPS[prepTipIndex(elapsed)];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 bg-deep px-[22px] pb-[calc(env(safe-area-inset-bottom)+24px)] pt-10 text-white">
      <p className="e2-rise text-[15px] font-bold text-brand-tint [word-break:keep-all]">{meta}</p>
      <h1 ref={headingRef} tabIndex={-1} className="e2-rise font-display text-[30px] font-bold leading-[1.3] tracking-[-0.02em] outline-none [word-break:keep-all]">
        훈련을 준비하고 있어요
      </h1>
      {/* 라이브 영역은 처음부터 두고 안쪽 문구만 바꿔 끼운다(경과 시간 안심 문구가 바뀔 때 읽힌다). */}
      <p role="status" aria-live="polite" className="-mt-3 text-[17px] leading-[1.6] text-brand-tint [word-break:keep-all]">
        {hint && (
          <span key={hint} className="motion-reveal block">
            {hint}
          </span>
        )}
      </p>
      <p aria-hidden="true" className="font-display text-[96px] font-bold leading-none tabular-nums text-sand">
        {formatElapsed(elapsed)}
      </p>
      <p className="text-[19px] font-bold text-white">{PREP_USUAL_LINE}</p>
      {/* 대기 막대 — 진행률이 아니라 "기다리는 중" 표시(끝없이 흐른다 · reduced-motion이면 멈춘 옅은 막대). */}
      <div aria-hidden="true" className="relative h-[14px] w-full overflow-hidden bg-brand">
        <span className="e2-wait-bar absolute inset-y-0 left-0 w-2/5 bg-sand" />
      </div>
      <p className="border-l-[3px] border-sand pl-3 text-[19px] leading-[1.6] text-brand-tint [word-break:keep-all]">
        <b className="text-white">{difficultyLabel}</b>에서는 {difficultyNote}
      </p>
      <div className="flex-1" />
      <div className="-mx-[22px] min-h-[110px] bg-surface px-[22px] py-4 text-ink">
        <b className="block text-[15px] font-bold text-brand">알아두면 좋아요</b>
        <p key={tip} className="motion-reveal text-[18px] leading-[1.6] [word-break:keep-all]">
          {tip}
        </p>
      </div>
    </main>
  );
}
