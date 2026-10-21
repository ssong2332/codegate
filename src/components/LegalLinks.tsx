// 화면 하단 법적 고지 링크(개인정보처리방침 · 이용약관 · 문의) — 외부 점검 2026-10-21. 첫 화면 · 로그인 화면 · 고지 화면 하단에 둔다.
// 경로는 RouteGuard 공개 경로(LEGAL_PATHS)와 같다 — 미인증 · 익명도 열 수 있다.
// 사용자 결정 2026-10-21(DECISIONS #204) — 내용 확정 전까지 숨긴다. 다시 켜는 곳은 SHOW_LEGAL_LINKS 한 곳이다.
import Link from "next/link";
import { SHOW_LEGAL_LINKS } from "@/lib/legal/legalContent";

const LINKS = [
  { href: "/privacy", label: "개인정보처리방침", strong: true },
  { href: "/terms", label: "이용약관", strong: false },
  { href: "/contact", label: "문의", strong: false },
] as const;

export default function LegalLinks({ className = "" }: { className?: string }) {
  if (!SHOW_LEGAL_LINKS) return null;
  return (
    <nav aria-label="법적 고지" className={`flex flex-wrap items-center justify-center gap-x-1 px-5 text-[15px] text-ink-sub ${className}`}>
      {LINKS.map((link, i) => (
        <span key={link.href} className="flex items-center gap-x-1">
          {i > 0 && <span aria-hidden="true">·</span>}
          <Link
            href={link.href}
            className={`inline-flex min-h-[44px] items-center px-1 underline-offset-2 hover:underline ${link.strong ? "font-semibold text-ink" : ""}`}
          >
            {link.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
