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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-bold">로그인</h1>
      <p className="max-w-sm text-base text-gray-600">
        Google 계정으로 로그인하면 훈련 기록이 내 계정에 안전하게 저장됩니다.
      </p>

      <button
        type="button"
        onClick={handleSignIn}
        disabled={isLoading}
        aria-label="Google 계정으로 로그인"
        aria-busy={isLoading}
        className="flex min-h-[48px] w-full max-w-xs items-center justify-center gap-3 rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isLoading && (
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
          />
        )}
        {isLoading ? "로그인 처리 중..." : "Google로 로그인"}
      </button>

      {viewState === "error" && errorMessage && (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="flex max-w-xs items-center gap-2 text-base text-red-700 outline-none"
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
