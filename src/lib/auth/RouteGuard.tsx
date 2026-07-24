"use client";

// 인증 게이팅 (Track C, T18, AC-027) — Architecture.md §7 "클라: 인증 안 된 사용자는 /login
// 외 모든 라우트 접근 시 리다이렉트". 정적 export(next.config.ts) 구성이라 서버 미들웨어를
// 쓸 수 없어 클라 컴포넌트로 구현하고, 루트 레이아웃(src/app/layout.tsx)에서 전역 1회 적용한다.
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "./useCurrentUser";

// T37(UX-021 동의 랜딩, AC-048) — 사용자2는 "로그인 없이 링크만으로 진입"해야 한다. 동의를 탭하기
// 전까지는(익명 사인인 이전) request.auth 자체가 없으므로, 이 라우트를 PUBLIC_PATHS에 넣지 않으면
// 이 화면 자체가 /login으로 즉시 리다이렉트되어 AC-048/AC-040 전체가 성립할 수 없다. 동의 이후
// 진입하는 화면(session/play·session/end·report/replay)은 익명 인증으로 얻은 request.auth가 있어
// (§14.7/ADR-0006 A1) 별도 등록 없이도 이 가드를 통과한다 — onAuthStateChanged가 익명 사용자도
// 정상 User로 넘겨주기 때문(useCurrentUser.ts).
const PUBLIC_PATHS = ["/login", "/challenge/join"];
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
