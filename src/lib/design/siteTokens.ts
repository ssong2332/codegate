// 시안 A "공공 안심형" 사이트 색 토큰 — 원천 한 곳 (UX D-132 · docs/Architecture.md §89 · DECISIONS #200).
//
// `src/app/globals.css`의 `:root` 값은 이 표의 사본이다(CSS가 TS를 import할 수 없다). G630
// (`./siteTokens.test.ts`)이 두 곳이 같은지, 아래 대비 쌍이 WCAG AA(글자 4.5:1 · 비텍스트 3:1)를 지키는지 막는다.
// ⚠️ 훈련 화면의 기기 재현 색(통화 셸 · 문자함 · 메신저 · 랜딩)은 여기가 아니라 `../phone/skinTokens.ts`다(G456).
import type { ContrastPair } from "../phone/skinTokens.ts";

/** CSS 변수 이름(`--` 뺀 것) → 값. 키 순서는 globals.css와 같다. */
export const SITE_TOKENS = {
  page: "#F5F7FA",
  surface: "#FFFFFF",
  ink: "#142235",
  "ink-sub": "#4A5868",
  brand: "#1B4B8A",
  "brand-hover": "#143A6C",
  "brand-tint": "#E6EEF8",
  line: "#DDE3EA",
  "line-strong": "#7B8999",
  danger: "#B3261E",
  "danger-hover": "#8F1E18",
  "danger-tint": "#FBE9E7",
  success: "#1E7A46",
  "success-tint": "#E3F3E9",
  caution: "#8A5A00",
  "caution-tint": "#FFF3D6",
  "neutral-tint": "#EEF1F5",
  "disabled-ink": "#7B8999",
  ai: "#5B4B9E",
  "ai-tint": "#EFEBF7",
  "ai-ink": "#463880",
  "avatar-bg": "#41525E",
  "avatar-fg": "#C9D4DB",
  canvas: "#E9EDF2",
} as const;

export type SiteToken = keyof typeof SITE_TOKENS;

const T = SITE_TOKENS;

/**
 * 사이트 화면이 실제로 그리는 (글자/아이콘, 바탕) 쌍(G630의 입력).
 * 비활성(`disabled-ink`)은 WCAG 1.4.3 예외라 넣지 않는다.
 */
export function siteContrastPairs(): ContrastPair[] {
  const text = (name: string, fg: SiteToken, bg: SiteToken): ContrastPair => ({ name, fg: T[fg], bg: T[bg], kind: "text" });
  const nonText = (name: string, fg: SiteToken, bg: SiteToken): ContrastPair => ({ name, fg: T[fg], bg: T[bg], kind: "nonText" });
  return [
    text("ink/page", "ink", "page"),
    text("ink/surface", "ink", "surface"),
    text("ink/brand-tint", "ink", "brand-tint"),
    text("ink-sub/page", "ink-sub", "page"),
    text("ink-sub/surface", "ink-sub", "surface"),
    text("ink-sub/brand-tint", "ink-sub", "brand-tint"),
    text("ink-sub/neutral-tint", "ink-sub", "neutral-tint"),
    text("brand/page", "brand", "page"),
    text("brand/surface", "brand", "surface"),
    text("brand/brand-tint", "brand", "brand-tint"),
    text("surface/brand", "surface", "brand"),
    text("surface/brand-hover", "surface", "brand-hover"),
    text("danger/page", "danger", "page"),
    text("danger/surface", "danger", "surface"),
    text("danger/danger-tint", "danger", "danger-tint"),
    text("surface/danger", "surface", "danger"),
    text("surface/danger-hover", "surface", "danger-hover"),
    text("success/surface", "success", "surface"),
    text("success/success-tint", "success", "success-tint"),
    text("caution/caution-tint", "caution", "caution-tint"),
    text("caution/surface", "caution", "surface"),
    text("ai-ink/ai-tint", "ai-ink", "ai-tint"),
    // 리뷰 Minor — 화면에 실제로 쓰이는 쌍 추가.
    text("caution/page", "caution", "page"),
    text("success/page", "success", "page"),
    text("success/brand-tint", "success", "brand-tint"),
    text("danger/caution-tint", "danger", "caution-tint"),
    text("surface/ai", "surface", "ai"),
    nonText("avatar-fg/avatar-bg", "avatar-fg", "avatar-bg"),
    nonText("line-strong/surface", "line-strong", "surface"),
    nonText("line-strong/page", "line-strong", "page"),
    nonText("brand(진행 막대)/line", "brand", "line"),
    nonText("brand(선택 경계)/surface", "brand", "surface"),
  ];
}
