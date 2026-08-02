"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/auth";
import { hasGrantedConsent } from "@/lib/consent";
import { hasVerifiedAge } from "@/lib/age";

// 루트 진입점. RouteGuard(lib/auth/RouteGuard.tsx)는 "/"가 PUBLIC_PATHS에 없어 비로그인
// 사용자를 이 화면이 그려지기 전에 이미 /login으로 보낸다 — 즉 이 화면의 콘텐츠가 실제로
// 렌더되는 것은 "로그인된 사용자가 '/'로 직접 이동한" 경우뿐이다.
//
// 사용자 요청(2026-08-02) — 이미 온보딩(동의+연령 확인)을 마친 사용자는 유형 선택 화면
// (`/scenarios`, "보이스피싱/메신저피싱 고르기")으로 바로 가야 한다. `/scenarios`는 자체
// 게이트가 없다(온보딩 여부는 상류 화면만 확인한다, `onboarding/age-gate/page.tsx` 동일 패턴).
// 그래서 여기서 무조건 `/onboarding/consent`로 보내던 것을 age-gate와 같은 2단계 체크
// (동의 → 연령)로 바꿔, 둘 다 통과한 사용자만 `/scenarios`로 직행시키고 — 하나라도 미완료면
// 그 게이트로 보내 기존 보호를 그대로 유지한다(AC-012/AC-017 우회 금지). 렌더 여부는 `loading`/
// `user`만으로 파생된다(state 불필요) — 로그인 사용자는 리다이렉트가 끝나기 전까지 null만 그린다.
export default function Home() {
  const { user, loading } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const granted = await hasGrantedConsent(user.uid);
        if (cancelled) return;
        if (!granted) {
          router.replace("/onboarding/consent");
          return;
        }
        const ageVerified = await hasVerifiedAge(user.uid);
        if (cancelled) return;
        router.replace(ageVerified ? "/scenarios" : "/onboarding/age-gate");
      } catch {
        // 조회 실패 시 안전한 기본값은 "가장 상류 게이트로 보낸다"다 — 동의를 이미 마친
        // 사용자가 한 번 더 보는 쪽이, 미동의 사용자를 건너뛰는 쪽보다 낫다(consent/page.tsx
        // 의 동일한 폴백 판단).
        if (!cancelled) router.replace("/onboarding/consent");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, router]);

  // 로딩 중이거나 로그인 사용자(게이트 조회·리다이렉트 중)면 아무것도 그리지 않아 스텁·중간
  // 상태가 잠깐이라도 노출되는 것을 막는다(RouteGuard의 동일한 "판정 전엔 null" 원칙). 여기
  // 도달하는 것은 로딩이 끝나고 비로그인일 때뿐이다.
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
