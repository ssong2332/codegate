// §133(DECISIONS #249) — 로그인 화면 검색 제목 · 설명. 페이지가 클라이언트 컴포넌트라 metadata는 이 레이아웃이 낸다.
import type { Metadata } from "next";
import { PUBLIC_PAGE_META } from "@/lib/seo/publicPages";

export const metadata: Metadata = PUBLIC_PAGE_META["/login"];

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
