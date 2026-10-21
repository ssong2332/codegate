// 훈련 화면 묶음(`/session/*`) 공통 — `?themedebug=1` 색 진단 패널만 덧붙인다(2026-10-21 · 웨일 다크 실기 신고 · §92).
// ⛔ 감싸는 DOM을 만들지 않는다(각 화면의 레이아웃 · `font-phone` 루트 그대로). 쿼리가 없으면 패널은 DOM 0이다.
import ThemeDebugPanel from "@/components/ThemeDebugPanel";

export default function SessionLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <ThemeDebugPanel />
    </>
  );
}
