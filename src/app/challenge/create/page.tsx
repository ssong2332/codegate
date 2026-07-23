"use client";

// UX-019 챌린지 만들기·공유 링크 (Track A/C, T36, AC-041/044/048/049).
//
// Entry: UF-004에서 클론 완료 + 딥보이스(clone) 시나리오 선택 후 이 화면으로 온다
// (src/app/scenarios/voice/ScenarioListView.tsx의 handleStart가 챌린지 모드일 때
// `?scenarioId=...`로 이동시킨다 — record/clone/wait를 거치지 않는다, pendingSession.ts의
// setChallengeMode/consumeChallengeMode 주석 참고). createChallenge가 서버에서 "완료된 클론 보유"
// 여부를 직접 재확인하므로, 이 화면 자체는 scenarioId 외에 클라 상태를 더 필요로 하지 않는다.
//
// D-20(docs/UX.md) — 앱이 카톡/문자를 대신 전송하지 않는다. navigator.share(OS 공유 시트)가 있으면
// 그걸 쓰고, 없으면 링크 텍스트 노출 + Clipboard API 복사로 폴백한다(P-14, 침묵 실패 금지).
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createChallenge } from "@/lib/api";

type PageState =
  | "no-scenario"
  | "form"
  | "submitting"
  | "success"
  | "error-cap"
  | "error-clone"
  | "error-issue";

function getFunctionsErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

