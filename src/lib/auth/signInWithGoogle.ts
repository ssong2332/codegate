// Google 로그인 실행(Track C, T18, UX-013 Primary/Failure) — Architecture.md §7.
// signInWithPopup 우선, 팝업 차단 시 signInWithRedirect로 폴백(UX-013 States/Failure (b)).
// 팝업 취소(a)·네트워크/제공자 오류(c)는 구분된 결과를 반환해 화면이 각기 다른 안내를 낸다.
import { signInWithPopup, signInWithRedirect, type AuthError } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { ensureUserProfile } from "./userProfile";

export type SignInOutcome =
  | { status: "success" }
  | { status: "redirecting" } // 팝업 차단 → 리다이렉트 폴백 시작(페이지 이탈 예정)
  | { status: "cancelled" } // 사용자가 팝업을 닫음/취소
  | { status: "error"; message: string };

function isAuthError(err: unknown): err is AuthError {
  return typeof err === "object" && err !== null && "code" in err;
}

export async function signInWithGoogle(): Promise<SignInOutcome> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await ensureUserProfile(result.user);
    return { status: "success" };
  } catch (err) {
    if (!isAuthError(err)) {
      return { status: "error", message: "알 수 없는 오류가 발생했습니다. 다시 시도해 주세요." };
    }

    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
      return { status: "cancelled" };
    }

    if (err.code === "auth/popup-blocked") {
      try {
        await signInWithRedirect(auth, googleProvider);
        return { status: "redirecting" };
      } catch {
        return { status: "error", message: "로그인 페이지로 이동하지 못했습니다. 다시 시도해 주세요." };
      }
    }

    if (err.code === "auth/network-request-failed") {
      return { status: "error", message: "네트워크 연결을 확인하고 다시 시도해 주세요." };
    }

    return { status: "error", message: "Google 로그인에 실패했습니다. 다시 시도해 주세요." };
  }
}
