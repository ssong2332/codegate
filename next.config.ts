import type { NextConfig } from "next";

// 배포 파이프라인: Firebase Hosting (T2 결정 — 하루 스코프, Architecture.md §1 "T2 스캐폴딩에서
// 팀 편의로 택1"). 이 앱은 전 화면이 클라이언트 컴포넌트 + Firebase SDK(callable/onSnapshot)로
// 동작하고 서버 렌더링을 필요로 하지 않으므로 정적 export로 빌드해 `firebase deploy`
// 하나로 Hosting + Functions + Firestore/Storage rules를 함께 배포한다(별도 Vercel 계정/환경변수
// 이중 관리 불필요).
const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
