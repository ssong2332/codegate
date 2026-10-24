import type { Metadata } from "next";
import LegalDocumentView from "@/components/LegalDocumentView";
import { TERMS_OF_SERVICE, LEGAL_ROBOTS } from "@/lib/legal/legalContent";
import { PUBLIC_PAGE_META } from "@/lib/seo/publicPages";

// 법적 고지(초안) — 외부 점검 2026-10-21. 공개 경로(RouteGuard LEGAL_PATHS).
// §133 — 제목 · 설명은 공개 페이지 단일 출처(@/lib/seo/publicPages).
export const metadata: Metadata = { ...PUBLIC_PAGE_META["/terms"], robots: LEGAL_ROBOTS };

export default function Page() {
  return <LegalDocumentView doc={TERMS_OF_SERVICE} />;
}
