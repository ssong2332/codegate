// 법적 고지 화면 공용 틀(개인정보처리방침 · 이용약관 · 문의) — 외부 점검 2026-10-21. 내용은 `@/lib/legal/legalContent`.
// 읽기 전용 화면이라 Firestore · Functions 호출이 없다. 초안 표식(DRAFT_NOTICE)을 맨 위에 항상 띄운다.
import Link from "next/link";
import { Chip, LineIcon } from "@/components/ui";
import LegalLinks from "@/components/LegalLinks";
import PageToc from "@/components/PageToc";
import { DRAFT_NOTICE, type LegalDocument } from "@/lib/legal/legalContent";

export default function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  // UX D-138 (3) — 조항 제목이 곧 목록이다.
  const tocSections = doc.sections.map((section, index) => ({ id: `legal-section-${index + 1}`, label: section.heading }));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-page">
      <header className="flex min-h-[56px] items-center gap-2 border-b border-line bg-surface px-4">
        <Link href="/" className="flex items-center gap-2 text-ink" aria-label="처음 화면으로">
          <LineIcon name="shield" className="text-brand" />
          <span className="text-[18px] font-bold">금융사기 예방 훈련</span>
        </Link>
      </header>
      <PageToc sections={tocSections} className="px-5" />
      <article className="flex flex-1 flex-col gap-5 px-5 pb-6 pt-2">
        <h1 className="text-[26px] font-bold leading-[1.35] text-ink">{doc.title}</h1>
        <p role="note" className="rounded-[8px] border border-caution/40 bg-caution-tint px-4 py-3 text-[16px] leading-[1.6] text-ink">
          {DRAFT_NOTICE}
        </p>
        <p className="text-[17px] leading-[1.65] text-ink">{doc.intro}</p>
        {doc.sections.map((section, index) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 id={tocSections[index].id} data-toc-target className="flex flex-wrap items-center gap-2 text-[19px] font-bold text-ink">
              {section.heading}
              {section.reviewNeeded && <Chip className="text-[13px]">검토 필요</Chip>}
            </h2>
            {section.paragraphs?.map((p) => (
              <p key={p} className="text-[17px] leading-[1.65] text-ink-sub">
                {p}
              </p>
            ))}
            {section.items && (
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[17px] leading-[1.65] text-ink-sub">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>
      <LegalLinks className="pb-8" />
    </main>
  );
}
