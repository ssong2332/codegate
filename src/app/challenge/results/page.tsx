"use client";

// UX-020 사용자1 챌린지 결과 열람 (Track A/C, T36, AC-041/043).
//
// listMyChallenges 콜러블로 본인 챌린지 목록을 조회한다(reviewer 리뷰 Critical #1 수정 이후 —
// challenges 컬렉션 클라 직접 read는 voiceId/linkTokenHash 노출 문제로 전면 거부됨, 상세는
// src/lib/challenge/fetchChallenges.ts 참고). T37(사용자2 동의·체험)이 아직 없어 실제 데이터는
// 전부 "미완료" 또는 Empty 상태로만 보인다 — 이는 예상된 정상 상태이며 가짜 데이터를 채우지
// 않는다(태스크 지시).
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/auth";
import { deleteChallenge } from "@/lib/api";
import { fetchMyChallenges, mapChallengesToListItems, type ChallengeListItem } from "@/lib/challenge";
import { Badge, Button } from "@/components/ui";

type PageState = "loading" | "error" | "empty" | "success";

// mapChallengeItems.ts의 resolveStatusLabel이 만드는 문장 중 "아직 안 해봄"에 해당하는 정확한
// 문자열 하나만 대기(caution) 배지로 취급하고, 그 외(전부 완료 계열 라벨)는 완료(success) 배지로
// 다룬다 — statusLabel 문자열에 결합된 판정이라 다소 취약하지만, 이 화면 파일만 손대라는 태스크
// 범위상 mapChallengeItems.ts에 원본 status를 노출하도록 바꿀 수 없어 택한 절충이다(구현 보고서
// 참고). "만료" 배지는 라벨이 대기와 구분되지 않아(원본 데이터에 없음) 만들지 않는다 — 없는
// 데이터를 지어내지 않는다는 원칙.
const PENDING_LABEL = "상대가 아직 해보지 않았습니다";

function resolveStatusBadge(statusLabel: string): { variant: "caution" | "success"; text: string } {
  if (statusLabel === PENDING_LABEL) {
    return { variant: "caution", text: "대기" };
  }
  return { variant: "success", text: "완료" };
}

export default function ChallengeResultsPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [state, setState] = useState<PageState>("loading");
  const [items, setItems] = useState<ChallengeListItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Firestore 조회는 setState 없는 순수 헬퍼로 분리한다(history/page.tsx와 동일 패턴,
  // react-hooks/set-state-in-effect 회피).
  const loadChallenges = useCallback(async (): Promise<ChallengeListItem[]> => {
    const raw = await fetchMyChallenges();
    const sorted = [...raw].sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
    );
    return mapChallengesToListItems(sorted);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const nextItems = await loadChallenges();
        if (cancelled) return;
        setItems(nextItems);
        setState(nextItems.length > 0 ? "success" : "empty");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loadChallenges]);

  const handleRetry = () => {
    if (!user) return;
    setState("loading");
    loadChallenges()
      .then((nextItems) => {
        setItems(nextItems);
        setState(nextItems.length > 0 ? "success" : "empty");
      })
      .catch(() => setState("error"));
  };

  const handleDelete = async (challengeId: string) => {
    // P-9(되돌릴 수 없는 작업은 확인 다이얼로그) — 이 앱에 아직 커스텀 확인 다이얼로그 컴포넌트가
    // 없어 플랫폼 confirm()으로 대체한다(태스크 지시로 허용된 임시 절충, 향후 커스텀 다이얼로그로
    // 교체 가능).
    const confirmed = window.confirm(
      "이 챌린지를 삭제하시겠어요? 복제 음성도 함께 폐기되며 되돌릴 수 없습니다.",
    );
    if (!confirmed) return;

    setDeleteError(null);
    setDeletingId(challengeId);
    try {
      await deleteChallenge({ challengeId });
      setItems((prev) => {
        const next = prev.filter((item) => item.challengeId !== challengeId);
        if (next.length === 0) setState("empty");
        return next;
      });
    } catch {
      setDeleteError("삭제에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setDeletingId(null);
    }
  };

  if (state === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p className="flex items-center gap-2 text-lg text-[#22303A]" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-transparent"
          />
          내 챌린지를 불러오는 중입니다...
        </p>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>내 챌린지를 불러오지 못했습니다. 다시 시도해 주세요.</span>
        </p>
        <div className="w-full max-w-xs">
          <Button type="button" onClick={handleRetry}>
            다시 시도
          </Button>
        </div>
      </main>
    );
  }

  if (state === "empty") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <h1 className="text-2xl font-bold text-[#22303A]">내 챌린지</h1>
        <p className="text-base text-[#6B655C]">아직 만든 챌린지가 없습니다.</p>
        <div className="w-full max-w-xs">
          <Button type="button" onClick={() => router.push("/scenarios/voice")}>
            새 챌린지 만들기
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 bg-[#FAF8F5] p-6">
      <header className="flex flex-col gap-2 pt-2">
        <h1 className="text-2xl font-bold text-[#22303A]">내 챌린지</h1>
        <p className="text-sm leading-relaxed text-[#6B655C]">
          결과는 요약만 보여요. 대화 내용 전문은 본인만 볼 수 있어요.
        </p>
      </header>

      {deleteError && (
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>{deleteError}</span>
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const badge = resolveStatusBadge(item.statusLabel);
          // 배지 텍스트("완료"/"대기")와 statusLabel이 다를 때만 상세 줄을 보여준다 — 정보 손실
          // 없이 배지와의 중복만 없앤다(예: "완료" 단독이면 배지로 충분, "완료 · 의심 시점: ..."
          // 이나 "결과 공유에 동의하지 않았습니다"처럼 배지보다 많은 정보를 담고 있을 때만 노출).
          const showDetail = item.statusLabel !== PENDING_LABEL && item.statusLabel !== badge.text;
          return (
            <li
              key={item.challengeId}
              className="flex flex-col gap-2 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-4"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#41525E]"
                >
                  <span className="h-[18px] w-[18px] rounded-full bg-[#C9D4DB]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-[#22303A]">{item.displayName}</p>
                  <p className="text-xs text-[#6B655C]">{item.dateLabel}</p>
                </div>
                {/* 상태는 색만이 아니라 배지 텍스트로도 구분한다(UX-020 Accessibility, Badge
                    컴포넌트가 아이콘도 병행). */}
                <Badge variant={badge.variant}>{badge.text}</Badge>
              </div>
              {showDetail && (
                <p className="border-t border-[#F2EFE9] pt-3 text-sm leading-relaxed text-[#22303A]">
                  {item.statusLabel}
                </p>
              )}
              <button
                type="button"
                onClick={() => void handleDelete(item.challengeId)}
                disabled={deletingId === item.challengeId}
                className="min-h-[48px] w-fit self-start rounded-[10px] border-[1.5px] border-[#C6392F] px-4 py-2 text-sm font-semibold text-[#C6392F] transition-colors hover:bg-[#C6392F]/10 disabled:opacity-50"
              >
                {deletingId === item.challengeId ? "삭제하는 중..." : "삭제"}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="rounded-[12px] bg-[#F2EFE9] px-4 py-3">
        <p className="text-xs leading-relaxed text-[#6B655C]">
          만료된 챌린지는 링크가 비활성화되고 기록이 30일 후 삭제됩니다.
        </p>
      </div>

      <Button type="button" variant="secondary" onClick={() => router.push("/scenarios/voice")}>
        새 챌린지 만들기
      </Button>
    </main>
  );
}
