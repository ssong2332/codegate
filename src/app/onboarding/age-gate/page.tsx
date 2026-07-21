"use client";

// UX-011 연령 확인(age-gate) (P1, Track C, T14, AC-014).
//
// 배치 판단(구현 보고서 참조): UX.md UX-011 Entry "UX-001 이전 또는 직후" 중 "직후"를 택했다 —
// UX-001(동의) 다음에 끼워 넣는다. **Phase B(2026-07-22) 갱신**: 원래 Exit은 "통과 → UX-002(녹음)"
// 였으나, 시나리오 선택(UX-004)이 이제 녹음보다 먼저 온다(voiceMode:"generic" 시나리오는 녹음
// 자체를 생략하므로 먼저 골라야 분기가 가능하다) — Exit을 `/scenarios`로 변경. `/onboarding/record`
// 진입 가드는 여전히 age-gate 통과 여부를 확인하므로 URL 직접 접근 우회는 그대로 막혀 있다
// (AC-014 "접근을 제한"의 실효성 유지).
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
          router.replace("/scenarios");
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
        <AgeGate uid={user.uid} onPass={() => router.push("/scenarios")} />
      )}
    </main>
  );
}
