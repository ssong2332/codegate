"use client";

// UX-001 사전고지 + 명시적 동의 게이팅 (Track C, T3, AC-012/AC-017).
// RouteGuard(lib/auth, T18)가 이미 인증되지 않은 사용자를 /login으로 보내므로, 이 화면은
// "인증된 사용자"를 전제로 한다(UX.md UX-001 Architect Handoff Assumptions).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/auth";
import { grantConsent, hasGrantedConsent } from "@/lib/consent";
import { Banner, Button } from "@/components/ui";

// AC-012 필수 3요소: (1) 시뮬레이션임 (2) 실제 금전·자격증명 미관여 (3) 언제든 종료 가능.
const NOTICE_POINTS = [
  "이것은 실제 사기가 아니라, 미리 겪어보고 대처법을 익히는 훈련용 시뮬레이션입니다.",
  "실제 돈이 오가거나 계좌·비밀번호 같은 개인 정보가 쓰이는 일은 전혀 없습니다.",
  "훈련 중 언제든지 화면의 \"훈련 종료\" 버튼을 누르면 그 자리에서 바로 멈출 수 있습니다.",
];

// checking: 기존 동의 여부 조회 중 / ready: 미동의 — 폼 노출 / redirecting: 이미 동의 — 다음
// 화면으로 넘어가는 중이라 폼을 그리지 않음. age-gate/page.tsx의 hasVerifiedAge 스킵 패턴과 동일.
type GateState = "checking" | "ready" | "redirecting";

export default function ConsentPage() {
  const { user, loading: userLoading } = useCurrentUser();
  const router = useRouter();
  const [gateState, setGateState] = useState<GateState>("checking");
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (userLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        // 재방문 사용자는 매 로그인마다 동의를 다시 체크하지 않는다 — age-gate가 hasVerifiedAge로
        // 이미 하는 것과 같은 판단이다(동의는 계정 단위 플래그이지 세션 단위가 아니다).
        const granted = await hasGrantedConsent(user.uid);
        if (cancelled) return;
        if (granted) {
          setGateState("redirecting");
          router.replace("/onboarding/age-gate");
          return;
        }
        setGateState("ready");
      } catch {
        // 조회 실패 시 안전한 기본값은 "동의 화면을 보여준다"다 — 이미 동의한 사용자를 잘못
        // 건너뛰어 AC-012 고지를 누락시키는 쪽보다, 이미 동의한 사용자가 한 번 더 보는 쪽이 낫다.
        if (!cancelled) setGateState("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, userLoading, router]);

  const handleSubmit = async () => {
    if (!user || !checked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await grantConsent(user.uid);
      // T14: 연령 확인(UX-011)이 동의 직후·녹음 이전에 끼워 들어간다(AC-014) — 근거는
      // src/app/onboarding/age-gate/page.tsx 상단 주석 참조. record로의 직행이었던 이전 경로를
      // age-gate 경유로 1줄만 변경했다(그 외 동의 로직은 무변경).
      router.push("/onboarding/age-gate");
    } catch {
      setError("동의 저장에 실패했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
      setSubmitting(false);
    }
  };

  if (userLoading || gateState === "checking" || gateState === "redirecting") return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col bg-[#FAF8F5] px-6 pt-6">
      {/* AC-012 사전 고지 배너 — 상시 노출(닫기 불가), 아래 3개 포인트 카드를 보강하는 상단 요약. */}
      <Banner variant="caution" sticky>
        <span className="font-semibold text-[#B96A1B]">모의 훈련입니다.</span>{" "}
        지금 보시는 내용은 실제 상황이 아닙니다.
      </Banner>

      <div className="flex flex-1 flex-col gap-8 pb-10 pt-8">
        <h1 className="text-[24px] font-bold leading-[1.35] text-[#22303A]">
          시작하기 전에
          <br />
          꼭 알아두세요
        </h1>

        <div className="flex flex-col gap-3">
          {NOTICE_POINTS.map((point, index) => (
            <div
              key={point}
              className="flex items-start gap-3 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-4"
            >
              <div
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E4F0EC] text-[15px] font-bold text-[#0E6B62]"
              >
                {index + 1}
              </div>
              <p className="text-[16px] leading-[1.55] text-[#22303A]">{point}</p>
            </div>
          ))}
        </div>

        <div className="flex-1" />

        <label className="flex cursor-pointer select-none items-start gap-3 py-3">
          {/* 체크박스 크기 확대(2026-07-23 모바일 UX 개선) — 32px, 디자인 시스템 토큰과 일치.
              접근성 보존을 위해 커스텀 div 대신 네이티브 checkbox를 그대로 유지(키보드/스크린리더
              시맨틱스). accent-color + rounded로 디자인 토큰에 최대한 근접시켰다. */}
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="mt-0.5 h-8 w-8 shrink-0 rounded-[10px] accent-[#0E6B62]"
            aria-describedby="consent-checkbox-label"
          />
          <span
            id="consent-checkbox-label"
            className="text-[16px] font-semibold leading-[1.5] text-[#22303A]"
          >
            위 내용을 모두 확인했으며, 이 훈련 시뮬레이션에 참여하는 것에 동의합니다.
          </span>
        </label>

        {error && (
          <p
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="flex items-center gap-2 text-[15px] text-[#C6392F] outline-none"
          >
            <span aria-hidden="true">⚠</span>
            <span>{error}</span>
          </p>
        )}

        <Button type="button" onClick={handleSubmit} disabled={!checked || submitting || !user}>
          {submitting ? "저장 중..." : "동의하고 시작"}
        </Button>
      </div>
    </main>
  );
}
