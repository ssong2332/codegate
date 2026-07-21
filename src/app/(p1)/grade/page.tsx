// UX-010 방어등급 (P1, Track A, T13, AC-010/AC-011)
// T2 스캐폴딩 스텁. 핵심 루프 비차단(P1) — 실패 시 조용히 생략(Architecture §8).
export default function GradePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-bold">방어 등급 (P1)</h1>
      <p className="text-sm text-gray-600">TODO(T13): 방어 점수/등급 산정 및 표시(AC-010, AC-011)</p>
    </main>
  );
}
