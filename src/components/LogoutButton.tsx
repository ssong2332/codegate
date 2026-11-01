"use client";

// 로그아웃 — 사용자 신고 2026-11-01 "로그아웃하는 기능은 없는 거 같네". 훈련 유형 선택(/scenarios) 화면 하단에 둔다.
// ⛔ 익명 사용자(가족 링크로 들어온 사람)에게는 보이지 않는다 — 익명 uid는 다시 받을 수 없어 로그아웃하면 기록을 잃는다(§34.5).
// /scenarios는 무효화 배너 대상 경로가 아니라(authInvalidation.ts isProtectedPath) 로그아웃이 '로그인이 풀렸어요' 배너로 오인되지 않는다.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

export default function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [busy, setBusy] = useState(false);
  if (!user || user.isAnonymous) return null;

  const handleLogout = async () => {
    setBusy(true);
    try {
      await signOut(auth);
      router.replace("/");
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-2 px-5 text-[15px] text-ink-sub ${className}`}>
      {user.email && <span className="truncate">{user.email}</span>}
      <button
        type="button"
        onClick={handleLogout}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center px-1 font-semibold text-ink underline-offset-2 hover:underline disabled:opacity-50"
      >
        {busy ? "로그아웃 중…" : "로그아웃"}
      </button>
    </div>
  );
}
