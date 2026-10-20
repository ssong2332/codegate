import type { MetadataRoute } from "next";

// OQ-U99 ⓐ(UX D-132 · docs/Architecture.md §89.6) — 홈 화면에 추가하면 주소창 없이(standalone) 열린다.
// ⚠️ 브라우저에서 그냥 열 때는 아무것도 바뀌지 않는다(전체화면 자동 전환 = ⓑ는 사용자 승인 전이라 하지 않는다).
// 아이콘 = 자체 도형(방패 + 체크 · 남색 바탕) — 상표 · 기관 로고 아님. 정적 export라 빌드 때 파일로 굳는다.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "금융사기 예방 훈련",
    short_name: "사기 예방 훈련",
    description: "AI가 사기범 역할을 맡아 앱 화면 안에서 전화와 문자를 재현하는 금융사기 예방 훈련",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F5F7FA",
    theme_color: "#F5F7FA",
    lang: "ko",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
