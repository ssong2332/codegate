import type { Metadata, Viewport } from "next";
import "./globals.css";
// UX D-134 — 사이트 모션(페이지 진입 · 로딩 점 · 펼침). globals.css와 분리해 둔다(motion.css 머리말 참고).
import "./motion.css";
import { RouteGuard } from "@/lib/auth";

// 전역 셸(인증 가드·전역 상시 "훈련 종료" 컨텍스트) — Architecture.md §2.
// 인증 가드(lib/auth/RouteGuard, T18, AC-027)를 여기서 전역 1회 적용한다. 상시 종료 컨텍스트
// (EndTrainingButton, AC-006)는 세션 화면 소유 트랙(T8)이 채운다.
// 공유 미리보기(카카오톡 · SNS)와 검색 정규 주소 — 외부 점검 2026-10-21 "카톡 미리보기 안 됨 · 같은 페이지 여러 개" 대응.
// canonical "./"은 Next가 페이지마다 그 경로로 풀어 준다(정적 export에서도 페이지별 HTML에 박힌다).
// 공유 이미지는 `scripts/generate-og-image.mjs`로 만든 public/og-image.png(1200×630).
const SITE_URL = "https://voicefishing-ff47f.web.app";
const SITE_TITLE = "안 당해본 사기는 못 막는다 — AI 금융사기 백신";
const SITE_DESCRIPTION =
  "AI 사기범의 전화와 문자를 앱 안에서 직접 받아 보며 금융사기 대처법을 연습하고, 가족에게도 훈련을 보내 함께 대비하는 예방 훈련 서비스";
const SHARE_IMAGE = { url: "/og-image.png", width: 1200, height: 630, alt: "금융사기 예방 훈련 — 사기 전화, 미리 한 번 받아 보세요" };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "금융사기 예방 훈련",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "./",
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION, images: [SHARE_IMAGE.url] },
  // OQ-U99 ⓐ(§89.6) — iPhone 홈 화면 추가 시에도 주소창 없이 열린다. 매니페스트는 `manifest.ts`.
  appleWebApp: { capable: true, title: "사기 예방 훈련", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

// T190-1(docs/Architecture.md §74.11 · OQ-U65 · AC-095 (f) · G458) — 강제 다크(Chrome 자동 다크)로 색이
// 반전되지 않게 **두 겹**으로 선언한다: 여기(`<meta name="color-scheme">`) + `globals.css`의 `:root`.
// 앱에 다크 테마가 없어 전역 적용의 손실은 0이다. ⚠️ 삼성 인터넷 다크 모드·웨일은 이 선언으로 막힌다는
// 근거가 없다 — 반전 결과의 대비만 실기로 확인한다(§74.17 P-4 · 미검증).
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
