import type { Metadata, Viewport } from "next";
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

// T190-1(docs/Architecture.md §73.11 · OQ-U65 · AC-095 (f) · G458) — 강제 다크(Chrome 자동 다크)로 색이
// 반전되지 않게 **두 겹**으로 선언한다: 여기(`<meta name="color-scheme">`) + `globals.css`의 `:root`.
// 앱에 다크 테마가 없어 전역 적용의 손실은 0이다. ⚠️ 삼성 인터넷 다크 모드·웨일은 이 선언으로 막힌다는
// 근거가 없다 — 반전 결과의 대비만 실기로 확인한다(§73.17 P-4 · 미검증).
export const viewport: Viewport = {
  colorScheme: "only light",
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
