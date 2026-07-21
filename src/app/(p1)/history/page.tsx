"use client";

// UX-012 (P1·스케치) 세션/리포트 히스토리 열람 (Track B, T15, AC-016).
// RouteGuard(lib/auth, T18)가 이미 인증되지 않은 사용자를 /login으로 보내므로, 이 화면은
// "인증된 사용자"를 전제로 한다(scenarios/page.tsx 등과 동일 패턴). **본인 열람만**(자녀의 부모
// 리포트 열람은 OQ-15 open, 이번 범위 아님 — UX.md UX-012 Purpose 명시).
//
// reports 컬렉션을 uid+createdAt desc로 직접 클라 read한다(Database.md §Indexes, firestore.rules
// reports read 규칙이 본인 귀속만 허용 — history/fetchReportHistory.ts 주석 참고). 항목 클릭 시
// report/page.tsx(UX-008)가 이미 쓰는 `?sessionId=` 규약을 그대로 재사용한다(reportId==sessionId,
// functions/src/report/generateReportCore.ts).
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/auth";
import { fetchReportHistory, mapReportsToHistoryItems, type HistoryListItem } from "@/lib/history";

type PageState = "loading" | "error" | "empty" | "success";

export default function HistoryPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [state, setState] = useState<PageState>("loading");
  const [items, setItems] = useState<HistoryListItem[]>([]);

  // Firestore 조회는 setState 없는 순수 헬퍼로 분리하고(report/page.tsx와 동일 패턴), effect의
  // 인라인 IIFE와 재시도 버튼이 각자 결과에 따라 setState한다(react-hooks/set-state-in-effect 회피).
  const loadHistory = useCallback(async (uid: string): Promise<HistoryListItem[]> => {
    const reports = await fetchReportHistory(uid);
    return mapReportsToHistoryItems(reports);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const nextItems = await loadHistory(user.uid);
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
  }, [user, loadHistory]);

  const handleRetry = () => {
    if (!user) return;
    setState("loading");
    loadHistory(user.uid)
      .then((nextItems) => {
        setItems(nextItems);
        setState(nextItems.length > 0 ? "success" : "empty");
      })
      .catch(() => setState("error"));
  };

  const handleSelect = (item: HistoryListItem) => {
    router.push(`/report?sessionId=${item.sessionId}`);
  };

  if (state === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="flex items-center gap-2 text-lg" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
          />
          히스토리를 불러오는 중입니다...
        </p>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>히스토리를 불러오지 못했습니다. 다시 시도해 주세요.</span>
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
        <h1 className="text-xl font-bold">세션/리포트 히스토리</h1>
        <p className="text-base text-gray-600">아직 완료한 훈련 기록이 없습니다.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-bold">세션/리포트 히스토리</h1>
      <p className="text-base text-gray-600">지난 훈련 기록을 최신순으로 볼 수 있습니다.</p>

      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.reportId}>
            <button
              type="button"
              onClick={() => handleSelect(item)}
              className="flex min-h-[56px] w-full flex-col items-start gap-1 rounded border border-gray-300 p-4 text-left text-lg hover:bg-gray-50"
            >
              <span className="font-bold">{item.dateLabel}</span>
              <span className="text-base text-gray-700">결과: {item.resultLabel}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
