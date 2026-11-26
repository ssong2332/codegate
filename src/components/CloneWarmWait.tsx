"use client";

// §143.22 — 챌린지 받는 사람이 동의한 뒤, 복제 목소리 서버가 아직 준비되지 않았을 때 벨(통화 화면) 대신 보는 대기 화면.
// 단계는 서버가 알려 준 실제 단계만 보여 준다(`cloneWarmup.ts` WARM_STAGES · 가짜 진행 막대 0). 준비되면 스스로 벨로 넘어간다.
// 접근성 — 단계가 바뀔 때마다 aria-live로 읽는다 · 움직임은 공용 loading-dot · motion-reveal(reduced-motion이면 멈춤 · motion.css).
import { useEffect, useRef, useState } from "react";
import { Banner, Button, LoadingDots } from "@/components/ui";
import {
  WARM_STAGES,
  WARM_WAIT_LIMIT_MS,
  warmStageIndex,
  type CloneWarmup,
  type WarmSnapshot,
} from "@/lib/realtime/cloneWarmup";

/** 처음 켤 때 걸리는 시간(실측 근거 · Architecture §143.22): 콜드 기동 /warm 28.1초(§143.21 전 운영 로그) + 기동 초기화 약 9초 이전
 *  · #624 뒤 콜드 통화의 받기 → 합성 준비 24.4초. 따뜻하면 몇 초. ⛔ 숫자를 바꾸면 근거도 함께 바꾼다. */
export const COLD_START_RANGE_TEXT = "처음 켤 때는 보통 30~45초 걸려요.";

export default function CloneWarmWait({
  warmup,
  displayName,
  onReady,
  onExit,
}: {
  warmup: CloneWarmup;
  displayName: string;
  onReady: () => void;
  onExit: () => void;
}) {
  const [snap, setSnap] = useState<WarmSnapshot>(() => warmup.get());
  const [now, setNow] = useState(() => Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    headingRef.current?.focus();
    const off = warmup.subscribe(setSnap);
    // 구독 전에 끝났을 수 있다(동의 처리 중 준비 완료) — 지금 값으로 한 번 맞춘다.
    const current = warmup.get();
    if (current.decision === "advance") readyRef.current();
    return () => {
      off();
    };
  }, [warmup]);

  useEffect(() => {
    if (snap.decision === "advance") readyRef.current();
  }, [snap.decision]);

  const waiting = snap.decision === "wait";
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [waiting]);

  const failed = snap.decision === "give-up";
  const current = warmStageIndex(snap.stage);
  const elapsedSec = Math.max(0, Math.floor((now - snap.startedAtMs) / 1000));
  const limitSec = WARM_WAIT_LIMIT_MS / 1000;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 bg-page p-6">
      <Banner variant="caution">
        <span className="font-semibold text-caution">아직 전화가 오지 않았어요.</span> 준비가 끝나면 훈련 전화가 바로 걸려
        와요.
      </Banner>

      <header className="flex flex-col gap-2">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold leading-relaxed text-ink outline-none">
          {failed ? "목소리를 준비하지 못했어요" : "목소리를 준비하고 있어요"}
        </h1>
        <p className="text-[17px] leading-[1.6] text-ink-sub">
          {failed ? (
            "서버가 제때 준비되지 않았어요. 다시 시도하거나, 나중에 같은 링크로 다시 들어와 주세요."
          ) : (
            <>
              <span className="font-semibold text-ink">{displayName}</span>님 목소리로 전화하려고 서버를 켜는 중이에요. 이 화면을
              닫지 말고 기다려 주세요.
            </>
          )}
        </p>
      </header>

      <ol aria-label="준비 단계" className="flex flex-col rounded-[8px] border-[1.5px] border-line bg-white px-4 py-2">
        {WARM_STAGES.map((stage, i) => {
          const done = i < current || (i === current && stage.phase === "ready");
          const active = i === current && !done && !failed;
          const stuck = i === current && failed;
          const last = i === WARM_STAGES.length - 1;
          return (
            <li key={stage.phase} className="relative flex min-h-[52px] items-center gap-3" aria-current={active ? "step" : undefined}>
              {!last && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[11px] top-[38px] h-[calc(100%-24px)] w-[2px] ${done ? "bg-brand" : "bg-line"}`}
                />
              )}
              <span
                aria-hidden="true"
                className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  done
                    ? "bg-brand text-white"
                    : active
                      ? "border-2 border-brand bg-brand-tint"
                      : stuck
                        ? "border-2 border-danger bg-white"
                        : "border-2 border-line bg-white"
                }`}
              >
                {done && (
                  <svg key="check" className="motion-reveal" width="12" height="12" viewBox="0 0 13 13" fill="none">
                    <path d="M2.5 7L5.2 9.7L10.5 3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {active && <span className="h-2 w-2 rounded-full bg-brand" />}
                {stuck && <span className="h-2 w-2 rounded-full bg-danger" />}
              </span>
              <span
                className={`flex-1 text-[17px] ${
                  active ? "font-semibold text-ink" : done ? "font-medium text-ink" : stuck ? "font-semibold text-danger" : "text-ink-sub"
                }`}
              >
                {stage.label}
                <span className="sr-only">{done ? " — 완료" : active ? " — 진행 중" : stuck ? " — 멈춤" : " — 대기"}</span>
              </span>
              {active && <LoadingDots className="text-brand" />}
            </li>
          );
        })}
      </ol>

      {/* 단계가 바뀔 때만 읽힌다(경과 초는 읽지 않는다 — 1초마다 읽으면 소음). */}
      <p role="status" aria-live="polite" className="sr-only">
        {failed ? "목소리를 준비하지 못했어요." : `${WARM_STAGES[current].label}`}
      </p>

      {!failed && (
        <p className="text-[16px] leading-relaxed text-ink-sub">
          <span className="font-semibold tabular-nums text-ink">{elapsedSec}초</span> 지났어요.{" "}
          {elapsedSec < 45 ? COLD_START_RANGE_TEXT : `조금 더 걸리고 있어요. ${limitSec}초까지 기다려 볼게요.`}
        </p>
      )}

      {failed ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="sr-only">
            목소리를 준비하지 못했어요. 다시 시도하거나 나갈 수 있어요.
          </p>
          <Button type="button" onClick={() => warmup.retry()}>
            다시 시도
          </Button>
          <Button type="button" variant="secondary" onClick={onExit}>
            나가기
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onExit}
          className="min-h-[48px] w-fit rounded-lg px-2 text-[15px] font-semibold text-ink-sub underline hover:bg-neutral-tint"
        >
          기다리지 않고 나가기
        </button>
      )}
    </main>
  );
}
