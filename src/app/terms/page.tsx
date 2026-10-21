import type { Metadata } from "next";
import LegalDocumentView from "@/components/LegalDocumentView";
import { TERMS_OF_SERVICE } from "@/lib/legal/legalContent";

// 법적 고지(초안) — 외부 점검 2026-10-21. 공개 경로(RouteGuard LEGAL_PATHS).
export const metadata: Metadata = { title: "이용약관 — 금융사기 예방 훈련" };

export default function Page() {
  return <LegalDocumentView doc={TERMS_OF_SERVICE} />;
}
