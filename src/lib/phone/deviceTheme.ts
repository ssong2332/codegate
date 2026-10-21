// §89.5 ⓒ(UX D-132 (5) ⓒ) — 통화 화면의 테마. 라이트 통화 화면은 One UI형에만 쓴다.
// ⭐ 사용자 결정(2026-10-21 · 실기 신고 "다크 모드에서도 변경되지 않고 유지") — 훈련 화면(카톡형 · One UI · iOS 통화)은 기기 다크 모드와
// **관계없이** 실제 앱의 기본 색(라이트)으로 고정한다(UX D-137 (B) · docs/Architecture.md §94). 종전에는 OS `prefers-color-scheme`을 읽어
// One UI형만 기기 테마를 따랐다 — 이제 OS 설정을 읽지 않는다(iOS형 · 기본 통화 화면은 원래 늘 어둡다 = 실제 앱 기본).
// `themeFromMatch`는 진단 패널(`?themedebug=1`)이 OS 값을 보여 줄 때만 쓴다.
import type { DeviceTheme } from "./skinTokens.ts";

/** 훈련 화면 테마 — 고정. */
export const TRAINING_SCREEN_THEME: DeviceTheme = "light";

/** matchMedia 결과 → 테마. 모르면(서버 · 미지원) 어두운 쪽. */
export function themeFromMatch(matchesLight: boolean | null): DeviceTheme {
  return matchesLight === true ? "light" : "dark";
}

/** 통화 화면이 쓰는 테마(호출부 무변경을 위해 훅 이름 유지 — 값은 고정). */
export function useDeviceTheme(): DeviceTheme {
  return TRAINING_SCREEN_THEME;
}
