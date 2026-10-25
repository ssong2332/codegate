"use client";

// 개발 단계 루트 강제 지정 — 어느 화면으로 들어오든 주소의 `?route=`를 이 탭에 저장한다(`devRouteOverride.ts` C1~C3).
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureDevRouteOverride } from "./devRouteOverride";

export function DevRouteCapture() {
  const pathname = usePathname();
  useEffect(() => {
    captureDevRouteOverride();
  }, [pathname]);
  return null;
}
