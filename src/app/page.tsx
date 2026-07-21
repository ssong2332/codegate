import Link from "next/link";

// 루트 진입점 — 온보딩 흐름 시작점(로그인)으로 안내하는 최소 스텁.
// 실제 랜딩/마케팅 카피, 인증 상태 분기(lib/auth)는 T18에서 구현.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">안 당해본 사기는 못 막는다</h1>
      <p className="text-sm text-gray-600">AI 금융사기 백신 — 스캐폴딩 단계 (T2)</p>
      <Link
        href="/login"
        className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
      >
        로그인하고 시작하기
      </Link>
    </main>
  );
}
