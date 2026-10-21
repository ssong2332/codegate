"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/auth";
import { hasGrantedConsent } from "@/lib/consent";
import { hasVerifiedAge } from "@/lib/age";
import { Card, Chip, LineIcon } from "@/components/ui";
import LegalLinks from "@/components/LegalLinks";

// 리뷰 Major 2 — "받기"가 진짜 전화 · 문자로 읽히지 않게 앱 안 체험임을 밝힌다(PSTN 없음 · 인앱 모의).
const LANDING_STEPS = ["체험 고르기", "앱에서 전화 · 문자 체험하기", "결과와 해설 보기"] as const;

// 루트 진입점. §89.4(시안 A)부터 "/"는 공개 경로다 — 비로그인 사용자에게 소개 화면을 그린다.
// 로그인 사용자는 아래 effect가 게이트(동의 → 연령)를 조회해 다음 화면으로 보낸다(종전 그대로).
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
    // 리뷰 Minor — 익명 사용자는 RouteGuard가 /login으로 보낸다(조회 낭비 방지).
    if (loading || !user || user.isAnonymous) return;
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

  // §89.4 · UX D-132 (4) — 시안 A 1번 화면(소개). "/"를 공개 경로로 두어 비로그인 사용자가 로그인 전에 무엇을 ·
  // 어떻게 · 안전한지 세 가지를 먼저 본다. 읽기 전용 — Firestore · Functions 호출 0.
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-page">
      <header className="flex min-h-[56px] items-center gap-2 border-b border-line bg-surface px-4">
        <LineIcon name="shield" className="text-brand" />
        <p className="text-[18px] font-bold text-ink">금융사기 예방 훈련</p>
      </header>
      <div className="flex flex-1 flex-col gap-5 px-5 pt-8">
        <Chip className="self-start">연습용 · 실제 돈은 오가지 않습니다</Chip>
        <h1 className="text-[28px] font-bold leading-[1.35] text-ink">
          사기 전화, 미리 한 번 받아 보세요
        </h1>
        <p className="text-[18px] leading-[1.65] text-ink-sub">
          AI가 사기범 역할을 맡아 앱 화면 안에서 전화와 문자를 재현합니다(진짜 전화 · 문자는 오지 않습니다). 끝나면 어디서 속을 뻔했는지 짚어 드립니다.
        </p>
        <Card title="훈련 순서">
          <ol className="flex flex-col gap-2">
            {LANDING_STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <span className="w-5 font-bold text-brand">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <div className="flex flex-col gap-3 px-5 pb-8 pt-6">
        <Link
          href="/login"
          className="flex min-h-[56px] w-full items-center justify-center rounded-[8px] bg-brand px-6 text-[18px] font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          훈련 시작하기
        </Link>
        <p className="text-center text-[16px] leading-[1.6] text-ink-sub">
          가족에게 받은 훈련 링크가 있나요? 그 링크를 다시 눌러 주세요.
        </p>
      </div>
      <LegalLinks className="pb-6" />
    </main>
  );
}
