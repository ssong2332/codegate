"use client";

// 시안 E2 준비 화면(UX D-141 (5) · D-142 · §97.7 · §99) — 난이도 화면에서 "이걸로 시작"을 누른 뒤 세션이 만들어지는 동안
// (createSession 대기) 화면 전체에 그린다. 세션 전 화면이다(훈련 화면 아님 — 통화 · 메신저는 무변경).
// 짙은 남색 바탕 · **실제 준비 단계 3줄**(서버가 끝낸 단계만 체크 — 스트리밍 신호 · 최종 응답) · 고른 난이도 설명 ·
// 시나리오 유형에 맞춘 예방 요령(5초마다 교체 · §99.5) · 오래 걸릴 때만 안심 문구(D-134 SESSION_PREP_HINTS).
// ⛔ 경과 초 · 예상 시간 · 진행률 · 퍼센트 · "1/3" 표기 금지(D-142 · D-134). 시간이 지났다고 체크하지 않는다.
import { useEffect, useRef, useState } from "react";
import { LineIcon, LoadingDots } from "@/components/ui";
import { useLoadingHint } from "@/components/ui/LoadingStatus";
import { SESSION_PREP_HINTS } from "@/lib/motion/routeMotion";
import {
  prepAnnouncement,
  prepStepState,
  prepStepsFor,
  prepTipIndex,
  prepTipsFor,
  slowPrepHints,
} from "@/lib/design/e2Prep";

const SLOW_HINTS = slowPrepHints(SESSION_PREP_HINTS);

export default function TrainingPrepScreen({
  meta,
  scenarioId,
  channel,
  doneCount,
  difficultyLabel,
  difficultyNote,
}: {
  /** 유형 · 시나리오 · 난이도 한 줄 */
  meta: string;
  /** 요령을 시나리오의 사칭 유형에 맞춰 고른다(§99.5). */
  scenarioId: string;
  channel: "voice" | "messenger";
  /** 서버가 실제로 끝낸 준비 단계 수(앞에서부터 — `advancePrepDone`). */
  doneCount: number;
  difficultyLabel: string;
  difficultyNote: string;
}) {
  const [tipElapsed, setTipElapsed] = useState(0);
  const hint = useLoadingHint(SLOW_HINTS);
  // 리뷰 Major — 누른 "이걸로 시작"이 사라져 포커스가 길을 잃지 않게 제목으로 옮긴다(낭독: "훈련을 준비하고 있어요").
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // 예방 요령을 돌리는 데만 쓴다(화면에 시간을 그리지 않는다).
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setTipElapsed(Date.now() - startedAt), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const steps = prepStepsFor(channel);
  const tips = prepTipsFor(scenarioId, channel);
  const tip = tips[prepTipIndex(tipElapsed, tips.length)];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 bg-deep px-[22px] pb-[calc(env(safe-area-inset-bottom)+24px)] pt-10 text-white">
      <p className="e2-rise text-[15px] font-bold text-brand-tint [word-break:keep-all]">{meta}</p>
      <h1 ref={headingRef} tabIndex={-1} className="e2-rise font-display text-[30px] font-bold leading-[1.3] tracking-[-0.02em] outline-none [word-break:keep-all]">
        훈련을 준비하고 있어요
      </h1>
      {/* 단계 변화 낭독 — 라이브 영역은 처음부터 두고 안쪽 문구만 바꾼다(방금 끝난 단계 + 지금 하는 단계). */}
      <p role="status" aria-live="polite" className="sr-only">
        {prepAnnouncement(steps, doneCount)}
      </p>
      <ol className="flex flex-col gap-4" aria-label="준비 단계">
        {steps.map((step, index) => {
          const state = prepStepState(index, doneCount);
          return (
            <li key={step.stage} className="flex min-h-[44px] items-center gap-3">
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  state === "done"
                    ? "bg-sand text-deep"
                    : state === "active"
                      ? "border-2 border-sand text-sand"
                      : "border-2 border-brand-tint/40"
                }`}
              >
                {state === "done" ? (
                  <LineIcon name="check" size={20} className="check-pop" />
                ) : state === "active" ? (
                  <LoadingDots />
                ) : null}
              </span>
              <span
                className={`text-[19px] leading-[1.5] [word-break:keep-all] ${
                  state === "waiting" ? "text-brand-tint/70" : state === "active" ? "font-bold text-white" : "text-white"
                }`}
              >
                {state === "done" ? step.done : state === "active" ? step.active : step.waiting}
                <span className="sr-only">{state === "done" ? " — 끝남" : state === "active" ? " — 하는 중" : " — 기다리는 중"}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {/* 오래 걸릴 때만(8초 · 20초) 안심 문구. */}
      <p role="status" aria-live="polite" className="text-[17px] leading-[1.6] text-brand-tint [word-break:keep-all]">
        {hint && (
          <span key={hint} className="motion-reveal block">
            {hint}
          </span>
        )}
      </p>
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