export default function ChallengeCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scenarioId = searchParams.get("scenarioId");

  const [displayName, setDisplayName] = useState("");
  const [state, setState] = useState<PageState>(scenarioId ? "form" : "no-scenario");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("복사");

  const isSubmitting = state === "submitting";

  const handleCreate = async () => {
    if (!scenarioId || !displayName.trim() || isSubmitting) return;
    setState("submitting");
    try {
      const result = await createChallenge({ scenarioId, displayName: displayName.trim() });
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      // T37이 실제 사용자2 진입 화면(UX-021)을 이 경로에 만들 예정이다 — 지금은 토큰 발급/공유
      // 메커니즘만 준비하고, 이 링크는 아직 존재하지 않는 페이지를 가리킨다(구현 보고서 참고).
      setShareUrl(`${origin}/challenge/join?token=${encodeURIComponent(result.shareToken)}`);
      setCopyLabel("복사");
      setState("success");
    } catch (err) {
      const code = getFunctionsErrorCode(err);
      if (code === "functions/resource-exhausted") {
        setState("error-cap");
      } else if (code === "functions/failed-precondition") {
        setState("error-clone");
      } else {
        setState("error-issue");
      }
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLabel("복사됨");
    } catch {
      setCopyLabel("복사에 실패했습니다 — 링크를 직접 선택해 복사해 주세요");
    }
  };

  const handleShare = async () => {
    if (!shareUrl) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "딥보이스 체험 챌린지", url: shareUrl });
        return;
      } catch {
        // 사용자가 공유 시트를 취소한 경우 등 — 복사 버튼이 여전히 유효한 대안이라 조용히 무시한다.
        return;
      }
    }
    // 공유 시트 미지원 브라우저 폴백(P-14, 침묵 실패 금지) — 복사로 대체한다.
    await handleCopy();
  };

  if (state === "no-scenario") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>시나리오 정보를 찾을 수 없습니다. 시나리오 선택부터 다시 시작해 주세요.</span>
        </p>
        <button
          type="button"
          onClick={() => router.push("/scenarios/voice")}
          className="min-h-[48px] rounded-xl border border-[#C9C2B6] px-6 py-3 text-lg font-bold text-[#22303A] hover:bg-white"
        >
          시나리오 선택으로
        </button>
      </main>
    );
  }

  if (state === "error-cap") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>
            동시에 만들 수 있는 챌린지 수를 초과했습니다. 기존 챌린지가 끝나거나 만료되면 다시
            만들 수 있어요.
          </span>
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => router.push("/challenge/results")}
            className="min-h-[48px] rounded-xl bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white"
          >
            내 챌린지 목록 보기
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="min-h-[48px] rounded-xl border border-[#C9C2B6] px-6 py-3 text-lg font-bold text-[#22303A] hover:bg-white"
          >
            처음으로
          </button>
        </div>
      </main>
    );
  }

  if (state === "error-clone") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>먼저 본인 목소리 클론을 완료해 주세요.</span>
        </p>
        <button
          type="button"
          onClick={() => router.push("/onboarding/record")}
          className="min-h-[48px] rounded-xl bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white"
        >
          목소리 클론하러 가기
        </button>
      </main>
    );
  }

  if (state === "success" && shareUrl) {
    const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 bg-[#FAF8F5] p-6">
        <header className="flex flex-col gap-2 pt-2">
          <h1 className="text-2xl font-bold text-[#22303A]">챌린지가 만들어졌습니다</h1>
          <p className="text-base leading-relaxed text-[#6B655C]">
            아래 링크를 카카오톡·문자로 직접 붙여넣어 지인에게 보내 주세요. 앱이 대신 전송하지
            않습니다.
          </p>
        </header>

        {/* 발급된 링크는 스크린리더가 읽을 수 있는 텍스트로도 노출한다(아이콘 단독 금지). */}
        <p className="break-all rounded-xl border border-[#E2DDD3] bg-white p-4 text-base text-[#22303A]" role="status">
          {shareUrl}
        </p>

        <div className="flex flex-col gap-3">
          {canNativeShare && (
            <button
              type="button"
              onClick={() => void handleShare()}
              className="min-h-[48px] rounded-xl bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white"
            >
              공유하기
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="min-h-[48px] rounded-xl border-2 border-[#0E6B62] px-6 py-3 text-lg font-bold text-[#0E6B62] hover:bg-[#E4F0EC]"
          >
            {copyLabel}
          </button>
        </div>

        <div className="mt-2 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => router.push("/challenge/results")}
            className="min-h-[48px] rounded-xl border border-[#C9C2B6] px-6 py-3 text-lg font-semibold text-[#22303A] hover:bg-white"
          >
            내 챌린지 결과 보기
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="min-h-[48px] rounded-xl px-6 py-3 text-base font-semibold text-[#6B655C]"
          >
            처음으로
          </button>
        </div>
      </main>
    );
  }

  // "form"·"submitting"·"error-issue" 공통 화면 — 입력 폼은 항상 보여주고, 발급 실패는 폼 위에
  // 재시도 안내로 얹는다(P-4, ScenarioListView의 sticky CTA + 에러 문구 패턴과 동일).
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 bg-[#FAF8F5] p-6">
      <header className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex min-h-[48px] w-fit items-center gap-1 rounded-lg px-2 -ml-2 text-base font-medium text-[#6B655C] hover:bg-[#F2EFE9]"
        >
          <span aria-hidden="true">←</span> 뒤로
        </button>
        <h1 className="text-2xl font-bold text-[#22303A]">챌린지 만들기</h1>
        <p className="text-base leading-relaxed text-[#6B655C]">
          지인에게 보일 표시 이름을 입력해 주세요. 「OOO님이 준비한 딥보이스 체험」 형태로
          보이게 됩니다.
        </p>
      </header>

      <label className="flex flex-col gap-2">
        <span className="text-base font-semibold text-[#22303A]">표시 이름</span>
        <input
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="예: 민수"
          disabled={isSubmitting}
          className="min-h-[48px] rounded-xl border border-[#C9C2B6] bg-white px-4 py-3 text-lg text-[#22303A] outline-none focus:border-[#0E6B62] disabled:opacity-50"
        />
      </label>

      {state === "error-issue" && (
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>링크 발급에 실패했습니다. 다시 시도해 주세요.</span>
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleCreate()}
        disabled={!displayName.trim() || isSubmitting}
        className="min-h-[56px] w-full rounded-xl bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white transition hover:bg-[#0B564F] disabled:opacity-50"
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2" role="status">
            <span
              aria-hidden="true"
              className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
            />
            챌린지를 만드는 중...
          </span>
        ) : (
          "챌린지 만들기"
        )}
      </button>
    </main>
  );
}
