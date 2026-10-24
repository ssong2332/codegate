// §133(DECISIONS #249) — 가족 링크 받는 화면 검색 제목 · 설명. 페이지가 클라이언트 컴포넌트라 metadata는 이 레이아웃이 낸다.
// 공유 미리보기(openGraph · twitter)는 루트 레이아웃 값을 그대로 쓴다(여기서 덮지 않는다).
// 받는 사람마다 토큰이 다른 초대 화면이라 검색에는 싣지 않는다(noindex). robots.txt에서는 막지 않는다 — 미리보기 수집 유지.
import type { Metadata } from "next";
import { PUBLIC_PAGE_META } from "@/lib/seo/publicPages";

export const metadata: Metadata = { ...PUBLIC_PAGE_META["/challenge/join"], robots: { index: false, follow: false } };

export default function ChallengeJoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
