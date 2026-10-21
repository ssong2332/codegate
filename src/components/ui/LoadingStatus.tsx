"use client";

// 공용 로딩 표현(UX D-134) — 시안 A "공공 안심형"에 맞춰 회전 스피너 대신 차례로 밝아지는 점 3개를 쓴다.
// - `LoadingDots`: 버튼 안 · 문장 앞에 붙이는 작은 점(장식 — 스크린리더에는 숨긴다).
// - `LoadingStatus`: 화면 가운데 대기 블록. `hints`를 주면 경과 시간에 따라 안심 문구를 덧붙인다
//   (⛔ 진행률 · 단계 완료 표시 없음 — `pickLoadingHint` 참고).
// reduced-motion이면 점이 멈춘 채로 보인다(motion.css).
import { useEffect, useState } from "react";
// ⚠️ 상대 경로 — ui 배럴은 렌더 하네스(`renderHarness.ts`, 별칭 해석 없음)가 불러온다.
import { pickLoadingHint, type LoadingHint } from "../../lib/motion/routeMotion";

export function LoadingDots({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex items-center gap-[5px] ${className}`}>
      <span className="loading-dot h-[7px] w-[7px] rounded-full bg-current" />
      <span className="loading-dot h-[7px] w-[7px] rounded-full bg-current" />
      <span className="loading-dot h-[7px] w-[7px] rounded-full bg-current" />
    </span>
  );
}

/**
 * 경과 시간에 맞는 안내 문구(없으면 null). 시간은 이 훅을 쓰는 컴포넌트가 **마운트된 때부터** 잰다 —
 * 대기가 시작될 때 마운트되는 자리에서만 쓴다. 1초마다 다시 계산하고, 문구가 같으면 다시 그리지 않는다.
 */
export function useLoadingHint(hints: readonly LoadingHint[] | undefined): string | null {
  const [hint, setHint] = useState<string | null>(() => (hints ? pickLoadingHint(hints, 0) : null));
  useEffect(() => {
    if (!hints) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setHint(pickLoadingHint(hints, Date.now() - startedAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hints]);
  return hint;
}

/** 버튼 아래에 붙는 대기 안내(마운트 = 대기 시작). 진행률 없음. */
export function LoadingHintLine({ hints, className = "" }: { hints: readonly LoadingHint[]; className?: string }) {
  const hint = useLoadingHint(hints);
  // 라이브 영역은 그대로 두고 안쪽 문구만 바꿔 끼운다(문구가 바뀔 때마다 읽히고, 등장 모션이 다시 돈다).
  return (
    <p role="status" aria-live="polite" className={`text-[16px] leading-relaxed text-ink-sub ${className}`}>
      {hint && (
        <span key={hint} className="motion-reveal block">
          {hint}
        </span>
      )}
    </p>
  );
}

export default function LoadingStatus({
  label,
  hints,
  className = "",
}: {
  label: string;
  hints?: readonly LoadingHint[];
  className?: string;
}) {
  const hint = useLoadingHint(hints);
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center gap-3 text-center ${className}`}>
      <LoadingDots className="text-brand" />
      <p className="text-lg text-ink">{label}</p>
      {hint && (
        <p key={hint} className="motion-reveal max-w-[22rem] text-[16px] leading-relaxed text-ink-sub">
          {hint}
        </p>
      )}
    </div>
  );
}
