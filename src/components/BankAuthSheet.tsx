"use client";

// ⭐ 이체 생체 인증 시트(2026-11-07 실기기 신고 — "생체인식 관련 화면에서도 별 모션 없이 그냥 넘어가잖아").
// 두 이체 화면(`MessengerFakeLanding` 훈련용 이체 · `BankAppOverlay` 내 은행 송금)이 같이 쓴다. 단계 · 시간 · 문구는 `@/lib/bankapp/bankAuth`(판정표 B).
//
// | 수단 | 모양 |
// |---|---|
// | 지문(One UI형 · 기본) | 아래에서 올라오는 생체 인증 시트 · 화면 아래 센서 자리(지문 아이콘)를 길게 누르면 고리가 차오른다 → 체크 · 일찍 떼면 흔들림 + 안내 |
// | 얼굴(iOS형) | 가운데 둥근 사각 표시 · 얼굴 윤곽이 스캔하듯 움직인다 → 체크(열리면 바로 시작) |
//
// ⛔ 숫자 · 비밀번호 입력 0(BA3). ⛔ 서버 호출 0 — 성공은 `onSuccess` 한 번(호출부가 종전 제출 콜백을 부른다).
// ⚠️ 상대 경로로만 import한다 — `MessengerFakeLanding`의 렌더 게이트 하네스가 CJS require로 따라와 `@/` 별칭을 풀지 못한다.
// ⚠️ 모션은 CSS 키프레임만(`globals.css` `bank-*` — reduced-motion이면 정지 · G457). JS는 단계 전환 타이머(setTimeout)뿐 — 프레임 루프 0(§23.6 A1).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BANK_AUTH_COPY as COPY,
  INITIAL_AUTH_STATE,
  authTimings,
  nextAuthState,
  type AuthEvent,
  type AuthMethod,
  type AuthState,
} from "../lib/bankapp/bankAuth";

type Props = {
  method: AuthMethod;
  /** 시트 부제(이 앱 이름 — "새솔은행"). */
  appName: string;
  /** 무엇을 인증하는지 한 줄("김민서님께 9,800,000원 이체"). */
  summary: string;
  /** 인증 성공(체크 표시가 끝난 뒤 한 번). 인자 = 그 순간의 `performance.now()`(제출 이벤트 시각 대용 — 값 입력 0). */
  onSuccess: (timeStamp: number) => void;
  /** 취소(기록 0 — 확인 화면으로 돌아간다). */
  onCancel: () => void;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

/** 움직임 줄이기 설정(서버 렌더 = 끔 · 기기 설정이 바뀌면 따라간다). */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/** 지문 모양(선 아이콘 · 자체 도형). */
function FingerprintGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M14 13.5a15 15 0 0 1 20 0" />
      <path d="M10.5 19.5a15.5 15.5 0 0 1 27 0" />
      <path d="M15.5 37c-2.3-3.4-3.5-7-3.5-10.5a12 12 0 0 1 24 0v1.2" />
      <path d="M20 39.5c-2-3.4-3-7-3-11a7 7 0 0 1 14 0c0 3 .6 6 1.8 8.5" />
      <path d="M24 26.5c0 5 1.3 9.4 4 13" />
      <path d="M35.8 33.5c.2-1.6.2-3.2.2-4.6" />
    </svg>
  );
}

/** 얼굴 윤곽(모서리 괄호 + 눈 · 코 · 입 — 자체 도형). */
function FaceGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 18V12a6 6 0 0 1 6-6h6M46 6h6a6 6 0 0 1 6 6v6M58 46v6a6 6 0 0 1-6 6h-6M18 58h-6a6 6 0 0 1-6-6v-6" />
      <path d="M23 24v4M41 24v4" />
      <path d="M32 24v11h-3" />
      <path d="M24 43c4.5 3.5 11.5 3.5 16 0" />
    </svg>
  );
}

function CheckGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="bank-check-draw" d="M5 12.5l4.5 4.5L19 7.5" pathLength={24} strokeDasharray={24} />
    </svg>
  );
}

