"use client";

// 인증 게이팅 (Track C, T18, AC-027) — Architecture.md §7 "클라: 인증 안 된 사용자는 /login
// 외 모든 라우트 접근 시 리다이렉트". 정적 export(next.config.ts) 구성이라 서버 미들웨어를
// 쓸 수 없어 클라 컴포넌트로 구현하고, 루트 레이아웃(src/app/layout.tsx)에서 전역 1회 적용한다.
//
// T128(Architecture.md §34.4) — **훈련·리포트 화면에서의 예외 1건**. 인증이 훈련 한가운데서
// 무효화되면(계정 삭제·비활성·강제 폐기 → Firebase SDK가 스스로 signOut한다, §34.2 (가)(다))
// 아래 `:42`의 `return null`이 화면 트리를 통째로 언마운트해 **실시간 세션·마이크·타이머가 끊긴다**
// (G10과 같은 형태). 그래서 §34.4 표가 지정한 경로 집합(TRAINING_PATHS·RECOVERABLE_PATHS)에서만
// 리다이렉트·언마운트를 보류하고 **비차단 배너**를 형제 노드로 띄운다(G151).
// ⛔ 그 밖의 경로는 전부 현행 그대로다(§34.4 표 1·7행) — 표를 넓히지 말 것(G152).
// ⛔ 배너 상태에서는 새 콜러블이 시작되지 않으므로(U1) AC-027이 금지한 "미인증 사용자의 다음 단계
//    진행"은 여전히 불가능하고, AC-007(세션당 1리포트) 불변식도 손상되지 않는다(§34.4 U2).
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "./useCurrentUser";
import { useAuthInvalidation } from "@/lib/authinvalidation";
import AuthInvalidationBanner from "@/components/AuthInvalidationBanner";

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
  const invalidation = useAuthInvalidation({ user, loading, pathname });
  // 배너가 떠 있는 동안에만 "지금 열려 있는 그 화면"을 붙잡는다. 라우트가 바뀌면 mode가 그 즉시
  // "none"으로 돌아가 현행 규칙이 복귀한다(§34.4 U3 — 예외는 이동에는 붙지 않는다).
  const holdCurrentScreen = invalidation.mode !== "none";

  useEffect(() => {
    if (loading) return;

    if (!user && !isPublicPath && !holdCurrentScreen) {
      router.replace("/login");
      return;
    }

    if (user && pathname === "/login") {
      router.replace(POST_LOGIN_PATH);
    }
  }, [loading, user, pathname, isPublicPath, holdCurrentScreen, router]);

  // 인증 판정 전이거나 리다이렉트 대상인 화면은 아무것도 렌더링하지 않아
  // 보호된 콘텐츠가 잠깐이라도 노출되는 것을 막는다.
  if (loading) return null;
  if (!user && !isPublicPath && !holdCurrentScreen) return null;
  if (user && pathname === "/login") return null;

  // ⛔ 배너는 **형제 노드**다(G151). `{children}`을 감싸지 않고, 슬롯 개수도 항상 2로 고정이라
  // (배너는 mode==="none"이면 스스로 null을 반환한다) 아래 트리가 다시 마운트되지 않는다.
  return (
    <>
      <AuthInvalidationBanner state={invalidation} />
      {children}
    </>
  );
}
