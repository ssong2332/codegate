// §89.5 ⓒ(UX D-132 (5) ⓒ) — 기기 테마(OS `prefers-color-scheme`)를 읽는다. 페이지 색 체계는 바꾸지 않는다
// (강제 다크 방지 G458 그대로 — 미디어 쿼리는 OS 설정을 읽을 뿐이다). 라이트 통화 화면은 One UI형에만 쓴다.
// ⚠️ 추정: Android Chrome · 삼성 인터넷이 이 미디어 쿼리에 기기 테마를 그대로 넘긴다 — 실기 확인 필요(OQ-U100).
import { useSyncExternalStore } from "react";
import type { DeviceTheme } from "./skinTokens.ts";

const QUERY = "(prefers-color-scheme: light)";

/** matchMedia 결과 → 테마. 모르면(서버 · 미지원) 어두운 쪽(종전 화면). */
export function themeFromMatch(matchesLight: boolean | null): DeviceTheme {
  return matchesLight === true ? "light" : "dark";
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function snapshot(): DeviceTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return themeFromMatch(window.matchMedia(QUERY).matches);
}

export function useDeviceTheme(): DeviceTheme {
  return useSyncExternalStore(subscribe, snapshot, () => "dark");
}
