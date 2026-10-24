import type { Metadata } from "next";
import Link from "next/link";
import { LineIcon } from "@/components/ui";
import LegalLinks from "@/components/LegalLinks";
import { FAQ_ITEMS } from "@/lib/faq/faqContent";
import { PUBLIC_PAGE_META } from "@/lib/seo/publicPages";

// §133(DECISIONS #249 · UX D-162) — 자주 묻는 질문. 공개 경로(RouteGuard PUBLIC_PATHS · anonymousScope INFO_PATHS) · 읽기 전용(호출 0).
// UX D-162 — 접기 없이 답을 모두 펼쳐 둔다(어르신 사용자가 한 번 더 누를 필요 없게). 글자 17px 이상 · 버튼 56px.
export const metadata: Metadata = PUBLIC_PAGE_META["/faq"];

export default function FaqPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-page">
      <header className="flex min-h-[56px] items-center gap-2 border-b border-line bg-surface px-4">
        <Link href="/" className="flex items-center gap-2 text-ink" aria-label="처음 화면으로">
          <LineIcon name="shield" className="text-brand" />
          <span className="text-[18px] font-bold">금융사기 예방 훈련</span>
        </Link>
      </header>
      <article className="flex flex-1 flex-col gap-6 px-5 pb-6 pt-5">
        <h1 className="text-[26px] font-bold leading-[1.35] text-ink">자주 묻는 질문</h1>
        {FAQ_ITEMS.map((item, index) => (
          <section key={item.question} aria-labelledby={`faq-${index + 1}`} className="flex flex-col gap-2 border-t border-line pt-5">
            <h2 id={`faq-${index + 1}`} className="text-[20px] font-bold leading-[1.45] text-ink [word-break:keep-all]">
              {item.question}
            </h2>
            {item.answer.map((line) => (
              <p key={line} className="text-[18px] leading-[1.7] text-ink-sub [word-break:keep-all]">
                {line}
              </p>
            ))}
          </section>
        ))}
        <Link
          href="/"
          className="mt-2 flex min-h-[56px] items-center justify-center rounded-[8px] bg-brand px-6 py-3 text-[18px] font-bold text-white hover:bg-brand-hover"
        >
          처음으로
        </Link>
      </article>
      <LegalLinks className="pb-8" />
    </main>
  );
}
