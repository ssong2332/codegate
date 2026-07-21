"use client";

// UX-001 사전고지 + 명시적 동의 게이팅 (Track C, T3, AC-012/AC-017).
// RouteGuard(lib/auth, T18)가 이미 인증되지 않은 사용자를 /login으로 보내므로, 이 화면은
// "인증된 사용자"를 전제로 한다(UX.md UX-001 Architect Handoff Assumptions).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/auth";
import { grantConsent } from "@/lib/consent";

// AC-012 필수 3요소: (1) 시뮬레이션임 (2) 실제 금전·자격증명 미관여 (3) 언제든 종료 가능.
const NOTICE_POINTS = [
  "이것은 실제 사기가 아니라, 미리 겪어보고 대처법을 익히는 훈련용 시뮬레이션입니다.",
  "실제 돈이 오가거나 계좌·비밀번호 같은 개인 정보가 쓰이는 일은 전혀 없습니다.",
  "훈련 중 언제든지 화면의 \"훈련 종료\" 버튼을 누르면 그 자리에서 바로 멈출 수 있습니다.",
];

export default function ConsentPage() {
  const { user, loading: userLoading } = useCurrentUser();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

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

  if (userLoading) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 p-8">
      <h1 className="text-2xl font-bold">시작하기 전에 꼭 알아두세요</h1>

      <ul className="flex flex-col gap-4 text-lg leading-relaxed">
        {NOTICE_POINTS.map((point) => (
          <li key={point} className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-0.5 shrink-0 text-2xl text-green-700">
              ✔
            </span>
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <label className="flex min-h-[48px] items-start gap-3 rounded border border-gray-300 p-4 text-lg">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-1 h-6 w-6 shrink-0"
          aria-describedby="consent-checkbox-label"
        />
        <span id="consent-checkbox-label">
          위 내용을 모두 확인했으며, 이 훈련 시뮬레이션에 참여하는 것에 동의합니다.
        </span>
      </label>

      {error && (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="flex items-center gap-2 text-base text-red-700 outline-none"
        >
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!checked || submitting || !user}
        className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {submitting ? "저장 중..." : "동의하고 시작"}
      </button>
    </main>
  );
}
