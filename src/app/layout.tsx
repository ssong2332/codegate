import type { Metadata } from "next";
import "./globals.css";
import { RouteGuard } from "@/lib/auth";

// 전역 셸(인증 가드·전역 상시 "훈련 종료" 컨텍스트) — Architecture.md §2.
// 인증 가드(lib/auth/RouteGuard, T18, AC-027)를 여기서 전역 1회 적용한다. 상시 종료 컨텍스트
// (EndTrainingButton, AC-006)는 세션 화면 소유 트랙(T8)이 채운다.
export const metadata: Metadata = {
  title: "안 당해본 사기는 못 막는다 — AI 금융사기 백신",
  description:
    "본인 목소리를 AI로 복제해 가족 사칭 딥보이스 사기를 미리 체험하고 대처법을 훈련하는 예방접종형 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <RouteGuard>{children}</RouteGuard>
      </body>
    </html>
  );
}
