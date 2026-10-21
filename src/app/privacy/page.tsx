import type { Metadata } from "next";
import LegalDocumentView from "@/components/LegalDocumentView";
import { PRIVACY_POLICY, LEGAL_ROBOTS } from "@/lib/legal/legalContent";

// 법적 고지(초안) — 외부 점검 2026-10-21. 공개 경로(RouteGuard LEGAL_PATHS).
export const metadata: Metadata = { title: "개인정보처리방침 — 금융사기 예방 훈련", robots: LEGAL_ROBOTS };

export default function Page() {
  return <LegalDocumentView doc={PRIVACY_POLICY} />;
}