export default function BankAuthSheet({ method, appName, summary, onSuccess, onCancel }: Props) {
  const reduced = usePrefersReducedMotion();
  const timings = authTimings(reduced);
  // 얼굴은 열리는 순간부터 스캔이다(판정표 B1 — 처음 상태로 둔다).
  const [state, setState] = useState<AuthState>(() => (method === "face" ? nextAuthState(INITIAL_AUTH_STATE, "touch-start") : INITIAL_AUTH_STATE));
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 성공 뒤에는 취소 · Esc를 받지 않는다(완료 콜백과 취소가 겹치지 않게).
  const doneRef = useRef(false);
  const firedRef = useRef(false);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onCancelRef.current = onCancel;
  });

  const dispatch = useCallback((event: AuthEvent) => setState((current) => nextAuthState(current, event)), []);

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  // 초점 · Esc(이 시트만 닫는다 — 화면 전체 닫기보다 먼저 window 캡처에서 멈춘다).
  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (!doneRef.current) onCancelRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  // 얼굴 — 열리면 바로 스캔(판정표 B1 → B3 · 스캔 시작은 처음 상태).
  useEffect(() => {
    if (method !== "face") return;
    const timer = setTimeout(() => dispatch("scan-complete"), timings.faceScanMs);
    return () => clearTimeout(timer);
  }, [method, dispatch, timings.faceScanMs]);

  // 성공 — 체크를 보여 준 뒤 한 번만 알린다(개발 모드 효과 두 번 실행에도 한 번 — 타이머 안에서 막는다).
  useEffect(() => {
    if (state.phase !== "success") return;
    doneRef.current = true;
    const timer = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      onSuccessRef.current(performance.now());
    }, timings.successHoldMs);
    return () => clearTimeout(timer);
  }, [state.phase, timings.successHoldMs]);

  // 지문 실패 — 짧은 진동(지원 기기만 · iOS형은 이 수단을 쓰지 않는다).
  useEffect(() => {
    if (state.phase !== "failed" && state.phase !== "locked") return;
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(80);
    } catch {
      // 진동 미지원 · 거부 — 무시(화면 안내가 같은 일을 한다).
    }
  }, [state.phase, state.fails]);

  // ── 지문 센서 누름(길게 누르기) ─────────────────────────────────────────────────────────────────
  const startHold = () => {
    if (state.phase !== "prompt" && state.phase !== "failed") return;
    dispatch("touch-start");
    clearHold();
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      dispatch("scan-complete");
    }, timings.fingerprintHoldMs);
    // 키보드 · 보조기기는 손을 떼는 사건(pointerup)이 없다 — 그대로 끝까지 스캔한다.
  };
  const endHold = () => {
    if (!holdTimer.current) return; // 이미 끝났다(성공) · 시작 안 했다
    clearHold();
    dispatch("touch-end");
  };

  const phase = state.phase;
  const busy = phase === "success";
  const fingerprintMessage =
    phase === "scanning"
      ? COPY.fingerprintScanning
      : phase === "failed"
        ? COPY.fingerprintFailed
        : phase === "locked"
          ? COPY.locked
          : phase === "success"
            ? COPY.success
            : COPY.fingerprintPrompt;

  if (method === "face") {
    return (
      <div className="fixed inset-0 z-[80] mx-auto flex w-full max-w-[430px] items-center justify-center" role="presentation">
        <div className="bank-sheet-dim absolute inset-0 bg-black/30" aria-hidden="true" />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bank-auth-title"
          className="bank-hud-in relative flex h-[168px] w-[168px] flex-col items-center justify-center gap-3 rounded-[28px] bg-[rgba(242,242,247,0.94)] text-[#1C1C1E] shadow-xl backdrop-blur"
        >
          <h2 ref={titleRef} id="bank-auth-title" tabIndex={-1} className="sr-only outline-none">
            {COPY.title} · {appName} · {summary}
          </h2>
          <span className={phase === "success" ? "bank-pop text-[#34C759]" : "bank-face-scan text-[#1C1C1E]"}>
            {phase === "success" ? <CheckGlyph size={64} /> : <FaceGlyph size={64} />}
          </span>
          <p role="status" aria-live="polite" className="text-[15px] font-semibold">
            {phase === "success" ? COPY.success : COPY.faceScanning}
          </p>
        </div>
      </div>
    );
  }

  // 지문(One UI형 · 기본) — 아래에서 올라오는 시트 · 센서 자리는 화면 아래쪽(화면 내장 센서 위치 근사).
  const ringColor = phase === "failed" || phase === "locked" ? "#D93025" : "#1A73E8";
  const ringLength = 2 * Math.PI * 44;
  return (
    <div className="fixed inset-0 z-[80] mx-auto flex w-full max-w-[430px] flex-col justify-end" role="presentation">
      <div className="bank-sheet-dim absolute inset-0 bg-black/45" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-auth-title"
        className="bank-sheet-up relative flex flex-col items-center gap-1 rounded-t-[26px] bg-[#FCFCFF] px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-6 text-center text-[#1F1F1F]"
      >
        <h2 ref={titleRef} id="bank-auth-title" tabIndex={-1} className="text-[20px] font-bold outline-none">
          {COPY.title}
        </h2>
        <p className="text-[15px] text-[#444]">{appName}</p>
        <p className="text-[14px] tabular-nums text-[#5F6368] [word-break:keep-all]">{summary}</p>
        <p
          key={`${phase}-${state.fails}`}
          role="status"
          aria-live="polite"
          className={`mt-5 min-h-[40px] text-[15px] [word-break:keep-all] ${phase === "failed" ? "bank-shake" : ""}`}
          style={{ color: phase === "failed" || phase === "locked" ? "#D93025" : "#1F1F1F" }}
        >
          {fingerprintMessage}
        </p>
        <div className="relative mt-3 flex h-[120px] w-[120px] items-center justify-center">
          {phase === "prompt" && <span aria-hidden="true" className="bank-fp-ripple absolute inset-3 rounded-full border-2 border-[#1A73E8]" />}
          <svg aria-hidden="true" width="120" height="120" viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="#E3E7EE" strokeWidth="4" />
            {(phase === "scanning" || phase === "success") && (
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke={phase === "success" ? "#1E8E3E" : ringColor}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={ringLength}
                className={phase === "scanning" ? "bank-fp-ring" : undefined}
                style={{ ["--bank-ring" as string]: `${ringLength}`, ["--bank-hold" as string]: `${timings.fingerprintHoldMs}ms`, strokeDashoffset: 0 }}
              />
            )}
          </svg>
          <button
            type="button"
            aria-label={COPY.sensorLabel}
            disabled={phase === "locked" || busy}
            onPointerDown={(event) => {
              event.preventDefault();
              (event.currentTarget as HTMLButtonElement).setPointerCapture?.(event.pointerId);
              startHold();
            }}
            onPointerUp={endHold}
            onPointerCancel={endHold}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                event.preventDefault();
                startHold();
              }
            }}
            // 보조기기(화면 낭독기 두 번 탭)는 누르고 있을 수 없다 — 클릭 하나가 스캔 끝까지 간다.
            onClick={(event) => {
              if (event.detail === 0) startHold();
            }}
            className={`relative flex h-[92px] w-[92px] touch-none select-none items-center justify-center rounded-full [-webkit-touch-callout:none] ${phase === "scanning" ? "bank-fp-press" : ""}`}
            style={{
              color: phase === "success" ? "#1E8E3E" : phase === "failed" || phase === "locked" ? "#D93025" : "#1A73E8",
              backgroundColor: phase === "scanning" ? "#E8F0FE" : "transparent",
            }}
          >
            {phase === "success" ? (
              <span className="bank-pop">
                <CheckGlyph size={52} />
              </span>
            ) : (
              <FingerprintGlyph size={56} />
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            clearHold();
            if (!doneRef.current) onCancel();
          }}
          disabled={busy}
          className="mt-4 min-h-[48px] self-stretch rounded-full text-[16px] font-semibold text-[#1A73E8] disabled:opacity-40"
        >
          {COPY.cancel}
        </button>
      </div>
    </div>
  );
}
