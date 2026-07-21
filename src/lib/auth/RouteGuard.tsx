"use client";

// 인증 게이팅 (Track C, T18, AC-027) — Architecture.md §7 "클라: 인증 안 된 사용자는 /login
// 외 모든 라우트 접근 시 리다이렉트". 정적 export(next.config.ts) 구성이라 서버 미들웨어를
// 쓸 수 없어 클라 컴포넌트로 구현하고, 루트 레이아웃(src/app/layout.tsx)에서 전역 1회 적용한다.
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "./useCurrentUser";

const PUBLIC_PATHS = ["/login"];
// 재로그인(유효 세션 보유) 시 UX-013을 건너뛰고 다음 화면으로 직행(UX.md UX-013 Alternative Flow (a)).
const POST_LOGIN_PATH = "/onboarding/consent";

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (loading) return;

    if (!user && !isPublicPath) {
      router.replace("/login");
      return;
    }

    if (user && pathname === "/login") {
      router.replace(POST_LOGIN_PATH);
    }
  }, [loading, user, pathname, isPublicPath, router]);

  // 인증 판정 전이거나 리다이렉트 대상인 화면은 아무것도 렌더링하지 않아
  // 보호된 콘텐츠가 잠깐이라도 노출되는 것을 막는다.
  if (loading) return null;
  if (!user && !isPublicPath) return null;
  if (user && pathname === "/login") return null;

  return <>{children}</>;
}
