import Link from "next/link";

// 루트 진입점 — 온보딩 흐름 시작점(로그인)으로 안내하는 최소 스텁.
// 실제 랜딩/마케팅 카피, 인증 상태 분기(lib/auth)는 T18에서 구현.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#FAF8F5] p-8 text-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-[#E4F0EC]">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2L4 5.5V11C4 16 7.4 20.4 12 21.8C16.6 20.4 20 16 20 11V5.5L12 2Z"
            stroke="#0E6B62"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 11.5L11 14L15.5 9"
            stroke="#0E6B62"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-[24px] font-bold leading-[1.35] text-[#22303A]">
          안 당해본 사기는 못 막는다
        </h1>
        <p className="text-[15px] leading-[1.6] text-[#6B655C]">
          AI 금융사기 백신 — 스캐폴딩 단계 (T2)
        </p>
      </div>
      <Link
        href="/login"
        className="flex min-h-[56px] w-full max-w-xs items-center justify-center rounded-[14px] bg-[#0E6B62] px-6 text-[17px] font-semibold text-white transition-colors hover:bg-[#0B564F]"
      >
        로그인하고 시작하기
      </Link>
    </main>
  );
}
