// UX-012 히스토리 열람 (P1, Track B, T15, AC-016)
// T2 스캐폴딩 스텁. 핵심 루프 비차단(P1) — 실패 시 조용히 생략(Architecture §8).
export default function HistoryPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-bold">세션/리포트 히스토리 (P1)</h1>
      <p className="text-sm text-gray-600">TODO(T15): 본인 sessions/reports 시간순 열람(AC-016)</p>
    </main>
  );
}
