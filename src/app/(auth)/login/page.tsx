"use client";

// UX-013 로그인 — Firebase Auth Google Provider (Track C, T18, AC-027).
// Google 로그인 버튼 1개만 노출(OQ-U5 확정 — 이메일/비밀번호 폼 없음). 상태는 UX.md UX-013의
// States/Failure 스펙을 그대로 따른다: Loading(버튼 비활성+스피너) / Error(취소·팝업차단·
// 네트워크 구분 안내 + 다시 시도) / Success(RouteGuard가 다음 화면으로 이동).
import { useEffect, useRef, useState } from "react";
import { getRedirectResult } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ensureUserProfile, signInWithGoogle } from "@/lib/auth";

type ViewState = "idle" | "loading" | "error";

export default function LoginPage() {
  const [viewState, setViewState] = useState<ViewState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // UX.md Accessibility "Focus Order: 오류 발생 시 포커스를 오류 메시지로." 오류 상태 진입 시
  // 포커스를 오류 메시지로 옮겨 스크린리더/키보드 사용자가 즉시 인지하게 한다.
  useEffect(() => {
    if (viewState === "error") {
      errorRef.current?.focus();
    }
  }, [viewState]);

  useEffect(() => {
    // 팝업 차단(auth/popup-blocked)으로 signInWithRedirect 폴백을 탄 경우, 리다이렉트로
    // 되돌아온 뒤 여기서 결과를 마무리 처리한다(UX-013 Failure (b)).
    let cancelled = false;
    getRedirectResult(auth)
      .then((result) => {
        if (!cancelled && result?.user) {
          return ensureUserProfile(result.user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setViewState("error");
          setErrorMessage("Google 로그인에 실패했습니다. 다시 시도해 주세요.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignIn = async () => {
    setViewState("loading");
    setErrorMessage(null);

    const outcome = await signInWithGoogle();

    if (outcome.status === "success" || outcome.status === "redirecting") {
      // success: RouteGuard가 인증 상태 변화를 감지해 다음 화면(UX-001)으로 이동시킨다.
      // redirecting: 브라우저가 Google 로그인 페이지로 이동한다.
      return;
    }

    if (outcome.status === "cancelled") {
      setViewState("error");
      setErrorMessage("Google 로그인을 취소하셨습니다. 다시 시도해 주세요.");
      return;
    }

    setViewState("error");
    setErrorMessage(outcome.message);
  };

  const isLoading = viewState === "loading";

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col bg-[#FAF8F5] px-6 pb-10 pt-16">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-[#E4F0EC]">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 2L4 5.5V11C4 16 7.4 20.4 12 21.8C16.6 20.4 20 16 20 11V5.5L12 2Z"
              stroke="#0E6B62"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M8.5 11.5L11 14L15.5 9"
              stroke="#0E6B62"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="text-[24px] font-bold leading-[1.35] text-[#22303A]">로그인</h1>
        <p className="mt-4 max-w-sm text-[16px] leading-[1.65] text-[#6B655C]">
          Google 계정으로 로그인하면 훈련 기록이 내 계정에 안전하게 저장됩니다.
        </p>
      </div>

      <button
        type="button"
        onClick={handleSignIn}
        disabled={isLoading}
        aria-label="Google 계정으로 로그인"
        aria-busy={isLoading}
        className="flex min-h-[56px] w-full items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-[#E2DDD3] bg-white text-[17px] font-semibold text-[#22303A] transition-colors hover:border-[#C9C2B6] disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[#F2EFE9] disabled:text-[#6B655C]"
      >
        {isLoading ? (
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-[2.5px] border-[#C9C2B6] border-t-[#0E6B62]"
          />
        ) : (
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8C43.9 38 46.5 31.8 46.5 24.5z"
            />
            <path
              fill="#FBBC05"
              d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.8-6.1z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.2 0 11.4-2 15.2-5.6l-7.5-5.8c-2.1 1.4-4.8 2.2-7.7 2.2-6.3 0-11.7-3.7-13.6-9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
            />
          </svg>
        )}
        {isLoading ? "로그인 처리 중..." : "Google로 로그인"}
      </button>

      <p className="mt-4 text-center text-[13px] leading-[1.6] text-[#6B655C]">
        로그인 시 개인정보는 훈련 목적으로만 사용됩니다.
      </p>

      {viewState === "error" && errorMessage && (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="mt-4 flex items-center justify-center gap-2 text-[15px] text-[#C6392F] outline-none"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M10 1.5c-4.694 0-8.5 3.806-8.5 8.5s3.806 8.5 8.5 8.5 8.5-3.806 8.5-8.5-3.806-8.5-8.5-8.5ZM10 6a.75.75 0 0 1 .75.75v4a.75.75 0 0 1-1.5 0v-4A.75.75 0 0 1 10 6Zm0 8.5a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z"
              clipRule="evenodd"
            />
          </svg>
          <span>{errorMessage}</span>
        </p>
      )}
    </main>
  );
}
