import type { Metadata } from "next";
import Link from "next/link";
import { LineIcon } from "@/components/ui";
import { NOT_FOUND_TITLE } from "@/lib/seo/publicPages";

// §133(DECISIONS #249 · UX D-162) — 없는 주소 화면(Next 기본 영문 404 대체). 정적 export에서 `out/404.html`이 되고
// Firebase Hosting이 없는 주소마다 이 파일을 404로 돌려준다.
// noindex는 Next가 404에 스스로 붙인다(빌드 산출물 `out/404.html` 확인 — 직접 넣으면 두 번 박힌다).
// canonical: 루트 레이아웃의 `canonical: "./"`가 여기서는 `/_not-found`로 풀렸다(라이브 실측 2026-10-24) — null로 지운다.
// 미인증 사용자도 이 화면을 본다 — RouteGuard가 모르는 주소(isKnownAppPath false)를 로그인으로 보내지 않는다.
export const metadata: Metadata = {
  title: NOT_FOUND_TITLE,
  alternates: { canonical: null },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-page">
      <header className="flex min-h-[56px] items-center gap-2 border-b border-line bg-surface px-4">
        <LineIcon name="shield" className="text-brand" />
        <p className="text-[18px] font-bold text-ink">금융사기 예방 훈련</p>
      </header>
      <div className="flex flex-1 flex-col justify-center gap-5 px-5 py-10">
        <h1 className="text-[28px] font-bold leading-[1.35] text-ink [word-break:keep-all]">찾으시는 화면이 없습니다</h1>
        <p className="text-[18px] leading-[1.7] text-ink-sub [word-break:keep-all]">
          주소가 바뀌었거나 잘못 입력된 것 같습니다. 아래 버튼을 누르면 처음 화면으로 돌아갑니다.
        </p>
        <Link
          href="/"
          className="flex min-h-[56px] items-center justify-center rounded-[8px] bg-brand px-6 py-3 text-[18px] font-bold text-white hover:bg-brand-hover"
        >
          처음으로
        </Link>
      </div>
    </main>
  );
}
