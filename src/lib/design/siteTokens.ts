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
  // 시안 E2 판 구조(UX D-141 · §97) — 화면 가로 큰 판 · 경계 판 · 리포트 머리. 남색 계열(A)만 쓰고 채도는 낮게 둔다.
  deep: "#0E2A50", // 짙은 남색 — 준비 화면 · 리포트 머리 · 랜딩 하단
  "panel-slate": "#3D5A80", // 회청 판(흰 글자) — 밝기 교차의 세 번째 판
  "panel-sand": "#F3EAD2", // 옅은 모래 판(진한 글자) — 밝기 교차의 네 번째 판
  sand: "#E9D29A", // 모래 — 하단 CTA 판 · 종료 판 · 큰 시계 글자
  "panel-line": "#C9D3DF", // 옅은 판 경계 · 리포트 사건 행 경계(장식)
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
    // UX D-141(E2 판 구조) — 판 위 글자 · 아이콘(42px는 비텍스트지만 제목과 같은 색이라 글자 기준으로 잰다).
    text("surface/brand(판 1)", "surface", "brand"),
    text("brand-tint/brand(판 1 보조)", "brand-tint", "brand"),
    text("ink/brand-tint(판 2)", "ink", "brand-tint"),
    text("brand/brand-tint(판 2 아이콘)", "brand", "brand-tint"),
    text("surface/panel-slate(판 3)", "surface", "panel-slate"),
    text("brand-tint/panel-slate(판 3 보조)", "brand-tint", "panel-slate"),
    text("ink/panel-sand(판 4)", "ink", "panel-sand"),
    text("ink-sub/panel-sand(판 4 보조)", "ink-sub", "panel-sand"),
    text("brand/panel-sand(판 4 아이콘)", "brand", "panel-sand"),
    text("ink/sand(CTA 판 · 종료 판)", "ink", "sand"),
    text("surface/deep(준비 · 리포트 머리)", "surface", "deep"),
    text("brand-tint/deep(보조 글자)", "brand-tint", "deep"),
    text("sand/deep(큰 시계 · 큰 숫자)", "sand", "deep"),
    text("sand/brand(랜딩 단계 번호)", "sand", "brand"),
    text("ink-sub/surface(시트)", "ink-sub", "surface"),
    nonText("sand(준비 막대)/deep", "sand", "deep"),
    nonText("line-strong(난이도 빈 원)/brand-tint", "line-strong", "brand-tint"),
  ];
}
