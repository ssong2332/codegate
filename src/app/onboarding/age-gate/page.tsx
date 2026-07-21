"use client";

// UX-011 연령 확인(age-gate) (P1, Track C, T14, AC-014).
//
// 배치 판단(구현 보고서 참조): UX.md UX-011 Entry "UX-001 이전 또는 직후" 중 "직후"를 택했다 —
// 같은 문서의 Exit이 "통과 → UX-002"로 명시돼 있어, UX-001(동의) 다음·UX-002(녹음) 이전에
// 끼워 넣어야 그 Exit 타깃과 그대로 정합한다(만약 UX-001 이전에 두면 Exit이 자연히 UX-001이
// 돼야 해 문서 기술과 어긋난다). 기존 온보딩 플로우(로그인→동의→녹음)를 깨지 않기 위해
// consent/page.tsx의 다음 이동만 이 화면으로 바꾸고(1줄), record/page.tsx 진입 가드에도 동일한
// "미충족 시 리다이렉트" 패턴으로 연령 확인 여부를 추가해 URL 직접 접근으로 이 화면을 건너뛸 수
// 없게 했다(AC-014 "접근을 제한"의 실효성 확보 — 최소 연결).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/auth";
import { hasGrantedConsent } from "@/lib/consent";
import { hasVerifiedAge } from "@/lib/age";
import AgeGate from "@/components/AgeGate";

type GateState = "checking" | "ready" | "redirecting" | "check-error";

export default function AgeGatePage() {
  const { user, loading: userLoading } = useCurrentUser();
  const router = useRouter();
  const [gateState, setGateState] = useState<GateState>("checking");

  useEffect(() => {
    if (userLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        // UX-001(동의) 완료 전이면 이 화면에 머무를 수 없다(record/page.tsx와 동일한 순서 보장).
        const granted = await hasGrantedConsent(user.uid);
        if (cancelled) return;
        if (!granted) {
          setGateState("redirecting");
          router.replace("/onboarding/consent");
          return;
        }
        // 이미 통과한 사용자는 재질문 없이 다음 화면으로(ageVerified는 세션이 아닌 계정 단위 플래그).
        const alreadyVerified = await hasVerifiedAge(user.uid);
        if (cancelled) return;
        if (alreadyVerified) {
          setGateState("redirecting");
          router.replace("/onboarding/record");
          return;
        }
        setGateState("ready");
      } catch {
        if (!cancelled) setGateState("check-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, userLoading, router]);

  if (userLoading || gateState === "checking" || gateState === "redirecting") return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 p-8">
      {gateState === "check-error" && (
        <p role="alert" className="flex items-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>확인 상태를 불러오지 못했습니다. 페이지를 새로고침해 주세요.</span>
        </p>
      )}
      {gateState === "ready" && user && (
        <AgeGate uid={user.uid} onPass={() => router.push("/onboarding/record")} />
      )}
    </main>
  );
}
