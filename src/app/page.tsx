"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/auth";

// 루트 진입점. RouteGuard(lib/auth/RouteGuard.tsx)는 "/"가 PUBLIC_PATHS에 없어 비로그인
// 사용자를 이 화면이 그려지기 전에 이미 /login으로 보낸다 — 즉 이 화면의 콘텐츠가 실제로
// 렌더되는 것은 "로그인된 사용자가 '/'로 직접 이동한" 경우뿐이다. 그런데 아래 카드는 원래
// "로그인하고 시작하기" 링크만 있었다 — 이미 로그인한 사용자에게 다시 로그인을 권하는
// 화면이 되어 있었다(N-1, 자체 감사에서 발견). RouteGuard가 /login에서 로그인 사용자를
// 이미 POST_LOGIN_PATH로 튕기는 것과 같은 목적지로, 여기서도 직접 리다이렉트한다.
export default function Home() {
  const { user, loading } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/onboarding/consent");
    }
  }, [loading, user, router]);

  // 로딩 중이거나 로그인 사용자(곧 리다이렉트됨)는 아무것도 그리지 않아 스텁이 잠깐이라도
  // 노출되는 것을 막는다(RouteGuard의 동일한 "판정 전엔 null" 원칙).
  if (loading || user) return null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#FAF8F5] p-8 text-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-[#E4F0EC]">
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
      <div className="flex flex-col gap-2">
        <h1 className="text-[24px] font-bold leading-[1.35] text-[#22303A]">
          안 당해본 사기는 못 막는다
        </h1>
        <p className="text-[15px] leading-[1.6] text-[#6B655C]">
          미리 겪어보고 대처법을 익히는 AI 금융사기 훈련
        </p>
      </div>
      <Link
        href="/login"
        className="flex min-h-[56px] w-full max-w-xs items-center justify-center rounded-[14px] bg-[#0E6B62] px-6 text-[17px] font-semibold text-white transition-colors hover:bg-[#0B564F]"
      >
        로그인하고 시작하기
      </Link>
    </main>
  );
}
