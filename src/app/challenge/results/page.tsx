"use client";

// UX-020 사용자1 챌린지 결과 열람 (Track A/C, T36, AC-041/043).
//
// challenges 컬렉션을 creatorUid로 직접 클라 read한다(firestore.rules가 본인 챌린지만 허용,
// src/app/(p1)/history/page.tsx와 동일 패턴). T37(사용자2 동의·체험)이 아직 없어 실제 데이터는
// 전부 "미완료" 또는 Empty 상태로만 보인다 — 이는 예상된 정상 상태이며 가짜 데이터를 채우지
// 않는다(태스크 지시).
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/auth";
import { deleteChallenge } from "@/lib/api";
import { fetchMyChallenges, mapChallengesToListItems, type ChallengeListItem } from "@/lib/challenge";

type PageState = "loading" | "error" | "empty" | "success";

export default function ChallengeResultsPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [state, setState] = useState<PageState>("loading");
  const [items, setItems] = useState<ChallengeListItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Firestore 조회는 setState 없는 순수 헬퍼로 분리한다(history/page.tsx와 동일 패턴,
  // react-hooks/set-state-in-effect 회피).
  const loadChallenges = useCallback(async (uid: string): Promise<ChallengeListItem[]> => {
    const raw = await fetchMyChallenges(uid);
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
        const nextItems = await loadChallenges(user.uid);
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
    loadChallenges(user.uid)
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
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="flex items-center gap-2 text-lg" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
          />
          내 챌린지를 불러오는 중입니다...
        </p>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>내 챌린지를 불러오지 못했습니다. 다시 시도해 주세요.</span>
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800"
        >
          다시 시도
        </button>
      </main>
    );
  }

  if (state === "empty") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-bold">내 챌린지</h1>
        <p className="text-base text-gray-600">아직 만든 챌린지가 없습니다.</p>
        <button
          type="button"
          onClick={() => router.push("/scenarios/voice")}
          className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800"
        >
          새 챌린지 만들기
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-bold">내 챌린지</h1>

      {deleteError && (
        <p role="alert" className="flex items-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>{deleteError}</span>
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li
            key={item.challengeId}
            className="flex flex-col gap-2 rounded border border-gray-300 p-4"
          >
            <p className="text-lg font-bold">{item.displayName}</p>
            <p className="text-sm text-gray-600">{item.dateLabel}</p>
            {/* 상태는 색이 아니라 텍스트 라벨로만 구분한다(UX-020 Accessibility). */}
            <p className="text-base text-gray-700">{item.statusLabel}</p>
            <button
              type="button"
              onClick={() => void handleDelete(item.challengeId)}
              disabled={deletingId === item.challengeId}
              className="min-h-[48px] w-fit self-start rounded border border-red-400 px-4 py-2 text-base font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {deletingId === item.challengeId ? "삭제하는 중..." : "삭제"}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => router.push("/scenarios/voice")}
        className="min-h-[48px] rounded border border-gray-400 px-6 py-3 text-lg font-bold hover:bg-gray-100"
      >
        새 챌린지 만들기
      </button>
    </main>
  );
}
