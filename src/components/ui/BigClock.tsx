"use client";

// 시안 E2(UX D-141 · §97) — 리포트 큰 시계. 0:00에서 목표 시각까지 1.2초 동안 굴러간다(ease-out).
// 스크린리더에는 `label` + 최종 값("1분 41초")만 읽힌다(굴러가는 숫자는 aria-hidden — 값은 컴포넌트가 직접 붙인다). reduced-motion이면 처음부터 최종 값이다.
// ⚠️ 숫자 폭이 바뀌어 흔들리지 않게 tabular-nums.
import { useEffect, useState } from "react";
import { clockEase, E2_MOTION, formatClock, formatClockSpoken } from "../../lib/design/e2Layout";

export default function BigClock({ seconds, label, className = "" }: { seconds: number; label: string; className?: string }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduced = false;
    }
    // 2026-11-07 Edge 시험 판 3(큰 숫자 "1:15" · 낭독 "1분 26초") — 가려진 탭은 프레임 · 타이머가 멈추거나 늦어 숫자가 중간 값에 머문다(추정 —
    // 낭독 값과 큰 숫자는 같은 `seconds`에서 나오므로 남는 원인은 굴리기 중단뿐). 가려진 채 열리면 굴리지 않고, 다시 보이면 최종 값으로 맞춘다.
    let hidden = false;
    try {
      hidden = document.visibilityState === "hidden";
    } catch {
      hidden = false;
    }
    // reduced-motion · 0초 · 가려진 탭이면 첫 프레임에 바로 최종 값(굴리기 없음).
    const duration = reduced || hidden || seconds <= 0 ? 0 : E2_MOTION.clockMs;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = duration === 0 ? 1 : Math.min(1, (now - t0) / duration);
      setShown(Math.round(seconds * clockEase(p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // §129.10(메인 라이브 재테스트 2026-10-24 — 큰 숫자 "0:00" · 낭독 문구 "처음 속은 시각 36초") — 탭이 보이지 않거나 프레임이 멈추면
    // requestAnimationFrame이 돌지 않아 숫자가 0에 머문다(추정). 굴리기 시간이 지나면 프레임과 무관하게 최종 값으로 맞춘다.
    const settle = window.setTimeout(() => setShown(seconds), duration + 100);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        cancelAnimationFrame(raf);
        setShown(seconds);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [seconds]);

  return (
    <p className={`font-display font-bold leading-none tabular-nums ${className}`}>
      <span aria-hidden="true">{formatClock(shown)}</span>
      <span className="sr-only">{`${label} ${formatClockSpoken(seconds)}`}</span>
    </p>
  );
}
